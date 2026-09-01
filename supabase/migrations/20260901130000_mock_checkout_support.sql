-- Mock UPI checkout support: idempotency keys, one payment per order, atomic finalize.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_idempotency_key text,
  ADD COLUMN IF NOT EXISTS stock_deducted boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_buyer_checkout_idempotency
  ON public.orders (buyer_id, checkout_idempotency_key)
  WHERE checkout_idempotency_key IS NOT NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.product_available_stock(p_product_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT GREATEST(0, COALESCE(p.stock_count, p.quantity, 0)::integer)
  FROM public.products p
  WHERE p.id = p_product_id;
$$;

CREATE OR REPLACE FUNCTION public.finalize_mock_upi_payment(
  p_order_id uuid,
  p_buyer_id uuid,
  p_outcome text,
  p_upi_app text DEFAULT NULL,
  p_upi_id text DEFAULT NULL,
  p_transaction_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_outcome text;
  v_txn text;
  v_item record;
  v_available integer;
BEGIN
  IF p_order_id IS NULL OR p_buyer_id IS NULL THEN
    RAISE EXCEPTION 'Order and buyer are required.';
  END IF;

  v_outcome := lower(btrim(COALESCE(p_outcome, '')));
  IF v_outcome NOT IN ('success', 'failed', 'pending') THEN
    RAISE EXCEPTION 'Invalid mock payment outcome.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'You can only pay for your own order.';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found.';
  END IF;

  IF v_payment.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'Payment buyer mismatch.';
  END IF;

  v_txn := NULLIF(btrim(COALESCE(p_transaction_id, '')), '');
  IF v_txn IS NULL THEN
    v_txn := 'MOCK-UPI-' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  -- Idempotent success: already paid and fulfilled.
  IF v_payment.status = 'success' AND public.is_completed_order_status(v_order.status) THEN
    RETURN jsonb_build_object(
      'idempotent', true,
      'order_id', v_order.id,
      'order_status', v_order.status,
      'payment_id', v_payment.id,
      'payment_status', v_payment.status,
      'transaction_id', v_payment.transaction_id,
      'stock_deducted', v_order.stock_deducted
    );
  END IF;

  IF v_payment.status = 'success' AND NOT v_order.stock_deducted THEN
    RAISE EXCEPTION 'Payment succeeded but stock was not deducted. Contact support.';
  END IF;

  IF v_outcome = 'success' THEN
    IF v_payment.status NOT IN ('pending', 'failed') THEN
      RAISE EXCEPTION 'Payment cannot be completed from its current state.';
    END IF;

    FOR v_item IN
      SELECT oi.product_id, oi.quantity
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
    LOOP
      v_available := public.product_available_stock(v_item.product_id);
      IF v_available < v_item.quantity THEN
        RAISE EXCEPTION 'This piece is no longer available in the requested quantity.';
      END IF;
    END LOOP;

    IF NOT v_order.stock_deducted THEN
      FOR v_item IN
        SELECT oi.product_id, oi.quantity
        FROM public.order_items oi
        WHERE oi.order_id = p_order_id
      LOOP
        UPDATE public.products p
        SET
          stock_count = GREATEST(0, public.product_available_stock(v_item.product_id) - v_item.quantity),
          quantity = GREATEST(0, public.product_available_stock(v_item.product_id) - v_item.quantity),
          updated_at = now()
        WHERE p.id = v_item.product_id;
      END LOOP;

      UPDATE public.orders
      SET stock_deducted = true, updated_at = now()
      WHERE id = p_order_id;
      v_order.stock_deducted := true;
    END IF;

    UPDATE public.payments
    SET
      status = 'success',
      payment_method = 'upi',
      upi_app = NULLIF(btrim(COALESCE(p_upi_app, '')), ''),
      transaction_id = COALESCE(v_payment.transaction_id, v_txn),
      amount = COALESCE(v_payment.amount, v_order.total_amount),
      updated_at = now()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;

    UPDATE public.orders
    SET status = 'delivered', updated_at = now()
    WHERE id = p_order_id
    RETURNING * INTO v_order;

  ELSIF v_outcome = 'failed' THEN
    IF v_payment.status = 'success' THEN
      RAISE EXCEPTION 'A successful payment cannot be marked failed.';
    END IF;

    UPDATE public.payments
    SET
      status = 'failed',
      payment_method = 'upi',
      upi_app = NULLIF(btrim(COALESCE(p_upi_app, '')), ''),
      transaction_id = COALESCE(v_payment.transaction_id, v_txn),
      updated_at = now()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;

    UPDATE public.orders
    SET status = 'processing', updated_at = now()
    WHERE id = p_order_id AND status <> 'delivered'
    RETURNING * INTO v_order;

  ELSE
    IF v_payment.status = 'success' THEN
      RAISE EXCEPTION 'A successful payment cannot be marked pending.';
    END IF;

    UPDATE public.payments
    SET
      status = 'pending',
      payment_method = 'upi',
      upi_app = NULLIF(btrim(COALESCE(p_upi_app, '')), ''),
      transaction_id = COALESCE(v_payment.transaction_id, v_txn),
      updated_at = now()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;

    UPDATE public.orders
    SET status = 'processing', updated_at = now()
    WHERE id = p_order_id AND status <> 'delivered'
    RETURNING * INTO v_order;
  END IF;

  RETURN jsonb_build_object(
    'idempotent', false,
    'order_id', v_order.id,
    'order_status', v_order.status,
    'payment_id', v_payment.id,
    'payment_status', v_payment.status,
    'transaction_id', v_payment.transaction_id,
    'upi_app', v_payment.upi_app,
    'amount', v_payment.amount,
    'stock_deducted', v_order.stock_deducted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_mock_payment_for_retry(
  p_order_id uuid,
  p_buyer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'You can only retry your own order.';
  END IF;

  IF public.is_completed_order_status(v_order.status) OR v_order.stock_deducted THEN
    RAISE EXCEPTION 'This order has already been fulfilled.';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found.';
  END IF;

  IF v_payment.status = 'success' THEN
    RAISE EXCEPTION 'This payment has already succeeded.';
  END IF;

  UPDATE public.payments
  SET status = 'pending', updated_at = now()
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  UPDATE public.orders
  SET status = 'processing', updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_status', v_order.status,
    'payment_id', v_payment.id,
    'payment_status', v_payment.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.product_available_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_available_stock(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.finalize_mock_upi_payment(uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_mock_upi_payment(uuid, uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.reset_mock_payment_for_retry(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_mock_payment_for_retry(uuid, uuid) TO service_role;
