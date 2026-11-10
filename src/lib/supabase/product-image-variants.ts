export const PRODUCT_IMAGE_THUMBNAIL_DIRECTORY = "__variants/v1";
export const PRODUCT_IMAGE_THUMBNAIL_WIDTH = 400;
export const PRODUCT_IMAGE_THUMBNAIL_QUALITY = 60;
export const PRODUCT_IMAGE_VARIANT_CACHE_CONTROL = "31536000";
const PRODUCT_IMAGE_PUBLIC_PATH = "/storage/v1/object/public/product-images/";

export function getProductImageThumbnailPath(originalPath: string): string {
  if (
    !originalPath ||
    originalPath.includes("/") ||
    originalPath.includes("\\") ||
    originalPath.startsWith("__variants/")
  ) {
    throw new Error("Product image originals must be root-level Storage objects");
  }

  return `${PRODUCT_IMAGE_THUMBNAIL_DIRECTORY}/${originalPath}.webp`;
}

export function getProductImageObjectName(
  imageUrl: string,
  supabaseUrl: string,
): string | null {
  try {
    const url = new URL(imageUrl);
    const projectUrl = new URL(supabaseUrl);
    if (url.origin !== projectUrl.origin || !url.pathname.startsWith(PRODUCT_IMAGE_PUBLIC_PATH)) {
      return null;
    }

    const objectName = decodeURIComponent(
      url.pathname.slice(PRODUCT_IMAGE_PUBLIC_PATH.length),
    );
    if (
      !objectName ||
      objectName.includes("/") ||
      objectName.includes("\\") ||
      objectName.startsWith("__variants/")
    ) {
      return null;
    }

    return objectName;
  } catch {
    return null;
  }
}