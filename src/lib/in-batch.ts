/**
 * Chunked `.in()` queries.
 *
 * Supabase/PostgREST passes every filter through the request line and headers,
 * so a large id list inflates the request headers. Undici (Node's fetch) caps
 * them at 16 KB: past ~370 UUIDs the whole request is rejected with
 * `UND_ERR_HEADERS_OVERFLOW`, and the call stalls ~8 s before failing. Three
 * such queries pushed /customers past Amplify's 30 s compute limit → HTTP 504.
 *
 * Batching keeps each request far below the cap and lets the batches run
 * concurrently, so the cost stays a single round-trip.
 */

/** Ids per request. Well under the ~370 UUID threshold with header headroom. */
export const IN_BATCH_SIZE = 200;

/** Splits `ids` into consecutive chunks of at most `size` entries. */
export function chunkIds(ids: readonly string[], size = IN_BATCH_SIZE): string[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`chunkIds: size must be a positive integer (got ${size})`);
  }
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

type BatchResult<T> = {
  data: T[] | null;
  error: { message?: string } | null | undefined;
};

/**
 * Runs `runQuery` once per chunk of `ids`, in parallel, and concatenates the
 * rows in chunk order. `runQuery` must build a fresh query for each chunk —
 * Supabase builders are single-use.
 *
 * Throws on the first failed batch so a partially-loaded list is never
 * returned as if it were complete. An empty `ids` list skips the query
 * entirely (`in.(...)` matches nothing anyway).
 */
export async function selectByIn<T>(
  ids: readonly string[],
  runQuery: (batch: string[]) => PromiseLike<BatchResult<T>>,
  size = IN_BATCH_SIZE,
): Promise<T[]> {
  const batches = chunkIds(ids, size);
  if (batches.length === 0) return [];

  const results = await Promise.all(batches.map((batch) => runQuery(batch)));

  const rows: T[] = [];
  for (const result of results) {
    if (result.error) {
      throw new Error(result.error.message || "Batched query failed");
    }
    if (result.data) rows.push(...result.data);
  }
  return rows;
}
