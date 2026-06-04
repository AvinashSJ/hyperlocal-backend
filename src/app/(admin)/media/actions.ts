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
    sortBy: { column: "updated_at", order: "desc" },
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

export async function uploadMedia(formData: FormData) {
  await assertPermission("media", "create");
  const supabase = createAdminClient();

  await ensureBucket(supabase);

  const files = formData.getAll("files") as File[];
  if (files.length === 0) throw new Error("No files provided");

  const errors: string[] = [];
  const uploaded: string[] = [];

  for (const file of files) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };
    const mime = mimeMap[ext.toLowerCase()] || file.type || "image/jpeg";

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, file, {
        contentType: mime,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      errors.push(`${file.name}: ${error.message}`);
    } else {
      uploaded.push(fileName);
    }
  }

  revalidatePath("/media");

  if (errors.length > 0) {
    throw new Error(
      `Uploaded ${uploaded.length} file(s). Errors: ${errors.join("; ")}`,
    );
  }
}

export async function deleteMedia(fileName: string) {
  await assertPermission("media", "delete");
  const supabase = createAdminClient();

  const { error } = await supabase.storage.from(BUCKET).remove([fileName]);
  if (error) throw new Error(error.message);

  revalidatePath("/media");
}
