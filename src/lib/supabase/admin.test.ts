import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("createAdminClient", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-svc";
    const { createAdminClient } = await import("./admin");
    expect(() => createAdminClient()).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createAdminClient } = await import("./admin");
    expect(() => createAdminClient()).toThrow(/Missing.*SERVICE_ROLE_KEY/);
  });

  it("throws when both env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createAdminClient } = await import("./admin");
    expect(() => createAdminClient()).toThrow(/Missing/);
  });

  it("returns a client object when both env vars are set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-svc";
    const { createAdminClient } = await import("./admin");
    const client = createAdminClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
    expect(typeof client.auth).toBe("object");
    expect(typeof client.storage).toBe("object");
  });

  it("returns a different client instance on each call", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-svc";
    const { createAdminClient } = await import("./admin");
    const a = createAdminClient();
    const b = createAdminClient();
    expect(a).not.toBe(b);
  });
});
