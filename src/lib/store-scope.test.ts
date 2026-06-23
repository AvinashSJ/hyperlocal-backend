import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../test/mocks/supabase-clients";
import {
  getServerClient,
  getAdminClient,
  setServerUser,
  resetSupabaseClients,
} from "../../test/mocks/supabase-clients";
import {
  getStoreScope,
  withStoreScope,
  assertStoreScope,
  UnassignedStoreError,
} from "./store-scope";
import { makeProfile, makeRole } from "../../test/fixtures/factories";

beforeEach(() => {
  resetSupabaseClients();
  vi.restoreAllMocks();
});

describe("getStoreScope", () => {
  it("returns null scope when there is no user", async () => {
    setServerUser(null);
    const server = getServerClient();
    server.enqueueResponse({ data: null, error: null });

    const scope = await getStoreScope();
    expect(scope).toEqual({ storeId: null, isStoreScoped: false, roleName: null });
  });

  it("returns null scope when profile has no store_id", async () => {
    setServerUser({ id: "u-1" });
    const server = getServerClient();
    server.enqueueResponse({
      data: makeProfile({ id: "u-1", role_id: null, store_id: null }),
      error: null,
    });

    const scope = await getStoreScope();
    expect(scope).toEqual({ storeId: null, isStoreScoped: false, roleName: null });
  });

  it("returns isStoreScoped true for a non-Super-Admin with a store_id (P47: includes roleName)", async () => {
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
    expect(scope).toEqual({ storeId: "store-99", isStoreScoped: true, roleName: "Manager" });
  });

  it("returns isStoreScoped false for a Super Admin even with a store_id (P47: roleName still set)", async () => {
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
    expect(scope).toEqual({ storeId: null, isStoreScoped: false, roleName: "Super Admin" });
  });

  it("returns isStoreScoped true (sic) when role_id is missing even with store_id", async () => {
    setServerUser({ id: "u-1" });
    const server = getServerClient();
    server.enqueueResponse({
      data: makeProfile({ id: "u-1", role_id: null, store_id: "store-99" }),
      error: null,
    });

    const scope = await getStoreScope();
    // P47: roleName is null because the role lookup is skipped on null role_id.
    expect(scope).toEqual({ storeId: "store-99", isStoreScoped: true, roleName: null });
  });

  // P47: when a non-Super-Admin has profile.store_id = NULL, getStoreScope
  // returns a null scope AND logs a dev-only console.warn. The assertStoreScope
  // helper (tested separately below) is the hard guard that page files use.
  it("P47: logs a console.warn for a non-Super-Admin with null store_id", async () => {
    setServerUser({ id: "u-1" });
    const server = getServerClient();
    server.enqueueResponse({
      data: makeProfile({ id: "u-1", role_id: 5, store_id: null }),
      error: null,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const scope = await getStoreScope();
    expect(scope).toEqual({ storeId: null, isStoreScoped: false, roleName: null });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("non-Super-Admin user has profile.store_id = NULL"),
    );
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

describe("assertStoreScope (P47)", () => {
  it("does not throw for a Super Admin (even with null storeId)", () => {
    expect(() =>
      assertStoreScope({ storeId: null, isStoreScoped: false, roleName: "Super Admin" }),
    ).not.toThrow();
  });

  it("does not throw for a scoped Manager (storeId set, isStoreScoped true)", () => {
    expect(() =>
      assertStoreScope({ storeId: "store-99", isStoreScoped: true, roleName: "Manager" }),
    ).not.toThrow();
  });

  it("throws UnassignedStoreError for a Manager with null storeId", () => {
    expect(() =>
      assertStoreScope({ storeId: null, isStoreScoped: false, roleName: "Manager" }),
    ).toThrow(UnassignedStoreError);
  });

  it("throws UnassignedStoreError for a Staff with null storeId", () => {
    expect(() =>
      assertStoreScope({ storeId: null, isStoreScoped: false, roleName: "Staff" }),
    ).toThrow(UnassignedStoreError);
  });

  it("throws UnassignedStoreError for a custom role with null storeId", () => {
    expect(() =>
      assertStoreScope({ storeId: null, isStoreScoped: false, roleName: "RegionalManager" }),
    ).toThrow(UnassignedStoreError);
  });

  it("throws UnassignedStoreError for an anonymous user (roleName is null)", () => {
    expect(() =>
      assertStoreScope({ storeId: null, isStoreScoped: false, roleName: null }),
    ).toThrow(UnassignedStoreError);
  });

  it("the thrown error has the expected user-facing message", () => {
    try {
      assertStoreScope({ storeId: null, isStoreScoped: false, roleName: "Manager" });
    } catch (err) {
      expect(err).toBeInstanceOf(UnassignedStoreError);
      expect((err as Error).message).toMatch(/not assigned to a store/i);
      return;
    }
    throw new Error("expected assertStoreScope to throw");
  });
});

