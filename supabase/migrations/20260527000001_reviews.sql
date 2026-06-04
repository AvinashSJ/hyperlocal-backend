-- Product reviews table
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, user_id)
);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews
CREATE POLICY "Anyone can read reviews" ON public.product_reviews
  FOR SELECT USING (true);

-- Authenticated users can insert their own reviews
CREATE POLICY "Users can insert own review" ON public.product_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own reviews
CREATE POLICY "Users can update own review" ON public.product_reviews
  FOR UPDATE USING (auth.uid() = user_id);

-- Add rating columns to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS avg_rating DECIMAL(3,2) NOT NULL DEFAULT 0 CHECK (avg_rating >= 0 AND avg_rating <= 5),
  ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0);

-- Trigger function to update product rating on review insert/update/delete
CREATE OR REPLACE FUNCTION public.update_product_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.products
  SET
    avg_rating = COALESCE(
      (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.product_reviews WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)),
      0
    ),
    review_count = (
      SELECT COUNT(*) FROM public.product_reviews WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
    )
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_product_reviews_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_product_rating();
