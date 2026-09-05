-- place_order money-validation migration.
--
-- After the atomic RPC parity migration (20260903000002) and the
-- pay_at_pickup payment_status fix (20260904000001), order money values
-- (subtotal / discount / tax / delivery / total, plus each item's
-- unit_price / total_price / gst_rate / gst_amount) are stored exactly
-- as the Flutter client sends them — the RPC performs no server-side
-- recompute or validation. A client bug can therefore persist corrupt
-- orders (observed live: ADORD-000005 has subtotal ₹10,813 while its
-- own line items sum to ₹2,107).
--
-- This migration adds validate_order_money(), a shared SECURITY DEFINER
-- helper invoked at the top of BOTH place_order overloads, which RAISEs
-- (aborting the whole order/xact, rolling back) when the payload
-- violates the confirmed money contract:
--
--   money contract (GST-INCLUSIVE, MRP-discounted selling prices):
--     items:       quantity > 0, unit_price >= 0, gst_rate >= 0,
--                  gst_amount >= 0, total_price == round(unit_price * quantity, 2)
--     subtotal     == Σ items.total_price
--     tax_amount   == Σ items.gst_amount
--     total_amount == subtotal + delivery_charge   (NO extra tax; GST is
--                                                   inside the item prices)
--
--   discount_amount is informational ("you saved", MRP − selling) and is
--   intentionally NOT validated: it depends on historical MRP that the
--   current catalog may no longer reflect, and rounding may legitimately
--   drift. delivery_charge is not validated either (no independent
--   source).
--
-- All comparisons use a ±0.02 tolerance to absorb 2dp rounding across
-- the Dart/numeric boundary. Rejecting inside the RPC (rather than a
-- CHECK constraint) keeps legacy write paths that bypass the RPC working,
-- and the "subtotal == Σ order_items.total_price" invariant cannot be
-- expressed as a CHECK on a single row.
--
-- The RPCs are invoked directly by Flutter (not from triggers), so
-- CREATE OR REPLACE is safe — there is no stale cached-plan concern.

-- Shared validation helper --------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_order_money(
  p_items jsonb DEFAULT '[]'::jsonb,
  p_subtotal numeric DEFAULT 0,
  p_tax_amount numeric DEFAULT 0,
  p_delivery_charge numeric DEFAULT 0,
  p_total_amount numeric DEFAULT 0
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_item          JSONB;
  v_qty           NUMERIC;
  v_unit_price    NUMERIC;
  v_total_price   NUMERIC;
  v_rate          NUMERIC;
  v_gst           NUMERIC;
  v_item_subtotal NUMERIC := 0;
  v_item_tax      NUMERIC := 0;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'place_order: p_items must be a non-empty array (got %)', jsonb_typeof(p_items)
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty         := (v_item->>'quantity')::NUMERIC;
    v_unit_price  := (v_item->>'unit_price')::NUMERIC;
    v_total_price := (v_item->>'total_price')::NUMERIC;
    v_rate        := COALESCE((v_item->>'gst_rate')::NUMERIC, 0);
    v_gst         := COALESCE((v_item->>'gst_amount')::NUMERIC, 0);

    IF v_qty IS NULL OR v_unit_price IS NULL OR v_total_price IS NULL THEN
      RAISE EXCEPTION 'place_order: item % is missing quantity, unit_price or total_price', v_item->>'product_id'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'place_order: quantity must be > 0 for item % (qty %)', v_item->>'product_id', v_qty
        USING ERRCODE = 'P0001';
    END IF;
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'place_order: unit_price must be >= 0 for item % (price %)', v_item->>'product_id', v_unit_price
        USING ERRCODE = 'P0001';
    END IF;
    IF v_rate < 0 OR v_gst < 0 THEN
      RAISE EXCEPTION 'place_order: gst_rate / gst_amount must be >= 0 for item %', v_item->>'product_id'
        USING ERRCODE = 'P0001';
    END IF;
    IF abs(round(v_unit_price * v_qty, 2) - v_total_price) > 0.02 THEN
      RAISE EXCEPTION 'place_order: line total mismatch for item % (unit % x qty % = %, sent total %)', v_item->>'product_id', v_unit_price, v_qty, round(v_unit_price * v_qty, 2), v_total_price
        USING ERRCODE = 'P0001';
    END IF;

    v_item_subtotal := v_item_subtotal + v_total_price;
    v_item_tax      := v_item_tax + v_gst;
  END LOOP;

  IF abs(v_item_subtotal - p_subtotal) > 0.02 THEN
    RAISE EXCEPTION 'place_order: subtotal mismatch (items %, sent %)', v_item_subtotal, p_subtotal
      USING ERRCODE = 'P0001';
  END IF;
  IF abs(v_item_tax - p_tax_amount) > 0.02 THEN
    RAISE EXCEPTION 'place_order: tax mismatch (items %, sent %)', v_item_tax, p_tax_amount
      USING ERRCODE = 'P0001';
  END IF;
  IF abs((p_subtotal + p_delivery_charge) - p_total_amount) > 0.02 THEN
    RAISE EXCEPTION 'place_order: total mismatch (subtotal % + delivery % = %, sent total %)', p_subtotal, p_delivery_charge, p_subtotal + p_delivery_charge, p_total_amount
      USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

-- 13-arg overload (complete, recommended) -----------------------------------

CREATE OR REPLACE FUNCTION public.place_order(
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
  -- -------------------------------------------------------------------------
  -- Money integrity (GST-inclusive contract). Raises (rollback) on any
  -- payload that does not satisfy:
  --   subtotal == Σ items.total_price
  --   tax_amount == Σ items.gst_amount
  --   total_amount == subtotal + delivery_charge
  --   per-item: qty > 0, unit_price >= 0, total_price == round(unit_price*qty, 2)
  --   discount_amount / delivery_charge are informational and NOT checked.
  -- -------------------------------------------------------------------------
  PERFORM public.validate_order_money(p_items, p_subtotal, p_tax_amount, p_delivery_charge, p_total_amount);

  -- -------------------------------------------------------------------------
  -- P54: defense-in-depth single-store check.
  -- Flutter MUST split a multi-store cart into N orders at checkout and
  -- call this RPC once per group. This check rejects callers that
  -- forget to split. Without it, the P48 trigger (which sets
  -- orders.store_id to the FIRST product's store on the first order_item
  -- insert) would silently miscount the other stores' revenue.
  -- -------------------------------------------------------------------------
  SELECT array_agg(DISTINCT p.store_id)
    INTO v_store_ids
  FROM   jsonb_array_elements(p_items) AS item
  JOIN   public.products p ON p.id = (item->>'product_id')::UUID
  WHERE  p.store_id IS NOT NULL;

  IF array_length(v_store_ids, 1) > 1 THEN
    RAISE EXCEPTION 'place_order: all items must belong to a single store (found % distinct stores). Split the cart by store before calling.', array_length(v_store_ids, 1)
      USING ERRCODE = 'P0001';
  END IF;

  -- -------------------------------------------------------------------------
  -- Insert the order. cart_id groups this order with its siblings
  -- from the same multi-store checkout (Approach E).
  -- -------------------------------------------------------------------------
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

-- 11-arg overload (legacy, backwards compatibility) --------------------------

CREATE OR REPLACE FUNCTION public.place_order(
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
  -- Same money-integrity guard as the 13-arg overload (see above).
  PERFORM public.validate_order_money(p_items, p_subtotal, p_tax_amount, p_delivery_charge, p_total_amount);

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