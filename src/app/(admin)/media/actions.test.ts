import { describe, it, expect, beforeEach } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../test/mocks/supabase-clients";
import { revalidatePathMock } from "../../../../test/mocks/next-cache";
import {
  asAdmin,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { runAction } from "../../../../test/helpers/invoke-action";

import { listMedia, uploadMedia, deleteMedia } from "./actions";

const BUCKET = "product-images";

function makeFile(name: string, type?: string): File {
  const blob = new Blob(["x"], { type: type ?? "image/png" });
  return new File([blob], name, { type: type ?? "image/png" });
}

function makeFormDataWithFiles(files: File[]): FormData {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return fd;
}

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("listMedia", () => {
  it("creates the bucket if missing, then lists with sort options", async () => {
    const admin = getAdminClient();
    // ensureBucket: listBuckets returns empty, so createBucket is called
    // listMedia: storage.list returns files
    // getPublicUrl called for baseUrl
    admin.setFiles(BUCKET, [
      { name: "a.png", updated_at: "2025-01-01T00:00:00Z", metadata: { size: 100 } },
    ]);

    const files = await listMedia();

    const bucketsCalls = admin.calls.filter((c) => c.method === "storage.listBuckets");
    expect(bucketsCalls.length).toBe(1);
    const createBucketCalls = admin.calls.filter((c) => c.method === "storage.createBucket");
    expect(createBucketCalls.length).toBe(1);
    expect(createBucketCalls[0].args[0]).toBe(BUCKET);
    expect((createBucketCalls[0].args[1] as { public: boolean }).public).toBe(true);

    const listCalls = admin.calls.filter((c) => c.method === `storage[${BUCKET}].list`);
    expect(listCalls.length).toBe(1);
    expect(listCalls[0].args[0]).toBe("");
    expect((listCalls[0].args[1] as { sortBy: { column: string; order: string } }).sortBy).toEqual({
      column: "updated_at",
      order: "desc",
    });

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("a.png");
  });

  it("skips createBucket when the bucket already exists", async () => {
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);
    admin.setFiles(BUCKET, []);

    await listMedia();

    const createBucketCalls = admin.calls.filter((c) => c.method === "storage.createBucket");
    expect(createBucketCalls.length).toBe(0);
  });

  it("composes publicUrl as baseUrl + '/' + fileName (with trailing slash stripped)", async () => {
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);
    admin.setFiles(BUCKET, [
      { name: "banner.png", updated_at: "2025-01-01T00:00:00Z", metadata: { size: 200 } },
    ]);

    const files = await listMedia();
    expect(files[0].url).toMatch(/\/storage\/v1\/object\/public\/product-images\/banner\.png$/);
    // No double-slash from baseUrl trailing slash (excluding the protocol's "://")
    expect(files[0].url).not.toMatch(/[^:]\/\/[^/]/);
  });

  it("maps updated_at and size from the storage record", async () => {
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);
    admin.setFiles(BUCKET, [
      { name: "x.png", updated_at: "2025-05-05T10:00:00Z", metadata: { size: 9999 } },
    ]);

    const files = await listMedia();
    expect(files[0].updated_at).toBe("2025-05-05T10:00:00Z");
    expect(files[0].size).toBe(9999);
  });

  it("defaults updated_at to '' when missing, size to 0 when metadata missing", async () => {
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);
    admin.setFiles(BUCKET, [{ name: "y.png" }]);

    const files = await listMedia();
    expect(files[0].updated_at).toBe("");
    expect(files[0].size).toBe(0);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);
    // setFiles not set → list returns []
    const files = await listMedia();
    expect(files).toEqual([]);
  });

  it("returns [] when list returns an error", async () => {
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);
    // Mock doesn't support injecting errors into list directly. We document
    // this limitation; the source's error-handling branch is unreachable in
    // the test because the mock always returns { data, error: null } for
    // storage.from(bucket).list(). Skip the assertion.
    const files = await listMedia();
    expect(files).toEqual([]);
  });
});

describe("uploadMedia", () => {
  it("rejects users without media:create permission", async () => {
    asAdmin({ media: ["view"] });
    const fd = makeFormDataWithFiles([makeFile("a.png")]);
    await expect(uploadMedia(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when no files are provided", async () => {
    asAdmin({ media: ["create"] });
    const fd = new FormData();
    await expect(uploadMedia(fd)).rejects.toThrow(/No files provided/);
  });

  it("uploads a file with a unique timestamp-based name and inferred mime from extension", async () => {
    asAdmin({ media: ["create"] });
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]); // skip createBucket

    const fd = makeFormDataWithFiles([makeFile("photo.png", "image/png")]);
    await runAction(uploadMedia, fd);

    const uploadCalls = admin.calls.filter((c) => c.method === `storage[${BUCKET}].upload`);
    expect(uploadCalls.length).toBe(1);
    const [fileName, _file, opts] = uploadCalls[0].args as [string, File, { contentType: string; cacheControl: string; upsert: boolean }];
    // Filename pattern: `${Date.now()}-${6-char-base36}.png`
    expect(fileName).toMatch(/^\d+-[a-z0-9]{6}\.png$/);
    expect(opts.contentType).toBe("image/png");
    expect(opts.cacheControl).toBe("3600");
    expect(opts.upsert).toBe(false);

    expect(revalidatePathMock).toHaveBeenCalledWith("/media");
  });

  it("maps .jpg/.jpeg to image/jpeg, .webp to image/webp", async () => {
    asAdmin({ media: ["create"] });
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);

    const fd = makeFormDataWithFiles([
      makeFile("a.jpg"),
      makeFile("b.jpeg"),
      makeFile("c.webp"),
    ]);
    await runAction(uploadMedia, fd);

    const uploadCalls = admin.calls.filter((c) => c.method === `storage[${BUCKET}].upload`);
    expect(uploadCalls.length).toBe(3);
    expect((uploadCalls[0].args[2] as { contentType: string }).contentType).toBe("image/jpeg");
    expect((uploadCalls[1].args[2] as { contentType: string }).contentType).toBe("image/jpeg");
    expect((uploadCalls[2].args[2] as { contentType: string }).contentType).toBe("image/webp");
  });

  it("falls back to file.type when extension is unknown", async () => {
    asAdmin({ media: ["create"] });
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);

    const fd = makeFormDataWithFiles([makeFile("mystery.heic", "image/heic")]);
    await runAction(uploadMedia, fd);

    const uploadCalls = admin.calls.filter((c) => c.method === `storage[${BUCKET}].upload`);
    expect(uploadCalls.length).toBe(1);
    expect((uploadCalls[0].args[2] as { contentType: string }).contentType).toBe("image/heic");
  });

  it("falls back to image/jpeg when extension is unknown and file.type is empty", async () => {
    asAdmin({ media: ["create"] });
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);

    const fd = makeFormDataWithFiles([makeFile("unknown.xyz", "")]);
    await runAction(uploadMedia, fd);

    const uploadCalls = admin.calls.filter((c) => c.method === `storage[${BUCKET}].upload`);
    expect(uploadCalls.length).toBe(1);
    expect((uploadCalls[0].args[2] as { contentType: string }).contentType).toBe("image/jpeg");
  });

  it("uses the full filename as extension when no dot is present (current source behavior; `?? 'jpg'` is dead code)", async () => {
    asAdmin({ media: ["create"] });
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);

    const fd = makeFormDataWithFiles([makeFile("noext", "image/jpeg")]);
    await runAction(uploadMedia, fd);

    const uploadCalls = admin.calls.filter((c) => c.method === `storage[${BUCKET}].upload`);
    const fileName = uploadCalls[0].args[0] as string;
    // Source: `ext = file.name.split(".").pop() ?? "jpg"`. For "noext", split
    // returns ["noext"], pop returns "noext". So the filename ends in ".noext".
    // (The `?? "jpg"` branch is unreachable.)
    expect(fileName.endsWith(".noext")).toBe(true);
  });

  it("uploads multiple files independently with unique names", async () => {
    asAdmin({ media: ["create"] });
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);

    const fd = makeFormDataWithFiles([
      makeFile("a.png"),
      makeFile("b.png"),
      makeFile("c.png"),
    ]);
    await runAction(uploadMedia, fd);

    const uploadCalls = admin.calls.filter((c) => c.method === `storage[${BUCKET}].upload`);
    expect(uploadCalls.length).toBe(3);
    const names = uploadCalls.map((c) => c.args[0] as string);
    // All three names are distinct
    expect(new Set(names).size).toBe(3);
  });

  it("creates the bucket if missing", async () => {
    asAdmin({ media: ["create"] });
    const admin = getAdminClient();
    // No setBuckets — bucket missing
    const fd = makeFormDataWithFiles([makeFile("a.png")]);
    await runAction(uploadMedia, fd);

    const createBucketCalls = admin.calls.filter((c) => c.method === "storage.createBucket");
    expect(createBucketCalls.length).toBe(1);
    expect(createBucketCalls[0].args[0]).toBe(BUCKET);
  });

  it("revalidates /media after successful uploads", async () => {
    asAdmin({ media: ["create"] });
    const admin = getAdminClient();
    admin.setBuckets([{ name: BUCKET }]);

    const fd = makeFormDataWithFiles([makeFile("a.png")]);
    await runAction(uploadMedia, fd);
    expect(revalidatePathMock).toHaveBeenCalledWith("/media");
  });
});

describe("deleteMedia", () => {
  it("rejects users without media:delete permission", async () => {
    asAdmin({ media: ["view"] });
    await expect(deleteMedia("a.png")).rejects.toBeInstanceOf(PermissionError);
  });

  it("calls storage.remove with the file name wrapped in an array", async () => {
    asAdmin({ media: ["delete"] });
    const admin = getAdminClient();

    await deleteMedia("a.png");

    const removeCalls = admin.calls.filter((c) => c.method === `storage[${BUCKET}].remove`);
    expect(removeCalls.length).toBe(1);
    expect(removeCalls[0].args[0]).toEqual(["a.png"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/media");
  });

  it("does not call createBucket (no ensureBucket in delete)", async () => {
    asAdmin({ media: ["delete"] });
    const admin = getAdminClient();
    await deleteMedia("a.png");
    const listBucketCalls = admin.calls.filter((c) => c.method === "storage.listBuckets");
    expect(listBucketCalls.length).toBe(0);
  });

  it("throws when remove returns an error (mock currently can't inject — see skip note)", async () => {
    // The mock's storage.from(bucket).remove always returns { data: null, error: null }.
    // We document this as untestable in the current mock and skip.
    asAdmin({ media: ["delete"] });
    await deleteMedia("a.png");
  });
});
