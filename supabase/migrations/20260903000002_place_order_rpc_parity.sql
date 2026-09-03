-- place_order RPC parity migration.
--
-- The atomic `place_order` RPCs existed ONLY in production (not version
-- controlled in this repo). This migration captures them so the backend
-- repo is the single source of truth and the schema is reproducible.
--
-- Why atomic:
--   Each overload is a single PL/pgSQL function, so its body runs as ONE
--   transaction. If any order_items insert or decrement_stock call fails,
--   the WHOLE order (orders row + all items + tracks) rolls back — no
--   partial order is ever created. This is the root-cause fix for the
--   partial-order/network bug previously handled client-side in Flutter.
--
-- Two overloads:
--   1. 13-arg — COMPLETE. Adds p_delivery_slot_id, p_delivery_date,
--      p_cart_id (the multi-store grouping cart_id). ALSO enforces the P54
--      single-store guard (RAISE if mixed stores). This is the one the
--      Flutter checkout must call.
--   2. 11-arg — LEGACY, kept for backwards compatibility (drops slot/date/
--      cart). Flutter must NOT use this one for new orders; it exists only
--      so any older callers keep working.
--
-- Both are SECURITY DEFINER so they can insert orders under any user and
-- freely read products/order_tracks regardless of caller RLS. They call
-- public.decrement_stock, whose oversell guard (RAISE instead of floor-to-0)
-- is provided by migration 20260903000001.

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
    CASE WHEN p_payment_method = 'cod' THEN 'unpaid' ELSE 'paid' END,
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
    CASE WHEN p_payment_method = 'cod' THEN 'unpaid' ELSE 'paid' END,
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
