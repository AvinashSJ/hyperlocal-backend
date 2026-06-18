import { describe, it, expect, beforeEach } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../test/mocks/supabase-clients";
import { revalidatePathMock } from "../../../../test/mocks/next-cache";
import {
  asAdmin,
  asSuperAdmin,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { buildFormData } from "../../../../test/fixtures/formdata";
import { makeRole } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getRoles (roles module)", () => {
  it("returns roles with computed userCount from profiles.role_id", async () => {
    const admin = getAdminClient();
    const r1 = makeRole({ id: 1, name: "Super Admin", permissions: { users: ["view"] } });
    const r2 = makeRole({ id: 2, name: "Admin", permissions: { users: ["view", "edit"] } });

    // 1) roles fetch
    // 2) profiles.role_id lookup (counts)
    admin.setResponses(
      { data: [r1, r2], error: null },
      { data: [{ role_id: 1 }, { role_id: 1 }, { role_id: 2 }], error: null },
    );

    const roles = await getRoles();

    expect(roles).toHaveLength(2);
    expect(roles[0]).toMatchObject({
      id: 1,
      name: "Super Admin",
      permissions: { users: ["view"] },
      userCount: 2,
    });
    expect(roles[1]).toMatchObject({
      id: 2,
      name: "Admin",
      userCount: 1,
    });
  });

  it("returns [] when roles fetch errors", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fail" } });
    const roles = await getRoles();
    expect(roles).toEqual([]);
  });

  it("returns [] when roles fetch returns null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const roles = await getRoles();
    expect(roles).toEqual([]);
  });

  it("skips profiles count query and reports 0 when there are no roles", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    const roles = await getRoles();
    expect(roles).toEqual([]);
    // profiles count query is still issued (with empty in-list)
    expect(admin.chainsForTable("profiles")).toHaveLength(1);
  });

  it("casts role_id (potentially string) to Number for the count map", async () => {
    const admin = getAdminClient();
    const r1 = makeRole({ id: 5, name: "Custom" });

    admin.setResponses(
      { data: [r1], error: null },
      { data: [{ role_id: "5" }, { role_id: "5" }, { role_id: "5" }], error: null },
    );

    const roles = await getRoles();
    expect(roles[0].userCount).toBe(3);
  });

  it("defaults userCount to 0 for roles with no assigned profiles", async () => {
    const admin = getAdminClient();
    const r1 = makeRole({ id: 1, name: "Alpha" });
    const r2 = makeRole({ id: 2, name: "Beta" });

    admin.setResponses(
      { data: [r1, r2], error: null },
      { data: [{ role_id: 1 }], error: null },
    );

    const roles = await getRoles();
    expect(roles[0].userCount).toBe(1);
    expect(roles[1].userCount).toBe(0);
  });
});

describe("createRole", () => {
  it("rejects users without roles:create permission", async () => {
    asAdmin({ roles: ["view"] });
    const fd = buildFormData({ name: "Test", description: "desc", permissions: "{}" });
    await expect(createRole(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("inserts a role with parsed permissions JSON, description, and is_system=false", async () => {
    asAdmin({ roles: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const permissions = JSON.stringify({ users: ["view", "edit"], orders: ["view"] });
    const fd = buildFormData({
      name: "Manager",
      description: "Can manage most things",
      permissions,
    });
    await runAction(createRole, fd);

    const chains = admin.chainsForTable("roles");
    const insertChain = chains[0];
    const insertCall = insertChain.find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg).toEqual({
      name: "Manager",
      description: "Can manage most things",
      permissions: { users: ["view", "edit"], orders: ["view"] },
      is_system: false,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/roles");
  });

  it("stores null description when empty string", async () => {
    asAdmin({ roles: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "NoDesc", description: "", permissions: "{}" });
    await runAction(createRole, fd);

    const chains = admin.chainsForTable("roles");
    const insertCall = chains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg.description).toBeNull();
  });

  it("falls back to empty permissions when JSON is invalid", async () => {
    asAdmin({ roles: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "BadPerms", description: "x", permissions: "not-json" });
    await runAction(createRole, fd);

    const chains = admin.chainsForTable("roles");
    const insertCall = chains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg.permissions).toEqual({});
  });

  it("falls back to empty permissions when permissions field is missing", async () => {
    asAdmin({ roles: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "NoPerms", description: "x" });
    await runAction(createRole, fd);

    const chains = admin.chainsForTable("roles");
    const insertCall = chains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg.permissions).toEqual({});
  });

  it("throws when insert returns an error", async () => {
    asAdmin({ roles: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "duplicate name" } });

    const fd = buildFormData({ name: "Dup", description: "x", permissions: "{}" });
    const result = await runAction(createRole, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/duplicate name/);
  });
});

describe("updateRole", () => {
  it("rejects users without roles:edit permission", async () => {
    asAdmin({ roles: ["view"] });
    const fd = buildFormData({ id: "5", name: "X", description: "x", permissions: "{}" });
    await expect(updateRole(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("updates name, description, and permissions", async () => {
    asAdmin({ roles: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const permissions = JSON.stringify({ users: ["view"] });
    const fd = buildFormData({ id: "5", name: "Updated", description: "new desc", permissions });
    await runAction(updateRole, fd);

    const chains = admin.chainsForTable("roles");
    const updateChain = chains[0];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg).toEqual({
      name: "Updated",
      description: "new desc",
      permissions: { users: ["view"] },
    });
    const eqCall = updateChain.find((c) => c.method === "eq")!;
    expect(eqCall.args).toEqual(["id", 5]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/roles");
  });

  it("stores null description when empty", async () => {
    asAdmin({ roles: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ id: "5", name: "X", description: "", permissions: "{}" });
    await runAction(updateRole, fd);

    const chains = admin.chainsForTable("roles");
    const updateCall = chains[0].find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg.description).toBeNull();
  });

  it("falls back to empty permissions when JSON is invalid", async () => {
    asAdmin({ roles: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ id: "5", name: "X", description: "x", permissions: "{bad" });
    await runAction(updateRole, fd);

    const chains = admin.chainsForTable("roles");
    const updateCall = chains[0].find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg.permissions).toEqual({});
  });

  it("throws when update returns an error", async () => {
    asAdmin({ roles: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint" } });

    const fd = buildFormData({ id: "5", name: "X", description: "x", permissions: "{}" });
    const result = await runAction(updateRole, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
  });
});

describe("deleteRole", () => {
  it("rejects users without roles:delete permission", async () => {
    asAdmin({ roles: ["view", "edit"] });
    const fd = buildFormData({ id: "5" });
    await expect(deleteRole(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses to delete a role with assigned users (count > 0)", async () => {
    asAdmin({ roles: ["delete"] });
    const admin = getAdminClient();
    // count query: 3 users have this role
    admin.setResponses({ data: null, error: null, count: 3 });

    const fd = buildFormData({ id: "5" });
    const result = await runAction(deleteRole, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/Cannot delete role with 3 assigned user/);
    // delete should NOT be called
    const rolesChains = admin.chainsForTable("roles");
    const deleteChains = rolesChains.filter((c) => c.some((cc) => cc.method === "delete"));
    expect(deleteChains).toHaveLength(0);
  });

  it("deletes the role when no users are assigned", async () => {
    asAdmin({ roles: ["delete"] });
    const admin = getAdminClient();
    // count: 0
    // delete: success
    admin.setResponses(
      { data: null, error: null, count: 0 },
      { data: null, error: null },
    );

    const fd = buildFormData({ id: "5" });
    await runAction(deleteRole, fd);

    const rolesChains = admin.chainsForTable("roles");
    expect(rolesChains).toHaveLength(1);
    const deleteChain = rolesChains[0];
    expect(deleteChain.some((c) => c.method === "delete")).toBe(true);
    expect(deleteChain.find((c) => c.method === "eq")!.args).toEqual(["id", 5]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/roles");
  });

  it("issues a head:true count query against profiles before delete", async () => {
    asAdmin({ roles: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null, count: 0 },
      { data: null, error: null },
    );

    const fd = buildFormData({ id: "7" });
    await runAction(deleteRole, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const countChain = profilesChains[0];
    const selectCall = countChain.find((c) => c.method === "select")!;
    expect(selectCall.args[1]).toEqual({ count: "exact", head: true });
    const eqCall = countChain.find((c) => c.method === "eq")!;
    expect(eqCall.args).toEqual(["role_id", 7]);
  });

  it("treats null count as 'no users' and proceeds with delete", async () => {
    asAdmin({ roles: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null, count: null },
      { data: null, error: null },
    );

    const fd = buildFormData({ id: "5" });
    await runAction(deleteRole, fd);

    const rolesChains = admin.chainsForTable("roles");
    expect(rolesChains).toHaveLength(1);
    expect(rolesChains[0].some((c) => c.method === "delete")).toBe(true);
  });

  it("throws when delete returns an error", async () => {
    asAdmin({ roles: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null, count: 0 },
      { data: null, error: { message: "fk violation" } },
    );

    const fd = buildFormData({ id: "5" });
    const result = await runAction(deleteRole, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/fk violation/);
  });
});
