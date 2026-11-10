import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { backfillProductImageThumbnails } from "@/lib/supabase/product-image-backfill";
import {
  PRODUCT_IMAGE_THUMBNAIL_QUALITY,
  PRODUCT_IMAGE_THUMBNAIL_WIDTH,
  PRODUCT_IMAGE_THUMBNAIL_DIRECTORY,
  PRODUCT_IMAGE_VARIANT_CACHE_CONTROL,
} from "@/lib/supabase/product-image-variants";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const storage = supabase.storage.from("product-images");
const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const afterIdArg = process.argv.find((arg) => arg.startsWith("--after-id="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : undefined;
const afterId = afterIdArg?.slice("--after-id=".length);

if (limitArg && (!Number.isInteger(limit) || (limit ?? 0) < 1)) {
  throw new Error("--limit must be a positive integer");
}
if (afterIdArg && !afterId) throw new Error("--after-id must have a UUID value");

const result = await backfillProductImageThumbnails(
  {
    async listPending(afterId, batchSize) {
      let query = supabase
        .from("product_images")
        .select("id, image_url, thumbnail_url")
        .is("thumbnail_url", null);
      if (afterId) query = query.gt("id", afterId);
      const { data, error } = await query
        .order("id", { ascending: true })
        .limit(batchSize);
      if (error) throw new Error(`Failed to list pending product images: ${error.message}`);
      return data ?? [];
    },
    async thumbnailExists(path) {
      const filename = path.slice(PRODUCT_IMAGE_THUMBNAIL_DIRECTORY.length + 1);
      const { data, error } = await storage.list(PRODUCT_IMAGE_THUMBNAIL_DIRECTORY, {
        limit: 10,
        search: filename,
      });
      if (error) throw new Error(`Failed to check thumbnail ${path}: ${error.message}`);
      return (data ?? []).some((file) => file.name === filename);
    },
    async downloadOriginal(path) {
      const { data, error } = await storage.download(path);
      if (error || !data) {
        throw new Error(`Failed to download original ${path}: ${error?.message ?? "no data"}`);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async uploadThumbnail(path, image) {
      const { error } = await storage.upload(path, Buffer.from(image), {
        contentType: "image/webp",
        cacheControl: PRODUCT_IMAGE_VARIANT_CACHE_CONTROL,
        upsert: false,
      });
      if (error) throw new Error(`Failed to upload thumbnail ${path}: ${error.message}`);
    },
    getPublicUrl(path) {
      return storage.getPublicUrl(path).data.publicUrl;
    },
    async setThumbnailUrl(id, url) {
      const { error } = await supabase
        .from("product_images")
        .update({ thumbnail_url: url })
        .eq("id", id)
        .is("thumbnail_url", null);
      if (error) throw new Error(`Failed to link thumbnail for ${id}: ${error.message}`);
    },
  },
  async (source) => {
    const thumbnail = await sharp(Buffer.from(source))
      .rotate()
      .resize(PRODUCT_IMAGE_THUMBNAIL_WIDTH, PRODUCT_IMAGE_THUMBNAIL_WIDTH, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: PRODUCT_IMAGE_THUMBNAIL_QUALITY })
      .toBuffer();
    return new Uint8Array(thumbnail);
  },
  {
    supabaseUrl,
    dryRun: !apply,
    limit,
    afterId,
  },
);

console.log(JSON.stringify(result, null, 2));
if (result.dryRun) {
  console.log("Dry run only. Re-run with --apply to write thumbnails and database URLs.");
}
if (result.failures.length > 0) process.exitCode = 1;