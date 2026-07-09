-- Add new unit of measurement options for products
-- Drop existing constraint first (original schema created outside migration set)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_of_measurement_check;

-- Migrate existing values to new naming
UPDATE products SET unit_of_measurement = 'gram'  WHERE unit_of_measurement = 'g';
UPDATE products SET unit_of_measurement = 'ltr'   WHERE unit_of_measurement = 'liter';
UPDATE products SET unit_of_measurement = 'pcs'   WHERE unit_of_measurement = 'piece';

-- Re-add constraint with consolidated options
ALTER TABLE products ADD CONSTRAINT products_unit_of_measurement_check
  CHECK (unit_of_measurement = ANY (ARRAY['kg','gram','ml','ltr','pcs','pack','dozen','box','bundle','pouch','unit','tin']));
