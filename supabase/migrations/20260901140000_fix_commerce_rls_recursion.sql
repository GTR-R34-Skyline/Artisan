-- Avoid recursive RLS checks between orders, order_items, and payments.

CREATE OR REPLACE FUNCTION public.auth_buyer_owns_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.buyer_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_vendor_has_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.vendor_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.auth_buyer_owns_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_buyer_owns_order(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.auth_vendor_has_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_vendor_has_order(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Vendors can read orders for their items" ON public.orders;
CREATE POLICY "Vendors can read orders for their items"
ON public.orders
FOR SELECT
TO authenticated
USING (public.auth_vendor_has_order(id));

DROP POLICY IF EXISTS "Buyers can read own order items" ON public.order_items;
CREATE POLICY "Buyers can read own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (public.auth_buyer_owns_order(order_id));

DROP POLICY IF EXISTS "Vendors can read payments for their orders" ON public.payments;
CREATE POLICY "Vendors can read payments for their orders"
ON public.payments
FOR SELECT
TO authenticated
USING (public.auth_vendor_has_order(order_id));
