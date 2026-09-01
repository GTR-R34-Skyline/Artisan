import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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

    let requestedVendorId = userId;
    try {
      const body = await req.json();
      if (body && typeof body.vendorId === 'string' && body.vendorId.trim()) {
        requestedVendorId = body.vendorId.trim();
      }
    } catch {
      // Body is optional; default to the authenticated vendor.
    }

    if (requestedVendorId !== userId) {
      return json({ error: 'You can only load your own workspace.' }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: productRows, error: productError } = await admin
      .from('products')
      .select('id')
      .eq('vendor_id', userId);
    if (productError) throw productError;

    const productIds = (productRows || [])
      .map((row) => (row as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string');

    const { data: itemsByVendor, error: vendorItemsError } = await admin
      .from('order_items')
      .select('*')
      .eq('vendor_id', userId);
    if (vendorItemsError) throw vendorItemsError;

    let itemsByProduct: Record<string, unknown>[] = [];
    if (productIds.length) {
      const { data, error } = await admin
        .from('order_items')
        .select('*')
        .in('product_id', productIds);
      if (error) throw error;
      itemsByProduct = (data || []) as Record<string, unknown>[];
    }

    const merged = new Map<string, Record<string, unknown>>();
    [...((itemsByVendor || []) as Record<string, unknown>[]), ...itemsByProduct].forEach((row) => {
      const id = typeof row.id === 'string' ? row.id : `${row.order_id}:${row.product_id}`;
      if (id) merged.set(id, row);
    });
    const orderItems = Array.from(merged.values());
    const orderIds = Array.from(
      new Set(
        orderItems
          .map((row) => (typeof row.order_id === 'string' ? row.order_id : null))
          .filter((id): id is string => Boolean(id)),
      ),
    );

    let orders: Record<string, unknown>[] = [];
    let payments: Record<string, unknown>[] = [];
    if (orderIds.length) {
      const [{ data: orderData, error: orderError }, { data: paymentData, error: paymentError }] = await Promise.all([
        admin.from('orders').select('*').in('id', orderIds),
        admin.from('payments').select('*').in('order_id', orderIds),
      ]);
      if (orderError) throw orderError;
      if (paymentError) throw paymentError;
      orders = (orderData || []) as Record<string, unknown>[];
      payments = (paymentData || []) as Record<string, unknown>[];
    }

    return json({ success: true, orderItems, orders, payments });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unable to load vendor commerce data.' },
      500,
    );
  }
});
