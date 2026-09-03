import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookieRecord = { name: string; value: string };

const cookieStoreMock: {
  cookies: Map<string, string>;
  setAll: ReturnType<typeof vi.fn>;
} = {
  cookies: new Map(),
  setAll: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () =>
      Array.from(cookieStoreMock.cookies.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      cookieStoreMock.cookies.set(name, value);
    },
    setAll: cookieStoreMock.setAll,
  }),
}));

import { createClient, safeGetUser } from "./server";

beforeEach(() => {
  cookieStoreMock.cookies.clear();
  cookieStoreMock.setAll.mockClear();
});

describe("createClient (server)", () => {
  it("returns a Supabase client object", async () => {
    const client = await createClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
    expect(typeof client.auth).toBe("object");
  });

  it("reads cookies via getAll on every operation", async () => {
    cookieStoreMock.cookies.set("sb-token", "abc123");
    const client = await createClient();
    await client.auth.getUser();
    expect(cookieStoreMock.cookies.has("sb-token")).toBe(true);
  });

  it("propagates cookie writes from the underlying client via setAll", async () => {
    const client = await createClient();
    (cookieStoreMock.setAll as any)([
      { name: "sb-new", value: "xyz", options: { path: "/" } },
    ]);
    expect(cookieStoreMock.setAll).toHaveBeenCalled();
  });

  it("creates a fresh client on each call (no module-level singleton)", async () => {
    const a: SupabaseClient = await createClient();
    const b: SupabaseClient = await createClient();
    expect(a).not.toBe(b);
  });
});

describe("safeGetUser (server)", () => {
  const mockSupabase = (auth = {}) =>
    ({ auth: { getUser: auth } }) as any;

  it("returns the user when the session is valid", async () => {
    const user = { id: "u-1", email: "a@b.c" };
    const supabase = mockSupabase(vi.fn().mockResolvedValue({ data: { user } }));
    await expect(safeGetUser(supabase)).resolves.toEqual(user);
  });

  it("returns null when getUser returns no user", async () => {
    const supabase = mockSupabase(vi.fn().mockResolvedValue({ data: { user: null } }));
    await expect(safeGetUser(supabase)).resolves.toBeNull();
  });

  it.each(["refresh_token_not_found", "refresh_token_already_used"])(
    "returns null on tolerated auth error (%s)",
    async (code) => {
      const err = Object.assign(new Error("stale refresh"), { code, status: 400 });
      const supabase = mockSupabase(vi.fn().mockRejectedValue(err));
      await expect(safeGetUser(supabase)).resolves.toBeNull();
    },
  );

  it("rethrows non-tolerated auth errors", async () => {
    const err = Object.assign(new Error("boom"), { status: 503 });
    const supabase = mockSupabase(vi.fn().mockRejectedValue(err));
    await expect(safeGetUser(supabase)).rejects.toThrow("boom");
  });
});
