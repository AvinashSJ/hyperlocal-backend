export function getTransformedImageUrl(
  originalUrl: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: "origin" | "webp";
  } = {},
): string {
  const { width, height, quality = 80, format = "webp" } = options;

  try {
    const url = new URL(originalUrl);

    // Only transform Supabase Storage URLs
    if (!url.pathname.includes("/storage/v1/object/")) {
      return originalUrl;
    }

    // Replace /object/ with /object/public/transform/ for public buckets
    if (url.pathname.includes("/storage/v1/object/public/")) {
      let transformPath = url.pathname.replace(
        "/storage/v1/object/public/",
        "/storage/v1/object/public/transform/",
      );

      const params = new URLSearchParams();
      if (width) params.set("width", width.toString());
      if (height) params.set("height", height.toString());
      params.set("quality", quality.toString());
      if (format === "webp") {
        params.set("format", "webp");
      }

      url.pathname = transformPath;
      url.search = params.toString();
      return url.toString();
    }

    // For authenticated buckets, transformations work differently
    // but we mainly use public product-images
    return originalUrl;
  } catch (error) {
    console.error("Error transforming image URL:", error);
    return originalUrl;
  }
}
