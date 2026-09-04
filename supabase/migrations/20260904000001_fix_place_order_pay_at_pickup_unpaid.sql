-- P71: pay_at_pickup orders must start UNPAID.
--
-- Bug: both place_order overloads derived payment_status with
--   CASE WHEN p_payment_method = 'cod' THEN 'unpaid' ELSE 'paid' END
-- so any non-COD method — including `pay_at_pickup` — was created as 'paid'.
-- A customer who chose Pay at Pickup hasn't paid anything yet; they pay when
-- they collect the order.
--
-- Fix: treat `pay_at_pickup` (and `cod`) as unpaid:
--   CASE WHEN p_payment_method IN ('cod', 'pay_at_pickup') THEN 'unpaid'
--        ELSE 'paid' END
--
-- Why DROP + CREATE (not just CREATE OR REPLACE): per the P-lesson on plan
-- cache invalidation, replacing a function body does not always invalidate
-- PostgreSQL's cached PL/pgSQL plans. DROP forces the cache to be rebuilt.
--
-- Both overloads are recreated with identical signatures so existing callers
-- (incl. the Flutter checkout, which calls the 13-arg overload with cart_id)
-- are unaffected.
--
-- No constraint change needed: `pay_at_pickup` is already a valid
-- `payment_method` value (added in migration 20260623000008).
--
-- Atomic: the whole file runs in a single transaction so the two
-- DROP+CREATE pairs are all-or-nothing. If any statement fails, the
-- transaction rolls back and the previous function bodies are preserved —
-- there is no window where an overload is left dropped. Apply with:
--   psql ... -f 20260904000001_fix_place_order_pay_at_pickup_unpaid.sql
-- (The file has its own BEGIN/COMMIT, so do NOT pass --single-transaction,
-- which would try to nest a second transaction block.)

BEGIN;

-- 13-arg overload (complete, recommended — used by Flutter checkout) ----------

DROP FUNCTION IF EXISTS public.place_order(
  p_user_id uuid,
  p_address_id uuid,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_tax_amount numeric,
  p_delivery_charge numeric,
  p_total_amount numeric,
  p_payment_method text,
  p_special_instructions text,
  p_items jsonb,
  p_delivery_slot_id uuid,
  p_delivery_date date,
  p_cart_id uuid
);

CREATE FUNCTION public.place_order(
  p_user_id uuid,
  p_address_id uuid DEFAULT NULL::uuid,
  p_subtotal numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_tax_amount numeric DEFAULT 0,
  p_delivery_charge numeric DEFAULT 0,
  p_total_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cod'::text,
  p_special_instructions text DEFAULT ''::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_delivery_slot_id uuid DEFAULT NULL::uuid,
  p_delivery_date date DEFAULT NULL::date,
  p_cart_id uuid DEFAULT NULL::uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_qty DECIMAL;
  v_store_ids UUID[];
BEGIN
  -- P54: defense-in-depth single-store check.
  -- Flutter MUST split a multi-store cart into N orders at checkout and
  -- call this RPC once per group. This check rejects callers that
  -- forget to split. Without it, the P48 trigger (which sets
  -- orders.store_id to the FIRST product's store on the first order_item
  -- insert) would silently miscount the other stores' revenue.
  SELECT array_agg(DISTINCT p.store_id)
    INTO v_store_ids
  FROM   jsonb_array_elements(p_items) AS item
  JOIN   public.products p ON p.id = (item->>'product_id')::UUID
  WHERE  p.store_id IS NOT NULL;

  IF array_length(v_store_ids, 1) > 1 THEN
    RAISE EXCEPTION 'place_order: all items must belong to a single store (found % distinct stores). Split the cart by store before calling.', array_length(v_store_ids, 1)
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.orders (
    user_id,
    status,
    subtotal,
    discount_amount,
    tax_amount,
    delivery_charge,
    total_amount,
    payment_status,
    payment_method,
    delivery_address_id,
    delivery_slot_id,
    delivery_date,
    special_instructions,
    cart_id
  ) VALUES (
    p_user_id,
    'pending',
    p_subtotal,
    p_discount_amount,
    p_tax_amount,
    p_delivery_charge,
    p_total_amount,
    CASE WHEN p_payment_method IN ('cod', 'pay_at_pickup') THEN 'unpaid' ELSE 'paid' END,
    p_payment_method,
    p_address_id,
    p_delivery_slot_id,
    p_delivery_date,
    p_special_instructions,
    p_cart_id
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::DECIMAL;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      quantity,
      unit_price,
      total_price,
      gst_rate,
      gst_amount
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'variant_id')::UUID,
      v_qty,
      (v_item->>'unit_price')::DECIMAL,
      (v_item->>'total_price')::DECIMAL,
      COALESCE((v_item->>'gst_rate')::DECIMAL, 0),
      COALESCE((v_item->>'gst_amount')::DECIMAL, 0)
    );

    PERFORM public.decrement_stock(
      (v_item->>'product_id')::UUID,
      (v_item->>'variant_id')::UUID,
      v_qty
    );
  END LOOP;

  INSERT INTO public.order_tracks (order_id, status, notes)
  VALUES (v_order_id, 'pending', 'Order placed');

  RETURN v_order_number;
END;
$function$;

-- 10-arg overload (legacy, backwards compatibility) ----------------------------

DROP FUNCTION IF EXISTS public.place_order(
  p_user_id uuid,
  p_address_id uuid,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_tax_amount numeric,
  p_delivery_charge numeric,
  p_total_amount numeric,
  p_payment_method text,
  p_special_instructions text,
  p_items jsonb
);

CREATE FUNCTION public.place_order(
  p_user_id uuid,
  p_address_id uuid DEFAULT NULL::uuid,
  p_subtotal numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_tax_amount numeric DEFAULT 0,
  p_delivery_charge numeric DEFAULT 0,
  p_total_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cod'::text,
  p_special_instructions text DEFAULT ''::text,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_qty DECIMAL;
BEGIN
  INSERT INTO public.orders (
    user_id,
    status,
    subtotal,
    discount_amount,
    tax_amount,
    delivery_charge,
    total_amount,
    payment_status,
    payment_method,
    delivery_address_id,
    special_instructions
  ) VALUES (
    p_user_id,
    'pending',
    p_subtotal,
    p_discount_amount,
    p_tax_amount,
    p_delivery_charge,
    p_total_amount,
    CASE WHEN p_payment_method IN ('cod', 'pay_at_pickup') THEN 'unpaid' ELSE 'paid' END,
    p_payment_method,
    p_address_id,
    p_special_instructions
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::DECIMAL;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      quantity,
      unit_price,
      total_price,
      gst_rate,
      gst_amount
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'variant_id')::UUID,
      v_qty,
      (v_item->>'unit_price')::DECIMAL,
      (v_item->>'total_price')::DECIMAL,
      COALESCE((v_item->>'gst_rate')::DECIMAL, 0),
      COALESCE((v_item->>'gst_amount')::DECIMAL, 0)
    );

    PERFORM public.decrement_stock(
      (v_item->>'product_id')::UUID,
      (v_item->>'variant_id')::UUID,
      v_qty
    );
  END LOOP;

  INSERT INTO public.order_tracks (order_id, status, notes)
  VALUES (v_order_id, 'pending', 'Order placed');

  RETURN v_order_number;
END;
$function$;

-- Re-apply grants that were owned by the dropped functions. SECURITY DEFINER
-- functions run as the definer, but SELECT/UPDATE grants on referenced tables
-- are still enforced for the definer at call time; ensure the public schema
-- grant that Supabase normally applies is present in case it was lost.
GRANT EXECUTE ON FUNCTION public.place_order(
  p_user_id uuid,
  p_address_id uuid,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_tax_amount numeric,
  p_delivery_charge numeric,
  p_total_amount numeric,
  p_payment_method text,
  p_special_instructions text,
  p_items jsonb,
  p_delivery_slot_id uuid,
  p_delivery_date date,
  p_cart_id uuid
) TO authenticated, anon;

GRANT EXECUTE ON FUNCTION public.place_order(
  p_user_id uuid,
  p_address_id uuid,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_tax_amount numeric,
  p_delivery_charge numeric,
  p_total_amount numeric,
  p_payment_method text,
  p_special_instructions text,
  p_items jsonb
) TO authenticated, anon;

COMMIT;
