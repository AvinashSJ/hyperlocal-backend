"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";
import {
  getProductImageThumbnailPath,
  PRODUCT_IMAGE_THUMBNAIL_DIRECTORY,
} from "@/lib/supabase/product-image-variants";

const BUCKET = "product-images";

export type MediaFile = {
  name: string;
  url: string;
  thumbnail_url: string | null;
  updated_at: string;
  size: number;
};

// Signed upload target handed to the browser so the file bytes go
// straight to Supabase Storage instead of through the SSR host. Amplify
// Web Compute caps request/response bodies (~4-6 MB) and returns empty
// responses over the limit, which surfaced as the client-side
// "Unexpected end of JSON input" error on large uploads.
export type UploadTarget = {
  path: string;
  token: string;
  publicUrl: string;
  thumbnail_path: string;
  thumbnail_token: string;
  thumbnail_url: string;
};

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });

  if (error) console.error("Failed to create bucket:", error.message);
}

export async function listMedia(): Promise<MediaFile[]> {
  const supabase = createAdminClient();

  await ensureBucket(supabase);

  const { data, error } = await supabase.storage.from(BUCKET).list("", {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    console.error("Failed to list media:", error.message);
    return [];
  }

  const { data: variants, error: variantError } = await supabase.storage
    .from(BUCKET)
    .list(PRODUCT_IMAGE_THUMBNAIL_DIRECTORY, {
      limit: 1000,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (variantError) {
    console.error("Failed to list product image thumbnails:", variantError.message);
  }

  const variantNames = new Set(
    (variants ?? []).filter((file) => file.id !== null).map((file) => file.name),
  );

  return (data ?? [])
    .filter((file) => file.id !== null && file.name !== PRODUCT_IMAGE_THUMBNAIL_DIRECTORY)
    .map((file) => {
      const thumbnailPath = getProductImageThumbnailPath(file.name);
      const thumbnailName = thumbnailPath.slice(
        PRODUCT_IMAGE_THUMBNAIL_DIRECTORY.length + 1,
      );
      return {
        name: file.name,
        url: supabase.storage.from(BUCKET).getPublicUrl(file.name).data.publicUrl,
        thumbnail_url: variantNames.has(thumbnailName)
          ? supabase.storage.from(BUCKET).getPublicUrl(thumbnailPath).data.publicUrl
          : null,
        updated_at: file.updated_at ?? "",
        size: file.metadata?.size ?? 0,
      };
    });
}

// Issues a single-file signed upload target. The browser compresses the
// image and PUTs it directly to Storage, so the bytes bypass the SSR host
// entirely. Gated on the `media:upload` permission (the action name in
// PERMISSION_MODULES.media — this module has no `create` action).
export async function createUploadUrl(): Promise<UploadTarget> {
  await assertPermission("media", "upload");
  const supabase = createAdminClient();

  await ensureBucket(supabase);

  const storage = supabase.storage.from(BUCKET);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const thumbnailPath = getProductImageThumbnailPath(path);
  const [originalTarget, thumbnailTarget] = await Promise.all([
    storage.createSignedUploadUrl(path),
    storage.createSignedUploadUrl(thumbnailPath),
  ]);

  if (originalTarget.error || !originalTarget.data) {
    throw new Error(originalTarget.error?.message ?? "Failed to create image upload URL");
  }
  if (thumbnailTarget.error || !thumbnailTarget.data) {
    throw new Error(
      thumbnailTarget.error?.message ?? "Failed to create thumbnail upload URL",
    );
  }

  return {
    path,
    token: originalTarget.data.token,
    publicUrl: storage.getPublicUrl(path).data.publicUrl,
    thumbnail_path: thumbnailPath,
    thumbnail_token: thumbnailTarget.data.token,
    thumbnail_url: storage.getPublicUrl(thumbnailPath).data.publicUrl,
  };
}

export async function deleteMedia(fileName: string) {
  await assertPermission("media", "delete");
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([fileName, getProductImageThumbnailPath(fileName)]);
  if (error) throw new Error(error.message);

  revalidatePath("/media");
}
