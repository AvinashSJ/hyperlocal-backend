-- Multi-condition delivery pricing rules.
-- Each rule defines conditions (order value range + distance range) and a charge.
-- Rules are evaluated in priority order; first match wins.
-- If no rule matches, the zone's flat delivery_charge is used as fallback.

CREATE TABLE public.delivery_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_order_value numeric,
  max_order_value numeric,
  min_distance_km numeric,
  max_distance_km numeric,
  charge numeric NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_rules_store ON public.delivery_rules(store_id);
CREATE INDEX idx_delivery_rules_priority ON public.delivery_rules(priority);

ALTER TABLE public.delivery_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.delivery_rules
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.delivery_rules IS 'Conditional delivery pricing: order value + distance ranges with per-rule charges. Evaluated top-down by priority; first match wins.';
