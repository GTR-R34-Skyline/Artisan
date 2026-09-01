-- Commerce tables and customer_reviews product linkage used by the public review flow.
-- Safe to re-run: uses IF NOT EXISTS / IF NOT EXISTS column adds only.

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_amount numeric,
  status text NOT NULL DEFAULT 'processing',
  shipping_address text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric,
  subtotal numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payment_method text,
  upi_app text,
  transaction_id text,
  amount numeric,
  status text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.customer_reviews
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS consumer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_reviews_product_id
  ON public.customer_reviews (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_buyer_id
  ON public.orders (buyer_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items (product_id);

CREATE INDEX IF NOT EXISTS idx_order_items_vendor_id
  ON public.order_items (vendor_id);

-- Orders / order_items RLS: buyers need read access for review eligibility; vendors/admins for dashboards.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers can read own orders" ON public.orders;
CREATE POLICY "Buyers can read own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (buyer_id = auth.uid());

DROP POLICY IF EXISTS "Vendors can read orders for their items" ON public.orders;
CREATE POLICY "Vendors can read orders for their items"
ON public.orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = orders.id
      AND oi.vendor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins have full access to orders" ON public.orders;
CREATE POLICY "Admins have full access to orders"
ON public.orders
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role can manage orders" ON public.orders;
CREATE POLICY "Service role can manage orders"
ON public.orders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Buyers can read own order items" ON public.order_items;
CREATE POLICY "Buyers can read own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.buyer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Vendors can read own order items" ON public.order_items;
CREATE POLICY "Vendors can read own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (vendor_id = auth.uid());

DROP POLICY IF EXISTS "Admins have full access to order items" ON public.order_items;
CREATE POLICY "Admins have full access to order items"
ON public.order_items
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role can manage order items" ON public.order_items;
CREATE POLICY "Service role can manage order items"
ON public.order_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Buyers can read own payments" ON public.payments;
CREATE POLICY "Buyers can read own payments"
ON public.payments
FOR SELECT
TO authenticated
USING (buyer_id = auth.uid());

DROP POLICY IF EXISTS "Vendors can read payments for their orders" ON public.payments;
CREATE POLICY "Vendors can read payments for their orders"
ON public.payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = payments.order_id
      AND oi.vendor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins have full access to payments" ON public.payments;
CREATE POLICY "Admins have full access to payments"
ON public.payments
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role can manage payments" ON public.payments;
CREATE POLICY "Service role can manage payments"
ON public.payments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
