import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../test/mocks/supabase-clients";
import "../../test/mocks/next-navigation";
import {
  getAdminClient,
  getServerClient,
  setServerUser,
  resetSupabaseClients,
} from "../../test/mocks/supabase-clients";
import { runAction } from "../../test/helpers/invoke-action";
import { makeProfile, makeRole } from "../../test/fixtures/factories";

import {
  requirePermission,
  assertPermission,
  getActionPermissions,
  PermissionError,
} from "./require-permission";
import type { RolePermissions } from "./permissions";

beforeEach(() => {
  resetSupabaseClients();
});

async function setupProfileScenario(profileOverrides: Record<string, unknown>, roleData: unknown | null) {
  setServerUser({ id: "u-1", email: "x@y.com" });
  const server = getServerClient();
  server.enqueueResponse({ data: makeProfile({ id: "u-1", ...profileOverrides }), error: null });

  const admin = getAdminClient();
  if (roleData !== null) {
    admin.enqueueResponse({ data: roleData, error: null });
  }
}

describe("requirePermission", () => {
  it("redirects to /auth/login when there is no user", async () => {
    setServerUser(null);
    // auth.getUser is intercepted by proxy — no enqueue needed.
    // Server client's only DB call (profiles) gets a no-row response.
    const server = getServerClient();
    server.enqueueResponse({ data: null, error: null });

    const result = await runAction(
      () => requirePermission("orders", "view"),
      new FormData(),
    );
    expect(result.redirectedTo).toBe("/auth/login");
  });

  it("redirects to /unauthorized when permissions are insufficient", async () => {
    await setupProfileScenario(
      { role_id: 1, role: "admin" },
      makeRole({ id: 1, name: "Manager", permissions: { orders: ["view"] } }),
    );

    const result = await runAction(
      () => requirePermission("orders", "delete"),
      new FormData(),
    );
    expect(result.redirectedTo).toBe("/unauthorized");
  });

  it("allows the action when permissions include it", async () => {
    await setupProfileScenario(
      { role_id: 1, role: "admin" },
      makeRole({ id: 1, name: "Manager", permissions: { orders: ["view", "edit"] } }),
    );

    const result = await runAction(
      () => requirePermission("orders", "edit"),
      new FormData(),
    );
    expect(result.redirectedTo).toBeNull();
    expect(result.error).toBeNull();
  });

  it("returns immediately and bypasses permission check for Super Admin", async () => {
    setServerUser({ id: "u-1" });
    const server = getServerClient();
    server.enqueueResponse({
      data: makeProfile({ id: "u-1", role_id: 1, role: "superadmin" }),
      error: null,
    });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeRole({ id: 1, name: "Super Admin", permissions: {} }),
      error: null,
    });

    const result = await runAction(
      () => requirePermission("orders", "delete"),
      new FormData(),
    );
    expect(result.redirectedTo).toBeNull();
  });

  it("redirects to /unauthorized when role_id is missing and permissions are empty", async () => {
    setServerUser({ id: "u-1" });
    const server = getServerClient();
    server.enqueueResponse({
      data: makeProfile({ id: "u-1", role_id: null, role: "admin" }),
      error: null,
    });

    const result = await runAction(
      () => requirePermission("orders", "view"),
      new FormData(),
    );
    expect(result.redirectedTo).toBe("/unauthorized");
  });

  it("defaults action to 'view' when omitted", async () => {
    await setupProfileScenario(
      { role_id: 1, role: "admin" },
      makeRole({ id: 1, name: "Manager", permissions: { orders: ["view"] } }),
    );

    const result = await runAction(
      () => requirePermission("orders"),
      new FormData(),
    );
    expect(result.redirectedTo).toBeNull();
  });
});

describe("assertPermission", () => {
  it("throws PermissionError when not authenticated", async () => {
    setServerUser(null);
    const server = getServerClient();
    server.enqueueResponse({ data: null, error: null });

    await expect(assertPermission("orders", "view")).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws PermissionError when action is not in permissions", async () => {
    await setupProfileScenario(
      { role_id: 1, role: "admin" },
      makeRole({ id: 1, name: "Manager", permissions: { orders: ["view"] } }),
    );

    await expect(assertPermission("orders", "delete")).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns the permission result on success", async () => {
    await setupProfileScenario(
      { role_id: 1, role: "admin", store_id: "s-1" },
      makeRole({ id: 1, name: "Manager", permissions: { orders: ["view", "edit"] } }),
    );

    const result = await assertPermission("orders", "edit");
    expect(result.role).toBe("Manager");
    expect(result.isSuperAdmin).toBe(false);
    expect(result.permissions).toEqual({ orders: ["view", "edit"] });
  });

  it("bypasses permission check for Super Admin", async () => {
    setServerUser({ id: "u-1" });
    const server = getServerClient();
    server.enqueueResponse({
      data: makeProfile({ id: "u-1", role_id: 1, role: "superadmin" }),
      error: null,
    });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeRole({ id: 1, name: "Super Admin", permissions: {} }),
      error: null,
    });

    const result = await assertPermission("orders", "delete");
    expect(result.isSuperAdmin).toBe(true);
  });

  it("includes module and action in PermissionError", async () => {
    setServerUser(null);
    const server = getServerClient();
    server.enqueueResponse({ data: null, error: null });

    try {
      await assertPermission("products", "delete");
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionError);
      const err = e as PermissionError;
      expect(err.module).toBe("auth");
      expect(err.action).toBe("authenticated");
    }
  });
});

describe("getActionPermissions", () => {
  it("returns all four booleans reflecting module permission set", () => {
    const perms: RolePermissions = { orders: ["view", "edit"] };
    const result = getActionPermissions(perms, "orders");
    expect(result).toEqual({
      canView: true,
      canCreate: false,
      canEdit: true,
      canDelete: false,
    });
  });

  it("returns all false for an unknown module", () => {
    const result = getActionPermissions({}, "orders");
    expect(result).toEqual({
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
  });

  it("returns all true for a fully-privileged role", () => {
    const perms: RolePermissions = {
      orders: ["view", "create", "edit", "delete"],
    };
    const result = getActionPermissions(perms, "orders");
    expect(result.canView).toBe(true);
    expect(result.canCreate).toBe(true);
    expect(result.canEdit).toBe(true);
    expect(result.canDelete).toBe(true);
  });
});
