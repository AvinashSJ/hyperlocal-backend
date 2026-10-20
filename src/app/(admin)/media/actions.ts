"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

const BUCKET = "product-images";

export type MediaFile = {
  name: string;
  url: string;
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

  const baseUrl = supabase.storage.from(BUCKET).getPublicUrl("").data.publicUrl.replace(/\/$/, "");

  return (data ?? []).map((f) => ({
    name: f.name,
    url: `${baseUrl}/${f.name}`,
    updated_at: f.updated_at ?? "",
    size: f.metadata?.size ?? 0,
  }));
}

// Issues a single-file signed upload target. The browser compresses the
// image and PUTs it directly to Storage, so the bytes bypass the SSR host
// entirely. Gated on the `media:upload` permission (the action name in
// PERMISSION_MODULES.media — this module has no `create` action).
export async function createUploadUrl(): Promise<UploadTarget> {
  await assertPermission("media", "upload");
  const supabase = createAdminClient();

  await ensureBucket(supabase);

  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create upload URL");
  }

  const baseUrl = supabase.storage
    .from(BUCKET)
    .getPublicUrl("")
    .data.publicUrl.replace(/\/$/, "");

  return { path, token: data.token, publicUrl: `${baseUrl}/${path}` };
}

export async function deleteMedia(fileName: string) {
  await assertPermission("media", "delete");
  const supabase = createAdminClient();

  const { error } = await supabase.storage.from(BUCKET).remove([fileName]);
  if (error) throw new Error(error.message);

  revalidatePath("/media");
}
