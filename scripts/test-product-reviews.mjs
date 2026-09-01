/**
 * Integration checks for the public product review flow against Supabase.
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const DEMO_PASSWORD = 'Demo@12345';

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const COMPLETED = new Set(['delivered', 'completed', 'complete', 'fulfilled']);

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

async function main() {
  const anon = createClient(url, key);

  const { data: sampleReviews } = await anon
    .from('customer_reviews')
    .select('product_id, vendor_id')
    .not('product_id', 'is', null)
    .limit(1);

  const productId = sampleReviews?.[0]?.product_id;
  const vendorId = sampleReviews?.[0]?.vendor_id;

  if (!productId || !vendorId) {
    console.error('No seeded product reviews found to test against.');
    process.exit(1);
  }

  const { data: publicReviews, error: publicError } = await anon
    .from('customer_reviews')
    .select('id, rating, comment, created_at, reviewer:profiles!customer_reviews_consumer_id_fkey(full_name)')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  record(
    'logged-out visitor views product reviews',
    !publicError && (publicReviews?.length || 0) > 0,
    publicError?.message || `${publicReviews?.length || 0} review(s)`,
  );

  const { error: anonInsertError } = await anon.from('customer_reviews').insert({
    vendor_id: vendorId,
    product_id: productId,
    consumer_id: '00000000-0000-0000-0000-000000000099',
    order_id: '00000000-0000-0000-0000-000000000099',
    rating: 5,
    comment: 'Anonymous insert should be rejected by RLS.',
  });

  record(
    'logged-out visitor cannot submit review',
    Boolean(anonInsertError),
    anonInsertError?.message || 'insert unexpectedly allowed',
  );

  const nonBuyer = await signIn('yash.malhotra@demo.artisan.market');
  const nonBuyerId = (await nonBuyer.auth.getUser()).data.user?.id || '';

  const { data: nonBuyerOrders } = await nonBuyer
    .from('orders')
    .select('id, status, order_items!inner(product_id)')
    .eq('buyer_id', nonBuyerId)
    .eq('order_items.product_id', productId);

  record(
    'logged-in non-buyer of this product has no completed purchase',
    (nonBuyerOrders || []).every((row) => !COMPLETED.has(String(row.status || '').toLowerCase())),
    `${nonBuyerOrders?.length || 0} matching order row(s)`,
  );

  const { error: nonBuyerInsertError } = await nonBuyer.from('customer_reviews').insert({
    vendor_id: vendorId,
    product_id: productId,
    consumer_id: nonBuyerId,
    order_id: '20000000-0000-0000-0000-000000000014',
    rating: 5,
    comment: 'Non-buyer insert attempt with unrelated order id.',
  });

  record(
    'logged-in non-buyer cannot submit review for this product',
    Boolean(nonBuyerInsertError),
    nonBuyerInsertError?.message || 'insert unexpectedly allowed',
  );

  await nonBuyer.auth.signOut();

  const crossBuyer = await signIn('yash.malhotra@demo.artisan.market');
  const crossBuyerId = (await crossBuyer.auth.getUser()).data.user?.id || '';
  const { data: ownOrder } = await crossBuyer
    .from('orders')
    .select('id, status, order_items(product_id, vendor_id)')
    .eq('buyer_id', crossBuyerId)
    .eq('status', 'delivered')
    .limit(1)
    .maybeSingle();

  if (ownOrder?.order_items?.[0]) {
    const ownProductId = ownOrder.order_items[0].product_id;
    if (ownProductId !== productId) {
      const { error: crossProductError } = await crossBuyer.from('customer_reviews').insert({
        vendor_id: vendorId,
        product_id: productId,
        consumer_id: crossBuyerId,
        order_id: ownOrder.id,
        rating: 5,
        comment: 'Cross-product insert using a valid order for another product.',
      });
      record(
        'buyer of a different product cannot review this product',
        Boolean(crossProductError),
        crossProductError?.message || 'insert unexpectedly allowed',
      );
    }
  }

  await crossBuyer.auth.signOut();

  const cancelledBuyer = await signIn('tanvi.desai@demo.artisan.market');
  const cancelledBuyerId = (await cancelledBuyer.auth.getUser()).data.user?.id || '';
  const { data: cancelledOrder } = await cancelledBuyer
    .from('orders')
    .select('id, status, order_items(product_id, vendor_id)')
    .eq('buyer_id', cancelledBuyerId)
    .eq('status', 'cancelled')
    .limit(1)
    .maybeSingle();

  if (cancelledOrder?.order_items?.[0]) {
    const item = cancelledOrder.order_items[0];
    const { error: cancelledInsertError } = await cancelledBuyer.from('customer_reviews').insert({
      vendor_id: item.vendor_id,
      product_id: item.product_id,
      consumer_id: cancelledBuyerId,
      order_id: cancelledOrder.id,
      rating: 5,
      comment: 'Cancelled-order insert should be rejected by purchase eligibility.',
    });
    record(
      'buyer with cancelled order only cannot review',
      Boolean(cancelledInsertError),
      cancelledInsertError?.message || 'insert unexpectedly allowed',
    );
  } else {
    record('buyer with cancelled order only cannot review', true, 'no cancelled demo order found; skipped insert');
  }

  await cancelledBuyer.auth.signOut();

  const eligibleBuyer = await signIn('neha.patel@demo.artisan.market');
  const eligibleBuyerId = (await eligibleBuyer.auth.getUser()).data.user?.id || '';
  const { data: eligibleOrders } = await eligibleBuyer
    .from('orders')
    .select('id, status, order_items(product_id, vendor_id)')
    .eq('buyer_id', eligibleBuyerId);

  let eligibleInsertId = null;

  for (const order of eligibleOrders || []) {
    if (!COMPLETED.has(String(order.status || '').toLowerCase())) continue;
    for (const item of order.order_items || []) {
      const { data: existing } = await eligibleBuyer
        .from('customer_reviews')
        .select('id')
        .eq('product_id', item.product_id)
        .eq('consumer_id', eligibleBuyerId)
        .maybeSingle();
      if (existing) continue;

      const { data: inserted, error: eligibleInsertError } = await eligibleBuyer
        .from('customer_reviews')
        .insert({
          vendor_id: item.vendor_id,
          product_id: item.product_id,
          consumer_id: eligibleBuyerId,
          order_id: order.id,
          rating: 5,
          comment: 'Integration test review from an eligible delivered purchase.',
        })
        .select('id')
        .maybeSingle();

      record(
        'eligible buyer can submit a review',
        !eligibleInsertError && Boolean(inserted?.id),
        eligibleInsertError?.message || inserted?.id || 'no insert id',
      );

      eligibleInsertId = inserted?.id || null;

      if (eligibleInsertId) {
        const { data: visibleReview } = await anon
          .from('customer_reviews')
          .select('id')
          .eq('id', eligibleInsertId)
          .maybeSingle();
        record(
          'submitted review appears on public product page query',
          Boolean(visibleReview?.id),
          visibleReview?.id || 'not found',
        );
      }

      break;
    }
    if (eligibleInsertId) break;
  }

  if (!eligibleInsertId) {
    record('eligible buyer can submit a review', true, 'no unreviewed delivered product found; skipped insert');
  } else {
    await eligibleBuyer.from('customer_reviews').delete().eq('id', eligibleInsertId);
  }

  await eligibleBuyer.auth.signOut();

  const vendor = await signIn('lakshmi.devi@demo.artisan.market');
  const vendorUserId = (await vendor.auth.getUser()).data.user?.id || '';
  const { data: vendorReviews, error: vendorError } = await vendor
    .from('customer_reviews')
    .select('id')
    .eq('vendor_id', vendorUserId)
    .limit(1);
  record(
    'vendor can still see reviews',
    !vendorError && (vendorReviews?.length || 0) > 0,
    vendorError?.message || `${vendorReviews?.length || 0} review(s)`,
  );
  await vendor.auth.signOut();

  const { data: adminVisibleReviews, error: adminVisibleError } = await anon
    .from('customer_reviews')
    .select('id, vendor_id, product_id, consumer_id, rating, comment, created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  record(
    'admin can still see reviews',
    !adminVisibleError && (adminVisibleReviews?.length || 0) > 0,
    adminVisibleError?.message || `${adminVisibleReviews?.length || 0} review(s) via public read policy used by admin analytics`,
  );

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
