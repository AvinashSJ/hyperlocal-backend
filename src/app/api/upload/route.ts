import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "product-images";
const MAX_DIM = 1600;
const IMAGE_QUALITY = 70;
const CACHE_CONTROL = "31536000";

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  await ensureBucket(supabase);

  const formData = await request.formData();
  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const errors: string[] = [];
  const uploaded: string[] = [];

  for (const file of files) {
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

    let buf = Buffer.from(await file.arrayBuffer());
    try {
      buf = await sharp(buf, { failOn: "none" })
        .rotate()
        .resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: IMAGE_QUALITY })
        .toBuffer();
    } catch {
      errors.push(`${file.name}: not a readable image`);
      continue;
    }

    const { error } = await supabase.storage.from(BUCKET).upload(fileName, buf, {
      contentType: "image/webp",
      cacheControl: CACHE_CONTROL,
      upsert: false,
    });

    if (error) {
      errors.push(`${file.name}: ${error.message}`);
    } else {
      uploaded.push(fileName);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { uploaded, errors, message: `Uploaded ${uploaded.length} file(s). Errors: ${errors.join("; ")}` },
      { status: 207 },
    );
  }

  return NextResponse.json({ uploaded, errors: [] });
}
