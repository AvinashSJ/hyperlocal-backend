// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/app/(admin)/media/actions", () => ({
  createUploadUrl: vi.fn(),
}));

import { createClient } from "@/lib/supabase/client";
import { createUploadUrl } from "@/app/(admin)/media/actions";
import {
  uploadImage,
  uploadImages,
  compressImage,
  formatBytesLimit,
  MAX_UPLOAD_BYTES,
} from "./upload-client";

const mockCreateClient = createClient as ReturnType<typeof vi.fn>;
const mockCreateUploadUrl = createUploadUrl as ReturnType<typeof vi.fn>;

const uploadToSignedUrl = vi.fn();
const drawImageMock = vi.fn();
const closeBitmap = vi.fn();

const TARGET = {
  path: "1700000000-abc123.webp",
  token: "tok-123",
  publicUrl: "https://cdn.example.com/product-images/1700000000-abc123.webp",
};

let createImageBitmapMock: ReturnType<typeof vi.fn>;
let toBlobResult: Blob | null;

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

function makeFile(name = "photo.png", bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadToSignedUrl.mockReset();
  uploadToSignedUrl.mockResolvedValue({ data: { path: TARGET.path }, error: null });
  drawImageMock.mockReset();
  closeBitmap.mockReset();

  mockCreateClient.mockReturnValue({
    storage: { from: () => ({ uploadToSignedUrl }) },
  });

  mockCreateUploadUrl.mockResolvedValue({ ...TARGET });

  createImageBitmapMock = vi.fn(async () => ({
    width: 3200,
    height: 1600,
    close: closeBitmap,
  }));
  vi.stubGlobal("createImageBitmap", createImageBitmapMock);

  // jsdom ships no canvas backend, so stub the 2D context + encoder.
  toBlobResult = new Blob(["webp"], { type: "image/webp" });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: drawImageMock,
  })) as unknown as typeof originalGetContext;
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => cb(toBlobResult)) as unknown as typeof originalToBlob;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toBlob = originalToBlob;
  vi.unstubAllGlobals();
});

describe("formatBytesLimit", () => {
  it("renders whole megabytes", () => {
    expect(formatBytesLimit(MAX_UPLOAD_BYTES)).toBe("20 MB");
  });
});

describe("compressImage", () => {
  it("downscales the longest edge to 1600 and returns a webp blob", async () => {
    const blobs: HTMLCanvasElement[] = [];
    const origCreate = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === "canvas") blobs.push(el as HTMLCanvasElement);
      return el;
    });

    const result = await compressImage(makeFile());

    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(blobs).toHaveLength(1);
    // 3200x1600 → scale 0.5 → 1600x800
    expect(blobs[0].width).toBe(1600);
    expect(blobs[0].height).toBe(800);
    expect(drawImageMock).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
    expect(result.type).toBe("image/webp");
    expect(closeBitmap).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it("does not upscale images already within the max dimension", async () => {
    createImageBitmapMock.mockResolvedValueOnce({ width: 800, height: 600, close: closeBitmap });

    const blobs: HTMLCanvasElement[] = [];
    const origCreate = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === "canvas") blobs.push(el as HTMLCanvasElement);
      return el;
    });

    await compressImage(makeFile());

    expect(blobs[0].width).toBe(800);
    expect(blobs[0].height).toBe(600);

    spy.mockRestore();
  });

  it("throws when a 2D context is unavailable (and still closes the bitmap)", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof originalGetContext;

    await expect(compressImage(makeFile())).rejects.toThrow(/Canvas is not supported/);
    expect(closeBitmap).toHaveBeenCalledTimes(1);
  });

  it("throws when the canvas cannot encode a blob", async () => {
    toBlobResult = null;

    await expect(compressImage(makeFile())).rejects.toThrow(/Failed to process image/);
  });
});

describe("uploadImage", () => {
  it("rejects files above the max size without compressing or requesting a URL", async () => {
    const big = makeFile("big.png");
    Object.defineProperty(big, "size", { value: MAX_UPLOAD_BYTES + 1 });

    await expect(uploadImage(big)).rejects.toThrow(/big\.png is larger than 20 MB/);
    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(mockCreateUploadUrl).not.toHaveBeenCalled();
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });

  it("compresses, PUTs to the signed target, and returns the name + public URL", async () => {
    const result = await uploadImage(makeFile("photo.png"));

    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
    const [path, token, body, opts] = uploadToSignedUrl.mock.calls[0];
    expect(path).toBe(TARGET.path);
    expect(token).toBe(TARGET.token);
    expect(body).toBeInstanceOf(Blob);
    expect((opts as { contentType: string }).contentType).toBe("image/webp");
    expect((opts as { cacheControl: string }).cacheControl).toBe("31536000");
    expect(result).toEqual({ name: TARGET.path, url: TARGET.publicUrl });
  });

  it("throws a file-scoped error when storage rejects the upload", async () => {
    uploadToSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "mime type not allowed" },
    });

    await expect(uploadImage(makeFile("photo.png"))).rejects.toThrow(
      /photo\.png: mime type not allowed/,
    );
  });
});

describe("uploadImages", () => {
  it("returns an empty result for an empty list", async () => {
    const result = await uploadImages([]);
    expect(result).toEqual({ uploaded: [], errors: [] });
    expect(mockCreateUploadUrl).not.toHaveBeenCalled();
  });

  it("uploads sequentially and aggregates per-file errors", async () => {
    mockCreateUploadUrl
      .mockResolvedValueOnce({ ...TARGET, path: "one.webp", publicUrl: "https://cdn/one.webp" })
      .mockRejectedValueOnce(new Error("Permission denied: upload on media"));

    const result = await uploadImages([makeFile("one.png"), makeFile("two.png")]);

    expect(result.uploaded).toEqual([
      { name: "one.webp", url: "https://cdn/one.webp" },
    ]);
    expect(result.errors).toEqual(["Permission denied: upload on media"]);
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("records a generic message for non-Error failures", async () => {
    mockCreateUploadUrl.mockRejectedValueOnce("boom");

    const result = await uploadImages([makeFile("one.png")]);

    expect(result.uploaded).toEqual([]);
    expect(result.errors).toEqual(["one.png: upload failed"]);
  });
});
