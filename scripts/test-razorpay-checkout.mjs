/**
 * Integration smoke checks for ARTISAN checkout order creation after Razorpay migration.
 *
 * Full Razorpay payment capture cannot be simulated without Razorpay Test Mode credentials
 * and a real Checkout / payment response. This script verifies:
 * - authenticated create_order
 * - idempotent create_order
 * - mock process_payment is rejected (410)
 * - create_razorpay_order when RAZORPAY_* secrets are configured
 *
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const DEMO_PASSWORD = 'Demo@12345';

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const results = [];

const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
};

async function signIn(email) {
  const client = createClient(url, key);
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function invokeCheckout(client, body) {
  const { data, error } = await client.functions.invoke('marketplace-checkout', { body });
  if (error) {
    let message = error.message;
    let status = null;
    if (error.context instanceof Response) {
      status = error.context.status;
      try {
        const payload = await error.context.json();
        message = payload.error || payload.message || message;
      } catch {
        // ignore
      }
    }
    const err = new Error(message);
    err.status = status;
    err.payload = { error: message };
    throw err;
  }
  if (!data?.success) {
    const err = new Error(data?.error || 'Checkout call failed.');
    err.payload = data;
    throw err;
  }
  return data;
}

async function findPurchasableProduct(client) {
  const { data, error } = await client
    .from('products')
    .select('id, vendor_id, title, title_en, final_price, suggested_price, quantity, stock_count, status')
    .in('status', ['approved', 'published', 'synced'])
    .gt('stock_count', 0)
    .limit(20);
  if (error) throw error;
  const candidate = (data || []).find((row) => (row.stock_count ?? row.quantity ?? 0) > 0 && (row.final_price ?? row.suggested_price));
  if (!candidate) throw new Error('No purchasable product found.');
  return candidate;
}

async function main() {
  const buyer = await signIn('neha.patel@demo.artisan.market');
  const product = await findPurchasableProduct(buyer);
  const idempotencyKey = `rzp-test-${Date.now()}`;

  const created = await invokeCheckout(buyer, {
    action: 'create_order',
    items: [{ productId: product.id, quantity: 1 }],
    shippingAddress: 'Neha Patel, 12 Demo Lane, Bengaluru, Karnataka 560001',
    idempotencyKey,
  });

  const orderId = created.order.id;
  const paymentId = created.payment.id;
  record('create order + pending payment', Boolean(orderId && paymentId), `${orderId} / ${paymentId}`);
  record(
    'payment method is upi (Razorpay is the gateway)',
    String(created.payment.payment_method || '').toLowerCase() === 'upi',
    created.payment.payment_method || 'missing',
  );

  const duplicate = await invokeCheckout(buyer, {
    action: 'create_order',
    items: [{ productId: product.id, quantity: 1 }],
    shippingAddress: 'Neha Patel, 12 Demo Lane, Bengaluru, Karnataka 560001',
    idempotencyKey,
  });
  record('idempotent order creation', duplicate.idempotent === true && duplicate.order.id === orderId, duplicate.order.id);

  let mockRejected = false;
  try {
    await invokeCheckout(buyer, {
      action: 'process_payment',
      orderId,
      mockOutcome: 'success',
      upiApp: 'Google Pay',
    });
  } catch (error) {
    mockRejected = String(error.message || '').toLowerCase().includes('razorpay') || error.status === 410;
    record('mock process_payment rejected', mockRejected, error.message);
  }
  if (!mockRejected) {
    record('mock process_payment rejected', false, 'mock payment still accepted');
  }

  try {
    const session = await invokeCheckout(buyer, {
      action: 'create_razorpay_order',
      orderId,
    });
    record(
      'create_razorpay_order returns session',
      Boolean(session.razorpayOrderId && session.keyId && session.amountPaise > 0),
      `${session.razorpayOrderId} / ${session.amountPaise} paise`,
    );
  } catch (error) {
    record(
      'create_razorpay_order available when secrets configured',
      String(error.message || '').toLowerCase().includes('not configured'),
      error.message,
    );
  }

  await buyer.auth.signOut();

  const failed = results.filter((row) => !row.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
