import { describe, expect, it, vi } from "vitest";
import {
  backfillProductImageThumbnails,
  type ProductImageBackfillPort,
  type ProductImageBackfillRow,
} from "./product-image-backfill";
import { getProductImageThumbnailPath } from "./product-image-variants";

const SUPABASE_URL = "https://project.supabase.co";

function makeFixture(
  initialRows: ProductImageBackfillRow[],
  existingVariants: string[] = [],
) {
  const rows = initialRows.map((row) => ({ ...row }));
  const variants = new Set(existingVariants);
  const uploads: string[] = [];
  const updates: Array<{ id: string; url: string }> = [];
  const port: ProductImageBackfillPort = {
    async listPending(afterId, limit) {
      return rows
        .filter((row) => row.thumbnail_url === null && (!afterId || row.id > afterId))
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, limit);
    },
    async thumbnailExists(path) {
      return variants.has(path);
    },
    async downloadOriginal(path) {
      if (path === "broken.webp") throw new Error("source download failed");
      return new Uint8Array([1, 2, 3]);
    },
    async uploadThumbnail(path) {
      if (variants.has(path)) throw new Error("object already exists");
      variants.add(path);
      uploads.push(path);
    },
    getPublicUrl(path) {
      return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
    },
    async setThumbnailUrl(id, url) {
      const row = rows.find((item) => item.id === id)!;
      row.thumbnail_url = url;
      updates.push({ id, url });
    },
  };

  return { port, rows, variants, uploads, updates };
}

const encode = vi.fn(async () => new Uint8Array([4, 5, 6]));

describe("backfillProductImageThumbnails", () => {
  it("generates, stores, and links a thumbnail; reruns do not duplicate it", async () => {
    const fixture = makeFixture([
      {
        id: "1",
        image_url: `${SUPABASE_URL}/storage/v1/object/public/product-images/photo.webp`,
        thumbnail_url: null,
      },
    ]);

    const first = await backfillProductImageThumbnails(fixture.port, encode, {
      supabaseUrl: SUPABASE_URL,
      dryRun: false,
      batchSize: 1,
    });
    const second = await backfillProductImageThumbnails(fixture.port, encode, {
      supabaseUrl: SUPABASE_URL,
      dryRun: false,
      batchSize: 1,
    });

    const expectedPath = getProductImageThumbnailPath("photo.webp");
    expect(first.generated).toBe(1);
    expect(first.failures).toEqual([]);
    expect(second.scanned).toBe(0);
    expect(fixture.uploads).toEqual([expectedPath]);
    expect(fixture.rows[0].thumbnail_url).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/product-images/${expectedPath}`,
    );
  });

  it("links a variant left by an interrupted prior run without uploading again", async () => {
    const path = getProductImageThumbnailPath("photo.webp");
    const fixture = makeFixture(
      [
        {
          id: "1",
          image_url: `${SUPABASE_URL}/storage/v1/object/public/product-images/photo.webp`,
          thumbnail_url: null,
        },
      ],
      [path],
    );

    const result = await backfillProductImageThumbnails(fixture.port, encode, {
      supabaseUrl: SUPABASE_URL,
      dryRun: false,
    });

    expect(result.linkedExisting).toBe(1);
    expect(fixture.uploads).toEqual([]);
    expect(fixture.rows[0].thumbnail_url).toContain(path);
  });

  it("reports per-image failures and continues processing later rows", async () => {
    const fixture = makeFixture([
      { id: "1", image_url: "https://external.example/photo.webp", thumbnail_url: null },
      {
        id: "2",
        image_url: `${SUPABASE_URL}/storage/v1/object/public/product-images/broken.webp`,
        thumbnail_url: null,
      },
      {
        id: "3",
        image_url: `${SUPABASE_URL}/storage/v1/object/public/product-images/good.webp`,
        thumbnail_url: null,
      },
    ]);

    const result = await backfillProductImageThumbnails(fixture.port, encode, {
      supabaseUrl: SUPABASE_URL,
      dryRun: false,
      batchSize: 2,
    });

    expect(result.generated).toBe(1);
    expect(result.failures).toEqual([
      { id: "1", error: "Image URL is not a root-level public product-images object" },
      { id: "2", error: "source download failed" },
    ]);
    expect(fixture.rows[2].thumbnail_url).toContain("good.webp.webp");
  });

  it("dry-run reports planned work without writing or updating", async () => {
    const fixture = makeFixture([
      {
        id: "1",
        image_url: `${SUPABASE_URL}/storage/v1/object/public/product-images/photo.webp`,
        thumbnail_url: null,
      },
    ]);

    const result = await backfillProductImageThumbnails(fixture.port, encode, {
      supabaseUrl: SUPABASE_URL,
      dryRun: true,
    });

    expect(result.wouldGenerate).toBe(1);
    expect(fixture.uploads).toEqual([]);
    expect(fixture.updates).toEqual([]);
  });

  it("returns a cursor that resumes after the last scanned id", async () => {
    const fixture = makeFixture([
      {
        id: "1",
        image_url: `${SUPABASE_URL}/storage/v1/object/public/product-images/first.webp`,
        thumbnail_url: null,
      },
      {
        id: "2",
        image_url: `${SUPABASE_URL}/storage/v1/object/public/product-images/second.webp`,
        thumbnail_url: null,
      },
    ]);

    const result = await backfillProductImageThumbnails(fixture.port, encode, {
      supabaseUrl: SUPABASE_URL,
      dryRun: true,
      limit: 1,
    });

    expect(result.nextAfterId).toBe("1");
    const resumed = await backfillProductImageThumbnails(fixture.port, encode, {
      supabaseUrl: SUPABASE_URL,
      dryRun: true,
      afterId: result.nextAfterId ?? undefined,
      limit: 1,
    });
    expect(resumed.nextAfterId).toBe("2");
    expect(resumed.scanned).toBe(1);
  });
});