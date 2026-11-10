"use client";

import { createClient } from "@/lib/supabase/client";
import { createUploadUrl } from "@/app/(admin)/media/actions";
import {
  PRODUCT_IMAGE_THUMBNAIL_QUALITY,
  PRODUCT_IMAGE_THUMBNAIL_WIDTH,
  PRODUCT_IMAGE_VARIANT_CACHE_CONTROL,
} from "./product-image-variants";

export const MEDIA_BUCKET = "product-images";

// Reject absurdly large source files before spending time encoding them.
// Phone photos are typically 2-12 MB, so 20 MB is a generous ceiling.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Mirror the previous server-side sharp settings (MAX_DIM 1600, q70 webp)
// so stored images keep the same dimensions/quality as before.
export const MAX_IMAGE_DIMENSION = 1600;
export const WEBP_QUALITY = 0.7;
export const CACHE_CONTROL = "31536000";

export type UploadedImage = {
  name: string;
  url: string;
  thumbnail_url: string;
};

export type UploadResult = {
  uploaded: UploadedImage[];
  errors: string[];
};

export function formatBytesLimit(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

async function encodeWebp(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) throw new Error("Failed to process image");
  return blob;
}

// Create the original and a separately stored grid-sized variant from one
// decoded source image. Both are uploaded as immutable, versioned objects.
export async function compressImageVariants(
  file: File,
): Promise<{ original: Blob; thumbnail: Blob }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale =
      longestEdge > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longestEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const thumbnailScale = Math.min(1, PRODUCT_IMAGE_THUMBNAIL_WIDTH / longestEdge);
    const thumbnailWidth = Math.max(1, Math.round(bitmap.width * thumbnailScale));
    const thumbnailHeight = Math.max(1, Math.round(bitmap.height * thumbnailScale));

    const [original, thumbnail] = await Promise.all([
      encodeWebp(bitmap, width, height, WEBP_QUALITY),
      encodeWebp(
        bitmap,
        thumbnailWidth,
        thumbnailHeight,
        PRODUCT_IMAGE_THUMBNAIL_QUALITY / 100,
      ),
    ]);
    return { original, thumbnail };
  } finally {
    bitmap.close();
  }
}

// Downscale + re-encode the detail-sized original in the browser.
export async function compressImage(file: File): Promise<Blob> {
  return (await compressImageVariants(file)).original;
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `${file.name} is larger than ${formatBytesLimit(MAX_UPLOAD_BYTES)}`,
    );
  }

  const [blobs, target] = await Promise.all([
    compressImageVariants(file),
    createUploadUrl(),
  ]);

  const supabase = createClient();
  const storage = supabase.storage.from(MEDIA_BUCKET);
  const [originalUpload, thumbnailUpload] = await Promise.all([
    storage.uploadToSignedUrl(target.path, target.token, blobs.original, {
      contentType: "image/webp",
      cacheControl: CACHE_CONTROL,
    }),
    storage.uploadToSignedUrl(
      target.thumbnail_path,
      target.thumbnail_token,
      blobs.thumbnail,
      {
        contentType: "image/webp",
        cacheControl: PRODUCT_IMAGE_VARIANT_CACHE_CONTROL,
      },
    ),
  ]);

  if (originalUpload.error) {
    throw new Error(`${file.name}: ${originalUpload.error.message}`);
  }
  if (thumbnailUpload.error) {
    throw new Error(`${file.name}: thumbnail upload failed: ${thumbnailUpload.error.message}`);
  }

  return {
    name: target.path,
    url: target.publicUrl,
    thumbnail_url: target.thumbnail_url,
  };
}

// Uploads sequentially (one signed PUT per file) and collects per-file
// failures instead of aborting the whole batch.
export async function uploadImages(files: File[]): Promise<UploadResult> {
  const uploaded: UploadedImage[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      uploaded.push(await uploadImage(file));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `${file.name}: upload failed`);
    }
  }

  return { uploaded, errors };
}
