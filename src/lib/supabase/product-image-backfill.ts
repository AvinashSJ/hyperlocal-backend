import {
  getProductImageObjectName,
  getProductImageThumbnailPath,
} from "./product-image-variants";

export type ProductImageBackfillRow = {
  id: string;
  image_url: string;
  thumbnail_url: string | null;
};

export type ProductImageBackfillPort = {
  listPending(afterId: string | null, limit: number): Promise<ProductImageBackfillRow[]>;
  thumbnailExists(path: string): Promise<boolean>;
  downloadOriginal(path: string): Promise<Uint8Array>;
  uploadThumbnail(path: string, image: Uint8Array): Promise<void>;
  getPublicUrl(path: string): string;
  setThumbnailUrl(id: string, url: string): Promise<void>;
};

export type ProductImageBackfillFailure = {
  id: string;
  error: string;
};

export type ProductImageBackfillResult = {
  dryRun: boolean;
  scanned: number;
  nextAfterId: string | null;
  generated: number;
  linkedExisting: number;
  wouldGenerate: number;
  wouldLinkExisting: number;
  failures: ProductImageBackfillFailure[];
};

export async function backfillProductImageThumbnails(
  port: ProductImageBackfillPort,
  encodeThumbnail: (source: Uint8Array) => Promise<Uint8Array>,
  options: {
    supabaseUrl: string;
    dryRun: boolean;
    afterId?: string;
    batchSize?: number;
    limit?: number;
  },
): Promise<ProductImageBackfillResult> {
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("batchSize must be a positive integer");
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("limit must be a positive integer");
  }

  const result: ProductImageBackfillResult = {
    dryRun: options.dryRun,
    scanned: 0,
    nextAfterId: options.afterId ?? null,
    generated: 0,
    linkedExisting: 0,
    wouldGenerate: 0,
    wouldLinkExisting: 0,
    failures: [],
  };

  let afterId: string | null = options.afterId ?? null;
  let remaining = options.limit ?? Number.POSITIVE_INFINITY;

  while (remaining > 0) {
    const requestSize = Math.min(batchSize, remaining);
    const rows = await port.listPending(afterId, requestSize);
    if (rows.length === 0) break;

    for (const row of rows) {
      afterId = row.id;
      result.nextAfterId = row.id;
      remaining -= 1;
      result.scanned += 1;

      try {
        const originalName = getProductImageObjectName(
          row.image_url,
          options.supabaseUrl,
        );
        if (!originalName) {
          throw new Error("Image URL is not a root-level public product-images object");
        }

        const thumbnailPath = getProductImageThumbnailPath(originalName);
        const exists = await port.thumbnailExists(thumbnailPath);
        if (exists) {
          if (options.dryRun) {
            result.wouldLinkExisting += 1;
          } else {
            await port.setThumbnailUrl(row.id, port.getPublicUrl(thumbnailPath));
            result.linkedExisting += 1;
          }
          continue;
        }

        if (options.dryRun) {
          result.wouldGenerate += 1;
          continue;
        }

        const source = await port.downloadOriginal(originalName);
        const thumbnail = await encodeThumbnail(source);
        try {
          await port.uploadThumbnail(thumbnailPath, thumbnail);
        } catch (uploadError) {
          // A concurrent run or a lost upload response may have created it.
          if (!(await port.thumbnailExists(thumbnailPath))) throw uploadError;
          await port.setThumbnailUrl(row.id, port.getPublicUrl(thumbnailPath));
          result.linkedExisting += 1;
          continue;
        }

        await port.setThumbnailUrl(row.id, port.getPublicUrl(thumbnailPath));
        result.generated += 1;
      } catch (error) {
        result.failures.push({
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return result;
}