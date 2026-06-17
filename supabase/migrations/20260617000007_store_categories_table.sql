-- Ensure store_categories table exists (idempotent).
-- This table was originally created outside the migration system. This migration
-- guarantees the schema is in place for environments running the migrations
-- against a clean database.

CREATE TABLE IF NOT EXISTS public.store_categories (
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_store_categories_store_id
  ON public.store_categories (store_id);
CREATE INDEX IF NOT EXISTS idx_store_categories_category_id
  ON public.store_categories (category_id);

ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin all" ON public.store_categories;
CREATE POLICY "Admin all" ON public.store_categories
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Public read active" ON public.store_categories;
CREATE POLICY "Public read active" ON public.store_categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = store_categories.category_id AND c.is_active = true
    )
  );
