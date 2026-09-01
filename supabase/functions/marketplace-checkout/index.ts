import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

interface CartItemInput {
  productId: string;
  quantity: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authorization = req.headers.get('Authorization') || '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Server configuration is incomplete.' }, 500);
    }

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
    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (action === 'create_order') {
      const itemsRaw = Array.isArray(body.items) ? body.items : [];
      const items: CartItemInput[] = itemsRaw
        .map((item) => asRecord(item))
        .map((item) => ({
          productId: toStringValue(item.productId) || toStringValue(item.product_id) || '',
          quantity: Math.max(1, Math.min(99, Math.round(toNumber(item.quantity)))),
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
        });
      }

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

      const transactionId = `MOCK-UPI-${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
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
        .select('id, status, amount, transaction_id, payment_method')
        .single();

      if (paymentError) throw paymentError;

      return json({ success: true, order, payment });
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

    if (action === 'process_payment') {
      const orderId = toStringValue(body.orderId) || toStringValue(body.order_id);
      const mockOutcome = toStringValue(body.mockOutcome) || toStringValue(body.mock_outcome);
      const upiApp = toStringValue(body.upiApp) || toStringValue(body.upi_app);
      const upiId = toStringValue(body.upiId) || toStringValue(body.upi_id);
      const transactionId = toStringValue(body.transactionId) || toStringValue(body.transaction_id);

      if (!orderId) return json({ error: 'Order id is required.' }, 400);
      if (!mockOutcome || !['success', 'failed', 'pending'].includes(mockOutcome)) {
        return json({ error: 'A valid mock payment outcome is required.' }, 400);
      }

      const { data, error } = await admin.rpc('finalize_mock_upi_payment', {
        p_order_id: orderId,
        p_buyer_id: userId,
        p_outcome: mockOutcome,
        p_upi_app: upiApp,
        p_upi_id: upiId,
        p_transaction_id: transactionId,
      });

      if (error) {
        return json({ error: error.message || 'Payment could not be processed.' }, 400);
      }

      return json({ success: true, result: data });
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

      return json({ success: true, result: data });
    }

    return json({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    return json({ error: readError(error) }, 500);
  }
});
