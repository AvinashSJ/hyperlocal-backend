-- Commission tracking tables
CREATE TABLE IF NOT EXISTS public.store_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID NOT NULL REFERENCES public.store_commissions(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin all" ON public.store_commissions FOR ALL USING (public.is_admin());
CREATE POLICY "Admin all" ON public.commission_payments FOR ALL USING (public.is_admin());

-- Add commissions module to existing role permissions
UPDATE public.roles
SET permissions = permissions || '{"commissions": ["view", "create", "edit", "delete"]}'::jsonb
WHERE name IN ('Super Admin', 'Manager');

UPDATE public.roles
SET permissions = permissions || '{"commissions": ["view"]}'::jsonb
WHERE name = 'Staff';
