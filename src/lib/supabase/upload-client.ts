"use client";

import { createClient } from "@/lib/supabase/client";
import { createUploadUrl } from "@/app/(admin)/media/actions";

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
};

export type UploadResult = {
  uploaded: UploadedImage[];
  errors: string[];
};

export function formatBytesLimit(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// Downscale + re-encode to WebP in the browser. This replaces the sharp
// step that used to run in the SSR Lambda (which cannot receive large
// bodies on Amplify and added memory/timeout pressure).
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale =
      longestEdge > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longestEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported in this browser");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
    );
    if (!blob) throw new Error("Failed to process image");
    return blob;
  } finally {
    bitmap.close();
  }
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `${file.name} is larger than ${formatBytesLimit(MAX_UPLOAD_BYTES)}`,
    );
  }

  const [blob, target] = await Promise.all([
    compressImage(file),
    createUploadUrl(),
  ]);

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .uploadToSignedUrl(target.path, target.token, blob, {
      contentType: "image/webp",
      cacheControl: CACHE_CONTROL,
    });

  if (error) throw new Error(`${file.name}: ${error.message}`);

  return { name: target.path, url: target.publicUrl };
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
