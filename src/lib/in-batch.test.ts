import { describe, it, expect, vi } from "vitest";
import { chunkIds, selectByIn, IN_BATCH_SIZE } from "./in-batch";

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `id-${i}`);
}

describe("chunkIds", () => {
  it("returns [] for an empty list", () => {
    expect(chunkIds([])).toEqual([]);
  });

  it("keeps a short list in a single chunk", () => {
    expect(chunkIds(["a", "b", "c"])).toEqual([["a", "b", "c"]]);
  });

  it("splits at exactly the batch size without a trailing empty chunk", () => {
    const chunks = chunkIds(ids(IN_BATCH_SIZE));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(IN_BATCH_SIZE);
  });

  it("moves the overflow id into the next chunk", () => {
    const chunks = chunkIds(ids(IN_BATCH_SIZE + 1));
    expect(chunks.map((c) => c.length)).toEqual([IN_BATCH_SIZE, 1]);
  });

  it("splits 400 ids into two equal chunks", () => {
    const chunks = chunkIds(ids(400));
    expect(chunks.map((c) => c.length)).toEqual([200, 200]);
    // No id is lost or duplicated across chunks.
    expect(chunks.flat()).toEqual(ids(400));
  });

  it("honours a custom size", () => {
    expect(chunkIds(ids(5), 2).map((c) => c.length)).toEqual([2, 2, 1]);
  });

  it("rejects a non-positive size", () => {
    expect(() => chunkIds(ids(3), 0)).toThrow(/positive integer/);
    expect(() => chunkIds(ids(3), -1)).toThrow(/positive integer/);
    expect(() => chunkIds(ids(3), 1.5)).toThrow(/positive integer/);
  });
});

describe("selectByIn", () => {
  it("short-circuits an empty id list without querying", async () => {
    const runQuery = vi.fn();
    await expect(selectByIn([], runQuery)).resolves.toEqual([]);
    expect(runQuery).not.toHaveBeenCalled();
  });

  it("issues a single query when ids fit in one batch", async () => {
    const runQuery = vi.fn(async (batch: string[]) => ({
      data: batch.map((id) => ({ id })),
      error: null,
    }));

    const rows = await selectByIn(ids(3), runQuery);

    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(runQuery.mock.calls[0][0]).toEqual(ids(3));
    expect(rows).toEqual(ids(3).map((id) => ({ id })));
  });

  it("never sends more than IN_BATCH_SIZE ids per query", async () => {
    const seen: number[] = [];
    const runQuery = vi.fn(async (batch: string[]) => {
      seen.push(batch.length);
      return { data: batch.map((id) => ({ id })), error: null };
    });

    await selectByIn(ids(400), runQuery);

    expect(seen).toEqual([200, 200]);
    expect(Math.max(...seen)).toBeLessThanOrEqual(IN_BATCH_SIZE);
  });

  it("starts every batch concurrently and preserves chunk order", async () => {
    let pending = 0;
    let maxPending = 0;
    const release: (() => void)[] = [];
    const runQuery = vi.fn((batch: string[]) => {
      pending += 1;
      maxPending = Math.max(maxPending, pending);
      return new Promise<{ data: { id: string }[]; error: null }>((resolve) => {
        release.push(() => {
          pending -= 1;
          resolve({ data: batch.map((id) => ({ id })), error: null });
        });
      });
    });

    const promise = selectByIn(ids(400), runQuery);
    // Both queries are in flight before either resolves.
    expect(runQuery).toHaveBeenCalledTimes(2);
    expect(maxPending).toBe(2);

    release.forEach((r) => r());
    const rows = await promise;

    expect(maxPending).toBe(2);
    expect(rows).toEqual(ids(400).map((id) => ({ id })));
  });

  it("throws with the batch error message instead of returning partial rows", async () => {
    const runQuery = vi.fn(async (_batch: string[]) => ({
      data: null,
      error: { message: "value too long for type character varying(64)" },
    }));

    await expect(selectByIn(ids(1), runQuery)).rejects.toThrow(
      "value too long for type character varying(64)",
    );
  });

  it("throws a generic message when the error carries none", async () => {
    const runQuery = vi.fn(async () => ({ data: null, error: { message: undefined } }));

    await expect(selectByIn(ids(1), runQuery)).rejects.toThrow("Batched query failed");
  });

  it("treats a null data payload as no rows", async () => {
    const runQuery = vi.fn(async () => ({ data: null, error: null }));

    await expect(selectByIn(ids(2), runQuery)).resolves.toEqual([]);
  });

  it("propagates a rejected query", async () => {
    const runQuery = vi.fn(async () => Promise.reject(new Error("network down")));

    await expect(selectByIn(ids(2), runQuery)).rejects.toThrow("network down");
  });
});
