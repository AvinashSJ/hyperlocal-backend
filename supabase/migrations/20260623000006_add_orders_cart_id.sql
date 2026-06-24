-- ============================================================================
-- Add cart_id to orders for multi-store cart grouping (Approach E)
-- ----------------------------------------------------------------------------
-- A single cart at checkout may contain products from multiple stores.
-- The Flutter app splits such carts into N orders at checkout time, all
-- sharing the same cart_id so the customer + support + admin can see them
-- as one logical "purchase" without losing the per-store invoice
-- separation (each order still gets its own INV-{storeCode}-{year}-{seq}).
--
-- Single-store carts leave cart_id NULL — no behavior change.
--
-- Index: a partial index on (cart_id) WHERE cart_id IS NOT NULL keeps
-- the index small (most orders are single-store). The cart_id lookups
-- happen in /cart/[cart_id] which is super-admin/support-driven traffic,
-- not a hot path.
--
-- Revert: DROP INDEX IF EXISTS idx_orders_cart_id;
--          ALTER TABLE public.orders DROP COLUMN IF EXISTS cart_id;
-- ============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cart_id UUID;

CREATE INDEX IF NOT EXISTS idx_orders_cart_id
  ON public.orders(cart_id)
  WHERE cart_id IS NOT NULL;
