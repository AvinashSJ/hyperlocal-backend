-- Cached aggregate of total units sold per product (from order_items).
-- Updated automatically by a trigger on order_items insert/update/delete.
ALTER TABLE products ADD COLUMN units_sold integer DEFAULT 0;

CREATE OR REPLACE FUNCTION update_product_units_sold()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET units_sold = (
    SELECT COALESCE(SUM(quantity), 0)
    FROM order_items
    WHERE order_items.product_id = COALESCE(NEW.product_id, OLD.product_id)
  )
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_units_sold
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_product_units_sold();

-- Backfill existing data
UPDATE products p SET units_sold = (
  SELECT COALESCE(SUM(quantity), 0) FROM order_items oi WHERE oi.product_id = p.id
);
