-- Create banners table for admin sliders
CREATE TABLE IF NOT EXISTS public.banners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  link TEXT,
  image_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin all" ON public.banners
  FOR ALL USING (public.is_admin());

-- Create order_tracks table for order status history
CREATE TABLE IF NOT EXISTS public.order_tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin all" ON public.order_tracks
  FOR ALL USING (public.is_admin());

CREATE POLICY "User read own" ON public.order_tracks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_tracks.order_id AND orders.user_id = auth.uid()
    )
  );

-- Add trigger for banners updated_at
CREATE TRIGGER trg_banners_updated_at
  BEFORE UPDATE ON public.banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Monthly order stats function for dashboard
CREATE OR REPLACE FUNCTION public.get_monthly_order_stats()
RETURNS TABLE(month TEXT, total BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    TO_CHAR(created_at, 'Mon') AS month,
    COUNT(*)::BIGINT AS total
  FROM public.orders
  WHERE created_at >= date_trunc('year', NOW())
  GROUP BY TO_CHAR(created_at, 'Mon'), EXTRACT(MONTH FROM created_at)
  ORDER BY EXTRACT(MONTH FROM created_at)
$$;
