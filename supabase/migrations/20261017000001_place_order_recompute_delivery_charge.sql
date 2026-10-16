-- place_order: recompute delivery_charge server-side from the ACTUAL items.
--
-- Bug (prod order ADORD-000310): wholesale customers build a cart over days/
-- weeks in the Flutter app (there is NO server-side cart table). At checkout
-- Flutter calls /api/delivery/charge with the cart value, then — if any item's
-- price changed since it was added — shows a "prices updated" toast and DROPS
-- that item from the payload it sends to place_order. It keeps, however, the
-- delivery_charge it computed from the LARGER pre-drop cart.
--
-- Concretely for ADORD-000310: zone "Zone 1 0-3km Less than 5000"
-- (delivery_charge 45, free_delivery_min_order 5000). The cart crossed 5000
-- (free tier) before checkout, an item was dropped for a price change, and the
-- order was INSERTed with subtotal 4729 (< 5000) but delivery_charge 0 —
-- the delivery charge that SHOULD have applied was lost.
--
-- place_order stored p_delivery_charge verbatim and validate_order_money
-- intentionally does not validate it ("no independent source"). This migration
-- gives it an independent source: the applicable zone for the delivery
-- address, resolved with the existing get_applicable_delivery_zone() RPC.
--
-- Behavior:
--   * v_delivery := compute_delivery_charge(items, subtotal, address)
--   * if that returns NULL (no address / no coords / no matching zone) the
--     client value is kept (unchanged legacy behavior).
--   * total_amount is always recomputed as subtotal + v_delivery so the
--     money-integrity invariant still holds.
--
-- This is a pure, read-only lookup (no external API call), so it is safe to
-- run inside the atomic place_order transaction.
--
-- CREATE OR REPLACE is safe here: the place_order RPCs are invoked directly by
-- Flutter (PostgREST RPC), not from triggers, so there is no stale
-- trigger-plan-cache concern.

-- Helper --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_delivery_charge(
  p_items jsonb DEFAULT '[]'::jsonb,
  p_subtotal numeric DEFAULT 0,
  p_address_id uuid DEFAULT NULL
)
  RETURNS numeric
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  AS $function$
DECLARE
  v_store_id uuid;
  v_lat      numeric;
  v_lng      numeric;
  v_zone     record;
BEGIN
  IF p_address_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- place_order enforces single-store; take the store of the (first) item.
  SELECT p.store_id
    INTO v_store_id
  FROM jsonb_array_elements(p_items) AS item
  JOIN public.products p ON p.id = (item->>'product_id')::uuid
  WHERE p.store_id IS NOT NULL
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT a.lat, a.lng
    INTO v_lat, v_lng
  FROM public.addresses a
  WHERE a.id = p_address_id;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO v_zone
  FROM public.get_applicable_delivery_zone(v_lat, v_lng, v_store_id);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Free delivery when the ACTUAL order value reaches the zone threshold.
  IF COALESCE(v_zone.free_delivery_min_order, 0) > 0
     AND p_subtotal >= v_zone.free_delivery_min_order THEN
    RETURN 0;
  END IF;

  RETURN COALESCE(v_zone.delivery_charge, 0);
END;
$function$;

-- 13-arg overload (complete, recommended — used by Flutter checkout) ---------

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
  v_order_id        UUID;
  v_order_number    TEXT;
  v_item            JSONB;
  v_qty             DECIMAL;
  v_store_ids       UUID[];
  v_delivery_charge NUMERIC;
  v_total_amount    NUMERIC;
BEGIN
  -- -------------------------------------------------------------------------
  -- Recompute delivery_charge from the actual items + delivery zone, so a
  -- client that drops items after computing a charge cannot under-charge.
  -- Falls back to the client value when no zone can be resolved.
  -- -------------------------------------------------------------------------
  v_delivery_charge := public.compute_delivery_charge(p_items, p_subtotal, p_address_id);
  IF v_delivery_charge IS NULL THEN
    v_delivery_charge := p_delivery_charge;
  END IF;
  v_total_amount := p_subtotal + v_delivery_charge;

  -- -------------------------------------------------------------------------
  -- Money integrity (GST-inclusive contract) against the RECOMPUTED values:
  --   subtotal == Σ items.total_price
  --   tax_amount == Σ items.gst_amount
  --   total_amount == subtotal + delivery_charge
  --   per-item: qty > 0, unit_price >= 0, total_price == round(unit_price*qty, 2)
  -- -------------------------------------------------------------------------
  PERFORM public.validate_order_money(p_items, p_subtotal, p_tax_amount, v_delivery_charge, v_total_amount);

  -- -------------------------------------------------------------------------
  -- P54: defense-in-depth single-store check.
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
    v_delivery_charge,
    v_total_amount,
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
  v_order_id        UUID;
  v_order_number    TEXT;
  v_item            JSONB;
  v_qty             DECIMAL;
  v_delivery_charge NUMERIC;
  v_total_amount    NUMERIC;
BEGIN
  -- Same recompute + money guard as the 13-arg overload.
  v_delivery_charge := public.compute_delivery_charge(p_items, p_subtotal, p_address_id);
  IF v_delivery_charge IS NULL THEN
    v_delivery_charge := p_delivery_charge;
  END IF;
  v_total_amount := p_subtotal + v_delivery_charge;

  PERFORM public.validate_order_money(p_items, p_subtotal, p_tax_amount, v_delivery_charge, v_total_amount);

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
    v_delivery_charge,
    v_total_amount,
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
