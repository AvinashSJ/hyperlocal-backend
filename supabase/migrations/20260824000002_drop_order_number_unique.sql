-- Hotfix: Drop UNIQUE constraint on order_number.
--
-- Flutter inserts orders with a hardcoded placeholder (e.g.
-- "ORD-2026-000001") BEFORE the set_order_store_id() trigger
-- renumbers them. If two customers place orders concurrently,
-- both try to insert the same placeholder -> UNIQUE violation -> order fails.
--
-- The advisory lock + MAX-based approach in generate_order_number()
-- already prevents duplicate final order numbers. The UNIQUE
-- constraint is redundant and harmful to Flutter's flow.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_number_unique;

-- The pre-existing auto-generated constraint (PostgreSQL naming:
-- {table}_{column}_key) also blocks Flutter's placeholder order numbers.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_number_key;
