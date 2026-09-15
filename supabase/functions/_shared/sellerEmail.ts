/**
 * Minimal server-side email helper for seller purchase notifications.
 * Uses Resend when RESEND_API_KEY is configured. Never throws to callers for
 * delivery failures — callers must keep orders successful regardless.
 *
 * Seller name/email are supplied by the caller after dynamic DB/auth lookup.
 * This module never hardcodes a seller identity.
 */

export interface SellerOrderLine {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface SellerOrderEmailInput {
  to: string;
  sellerName: string;
  orderId: string;
  orderStatus: string;
  orderDate: string;
  lines: SellerOrderLine[];
  dashboardUrl?: string;
  idempotencyKey: string;
}

export interface SellerEmailSendResult {
  sent: boolean;
  skipped?: string;
  error?: string;
  providerId?: string;
  to?: string;
}

const buildSellerEmailHtml = (input: SellerOrderEmailInput): string => `
  <div style="font-family:Georgia,serif;color:#1c1917;line-height:1.6;max-width:640px;">
    <p>Hello ${input.sellerName},</p>
    <p>Your product has been purchased.</p>
    <p>Please check your seller dashboard and handle/process the order.</p>
    <p>Regards,<br/>ARTISAN</p>
  </div>`;

const buildSellerEmailText = (input: SellerOrderEmailInput): string =>
  [
    `Hello ${input.sellerName},`,
    '',
    'Your product has been purchased.',
    '',
    'Please check your seller dashboard and handle/process the order.',
    '',
    'Regards,',
    'ARTISAN',
  ].join('\n');

export const isDeliverableEmail = (email: string | null | undefined): boolean => {
  if (!email || !email.includes('@')) return false;
  const normalized = email.trim().toLowerCase();
  // Synthetic/local placeholders used by phone/demo provisioning — never send here.
  if (normalized.endsWith('@artisan.local')) return false;
  if (normalized.endsWith('@sampark.local')) return false;
  if (normalized.endsWith('@demo.artisan.market')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
};

export const sendSellerOrderEmail = async (
  input: SellerOrderEmailInput,
): Promise<SellerEmailSendResult> => {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') || Deno.env.get('SELLER_NOTIFY_FROM') || 'ARTISAN <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('[seller-email] skipped_missing_resend_api_key', {
      orderId: input.orderId,
      to: input.to,
    });
    return { sent: false, skipped: 'RESEND_API_KEY not configured', to: input.to };
  }

  if (!isDeliverableEmail(input.to)) {
    console.warn('[seller-email] skipped_undeliverable_address', {
      orderId: input.orderId,
      to: input.to,
    });
    return { sent: false, skipped: 'undeliverable seller email', to: input.to };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: 'Your product has been purchased',
        html: buildSellerEmailHtml(input),
        text: buildSellerEmailText(input),
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      console.error('[seller-email] send_failed', {
        orderId: input.orderId,
        status: response.status,
        detail,
      });
      return {
        sent: false,
        error: `Resend status ${response.status}: ${detail}`,
        to: input.to,
      };
    }

    const payload = await response.json().catch(() => ({})) as { id?: string };
    console.info('[seller-email] sent', {
      orderId: input.orderId,
      vendorEmail: input.to,
      sellerName: input.sellerName,
      providerId: payload.id ?? null,
      idempotencyKey: input.idempotencyKey,
    });
    return { sent: true, providerId: payload.id, to: input.to };
  } catch (error) {
    console.error('[seller-email] exception', {
      orderId: input.orderId,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      sent: false,
      error: error instanceof Error ? error.message : 'email failed',
      to: input.to,
    };
  }
};
