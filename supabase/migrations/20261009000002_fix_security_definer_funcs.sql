-- Fix SECURITY DEFINER functions to set a secure search_path (prevent search_path hijacking)

-- generate_order_number
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  store_code text;
  seq_val bigint;
  store_id_val uuid;
BEGIN
  store_id_val := NEW.store_id;
  IF store_id_val IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.code INTO store_code FROM public.stores s WHERE s.id = store_id_val;
  IF store_code IS NULL OR store_code = '' THEN
    store_code := 'ORD';
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(o.order_number FROM LENGTH(store_code) + 2 + 1) AS bigint)), 0) + 1
  INTO seq_val
  FROM public.orders o
  WHERE o.store_id = store_id_val;

  NEW.order_number := store_code || '-' || LPAD(seq_val::text, 6, '0');
  RETURN NEW;
END;
$$;

-- sync_role_from_role_id
CREATE OR REPLACE FUNCTION public.sync_role_from_role_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.role_id IS DISTINCT FROM NEW.role_id) THEN
    SELECT r.name INTO NEW.role FROM public.roles r WHERE r.id = NEW.role_id;
  END IF;
  RETURN NEW;
END;
$$;

-- validate_order_money
CREATE OR REPLACE FUNCTION public.validate_order_money()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.subtotal IS NULL OR NEW.tax_amount IS NULL OR NEW.delivery_charge IS NULL THEN
    RAISE EXCEPTION 'Money fields cannot be NULL';
  END IF;
  IF NEW.subtotal < 0 OR NEW.tax_amount < 0 OR NEW.delivery_charge < 0 THEN
    RAISE EXCEPTION 'Money fields cannot be negative';
  END IF;
  IF NEW.total_amount <> (NEW.subtotal + NEW.tax_amount + NEW.delivery_charge) THEN
    RAISE EXCEPTION 'Total amount does not match subtotal + tax + delivery';
  END IF;
  RETURN NEW;
END;
$$;

-- place_order (2 variants exist; handle both signatures)
-- variant 1: (p_user_id uuid, p_store_id uuid, p_shipping_address_id uuid, p_payment_method text, p_note text)
CREATE OR REPLACE FUNCTION public.place_order(
  p_user_id uuid,
  p_store_id uuid,
  p_shipping_address_id uuid,
  p_payment_method text,
  p_note text
)
RETURNS TABLE(order_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  INSERT INTO public.orders (user_id, store_id, shipping_address_id, payment_method, note)
  VALUES (p_user_id, p_store_id, p_shipping_address_id, p_payment_method, p_note)
  RETURNING id INTO v_order_id;
  RETURN QUERY SELECT v_order_id;
END;
$$;

-- variant 2: with billing address and amounts (common in this codebase)
CREATE OR REPLACE FUNCTION public.place_order(
  p_user_id uuid,
  p_store_id uuid,
  p_shipping_address_id uuid,
  p_billing_address_id uuid,
  p_payment_method text,
  p_subtotal numeric,
  p_delivery_charge numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_note text
)
RETURNS TABLE(order_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  INSERT INTO public.orders (
    user_id, store_id, shipping_address_id, billing_address_id,
    payment_method, subtotal, delivery_charge, tax_amount, total_amount, note
  )
  VALUES (
    p_user_id, p_store_id, p_shipping_address_id, p_billing_address_id,
    p_payment_method, p_subtotal, p_delivery_charge, p_tax_amount, p_total_amount, p_note
  )
  RETURNING id INTO v_order_id;
  RETURN QUERY SELECT v_order_id;
END;
$$;
