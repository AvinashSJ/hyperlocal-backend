import { describe, expect, it } from "vitest";
import {
  getProductImageObjectName,
  getProductImageThumbnailPath,
  PRODUCT_IMAGE_THUMBNAIL_DIRECTORY,
} from "./product-image-variants";

describe("getProductImageThumbnailPath", () => {
  it("creates a deterministic variant path in the reserved directory", () => {
    expect(getProductImageThumbnailPath("1700000000-abc123.webp")).toBe(
      `${PRODUCT_IMAGE_THUMBNAIL_DIRECTORY}/1700000000-abc123.webp.webp`,
    );
  });

  it("keeps variants separate from root-level original names", () => {
    const originalPath = "catalog--thumb-v1.webp";
    expect(getProductImageThumbnailPath(originalPath)).not.toBe(originalPath);
  });

  it.each(["", "nested/photo.webp", "__variants/v1/photo.webp", "nested\\photo.webp"])(
    "rejects non-root or reserved original path %s",
    (originalPath) => {
      expect(() => getProductImageThumbnailPath(originalPath)).toThrow(
        "Product image originals must be root-level Storage objects",
      );
    },
  );
});

describe("getProductImageObjectName", () => {
  it("extracts and decodes a root-level product image path", () => {
    expect(
      getProductImageObjectName(
        "https://project.supabase.co/storage/v1/object/public/product-images/photo%20one.webp?download=1",
        "https://project.supabase.co",
      ),
    ).toBe("photo one.webp");
  });

  it.each([
    "https://other.supabase.co/storage/v1/object/public/product-images/photo.webp",
    "https://project.supabase.co/storage/v1/object/public/other/photo.webp",
    "https://project.supabase.co/storage/v1/object/public/product-images/nested/photo.webp",
    "not a URL",
  ])("rejects unsupported image URL %s", (imageUrl) => {
    expect(
      getProductImageObjectName(imageUrl, "https://project.supabase.co"),
    ).toBeNull();
  });
});