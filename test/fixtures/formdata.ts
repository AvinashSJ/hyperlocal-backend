export function buildFormData(fields: Record<string, string | number | boolean | null | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "boolean") {
      fd.append(k, v ? "on" : "off");
    } else {
      fd.append(k, String(v));
    }
  }
  return fd;
}

export type FileLike = {
  name: string;
  type?: string;
  size?: number;
  content?: string | Uint8Array;
};

export function buildFormDataWithFiles(opts: {
  fields?: Record<string, string | number | boolean | null | undefined>;
  files?: Record<string, FileLike | FileLike[]>;
}): FormData {
  const fd = buildFormData(opts.fields ?? {});
  if (opts.files) {
    for (const [k, v] of Object.entries(opts.files)) {
      if (Array.isArray(v)) {
        for (const f of v) fd.append(k, toFile(f));
      } else {
        fd.append(k, toFile(v));
      }
    }
  }
  return fd;
}

function toFile(f: FileLike): File {
  const content: string = typeof f.content === "string" ? f.content : "";
  const blob = new Blob([content], { type: f.type ?? "image/png" });
  return new File([blob], f.name, { type: f.type ?? "image/png" });
}
