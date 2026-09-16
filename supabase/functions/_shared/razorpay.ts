/**
 * Server-side Razorpay helpers for ARTISAN checkout.
 * Key secret must never leave this edge runtime.
 */

export const inrToPaise = (amountInr: number): number => {
  if (!Number.isFinite(amountInr) || amountInr < 0) {
    throw new Error('Invalid payment amount.');
  }
  const normalized = amountInr.toFixed(2);
  const [rupeesPart, paisePart = '0'] = normalized.split('.');
  const rupees = Number(rupeesPart);
  const paise = Number(paisePart.padEnd(2, '0').slice(0, 2));
  if (!Number.isFinite(rupees) || !Number.isFinite(paise)) {
    throw new Error('Invalid payment amount.');
  }
  return rupees * 100 + paise;
};

export const paiseToInr = (paise: number): number => {
  if (!Number.isFinite(paise)) return 0;
  return Math.round(paise) / 100;
};

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

export const hmacSha256Hex = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toHex(signature);
};

export const verifyCheckoutPaymentSignature = async (input: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): Promise<boolean> => {
  const expected = await hmacSha256Hex(input.keySecret, `${input.orderId}|${input.paymentId}`);
  return timingSafeEqual(expected, input.signature);
};

export const verifyWebhookSignature = async (input: {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}): Promise<boolean> => {
  const expected = await hmacSha256Hex(input.webhookSecret, input.rawBody);
  return timingSafeEqual(expected, input.signature);
};

const basicAuthHeader = (keyId: string, keySecret: string): string => {
  const token = btoa(`${keyId}:${keySecret}`);
  return `Basic ${token}`;
};

export interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt: string | null;
}

export interface RazorpayPaymentResponse {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  captured?: boolean;
}

export const createRazorpayOrder = async (input: {
  keyId: string;
  keySecret: string;
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrderResponse> => {
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(input.keyId, input.keySecret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: 'INR',
      receipt: input.receipt.slice(0, 40),
      notes: input.notes || {},
      payment_capture: 1,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const description =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error?: { description?: string } }).error?.description || 'Razorpay order creation failed.')
        : 'Razorpay order creation failed.';
    throw new Error(description);
  }

  return {
    id: String((payload as { id?: string }).id || ''),
    amount: Number((payload as { amount?: number }).amount || 0),
    currency: String((payload as { currency?: string }).currency || ''),
    status: String((payload as { status?: string }).status || ''),
    receipt: (payload as { receipt?: string | null }).receipt ?? null,
  };
};

export const fetchRazorpayPayment = async (input: {
  keyId: string;
  keySecret: string;
  paymentId: string;
}): Promise<RazorpayPaymentResponse> => {
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.paymentId)}`, {
    method: 'GET',
    headers: {
      Authorization: basicAuthHeader(input.keyId, input.keySecret),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('Unable to verify payment with Razorpay.');
  }

  return {
    id: String((payload as { id?: string }).id || ''),
    order_id: String((payload as { order_id?: string }).order_id || ''),
    amount: Number((payload as { amount?: number }).amount || 0),
    currency: String((payload as { currency?: string }).currency || ''),
    status: String((payload as { status?: string }).status || ''),
    method: (payload as { method?: string | null }).method ?? null,
    captured: Boolean((payload as { captured?: boolean }).captured),
  };
};

export const isSuccessfulRazorpayPaymentStatus = (status: string, captured?: boolean): boolean => {
  const normalized = status.toLowerCase();
  if (normalized === 'captured') return true;
  // Auto-capture accounts usually report captured; treat authorized+captured flag as success.
  if (normalized === 'authorized' && captured === true) return true;
  return false;
};

/** Values allowed by ARTISAN payments_payment_method_check. Razorpay is never a method. */
export const ALLOWED_ARTISAN_PAYMENT_METHODS = ['upi', 'card', 'netbanking', 'cod'] as const;

/**
 * Map Razorpay instrument → ARTISAN payment_method.
 * Unsupported instruments fall back to 'upi' (current checkout default).
 */
export const mapRazorpayInstrumentToPaymentMethod = (
  method: string | null | undefined,
): (typeof ALLOWED_ARTISAN_PAYMENT_METHODS)[number] => {
  const normalized = (method || '').trim().toLowerCase();
  if (normalized === 'upi') return 'upi';
  if (normalized === 'card') return 'card';
  if (normalized === 'netbanking') return 'netbanking';
  return 'upi';
};
