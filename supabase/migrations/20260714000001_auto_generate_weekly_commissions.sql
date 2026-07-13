-- Auto-generate weekly commission records every Sunday 8:00 AM IST.
--
-- Cron fires at 2:30 AM UTC (8:00 AM IST) every Sunday.
-- Period: previous Sunday 8am IST → current Sunday 8am IST
-- Revenue basis: subtotal (excludes delivery_charge, tax_amount)
-- Refunds: not applicable (only replacement model)
-- Idempotent: unique constraint prevents duplicate runs

-- 1. Enable pg_cron (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Deduplicate existing rows, then add unique constraint
DELETE FROM public.store_commissions
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY store_id, period_start, period_end
      ORDER BY created_at DESC
    ) AS rn
    FROM public.store_commissions
  ) dup
  WHERE dup.rn > 1
);

ALTER TABLE public.store_commissions
  DROP CONSTRAINT IF EXISTS store_commissions_store_period_unique;

ALTER TABLE public.store_commissions
  ADD CONSTRAINT store_commissions_store_period_unique
  UNIQUE (store_id, period_start, period_end);

-- 3. Weekly generation function
CREATE OR REPLACE FUNCTION public.generate_weekly_commissions()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  period_end_ts TIMESTAMPTZ;
  period_start_ts TIMESTAMPTZ;
  period_end_date DATE;
  period_start_date DATE;
BEGIN
  -- Sunday 2:30 AM UTC = Sunday 8:00 AM IST
  -- date_trunc('week') returns Monday 00:00 UTC of the current ISO week.
  -- At 2:30 AM UTC on Sunday we are still in the PREVIOUS ISO week,
  -- so add 6 days to reach Sunday, then 2.5 hours for 8am IST.
  period_end_ts := date_trunc('week', now()) + interval '6 days' + interval '2.5 hours';
  period_start_ts := period_end_ts - interval '7 days';

  period_end_date := date_trunc('week', now())::DATE + 6;
  period_start_date := period_end_date - 7;

  INSERT INTO public.store_commissions (
    store_id, period_start, period_end,
    total_revenue, commission_rate, commission_amount,
    balance_due, status
  )
  SELECT
    o.store_id,
    period_start_date,
    period_end_date,
    COALESCE(SUM(o.subtotal), 0) AS total_revenue,
    s.commission_rate,
    ROUND(COALESCE(SUM(o.subtotal * s.commission_rate / 100), 0), 2) AS commission_amount,
    ROUND(COALESCE(SUM(o.subtotal * s.commission_rate / 100), 0), 2) AS balance_due,
    'unpaid'
  FROM public.orders o
  JOIN public.stores s ON s.id = o.store_id
  WHERE o.status = 'delivered'
    AND o.payment_status = 'paid'
    AND o.delivered_at >= period_start_ts
    AND o.delivered_at < period_end_ts
    AND s.commission_rate > 0
  GROUP BY o.store_id, s.commission_rate
  HAVING ROUND(COALESCE(SUM(o.subtotal * s.commission_rate / 100), 0), 2) > 0
  ON CONFLICT (store_id, period_start, period_end) DO NOTHING;
END;
$$;

-- 4. Schedule: 2:30 AM UTC every Sunday = 8:00 AM IST
SELECT cron.schedule(
  'weekly-commission-generation',
  '30 2 * * 0',
  'SELECT public.generate_weekly_commissions();'
);
