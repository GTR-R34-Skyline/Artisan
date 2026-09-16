import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isDeliverableEmail, sendSellerOrderEmail } from '../_shared/sellerEmail.ts';
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  inrToPaise,
  isSuccessfulRazorpayPaymentStatus,
  mapRazorpayInstrumentToPaymentMethod,
  verifyCheckoutPaymentSignature,
  verifyWebhookSignature,
} from '../_shared/razorpay.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

/**
 * Fixed Demo Courier for the current marketplace logistics demo.
 * Keep in sync with src/config/logistics.ts (DEMO_COURIER_PROFILE_ID).
 */
const DEMO_COURIER_PROFILE_ID = '3734f939-b7c3-4f1d-bdce-a2460cf76a58';

const PUBLIC_STATUSES = new Set(['approved', 'published', 'synced']);

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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

const productStock = (row: Record<string, unknown>): number =>
  Math.max(0, toNumber(row.stock_count ?? row.quantity));

const readError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Checkout request failed.';
};

const productPrice = (row: Record<string, unknown>): number => {
  const finalPrice = row.final_price;
  const suggested = row.suggested_price;
  if (finalPrice !== null && finalPrice !== undefined) return Math.max(0, toNumber(finalPrice));
  return Math.max(0, toNumber(suggested));
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));

/**
 * Reads optional GST discount rate from Edge secrets.
 * Do NOT invent a default rate — if unset/invalid, no GST discount is applied.
 */
const readConfiguredGstDiscountRate = (): number | null => {
  const raw = Deno.env.get('GST_DISCOUNT_RATE') || Deno.env.get('GST_RATE');
  if (!raw || !raw.trim()) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 100) return null;
  return parsed;
};

const notifySellersForPaidOrder = async (
  admin: ReturnType<typeof createClient>,
  orderId: string,
): Promise<Array<Record<string, unknown>>> => {
  const notifications: Array<Record<string, unknown>> = [];
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, status, created_at, total_amount')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) return notifications;

  const orderRecord = asRecord(order);
  const orderStatus = toStringValue(orderRecord.status) || 'processing';
  const orderDate = toStringValue(orderRecord.created_at) || new Date().toISOString();

  const { data: itemRows, error: itemsError } = await admin
    .from('order_items')
    .select('id, product_id, vendor_id, quantity, unit_price, subtotal')
    .eq('order_id', orderId);
  if (itemsError) throw itemsError;

  const items = (itemRows || []).map(asRecord);
  const vendorIds = uniqueStrings(items.map((row) => toStringValue(row.vendor_id)));
  if (!vendorIds.length) return notifications;

  const productIds = uniqueStrings(items.map((row) => toStringValue(row.product_id)));
  const productsById = new Map<string, Record<string, unknown>>();
  if (productIds.length) {
    const { data: productRows, error: productsError } = await admin
      .from('products')
      .select('id, title, title_en')
      .in('id', productIds);
    if (productsError) throw productsError;
    (productRows || []).forEach((row) => {
      const record = asRecord(row);
      const id = toStringValue(record.id);
      if (id) productsById.set(id, record);
    });
  }

  const appBase = (Deno.env.get('APP_BASE_URL') || Deno.env.get('PUBLIC_APP_URL') || '').replace(/\/$/, '');
  const dashboardUrl = appBase ? `${appBase}/vendor/dashboard` : undefined;

  for (const vendorId of vendorIds) {
    const vendorItems = items.filter((row) => toStringValue(row.vendor_id) === vendorId);
    if (!vendorItems.length) continue;

    let sellerEmail: string | null = null;
    let sellerName = 'Artisan';

    try {
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(vendorId);
      if (!userError && userData?.user?.email) {
        sellerEmail = userData.user.email;
      }
    } catch (authError) {
      console.warn('[seller-email] auth_lookup_failed', {
        vendorId,
        message: authError instanceof Error ? authError.message : String(authError),
      });
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', vendorId)
      .maybeSingle();
    const profileName = toStringValue(asRecord(profile).full_name);
    if (profileName) sellerName = profileName;

    // Fallback: vendor application email matched by profile name (still dynamic — never hardcoded).
    if (!isDeliverableEmail(sellerEmail)) {
      const { data: appsByName } = await admin
        .from('vendor_applications')
        .select('email, name, created_at')
        .ilike('name', sellerName)
        .order('created_at', { ascending: false })
        .limit(5);
      const candidate = (appsByName || [])
        .map(asRecord)
        .map((row) => toStringValue(row.email))
        .find((email) => isDeliverableEmail(email));
      if (candidate) sellerEmail = candidate;
    }

    if (!isDeliverableEmail(sellerEmail)) {
      console.warn('[seller-email] no_deliverable_email_for_vendor', { orderId, vendorId, sellerName });
      notifications.push({
        vendorId,
        sellerName,
        sent: false,
        skipped: 'no_deliverable_email_for_vendor',
        to: sellerEmail,
      });
      continue;
    }

    const lines = vendorItems.map((row) => {
      const productId = toStringValue(row.product_id) || '';
      const product = productsById.get(productId);
      const productName =
        toStringValue(product?.title_en) ||
        toStringValue(product?.title) ||
        'Product';
      const quantity = Math.max(1, toNumber(row.quantity));
      const unitPrice = toNumber(row.unit_price);
      const subtotal = toNumber(row.subtotal) || unitPrice * quantity;
      return { productName, quantity, unitPrice, subtotal };
    });

    const sendResult = await sendSellerOrderEmail({
      to: sellerEmail!,
      sellerName,
      orderId,
      orderStatus,
      orderDate,
      lines,
      dashboardUrl,
      idempotencyKey: `artisan-seller-order-${orderId}-${vendorId}`,
    });

    notifications.push({
      vendorId,
      sellerName,
      to: sendResult.to || sellerEmail,
      sent: sendResult.sent,
      skipped: sendResult.skipped ?? null,
      error: sendResult.error ?? null,
      providerId: sendResult.providerId ?? null,
      lineCount: lines.length,
    });
  }

  return notifications;
};

const buildTrackingNumber = (orderId: string, sequence: number): string => {
  const orderPrefix = orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const suffix = String(Math.max(1, sequence)).padStart(4, '0');
  return `MC${orderPrefix}${suffix}`;
};

const estimatedDeliveryDate = (): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 5);
  return date.toISOString().slice(0, 10);
};

/** Create one pending shipment per vendor on an order. Idempotent for retries. */
const ensureShipmentsForPaidOrder = async (
  admin: ReturnType<typeof createClient>,
  orderId: string,
): Promise<void> => {
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, buyer_id, shipping_address, status')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!order) throw new Error('Order not found while preparing shipments.');

  const orderRecord = asRecord(order);
  const buyerId = toStringValue(orderRecord.buyer_id);
  const destination = toStringValue(orderRecord.shipping_address);
  if (!buyerId) throw new Error('Order buyer is missing.');
  if (!destination) throw new Error('Order shipping address is missing.');

  const { data: itemRows, error: itemsError } = await admin
    .from('order_items')
    .select('vendor_id')
    .eq('order_id', orderId);

  if (itemsError) throw itemsError;

  const vendorIds = uniqueStrings(
    (itemRows || []).map((row) => toStringValue(asRecord(row).vendor_id)),
  );
  if (!vendorIds.length) return;

  const { data: existingRows, error: existingError } = await admin
    .from('shipments')
    .select('id, vendor_id, tracking_number')
    .eq('order_id', orderId);

  if (existingError) throw existingError;

  const existingVendorIds = new Set(
    (existingRows || [])
      .map((row) => toStringValue(asRecord(row).vendor_id))
      .filter((value): value is string => Boolean(value)),
  );

  const missingVendorIds = vendorIds.filter((vendorId) => !existingVendorIds.has(vendorId));
  if (!missingVendorIds.length) return;

  const { count: shipmentCount, error: countError } = await admin
    .from('shipments')
    .select('id', { count: 'exact', head: true });

  if (countError) throw countError;

  let sequence = (shipmentCount || 0) + 1;
  const inserts = missingVendorIds.map((vendorId) => {
    const trackingNumber = buildTrackingNumber(orderId, sequence);
    sequence += 1;
    return {
      order_id: orderId,
      vendor_id: vendorId,
      buyer_id: buyerId,
      courier_id: null,
      carrier: 'Mock Courier',
      tracking_number: trackingNumber,
      status: 'pending',
      origin: 'Artisan Origin',
      destination,
      estimated_delivery_date: estimatedDeliveryDate(),
      dispatched_at: null,
      picked_up_at: null,
      delivered_at: null,
    };
  });

  const { error: insertError } = await admin.from('shipments').insert(inserts);
  if (insertError) {
    // Concurrent retries may race; treat unique/duplicate conflicts as already prepared.
    if (insertError.code === '23505') return;
    throw insertError;
  }
};

interface CartItemInput {
  productId: string;
  quantity: number;
}

const readRazorpayCredentials = (): { keyId: string; keySecret: string } => {
  const keyId = Deno.env.get('RAZORPAY_KEY_ID') || '';
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') || '';
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured on the server.');
  }
  return { keyId, keySecret };
};

/** Values allowed by payments_payment_method_check — Razorpay is the gateway, not a method. */
const ALLOWED_PAYMENT_METHODS = new Set(['upi', 'card', 'netbanking', 'cod']);

/**
 * Existing payments schema mapping (no migration):
 * - payment_method = allowed instrument ('upi' | 'card' | 'netbanking' | 'cod')
 * - upi_app = Razorpay Order ID (provider order reference; legacy column)
 * - transaction_id = Razorpay Payment ID after capture (never MOCK-UPI-*)
 */
const fulfillVerifiedRazorpayPayment = async (
  admin: ReturnType<typeof createClient>,
  input: {
    artisanOrderId: string;
    buyerId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    paymentMethod?: string | null;
  },
): Promise<{ result: Record<string, unknown>; sellerNotifications: Array<Record<string, unknown>>; idempotent: boolean }> => {
  const artisanPaymentMethod = ALLOWED_PAYMENT_METHODS.has((input.paymentMethod || '').toLowerCase())
    ? (input.paymentMethod || 'upi').toLowerCase()
    : mapRazorpayInstrumentToPaymentMethod(input.paymentMethod);

  const { data: existingPayment, error: existingPaymentError } = await admin
    .from('payments')
    .select('id, status, amount, transaction_id, upi_app, payment_method')
    .eq('order_id', input.artisanOrderId)
    .maybeSingle();
  if (existingPaymentError) throw existingPaymentError;

  const existing = asRecord(existingPayment);
  if (toStringValue(existing.status)?.toLowerCase() === 'success') {
    try {
      await ensureShipmentsForPaidOrder(admin, input.artisanOrderId);
    } catch (shipmentError) {
      console.error('[marketplace-checkout] shipment_prep_failed_idempotent', {
        orderId: input.artisanOrderId,
        message: readError(shipmentError),
      });
    }
    return {
      idempotent: true,
      result: {
        idempotent: true,
        order_id: input.artisanOrderId,
        payment_status: 'success',
        payment_method: toStringValue(existing.payment_method) || artisanPaymentMethod,
        transaction_id: toStringValue(existing.transaction_id),
        razorpay_order_id: toStringValue(existing.upi_app),
        razorpay_payment_id: toStringValue(existing.transaction_id),
      },
      sellerNotifications: [],
    };
  }

  const { data, error } = await admin.rpc('finalize_mock_upi_payment', {
    p_order_id: input.artisanOrderId,
    p_buyer_id: input.buyerId,
    p_outcome: 'success',
    p_upi_app: input.razorpayOrderId,
    p_upi_id: null,
    p_transaction_id: input.razorpayPaymentId,
  });

  if (error) {
    throw new Error(error.message || 'Order could not be finalized after payment verification.');
  }

  const result = asRecord(data);

  // Persist gateway IDs + allowed payment_method. Never write payment_method = 'razorpay'.
  await admin
    .from('payments')
    .update({
      payment_method: artisanPaymentMethod,
      upi_app: input.razorpayOrderId,
      transaction_id: input.razorpayPaymentId,
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', input.artisanOrderId);

  result.payment_method = artisanPaymentMethod;
  result.razorpay_order_id = input.razorpayOrderId;
  result.razorpay_payment_id = input.razorpayPaymentId;
  result.transaction_id = input.razorpayPaymentId;

  try {
    await ensureShipmentsForPaidOrder(admin, input.artisanOrderId);
  } catch (shipmentError) {
    console.error('[marketplace-checkout] shipment_prep_failed', {
      orderId: input.artisanOrderId,
      message: readError(shipmentError),
    });
  }

  let sellerNotifications: Array<Record<string, unknown>> = [];
  try {
    sellerNotifications = await notifySellersForPaidOrder(admin, input.artisanOrderId);
  } catch (notifyError) {
    console.error('[marketplace-checkout] seller_notify_failed', {
      orderId: input.artisanOrderId,
      message: readError(notifyError),
    });
  }

  return {
    idempotent: Boolean(result.idempotent),
    result,
    sellerNotifications,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Server configuration is incomplete.' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const razorpaySignatureHeader = req.headers.get('x-razorpay-signature');

    // Razorpay webhooks are unauthenticated; verify X-Razorpay-Signature instead.
    if (razorpaySignatureHeader && !req.headers.get('Authorization')) {
      const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '';
      if (!webhookSecret) {
        return json({ error: 'Razorpay webhook is not configured.' }, 503);
      }

      const rawBody = await req.text();
      const valid = await verifyWebhookSignature({
        rawBody,
        signature: razorpaySignatureHeader,
        webhookSecret,
      });
      if (!valid) {
        return json({ error: 'Invalid webhook signature.' }, 400);
      }

      const event = asRecord(JSON.parse(rawBody));
      const eventType = toStringValue(event.event) || '';
      if (eventType !== 'payment.captured' && eventType !== 'order.paid') {
        return json({ success: true, ignored: true, event: eventType });
      }

      const payload = asRecord(event.payload);
      const paymentEntity = asRecord(asRecord(payload.payment).entity);
      const razorpayPaymentId = toStringValue(paymentEntity.id);
      const razorpayOrderId = toStringValue(paymentEntity.order_id);
      const paymentAmountPaise = Math.round(toNumber(paymentEntity.amount));
      const paymentCurrency = (toStringValue(paymentEntity.currency) || '').toUpperCase();
      const paymentStatus = toStringValue(paymentEntity.status) || '';

      if (!razorpayPaymentId || !razorpayOrderId) {
        return json({ error: 'Webhook payment payload incomplete.' }, 400);
      }
      if (paymentCurrency !== 'INR') {
        return json({ error: 'Unsupported payment currency.' }, 400);
      }
      if (!isSuccessfulRazorpayPaymentStatus(paymentStatus, Boolean(paymentEntity.captured))) {
        return json({ success: true, ignored: true, status: paymentStatus });
      }

      const { data: paymentRow, error: paymentLookupError } = await admin
        .from('payments')
        .select('id, order_id, buyer_id, amount, status, upi_app, transaction_id')
        .eq('upi_app', razorpayOrderId)
        .maybeSingle();
      if (paymentLookupError) throw paymentLookupError;
      if (!paymentRow) {
        return json({ error: 'No ARTISAN payment matches this Razorpay order.' }, 404);
      }

      const paymentRecord = asRecord(paymentRow);
      const artisanOrderId = toStringValue(paymentRecord.order_id);
      const buyerId = toStringValue(paymentRecord.buyer_id);
      if (!artisanOrderId || !buyerId) {
        return json({ error: 'Payment record is incomplete.' }, 400);
      }

      const expectedPaise = inrToPaise(toNumber(paymentRecord.amount));
      if (expectedPaise !== paymentAmountPaise) {
        console.error('[marketplace-checkout] webhook_amount_mismatch', {
          artisanOrderId,
          expectedPaise,
          paymentAmountPaise,
        });
        return json({ error: 'Payment amount does not match the ARTISAN order.' }, 400);
      }

      const fulfilled = await fulfillVerifiedRazorpayPayment(admin, {
        artisanOrderId,
        buyerId,
        razorpayOrderId,
        razorpayPaymentId,
        paymentMethod: mapRazorpayInstrumentToPaymentMethod(toStringValue(paymentEntity.method)),
      });

      return json({
        success: true,
        source: 'webhook',
        idempotent: fulfilled.idempotent,
        result: fulfilled.result,
      });
    }

    const authorization = req.headers.get('Authorization') || '';
    if (!authorization) {
      return json({ error: 'Missing authorization.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const userId = userData.user?.id;
    if (userError || !userId) {
      return json({ error: 'Invalid session.' }, 401);
    }

    const body = asRecord(await req.json());
    const action = toStringValue(body.action);

    if (action === 'create_order') {
      const itemsRaw = Array.isArray(body.items) ? body.items : [];
      const items: CartItemInput[] = itemsRaw
        .map((item) => asRecord(item))
        .map((item) => ({
          productId: toStringValue(item.productId) || toStringValue(item.product_id) || '',
          quantity: Math.max(1, Math.round(toNumber(item.quantity))),
        }))
        .filter((item) => item.productId);

      if (!items.length) {
        return json({ error: 'Your collection is empty.' }, 400);
      }

      const shippingAddress = toStringValue(body.shippingAddress) || toStringValue(body.shipping_address);
      if (!shippingAddress || shippingAddress.length < 8) {
        return json({ error: 'Please provide a delivery address.' }, 400);
      }

      const idempotencyKey = toStringValue(body.idempotencyKey) || toStringValue(body.idempotency_key);
      if (idempotencyKey) {
        const { data: existingOrder } = await admin
          .from('orders')
          .select('id, status, total_amount, stock_deducted, checkout_idempotency_key')
          .eq('buyer_id', userId)
          .eq('checkout_idempotency_key', idempotencyKey)
          .maybeSingle();

        if (existingOrder?.id) {
          const { data: payment } = await admin
            .from('payments')
            .select('id, status, amount, transaction_id, upi_app, payment_method')
            .eq('order_id', existingOrder.id)
            .maybeSingle();

          return json({
            success: true,
            idempotent: true,
            order: existingOrder,
            payment,
          });
        }
      }

      const productIds = items.map((item) => item.productId);
      const { data: productRows, error: productError } = await admin
        .from('products')
        .select('id, vendor_id, title, title_en, final_price, suggested_price, quantity, stock_count, status')
        .in('id', productIds);

      if (productError) throw productError;

      const productsById = new Map(
        (productRows || []).map((row) => [toStringValue(asRecord(row).id) || '', asRecord(row)]),
      );

      let totalAmount = 0;
      const orderItemsPayload: Record<string, unknown>[] = [];

      for (const item of items) {
        const product = productsById.get(item.productId);
        if (!product) {
          return json({ error: 'One of the selected pieces is no longer available.' }, 400);
        }

        const status = toStringValue(product.status) || '';
        if (!PUBLIC_STATUSES.has(status)) {
          return json({ error: 'One of the selected pieces is no longer listed.' }, 400);
        }

        const available = productStock(product);
        if (available < item.quantity) {
          return json({ error: 'One of the selected pieces does not have enough stock.' }, 400);
        }

        const unitPrice = productPrice(product);
        if (unitPrice <= 0) {
          return json({ error: 'One of the selected pieces cannot be purchased yet.' }, 400);
        }

        const subtotal = unitPrice * item.quantity;
        totalAmount += subtotal;
        orderItemsPayload.push({
          product_id: item.productId,
          vendor_id: toStringValue(product.vendor_id),
          quantity: item.quantity,
          unit_price: unitPrice,
          // subtotal may be a generated column in the live DB — do not insert it.
        });
      }

      // GSTIN is accepted as free text (no external verification). Discount applies only when
      // a GSTIN value is supplied AND GST_DISCOUNT_RATE / GST_RATE is configured server-side.
      const gstin = toStringValue(body.gstin) || toStringValue(body.GSTIN);
      const hasGstin = Boolean(gstin);
      const gstRate = readConfiguredGstDiscountRate();
      let gstDiscountAmount = 0;
      let gstDiscountApplied = false;
      if (hasGstin && gstRate !== null) {
        gstDiscountAmount = Math.round((totalAmount * (gstRate / 100)) * 100) / 100;
        totalAmount = Math.max(0, Math.round((totalAmount - gstDiscountAmount) * 100) / 100);
        gstDiscountApplied = gstDiscountAmount > 0;
      }

      // Ignore any client-supplied totals / discounts — server values are authoritative.
      void body.totalAmount;
      void body.discountAmount;
      void body.gstDiscountAmount;

      const { data: order, error: orderError } = await admin
        .from('orders')
        .insert({
          buyer_id: userId,
          total_amount: totalAmount,
          status: 'processing',
          shipping_address: shippingAddress,
          checkout_idempotency_key: idempotencyKey,
          stock_deducted: false,
        })
        .select('id, status, total_amount, shipping_address, stock_deducted, created_at')
        .single();

      if (orderError) {
        if (orderError.code === '23505' && idempotencyKey) {
          const { data: existingOrder } = await admin
            .from('orders')
            .select('id, status, total_amount, stock_deducted')
            .eq('buyer_id', userId)
            .eq('checkout_idempotency_key', idempotencyKey)
            .maybeSingle();
          const { data: payment } = existingOrder?.id
            ? await admin.from('payments').select('*').eq('order_id', existingOrder.id).maybeSingle()
            : { data: null };
          return json({ success: true, idempotent: true, order: existingOrder, payment });
        }
        throw orderError;
      }

      const orderId = toStringValue(asRecord(order).id);
      if (!orderId) throw new Error('Order could not be created.');

      const { error: itemsError } = await admin.from('order_items').insert(
        orderItemsPayload.map((item) => ({ ...item, order_id: orderId })),
      );
      if (itemsError) throw itemsError;

      const transactionId = null;
      const { data: payment, error: paymentError } = await admin
        .from('payments')
        .insert({
          order_id: orderId,
          buyer_id: userId,
          payment_method: 'upi',
          upi_app: null,
          transaction_id: transactionId,
          amount: totalAmount,
          status: 'pending',
        })
        .select('id, status, amount, transaction_id, payment_method, upi_app')
        .single();

      if (paymentError) throw paymentError;

      return json({
        success: true,
        order,
        payment,
        pricing: {
          gstinSupplied: hasGstin,
          gstDiscountRate: gstRate,
          gstDiscountAmount,
          gstDiscountApplied,
          // GSTIN is not persisted — no suitable schema field without a migration.
          gstinPersisted: false,
        },
      });
    }

    if (action === 'get_checkout') {
      const orderId = toStringValue(body.orderId) || toStringValue(body.order_id);
      if (!orderId) return json({ error: 'Order id is required.' }, 400);

      const { data: order, error: orderError } = await admin
        .from('orders')
        .select('id, buyer_id, status, total_amount, shipping_address, stock_deducted, created_at, updated_at')
        .eq('id', orderId)
        .maybeSingle();

      if (orderError) throw orderError;
      if (!order || asRecord(order).buyer_id !== userId) {
        return json({ error: 'Order not found.' }, 404);
      }

      const [{ data: items, error: itemsError }, { data: payment, error: paymentError }] = await Promise.all([
        admin.from('order_items').select('id, product_id, vendor_id, quantity, unit_price, subtotal').eq('order_id', orderId),
        admin.from('payments').select('id, status, amount, transaction_id, upi_app, payment_method, created_at, updated_at').eq('order_id', orderId).maybeSingle(),
      ]);

      if (itemsError) throw itemsError;
      if (paymentError) throw paymentError;

      const paymentStatus = toStringValue(asRecord(payment).status)?.toLowerCase();
      if (paymentStatus === 'success') {
        await ensureShipmentsForPaidOrder(admin, orderId);
      }

      const productIds = (items || [])
        .map((row) => toStringValue(asRecord(row).product_id))
        .filter((id): id is string => Boolean(id));

      let products: Record<string, unknown>[] = [];
      if (productIds.length) {
        const { data: productRows, error: productsError } = await admin
          .from('products')
          .select('id, title, title_en, original_image_url, studio_image_url, enhanced_image_url')
          .in('id', productIds);
        if (productsError) throw productsError;
        products = (productRows || []).map(asRecord);
      }

      return json({ success: true, order, items: items || [], payment, products });
    }

    if (action === 'create_razorpay_order') {
      const orderId = toStringValue(body.orderId) || toStringValue(body.order_id);
      if (!orderId) return json({ error: 'Order id is required.' }, 400);

      const { keyId, keySecret } = readRazorpayCredentials();

      const { data: order, error: orderError } = await admin
        .from('orders')
        .select('id, buyer_id, status, total_amount, stock_deducted')
        .eq('id', orderId)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order || asRecord(order).buyer_id !== userId) {
        return json({ error: 'Order not found.' }, 404);
      }

      const orderRecord = asRecord(order);
      if (Boolean(orderRecord.stock_deducted)) {
        return json({ error: 'This order has already been fulfilled.' }, 400);
      }

      const { data: payment, error: paymentError } = await admin
        .from('payments')
        .select('id, status, amount, transaction_id, upi_app, payment_method')
        .eq('order_id', orderId)
        .maybeSingle();
      if (paymentError) throw paymentError;
      if (!payment) return json({ error: 'Payment record not found.' }, 404);

      const paymentRecord = asRecord(payment);
      if (toStringValue(paymentRecord.status)?.toLowerCase() === 'success') {
        return json({ error: 'This order is already paid.' }, 400);
      }

      const amountInr = toNumber(paymentRecord.amount ?? orderRecord.total_amount);
      if (amountInr <= 0) {
        return json({ error: 'This order has no payable amount.' }, 400);
      }
      const amountPaise = inrToPaise(amountInr);

      const existingRazorpayOrderId = toStringValue(paymentRecord.upi_app);
      if (existingRazorpayOrderId && existingRazorpayOrderId.startsWith('order_')) {
        return json({
          success: true,
          reused: true,
          keyId,
          razorpayOrderId: existingRazorpayOrderId,
          amount: amountInr,
          amountPaise,
          currency: 'INR',
          artisanOrderId: orderId,
        });
      }

      const razorpayOrder = await createRazorpayOrder({
        keyId,
        keySecret,
        amountPaise,
        receipt: orderId,
        notes: {
          artisan_order_id: orderId,
          buyer_id: userId,
        },
      });

      if (!razorpayOrder.id || razorpayOrder.amount !== amountPaise || razorpayOrder.currency !== 'INR') {
        return json({ error: 'Razorpay order could not be created with the expected amount.' }, 502);
      }

      const { error: updateError } = await admin
        .from('payments')
        .update({
          payment_method: 'upi',
          upi_app: razorpayOrder.id,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', toStringValue(paymentRecord.id) || '');

      if (updateError) throw updateError;

      return json({
        success: true,
        reused: false,
        keyId,
        razorpayOrderId: razorpayOrder.id,
        amount: amountInr,
        amountPaise,
        currency: 'INR',
        artisanOrderId: orderId,
      });
    }

    if (action === 'verify_razorpay_payment') {
      const orderId = toStringValue(body.orderId) || toStringValue(body.order_id);
      const razorpayOrderId = toStringValue(body.razorpayOrderId) || toStringValue(body.razorpay_order_id);
      const razorpayPaymentId = toStringValue(body.razorpayPaymentId) || toStringValue(body.razorpay_payment_id);
      const razorpaySignature = toStringValue(body.razorpaySignature) || toStringValue(body.razorpay_signature);

      if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return json({ error: 'Payment verification details are incomplete.' }, 400);
      }

      const { keyId, keySecret } = readRazorpayCredentials();

      const { data: order, error: orderError } = await admin
        .from('orders')
        .select('id, buyer_id, status, total_amount, stock_deducted')
        .eq('id', orderId)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order || asRecord(order).buyer_id !== userId) {
        return json({ error: 'Order not found.' }, 404);
      }

      const { data: payment, error: paymentError } = await admin
        .from('payments')
        .select('id, status, amount, transaction_id, upi_app, payment_method')
        .eq('order_id', orderId)
        .maybeSingle();
      if (paymentError) throw paymentError;
      if (!payment) return json({ error: 'Payment record not found.' }, 404);

      const paymentRecord = asRecord(payment);
      const storedRazorpayOrderId = toStringValue(paymentRecord.upi_app);

      if (!storedRazorpayOrderId || storedRazorpayOrderId !== razorpayOrderId) {
        return json({ error: 'Razorpay order does not match this ARTISAN payment.' }, 400);
      }

      const signatureOk = await verifyCheckoutPaymentSignature({
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
        keySecret,
      });
      if (!signatureOk) {
        return json({ error: 'Payment signature verification failed.' }, 400);
      }

      const remotePayment = await fetchRazorpayPayment({
        keyId,
        keySecret,
        paymentId: razorpayPaymentId,
      });

      if (remotePayment.order_id !== razorpayOrderId) {
        return json({ error: 'Razorpay payment does not belong to the expected order.' }, 400);
      }
      if ((remotePayment.currency || '').toUpperCase() !== 'INR') {
        return json({ error: 'Payment currency mismatch.' }, 400);
      }

      const expectedPaise = inrToPaise(toNumber(paymentRecord.amount));
      if (Math.round(remotePayment.amount) !== expectedPaise) {
        return json({ error: 'Payment amount does not match the ARTISAN order total.' }, 400);
      }

      if (!isSuccessfulRazorpayPaymentStatus(remotePayment.status, remotePayment.captured)) {
        return json({ error: 'Razorpay payment is not captured yet.' }, 400);
      }

      // Ignore any client-supplied amounts — only server/payment record amounts are trusted.
      void body.amount;
      void body.amountPaise;

      const fulfilled = await fulfillVerifiedRazorpayPayment(admin, {
        artisanOrderId: orderId,
        buyerId: userId,
        razorpayOrderId,
        razorpayPaymentId,
        paymentMethod: mapRazorpayInstrumentToPaymentMethod(remotePayment.method),
      });

      return json({
        success: true,
        result: fulfilled.result,
        sellerNotifications: fulfilled.sellerNotifications,
        idempotent: fulfilled.idempotent,
      });
    }

    if (action === 'process_payment') {
      return json({
        error: 'Mock UPI payment has been replaced by Razorpay. Use create_razorpay_order and verify_razorpay_payment.',
      }, 410);
    }

    if (action === 'retry_payment') {
      const orderId = toStringValue(body.orderId) || toStringValue(body.order_id);
      if (!orderId) return json({ error: 'Order id is required.' }, 400);

      const { data, error } = await admin.rpc('reset_mock_payment_for_retry', {
        p_order_id: orderId,
        p_buyer_id: userId,
      });

      if (error) {
        return json({ error: error.message || 'Payment could not be reset.' }, 400);
      }

      // Clear prior Razorpay order reference so a fresh Razorpay order can be created on retry.
      await admin
        .from('payments')
        .update({
          upi_app: null,
          transaction_id: null,
          payment_method: 'upi',
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', orderId)
        .eq('buyer_id', userId);

      return json({ success: true, result: data });
    }

    if (action === 'ensure_shipments') {
      const orderId = toStringValue(body.orderId) || toStringValue(body.order_id);
      if (!orderId) return json({ error: 'Order id is required.' }, 400);

      const { data: order, error: orderError } = await admin
        .from('orders')
        .select('id, buyer_id')
        .eq('id', orderId)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order) return json({ error: 'Order not found.' }, 404);

      const orderBuyerId = toStringValue(asRecord(order).buyer_id);
      const isBuyer = orderBuyerId === userId;
      let isVendor = false;
      if (!isBuyer) {
        const { data: vendorItems, error: vendorItemsError } = await admin
          .from('order_items')
          .select('id')
          .eq('order_id', orderId)
          .eq('vendor_id', userId)
          .limit(1);
        if (vendorItemsError) throw vendorItemsError;
        isVendor = Boolean(vendorItems?.length);
      }

      if (!isBuyer && !isVendor) {
        return json({ error: 'You cannot prepare shipments for this order.' }, 403);
      }

      const { data: payment, error: paymentError } = await admin
        .from('payments')
        .select('status')
        .eq('order_id', orderId)
        .maybeSingle();
      if (paymentError) throw paymentError;

      const paymentStatus = toStringValue(asRecord(payment).status)?.toLowerCase();
      if (paymentStatus !== 'success') {
        return json({ success: true, prepared: false, reason: 'payment_not_success' });
      }

      await ensureShipmentsForPaidOrder(admin, orderId);
      return json({ success: true, prepared: true });
    }

    if (action === 'dispatch_shipment') {
      const shipmentId = toStringValue(body.shipmentId) || toStringValue(body.shipment_id) || toStringValue(body.p_shipment_id);
      if (!shipmentId) return json({ error: 'Shipment id is required.' }, 400);

      const { data: existingShipment, error: existingError } = await admin
        .from('shipments')
        .select('id, vendor_id, status, courier_id, tracking_number, order_id')
        .eq('id', shipmentId)
        .maybeSingle();

      if (existingError) throw existingError;
      if (!existingShipment) return json({ error: 'Shipment not found.' }, 404);

      const shipmentRecord = asRecord(existingShipment);
      const shipmentVendorId = toStringValue(shipmentRecord.vendor_id);
      if (!shipmentVendorId || shipmentVendorId !== userId) {
        return json({ error: 'You can only dispatch your own shipments.' }, 403);
      }

      const currentStatus = toStringValue(shipmentRecord.status) || '';
      if (!['pending', 'seller_processing'].includes(currentStatus)) {
        return json({ error: 'This shipment cannot be dispatched from its current status.' }, 400);
      }

      // Run the existing seller dispatch RPC as the authenticated seller (ownership + event creation).
      const { data: rpcData, error: rpcError } = await userClient.rpc('seller_dispatch_shipment', {
        p_shipment_id: shipmentId,
      });

      if (rpcError) {
        return json({ error: rpcError.message || 'The shipment could not be marked as dispatched.' }, 400);
      }

      // Assign every dispatched shipment to the single Demo Courier account.
      const { data: assigned, error: assignError } = await admin
        .from('shipments')
        .update({ courier_id: DEMO_COURIER_PROFILE_ID })
        .eq('id', shipmentId)
        .eq('vendor_id', userId)
        .eq('status', 'dispatched')
        .select('id, order_id, vendor_id, buyer_id, courier_id, carrier, tracking_number, status, origin, destination, estimated_delivery_date, dispatched_at, picked_up_at, delivered_at, created_at, updated_at')
        .maybeSingle();

      if (assignError) {
        return json({
          error: assignError.message || 'Shipment was dispatched, but the Demo Courier could not be assigned.',
        }, 500);
      }

      return json({
        success: true,
        shipment: assigned || rpcData,
      });
    }

    // Buyer tracking read path. Direct table SELECT is currently empty under buyer RLS
    // (courier/vendor policies exist; buyer_id SELECT does not). This action verifies
    // order ownership then returns that buyer's shipments + events via service role.
    if (action === 'list_order_shipments') {
      const orderId = toStringValue(body.orderId) || toStringValue(body.order_id);
      if (!orderId) return json({ error: 'Order id is required.' }, 400);

      const { data: order, error: orderError } = await admin
        .from('orders')
        .select('id, buyer_id')
        .eq('id', orderId)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order || asRecord(order).buyer_id !== userId) {
        return json({ error: 'Order not found.' }, 404);
      }

      const { data: shipmentRows, error: shipmentError } = await admin
        .from('shipments')
        .select(
          'id, order_id, vendor_id, buyer_id, courier_id, carrier, tracking_number, status, origin, destination, estimated_delivery_date, dispatched_at, picked_up_at, delivered_at, created_at, updated_at',
        )
        .eq('order_id', orderId)
        .eq('buyer_id', userId)
        .order('created_at', { ascending: true });
      if (shipmentError) throw shipmentError;

      const shipments = (shipmentRows || []).map(asRecord);
      const shipmentIds = shipments
        .map((row) => toStringValue(row.id))
        .filter((id): id is string => Boolean(id));

      let events: Record<string, unknown>[] = [];
      if (shipmentIds.length) {
        const { data: eventRows, error: eventsError } = await admin
          .from('shipment_events')
          .select('id, shipment_id, status, location, description, actor_type, actor_id, event_time, created_at')
          .in('shipment_id', shipmentIds)
          .order('event_time', { ascending: true });
        if (eventsError) throw eventsError;
        events = (eventRows || []).map(asRecord);
      }

      return json({ success: true, shipments, events });
    }

    if (action === 'list_shipment_summaries') {
      const orderIdsRaw = Array.isArray(body.orderIds)
        ? body.orderIds
        : Array.isArray(body.order_ids)
          ? body.order_ids
          : [];
      const orderIds = orderIdsRaw
        .map((value) => toStringValue(value))
        .filter((id): id is string => Boolean(id));
      if (!orderIds.length) {
        return json({ success: true, shipments: [] });
      }

      const { data: ownedOrders, error: ownedError } = await admin
        .from('orders')
        .select('id')
        .eq('buyer_id', userId)
        .in('id', orderIds);
      if (ownedError) throw ownedError;

      const ownedIds = (ownedOrders || [])
        .map((row) => toStringValue(asRecord(row).id))
        .filter((id): id is string => Boolean(id));
      if (!ownedIds.length) {
        return json({ success: true, shipments: [] });
      }

      const { data: shipmentRows, error: shipmentError } = await admin
        .from('shipments')
        .select('order_id, status, created_at, buyer_id')
        .eq('buyer_id', userId)
        .in('order_id', ownedIds)
        .order('created_at', { ascending: false });
      if (shipmentError) throw shipmentError;

      return json({ success: true, shipments: (shipmentRows || []).map(asRecord) });
    }

    return json({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    return json({ error: readError(error) }, 500);
  }
});
