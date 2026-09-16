/**
 * E2E: purchase a product from seller "Mohan Das", pay, verify order_item.vendor_id,
 * resolve seller email dynamically (auth → vendor_applications by name), notify.
 *
 * Does NOT hardcode seller email into production paths. Optional SELLER_TEST_EMAIL
 * is only used as an assertion target for this script.
 */

import { createClient } from '@supabase/supabase-js';

const SELLER_DISPLAY_NAME = process.env.SELLER_TEST_NAME || 'Mohan Das';
const EXPECTED_EMAIL = (process.env.SELLER_TEST_EMAIL || '').trim().toLowerCase();
const BUYER_EMAIL = process.env.BUYER_TEST_EMAIL || 'buyer.e2e@demo.artisan.market';
const BUYER_PASSWORD = process.env.BUYER_TEST_PASSWORD || 'Demo@12345';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error('Missing SUPABASE_URL / ANON / SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const buyer = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const step = (label, detail) => {
  console.log(`\n=== ${label} ===`);
  if (detail !== undefined) console.log(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
};

const fail = (message) => {
  console.error(`\nFAIL: ${message}`);
  process.exit(1);
};

const isPlaceholderEmail = (email) => {
  if (!email) return true;
  const e = email.toLowerCase();
  return e.endsWith('@artisan.local') || e.endsWith('@sampark.local') || e.endsWith('@demo.artisan.market');
};

async function resolveSellerEmail(vendorId, sellerName) {
  const { data: userData, error } = await admin.auth.admin.getUserById(vendorId);
  if (error) fail(error.message);
  let email = userData.user?.email || null;
  let source = 'auth.users';

  if (isPlaceholderEmail(email)) {
    const { data: apps } = await admin
      .from('vendor_applications')
      .select('email, name, created_at')
      .ilike('name', sellerName)
      .order('created_at', { ascending: false })
      .limit(5);
    const candidate = (apps || []).map((row) => row.email).find((value) => value && !isPlaceholderEmail(value));
    if (candidate) {
      email = candidate;
      source = 'vendor_applications(name match)';
    }
  }

  return { email, source, authEmail: userData.user?.email || null };
}

async function main() {
  // Prefer the Mohan Das profile that actually owns marketplace products.
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .ilike('full_name', SELLER_DISPLAY_NAME);
  if (profileError) fail(profileError.message);
  if (!profiles?.length) fail(`No profiles for "${SELLER_DISPLAY_NAME}"`);

  let vendorId = null;
  let profile = null;
  let product = null;

  for (const candidate of profiles) {
    const { data: products, error: productsError } = await admin
      .from('products')
      .select('id, title, title_en, vendor_id, status, final_price, suggested_price, stock_count, quantity')
      .eq('vendor_id', candidate.id)
      .in('status', ['approved', 'published', 'synced'])
      .limit(20);
    if (productsError) fail(productsError.message);
    const withStock = (products || []).find((row) => Number(row.stock_count ?? row.quantity ?? 0) > 0);
    const any = withStock || (products || [])[0];
    if (any) {
      vendorId = candidate.id;
      profile = candidate;
      product = any;
      break;
    }
  }

  if (!vendorId || !product || !profile) {
    fail(`No purchasable products found for any "${SELLER_DISPLAY_NAME}" profile`);
  }

  step('Resolved seller profile', { vendorId, full_name: profile.full_name, role: profile.role });

  if (Number(product.stock_count ?? product.quantity ?? 0) <= 0) {
    const { error: stockError } = await admin
      .from('products')
      .update({ stock_count: 5, quantity: 5 })
      .eq('id', product.id);
    if (stockError) fail(stockError.message);
    step('Restocked seller product for test', { productId: product.id });
  }

  step('Selected seller product', {
    productId: product.id,
    title: product.title_en || product.title,
    vendor_id: product.vendor_id,
  });

  const resolved = await resolveSellerEmail(vendorId, profile.full_name);
  step('Server-side resolved seller email', resolved);
  if (EXPECTED_EMAIL && (resolved.email || '').toLowerCase() !== EXPECTED_EMAIL) {
    fail(`Expected resolved email ${EXPECTED_EMAIL}, got ${resolved.email}`);
  }

  let { data: signIn, error: signInError } = await buyer.auth.signInWithPassword({
    email: BUYER_EMAIL,
    password: BUYER_PASSWORD,
  });
  if (signInError) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: BUYER_EMAIL,
      password: BUYER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Buyer' },
    });
    if (createError && !String(createError.message).toLowerCase().includes('already')) {
      fail(`Buyer setup failed: ${createError.message}`);
    }
    if (created?.user?.id) {
      await admin.from('profiles').upsert({
        id: created.user.id,
        role: 'customer',
        full_name: 'E2E Buyer',
      });
    }
    ({ data: signIn, error: signInError } = await buyer.auth.signInWithPassword({
      email: BUYER_EMAIL,
      password: BUYER_PASSWORD,
    }));
  }
  if (signInError || !signIn.session) fail(`Buyer sign-in failed: ${signInError?.message}`);
  step('Buyer signed in', { buyerId: signIn.user.id, email: BUYER_EMAIL });

  const idempotencyKey = crypto.randomUUID();
  const createRes = await fetch(`${url}/functions/v1/marketplace-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signIn.session.access_token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'create_order',
      items: [{ productId: product.id, quantity: 1 }],
      shippingAddress: 'E2E Test Address, Chennai, TN 600001',
      idempotencyKey,
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok || !createJson.success) {
    fail(`create_order failed: ${JSON.stringify(createJson)}`);
  }
  const orderId = createJson.order?.id;
  step('Order created', { orderId, status: createJson.order?.status, total: createJson.order?.total_amount });

  const { data: items, error: itemsError } = await admin
    .from('order_items')
    .select('id, order_id, product_id, vendor_id, quantity, unit_price, subtotal')
    .eq('order_id', orderId);
  if (itemsError) fail(itemsError.message);
  const item = (items || [])[0];
  if (!item) fail('No order_items for order');
  if (item.vendor_id !== vendorId) {
    fail(`order_item.vendor_id ${item.vendor_id} !== seller ${vendorId}`);
  }

  const { data: sellerProfile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', item.vendor_id)
    .maybeSingle();
  step('order_item seller check', {
    order_item_id: item.id,
    vendor_id: item.vendor_id,
    seller_full_name: sellerProfile?.full_name,
  });
  if ((sellerProfile?.full_name || '').toLowerCase() !== SELLER_DISPLAY_NAME.toLowerCase()) {
    fail(`order_item seller name ${sellerProfile?.full_name} !== ${SELLER_DISPLAY_NAME}`);
  }

  const payRes = await fetch(`${url}/functions/v1/marketplace-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signIn.session.access_token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'process_payment',
      orderId,
      mockOutcome: 'success',
      upiApp: 'gpay',
      upiId: 'success@mockupi',
      transactionId: `E2E-${Date.now()}`,
    }),
  });
  const payJson = await payRes.json();
  if (payRes.status === 410 || String(payJson.error || '').toLowerCase().includes('razorpay')) {
    fail(
      'Mock process_payment is disabled. Complete payment via Razorpay Test Mode (create_razorpay_order + verify_razorpay_payment), then re-run seller notification checks against a paid order.',
    );
  }
  if (!payRes.ok || !payJson.success) {
    fail(`process_payment failed: ${JSON.stringify(payJson)}`);
  }
  step('Payment result', payJson.result);
  step('Seller notifications', payJson.sellerNotifications || []);

  const paymentStatus = String(payJson.result?.payment_status || '').toLowerCase();
  if (paymentStatus !== 'success') fail(`Expected payment_status success, got ${paymentStatus}`);

  const notifications = Array.isArray(payJson.sellerNotifications) ? payJson.sellerNotifications : [];
  const forSeller = notifications.find((n) => n.vendorId === vendorId) || notifications[0];
  if (!forSeller) fail('No sellerNotifications returned from process_payment');

  if (EXPECTED_EMAIL && String(forSeller.to || '').toLowerCase() !== EXPECTED_EMAIL) {
    fail(`Notification recipient ${forSeller.to} !== ${EXPECTED_EMAIL}`);
  }
  step('Confirmed resolved recipient', { to: forSeller.to, sellerName: forSeller.sellerName });

  if (forSeller.sent) {
    step('Email provider accepted request', {
      sent: true,
      providerId: forSeller.providerId,
      to: forSeller.to,
    });

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && forSeller.providerId) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(`https://api.resend.com/emails/${forSeller.providerId}`, {
        headers: { Authorization: `Bearer ${resendKey}` },
      });
      const statusJson = await statusRes.json();
      step('Resend delivery status', statusJson);
    } else {
      step('Delivery status', 'Skipped (set RESEND_API_KEY locally to query Resend by providerId)');
    }
  } else {
    step('Email not sent', { skipped: forSeller.skipped, error: forSeller.error });
    if (forSeller.skipped === 'RESEND_API_KEY not configured') {
      fail('Payment + seller resolution OK, but RESEND_API_KEY is not set on the Edge Function.');
    }
    fail(`Seller email was not sent: ${forSeller.skipped || forSeller.error}`);
  }

  console.log('\nPASS: E2E seller purchase notification completed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
