ALTER TABLE public.product_images
	ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN public.product_images.thumbnail_url IS
	'Optional public URL of the immutable 400px WebP grid thumbnail; image_url remains the original.';
