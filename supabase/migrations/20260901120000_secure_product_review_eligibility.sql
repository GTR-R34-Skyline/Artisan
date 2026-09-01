-- Align customer_reviews write access with a completed purchase of that product.
-- Public SELECT, admin ALL, and service-role ALL policies are left in place.

CREATE OR REPLACE FUNCTION public.is_completed_order_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_status IS NOT NULL
    AND lower(btrim(p_status)) IN ('delivered', 'completed', 'complete', 'fulfilled');
$$;

CREATE OR REPLACE FUNCTION public.buyer_has_completed_product_purchase(
  p_product_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_product_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.buyer_id = auth.uid()
        AND oi.product_id = p_product_id
        AND public.is_completed_order_status(o.status)
        AND (p_order_id IS NULL OR o.id = p_order_id)
    );
$$;

REVOKE ALL ON FUNCTION public.is_completed_order_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_completed_order_status(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.buyer_has_completed_product_purchase(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buyer_has_completed_product_purchase(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.buyer_has_completed_product_purchase(uuid, uuid) TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_reviews_consumer_product
  ON public.customer_reviews (consumer_id, product_id)
  WHERE consumer_id IS NOT NULL AND product_id IS NOT NULL;

DROP POLICY IF EXISTS "Anyone can create reviews" ON public.customer_reviews;
DROP POLICY IF EXISTS "Consumers can create reviews" ON public.customer_reviews;
DROP POLICY IF EXISTS "Consumers can update own reviews" ON public.customer_reviews;

CREATE POLICY "Consumers can create reviews"
ON public.customer_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  consumer_id = auth.uid()
  AND product_id IS NOT NULL
  AND order_id IS NOT NULL
  AND public.buyer_has_completed_product_purchase(product_id, order_id)
  AND vendor_id IS NOT NULL
  AND vendor_id = (
    SELECT p.vendor_id
    FROM public.products p
    WHERE p.id = customer_reviews.product_id
  )
);

CREATE POLICY "Consumers can update own reviews"
ON public.customer_reviews
FOR UPDATE
TO authenticated
USING (consumer_id = auth.uid())
WITH CHECK (
  consumer_id = auth.uid()
  AND product_id IS NOT NULL
  AND order_id IS NOT NULL
  AND public.buyer_has_completed_product_purchase(product_id, order_id)
  AND vendor_id IS NOT NULL
  AND vendor_id = (
    SELECT p.vendor_id
    FROM public.products p
    WHERE p.id = customer_reviews.product_id
  )
);

DROP POLICY IF EXISTS "Admins have full access to customer_reviews" ON public.customer_reviews;
CREATE POLICY "Admins have full access to customer_reviews"
ON public.customer_reviews
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
