import { supabase } from '../lib/supabase';
import {
  CHECKOUT_SESSION_KEY,
  CheckoutOrder,
  CheckoutOrderItem,
  CheckoutPayment,
  CheckoutSnapshot,
  RazorpayCheckoutSession,
} from '../types/checkout';
import { CartItem } from '../types/checkout';

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toStringValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const readFunctionError = async (error: unknown): Promise<string> => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: Response }).context;
    if (context instanceof Response) {
      try {
        const payload = asRecord(await context.json());
        return toStringValue(payload.error) || toStringValue(payload.message) || 'Checkout request failed.';
      } catch {
        return 'Checkout request failed.';
      }
    }
  }
  return error instanceof Error ? error.message : 'Checkout request failed.';
};

const mapOrder = (row: Record<string, unknown>): CheckoutOrder => ({
  id: toStringValue(row.id) || '',
  status: toStringValue(row.status) || 'processing',
  totalAmount: toNumber(row.total_amount),
  shippingAddress: toStringValue(row.shipping_address),
  stockDeducted: Boolean(row.stock_deducted),
  createdAt: toStringValue(row.created_at),
});

const mapPayment = (row: Record<string, unknown> | null | undefined): CheckoutPayment | null => {
  if (!row) return null;
  return {
    id: toStringValue(row.id) || '',
    status: toStringValue(row.status) || 'pending',
    amount: toNumber(row.amount),
    transactionId: toStringValue(row.transaction_id),
    upiApp: toStringValue(row.upi_app),
    paymentMethod: toStringValue(row.payment_method),
  };
};

const mapItem = (
  row: Record<string, unknown>,
  productsById: Map<string, Record<string, unknown>>,
): CheckoutOrderItem => {
  const productId = toStringValue(row.product_id) || '';
  const product = productsById.get(productId);
  const title = product ? toStringValue(product.title_en) || toStringValue(product.title) : null;
  const image =
    toStringValue(product?.studio_image_url) ||
    toStringValue(product?.enhanced_image_url) ||
    toStringValue(product?.original_image_url);
  return {
    id: toStringValue(row.id) || '',
    productId,
    vendorId: toStringValue(row.vendor_id),
    quantity: Math.max(1, toNumber(row.quantity)),
    unitPrice: toNumber(row.unit_price),
    subtotal: toNumber(row.subtotal) || toNumber(row.unit_price) * Math.max(1, toNumber(row.quantity)),
    title,
    image,
  };
};

export const createCheckoutIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const rememberCheckoutIdempotencyKey = (key: string): void => {
  sessionStorage.setItem(CHECKOUT_SESSION_KEY, key);
};

export const readCheckoutIdempotencyKey = (): string | null => {
  return sessionStorage.getItem(CHECKOUT_SESSION_KEY);
};

export const clearCheckoutIdempotencyKey = (): void => {
  sessionStorage.removeItem(CHECKOUT_SESSION_KEY);
};

export const createCheckoutOrder = async (input: {
  items: CartItem[];
  shippingAddress: string;
  idempotencyKey: string;
  gstin?: string;
}): Promise<{ order: CheckoutOrder; payment: CheckoutPayment | null; idempotent: boolean }> => {
  const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
    body: {
      action: 'create_order',
      items: input.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      shippingAddress: input.shippingAddress,
      idempotencyKey: input.idempotencyKey,
      gstin: input.gstin?.trim() || undefined,
    },
  });

  if (error) throw new Error(await readFunctionError(error));
  const payload = asRecord(data);
  if (!payload.success) throw new Error(toStringValue(payload.error) || 'Order could not be created.');

  return {
    order: mapOrder(asRecord(payload.order)),
    payment: mapPayment(asRecord(payload.payment)),
    idempotent: Boolean(payload.idempotent),
  };
};

export const getCheckoutSnapshot = async (orderId: string): Promise<CheckoutSnapshot> => {
  const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
    body: { action: 'get_checkout', orderId },
  });

  if (error) throw new Error(await readFunctionError(error));
  const payload = asRecord(data);
  if (!payload.success) throw new Error(toStringValue(payload.error) || 'Checkout could not be loaded.');

  const productsById = new Map<string, Record<string, unknown>>();
  (Array.isArray(payload.products) ? payload.products : []).forEach((row) => {
    const record = asRecord(row);
    const id = toStringValue(record.id);
    if (id) productsById.set(id, record);
  });

  return {
    order: mapOrder(asRecord(payload.order)),
    items: (Array.isArray(payload.items) ? payload.items : []).map((row) => mapItem(asRecord(row), productsById)),
    payment: mapPayment(asRecord(payload.payment)),
  };
};

export const createRazorpayCheckoutSession = async (orderId: string): Promise<RazorpayCheckoutSession> => {
  const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
    body: { action: 'create_razorpay_order', orderId },
  });

  if (error) throw new Error(await readFunctionError(error));
  const payload = asRecord(data);
  if (!payload.success) throw new Error(toStringValue(payload.error) || 'Razorpay checkout could not be prepared.');

  const keyId = toStringValue(payload.keyId);
  const razorpayOrderId = toStringValue(payload.razorpayOrderId);
  if (!keyId || !razorpayOrderId) {
    throw new Error('Razorpay checkout session is incomplete.');
  }

  return {
    keyId,
    razorpayOrderId,
    amount: toNumber(payload.amount),
    amountPaise: Math.round(toNumber(payload.amountPaise)),
    currency: toStringValue(payload.currency) || 'INR',
    artisanOrderId: toStringValue(payload.artisanOrderId) || orderId,
    reused: Boolean(payload.reused),
  };
};

export const verifyRazorpayPayment = async (input: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<Record<string, unknown>> => {
  const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
    body: {
      action: 'verify_razorpay_payment',
      orderId: input.orderId,
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      razorpaySignature: input.razorpaySignature,
    },
  });

  if (error) throw new Error(await readFunctionError(error));
  const payload = asRecord(data);
  if (!payload.success) throw new Error(toStringValue(payload.error) || 'Payment verification failed.');
  return asRecord(payload.result);
};

export const retryCheckoutPayment = async (orderId: string): Promise<Record<string, unknown>> => {
  const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
    body: { action: 'retry_payment', orderId },
  });

  if (error) throw new Error(await readFunctionError(error));
  const payload = asRecord(data);
  if (!payload.success) throw new Error(toStringValue(payload.error) || 'Payment could not be retried.');
  return asRecord(payload.result);
};

export const formatCurrency = (amount: number): string => `₹${amount.toLocaleString('en-IN')}`;

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayInstance = {
  open: () => void;
  on?: (event: string, handler: (response: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

let razorpayScriptPromise: Promise<void> | null = null;

export const loadRazorpayCheckoutScript = (): Promise<void> => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay checkout is only available in the browser.'));
  }
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-artisan-razorpay="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Razorpay checkout could not be loaded.')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.artisanRazorpay = '1';
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayScriptPromise = null;
      reject(new Error('Razorpay checkout could not be loaded.'));
    };
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
};

export const openRazorpayCheckout = async (input: {
  session: RazorpayCheckoutSession;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  onSuccess: (response: RazorpayHandlerResponse) => void;
  onDismiss: () => void;
  onFailure?: (message: string) => void;
}): Promise<void> => {
  await loadRazorpayCheckoutScript();
  if (!window.Razorpay) {
    throw new Error('Razorpay checkout is unavailable.');
  }

  const checkout = new window.Razorpay({
    key: input.session.keyId,
    amount: input.session.amountPaise,
    currency: input.session.currency || 'INR',
    name: 'ARTISAN',
    description: `Order ${input.session.artisanOrderId.slice(0, 8)}`,
    order_id: input.session.razorpayOrderId,
    prefill: {
      name: input.customerName || undefined,
      email: input.customerEmail || undefined,
      contact: input.customerPhone || undefined,
    },
    theme: { color: '#264336' },
    handler: input.onSuccess,
    modal: {
      ondismiss: input.onDismiss,
    },
  });

  checkout.on?.('payment.failed', (response) => {
    const record = asRecord(response);
    const error = asRecord(record.error);
    const message =
      toStringValue(error.description) ||
      toStringValue(error.reason) ||
      'The payment could not be completed.';
    input.onFailure?.(message);
  });

  checkout.open();
};
