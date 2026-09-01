/**
 * Integration checks for the mock UPI checkout flow.
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
    if (error.context instanceof Response) {
      try {
        const payload = await error.context.json();
        message = payload.error || payload.message || message;
      } catch {
        // ignore
      }
    }
    throw new Error(message);
  }
  if (!data?.success) throw new Error(data?.error || 'Checkout call failed.');
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
  const initialStock = product.stock_count ?? product.quantity ?? 0;
  const unitPrice = product.final_price ?? product.suggested_price;
  const idempotencyKey = `test-${Date.now()}`;

  const created = await invokeCheckout(buyer, {
    action: 'create_order',
    items: [{ productId: product.id, quantity: 1 }],
    shippingAddress: 'Neha Patel, 12 Demo Lane, Bengaluru, Karnataka 560001',
    idempotencyKey,
  });

  const orderId = created.order.id;
  const paymentId = created.payment.id;
  record('create order + pending payment', Boolean(orderId && paymentId), `${orderId} / ${paymentId}`);

  const duplicate = await invokeCheckout(buyer, {
    action: 'create_order',
    items: [{ productId: product.id, quantity: 1 }],
    shippingAddress: 'Neha Patel, 12 Demo Lane, Bengaluru, Karnataka 560001',
    idempotencyKey,
  });
  record('idempotent order creation', duplicate.idempotent === true && duplicate.order.id === orderId, duplicate.order.id);

  const failedPayment = await invokeCheckout(buyer, {
    action: 'process_payment',
    orderId,
    mockOutcome: 'failed',
    upiApp: 'Google Pay',
    transactionId: created.payment.transaction_id,
  });
  record('failed payment marks payment failed', failedPayment.result.payment_status === 'failed', failedPayment.result.payment_status);

  const { data: afterFailProduct } = await buyer.from('products').select('stock_count, quantity').eq('id', product.id).single();
  record('failed payment does not reduce stock', (afterFailProduct?.stock_count ?? afterFailProduct?.quantity) === initialStock, `stock ${afterFailProduct?.stock_count ?? afterFailProduct?.quantity}`);

  await invokeCheckout(buyer, { action: 'retry_payment', orderId });
  const pending = await invokeCheckout(buyer, {
    action: 'process_payment',
    orderId,
    mockOutcome: 'pending',
    upiApp: 'PhonePe',
    transactionId: created.payment.transaction_id,
  });
  record('pending payment stays pending', pending.result.payment_status === 'pending', pending.result.payment_status);

  const { data: pendingOrder } = await buyer.from('orders').select('status').eq('id', orderId).single();
  record('pending payment does not deliver order', pendingOrder?.status === 'processing', pendingOrder?.status || 'unknown');

  await invokeCheckout(buyer, { action: 'retry_payment', orderId });
  const success = await invokeCheckout(buyer, {
    action: 'process_payment',
    orderId,
    mockOutcome: 'success',
    upiApp: 'Paytm',
    transactionId: created.payment.transaction_id,
  });
  record('successful payment completes order', success.result.payment_status === 'success' && success.result.order_status === 'delivered', `${success.result.payment_status}/${success.result.order_status}`);

  const duplicateSuccess = await invokeCheckout(buyer, {
    action: 'process_payment',
    orderId,
    mockOutcome: 'success',
    upiApp: 'Paytm',
    transactionId: created.payment.transaction_id,
  });
  record('duplicate success is idempotent', duplicateSuccess.result.idempotent === true, String(duplicateSuccess.result.idempotent));

  const { data: afterSuccessProduct } = await buyer.from('products').select('stock_count, quantity').eq('id', product.id).single();
  record('successful payment reduces stock once', (afterSuccessProduct?.stock_count ?? afterSuccessProduct?.quantity) === initialStock - 1, `stock ${afterSuccessProduct?.stock_count ?? afterSuccessProduct?.quantity}`);

  const { data: paymentRow } = await buyer.from('payments').select('amount, transaction_id, payment_method, upi_app, status').eq('order_id', orderId).single();
  record(
    'payment row populated correctly',
    paymentRow?.status === 'success' && Number(paymentRow.amount) === Number(unitPrice) && String(paymentRow.transaction_id || '').startsWith('MOCK-UPI-'),
    `${paymentRow?.status} ${paymentRow?.amount}`,
  );

  const { data: orderItems } = await buyer.from('order_items').select('product_id, quantity, unit_price, subtotal').eq('order_id', orderId);
  record('order items created', (orderItems || []).length === 1 && orderItems[0].product_id === product.id, `${orderItems?.length || 0} item(s)`);

  const buyerId = (await buyer.auth.getUser()).data.user?.id;
  const { data: eligibilityOrders } = await buyer
    .from('orders')
    .select('id, status, order_items!inner(product_id)')
    .eq('buyer_id', buyerId)
    .eq('order_items.product_id', product.id);
  const eligible = (eligibilityOrders || []).some((row) => ['delivered', 'completed', 'complete', 'fulfilled'].includes(String(row.status || '').toLowerCase()));
  record('successful purchase makes buyer review-eligible', eligible, `${eligibilityOrders?.length || 0} matching order(s)`);

  const failedBuyer = await signIn('yash.malhotra@demo.artisan.market');
  const failedAttempt = await invokeCheckout(failedBuyer, {
    action: 'create_order',
    items: [{ productId: product.id, quantity: 1 }],
    shippingAddress: 'Yash Malhotra, Demo Lane, Haryana',
    idempotencyKey: `fail-test-${Date.now()}`,
  }).catch((error) => ({ error: error.message }));
  if (failedAttempt.error) {
    record('out-of-stock or validation prevents impossible purchase', true, failedAttempt.error);
  } else {
    const failOrderId = failedAttempt.order.id;
    await invokeCheckout(failedBuyer, {
      action: 'process_payment',
      orderId: failOrderId,
      mockOutcome: 'failed',
      upiApp: 'Google Pay',
      transactionId: failedAttempt.payment.transaction_id,
    });
    const { data: failEligibility } = await failedBuyer
      .from('orders')
      .select('status')
      .eq('id', failOrderId)
      .single();
    record('failed purchase is not delivered', failEligibility?.status !== 'delivered', failEligibility?.status || 'unknown');
  }

  await buyer.auth.signOut();
  await failedBuyer.auth.signOut();

  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    failed.forEach((result) => console.error(`  - ${result.name}: ${result.detail}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
