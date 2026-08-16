// Re-encode product images in-place to reduce storage size and delivery bytes
// (cached-egress). Skips files already optimized (image/webp + 1-year cache),
// which is what both this script and /api/upload produce — idempotent.
//
// Usage:
//   node scripts/reoptimize-images.mjs --dry-run            # report only, no writes
//   node scripts/reoptimize-images.mjs --limit 3 --dry-run  # sample a few files
//   node scripts/reoptimize-images.mjs --backup ./backup    # backup originals, then write
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (target project).

import { mkdir, writeFile } from "node:fs/promises";

const BUCKET = "product-images";
const MAX_DIM = 1600;
const QUALITY = 70;
const CACHE_CONTROL = "31536000";
const isOptimized = (f) =>
  f.metadata?.mimetype === "image/webp" && f.metadata?.cacheControl === "max-age=31536000";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const argValue = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const LIMIT = Number(argValue("--limit") ?? 0);
const BACKUP_DIR = argValue("--backup");

const { createClient } = await import("@supabase/supabase-js");
const { default: sharp } = await import("sharp");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function listAll() {
  const files = [];
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(undefined, {
      limit: PAGE,
      offset,
    });
    if (error) throw error;
    files.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return files;
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

const main = async () => {
  const files = await listAll();
  const candidates = files.filter((f) => !isOptimized(f));
  if (LIMIT > 0) candidates.length = Math.min(candidates.length, LIMIT);

  console.log(`Total objects: ${files.length}`);
  console.log(`To process: ${candidates.length}${DRY_RUN ? " (DRY-RUN, no writes)" : ""}\n`);

  if (BACKUP_DIR) await mkdir(BACKUP_DIR, { recursive: true });

  let done = 0;
  let failed = 0;
  let beforeBytes = 0;
  let afterBytes = 0;
  let keptOriginal = 0;

  for (const file of candidates) {
    const before = file.metadata?.size ?? 0;
    beforeBytes += before;

    const { data, error } = await supabase.storage.from(BUCKET).download(file.name);
    if (error || !data) {
      console.error(`  FAIL download ${file.name}: ${error?.message}`);
      failed += 1;
      continue;
    }

    const original = Buffer.from(await data.arrayBuffer());
    if (BACKUP_DIR) {
      await writeFile(`${BACKUP_DIR}/${file.name}`, original);
    }

    let out;
    let useOriginal = false;
    try {
      out = await sharp(original, { failOn: "none" })
        .rotate()
        .resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer();
      useOriginal = out.length >= original.length;
    } catch (e) {
      console.error(`  FAIL process ${file.name}: ${e.message}`);
      failed += 1;
      continue;
    }

    const payload = useOriginal ? original : out;
    const contentType = useOriginal
      ? file.metadata?.mimetype ?? "image/webp"
      : "image/webp";
    if (useOriginal) keptOriginal += 1;
    afterBytes += payload.length;

    if (!DRY_RUN) {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(file.name, payload, {
        upsert: true,
        contentType,
        cacheControl: CACHE_CONTROL,
      });
      if (upErr) {
        console.error(`  FAIL upload ${file.name}: ${upErr.message}`);
        failed += 1;
        continue;
      }
    }

    done += 1;
    if (done % 25 === 0 || done === candidates.length) {
      console.log(
        `  ${done}/${candidates.length} — ${mb(beforeBytes)} MB -> ${mb(afterBytes)} MB so far`,
      );
    }
  }

  console.log(`\nDone: ${done} ok, ${failed} failed, ${keptOriginal} kept original (already smaller than webp q70)`);
  console.log(`Size: ${mb(beforeBytes)} MB -> ${mb(afterBytes)} MB (${beforeBytes ? Math.round((afterBytes / beforeBytes) * 100) : 0}%)`);
  if (!DRY_RUN && BACKUP_DIR) {
    console.log(`Originals backed up to: ${BACKUP_DIR}`);
  }
  if (failed > 0) process.exitCode = 1;
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
