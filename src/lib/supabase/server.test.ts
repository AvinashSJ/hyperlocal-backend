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

import { createClient } from "./server";

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
