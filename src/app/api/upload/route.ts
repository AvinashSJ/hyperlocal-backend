import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "product-images";

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
    const ext = file.name.split(".").pop() ?? "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };
    const mime = mimeMap[ext.toLowerCase()] || file.type || "image/jpeg";

    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await supabase.storage.from(BUCKET).upload(fileName, buf, {
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

  if (errors.length > 0) {
    return NextResponse.json(
      { uploaded, errors, message: `Uploaded ${uploaded.length} file(s). Errors: ${errors.join("; ")}` },
      { status: 207 },
    );
  }

  return NextResponse.json({ uploaded, errors: [] });
}
