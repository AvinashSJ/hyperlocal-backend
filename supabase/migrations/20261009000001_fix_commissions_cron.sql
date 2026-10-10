-- Fix commissions cron: re-schedule to run 30 2 * * 0 (UTC Sunday 2:30) and mark active
-- This ensures weekly commissions continue to run

-- Unschedule any previous job (if exists)
DO $$
BEGIN
  PERFORM cron.unschedule('weekly-commission-generation');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule job
SELECT cron.schedule(
  'weekly-commission-generation',
  '30 2 * * 0',
  'SELECT public.generate_weekly_commissions();'
);
