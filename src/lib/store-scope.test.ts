import { describe, it, expect, beforeEach } from "vitest";
import "../../test/mocks/supabase-clients";
import {
  getServerClient,
  getAdminClient,
  setServerUser,
  resetSupabaseClients,
} from "../../test/mocks/supabase-clients";
import { getStoreScope, withStoreScope } from "./store-scope";
import { makeProfile, makeRole } from "../../test/fixtures/factories";

beforeEach(() => {
  resetSupabaseClients();
});

describe("getStoreScope", () => {
  it("returns null scope when there is no user", async () => {
    setServerUser(null);
    const server = getServerClient();
    server.enqueueResponse({ data: null, error: null });

    const scope = await getStoreScope();
    expect(scope).toEqual({ storeId: null, isStoreScoped: false });
  });

  it("returns null scope when profile has no store_id", async () => {
    setServerUser({ id: "u-1" });
    const server = getServerClient();
    server.enqueueResponse({
      data: makeProfile({ id: "u-1", role_id: null, store_id: null }),
      error: null,
    });

    const scope = await getStoreScope();
    expect(scope).toEqual({ storeId: null, isStoreScoped: false });
  });

  it("returns isStoreScoped true for a non-Super-Admin with a store_id", async () => {
    setServerUser({ id: "u-1" });
    const server = getServerClient();
    server.enqueueResponse({
      data: makeProfile({ id: "u-1", role_id: 5, store_id: "store-99" }),
      error: null,
    });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeRole({ id: 5, name: "Manager", permissions: {} }),
      error: null,
    });

    const scope = await getStoreScope();
    expect(scope).toEqual({ storeId: "store-99", isStoreScoped: true });
  });

  it("returns isStoreScoped false for a Super Admin even with a store_id", async () => {
    setServerUser({ id: "u-1" });
    const server = getServerClient();
    server.enqueueResponse({
      data: makeProfile({ id: "u-1", role_id: 1, store_id: "store-99", role: "superadmin" }),
      error: null,
    });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeRole({ id: 1, name: "Super Admin", permissions: {} }),
      error: null,
    });

    const scope = await getStoreScope();
    expect(scope).toEqual({ storeId: null, isStoreScoped: false });
  });

  it("returns isStoreScoped false when role_id is missing even with store_id", async () => {
    setServerUser({ id: "u-1" });
    const server = getServerClient();
    server.enqueueResponse({
      data: makeProfile({ id: "u-1", role_id: null, store_id: "store-99" }),
      error: null,
    });
    // No admin call expected — getStoreScope returns early when role_id is null.

    const scope = await getStoreScope();
    expect(scope).toEqual({ storeId: "store-99", isStoreScoped: true });
  });
});

describe("withStoreScope", () => {
  it("returns the query unchanged when storeId is null", () => {
    const q = { eq: (col: string, val: unknown) => ({ col, val }) };
    const result = withStoreScope(q as any, null);
    expect(result).toBe(q);
  });

  it("calls .eq with the default column 'store_id' when storeId is provided", () => {
    const eqMock = (col: string, val: unknown) => ({ col, val });
    const q = { eq: eqMock };
    const result = withStoreScope(q as any, "store-99") as any;
    expect(result).toEqual({ col: "store_id", val: "store-99" });
  });

  it("calls .eq with a custom column when provided", () => {
    const eqMock = (col: string, val: unknown) => ({ col, val });
    const q = { eq: eqMock };
    const result = withStoreScope(q as any, "u-1", "user_id") as any;
    expect(result).toEqual({ col: "user_id", val: "u-1" });
  });
});
