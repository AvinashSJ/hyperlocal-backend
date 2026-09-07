-- FAQs table.
-- Prod had this table created outside versioned migrations (Supabase SQL editor),
-- which broke the nightly prod->test data replication because the test schema
-- lacked it. This migration makes the schema drift disappear and matches the
-- deployed column definitions on prod.

CREATE TABLE IF NOT EXISTS public.faqs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'general'::text,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT faqs_pkey PRIMARY KEY (id)
);

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "FAQs are publicly readable" ON public.faqs;
CREATE POLICY "FAQs are publicly readable" ON public.faqs
  FOR SELECT USING (is_active = true);