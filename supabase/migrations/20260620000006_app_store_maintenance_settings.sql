-- P34: Seed the three default settings rows for the new
-- maintenance / kill-switch feature.
--
-- The `settings` table already exists in the live DB (it predates
-- the migration system). This migration just upserts the defaults
-- so the new code paths (app_maintenance, store_maintenance,
-- category_deletion_grace_days) always have a row to read.
--
--   app_maintenance: { enabled: false, reason: "maintenance",
--                      message: "", etaHours: null }
--     — global app-wide on/off toggle (Super Admin only).
--     "reason" can be "maintenance" | "technical" | "operations".
--   store_maintenance: {} (empty object)
--     — per-store on/off toggle. Keyed by storeId; each value is
--       { enabled, reason, message, etaHours }.
--   category_deletion_grace_days: 30
--     — read by the categories delete-grace trigger (P33 migration).

INSERT INTO public.settings (key, value, group_name, created_at, updated_at)
VALUES
  (
    'app_maintenance',
    '{"enabled": false, "reason": "maintenance", "message": "", "etaHours": null}'::jsonb,
    'general',
    now(),
    now()
  ),
  (
    'store_maintenance',
    '{}'::jsonb,
    'store',
    now(),
    now()
  ),
  (
    'category_deletion_grace_days',
    '30'::jsonb,
    'general',
    now(),
    now()
  )
ON CONFLICT (key) DO NOTHING;
