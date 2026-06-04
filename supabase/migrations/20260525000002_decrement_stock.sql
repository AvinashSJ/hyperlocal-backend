CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_product_id UUID,
  p_variant_id UUID DEFAULT NULL,
  p_quantity DECIMAL DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_stock DECIMAL;
BEGIN
  -- Decrement product stock
  UPDATE public.products
  SET
    stock_quantity = GREATEST(stock_quantity - p_quantity, 0),
    status = CASE
      WHEN stock_quantity - p_quantity <= 0 THEN 'out_of_stock'
      ELSE status
    END
  WHERE id = p_product_id
  RETURNING stock_quantity INTO v_new_stock;

  -- Decrement variant stock if applicable
  IF p_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET stock = GREATEST(stock - p_quantity, 0)
    WHERE id = p_variant_id;
  END IF;

  -- Log to inventory_log
  INSERT INTO public.inventory_log (
    product_id,
    variant_id,
    quantity_change,
    running_balance,
    reason_code,
    notes
  ) VALUES (
    p_product_id,
    p_variant_id,
    -p_quantity,
    v_new_stock,
    'sale',
    'Order placed'
  );
END;
$$;
