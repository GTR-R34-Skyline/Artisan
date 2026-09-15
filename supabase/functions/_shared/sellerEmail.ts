/**
 * Minimal server-side email helper for seller purchase notifications.
 * Uses Resend when RESEND_API_KEY is configured. Never throws to callers for
 * delivery failures — callers must keep orders successful regardless.
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

const formatCurrency = (amount: number): string =>
  `₹${Math.round(amount).toLocaleString('en-IN')}`;

const buildSellerEmailHtml = (input: SellerOrderEmailInput): string => {
  const linesHtml = input.lines.map((line) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;">${line.productName}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:center;">${line.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:right;">${formatCurrency(line.unitPrice)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:right;">${formatCurrency(line.subtotal)}</td>
    </tr>
  `).join('');

  const action = input.dashboardUrl
    ? `<p style="margin:24px 0;"><a href="${input.dashboardUrl}" style="display:inline-block;padding:12px 18px;background:#1c1917;color:#fff;text-decoration:none;">Open seller dashboard</a></p>`
    : '';

  return `
  <div style="font-family:Georgia,serif;color:#1c1917;line-height:1.6;max-width:640px;">
    <p>Hello ${input.sellerName},</p>
    <p>Your product has been purchased on ARTISAN.</p>
    <p><strong>Order Number:</strong> #${input.orderId.slice(0, 8).toUpperCase()}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid #1c1917;">Product</th>
          <th style="text-align:center;padding:8px 0;border-bottom:2px solid #1c1917;">Quantity</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid #1c1917;">Unit Price</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid #1c1917;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <p><strong>Order Date:</strong> ${input.orderDate}</p>
    <p><strong>Order Status:</strong> ${input.orderStatus}</p>
    <p>Please log in to your seller dashboard and process the order.</p>
    ${action}
    <p>ARTISAN</p>
  </div>`;
};

const buildSellerEmailText = (input: SellerOrderEmailInput): string => {
  const lines = input.lines.map((line) =>
    `- ${line.productName} | Qty ${line.quantity} | ${formatCurrency(line.unitPrice)} | ${formatCurrency(line.subtotal)}`,
  ).join('\n');
  return [
    `Hello ${input.sellerName},`,
    '',
    'Your product has been purchased on ARTISAN.',
    '',
    `Order Number: #${input.orderId.slice(0, 8).toUpperCase()}`,
    '',
    'Products:',
    lines,
    '',
    `Order Date: ${input.orderDate}`,
    `Order Status: ${input.orderStatus}`,
    '',
    'Please log in to your seller dashboard and process the order.',
    '',
    'ARTISAN',
  ].join('\n');
};

export const isDeliverableEmail = (email: string | null | undefined): boolean => {
  if (!email || !email.includes('@')) return false;
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith('@artisan.local')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
};

export const sendSellerOrderEmail = async (
  input: SellerOrderEmailInput,
): Promise<{ sent: boolean; skipped?: string; error?: string }> => {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') || Deno.env.get('SELLER_NOTIFY_FROM') || 'ARTISAN <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('[seller-email] skipped_missing_resend_api_key', {
      orderId: input.orderId,
      to: input.to,
    });
    return { sent: false, skipped: 'RESEND_API_KEY not configured' };
  }

  if (!isDeliverableEmail(input.to)) {
    console.warn('[seller-email] skipped_undeliverable_address', {
      orderId: input.orderId,
      to: input.to,
    });
    return { sent: false, skipped: 'undeliverable seller email' };
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
        subject: `New ARTISAN Order Received — #${input.orderId.slice(0, 8).toUpperCase()}`,
        html: buildSellerEmailHtml(input),
        text: buildSellerEmailText(input),
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      console.error('[seller-email] send_failed', {
        orderId: input.orderId,
        status: response.status,
        detail,
      });
      return { sent: false, error: `Resend status ${response.status}` };
    }

    console.info('[seller-email] sent', {
      orderId: input.orderId,
      vendorEmail: input.to,
      idempotencyKey: input.idempotencyKey,
    });
    return { sent: true };
  } catch (error) {
    console.error('[seller-email] exception', {
      orderId: input.orderId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, error: error instanceof Error ? error.message : 'email failed' };
  }
};
