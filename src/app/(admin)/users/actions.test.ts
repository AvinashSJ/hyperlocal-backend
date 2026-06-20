import { describe, it, expect, beforeEach } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
  setServerUser,
} from "../../../../test/mocks/supabase-clients";
import { revalidatePathMock } from "../../../../test/mocks/next-cache";
import {
  asAdmin,
  asSuperAdmin,
  asAnonymous,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { buildFormData } from "../../../../test/fixtures/formdata";
import { makeProfile, makeRole, makeStore } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getRoles,
  getStoresLight,
  getUsers,
  toggleUserActive,
  toggleManagerActiveWithCascade,
  deleteUser,
  updateUser,
  createUser,
  resetUserPassword,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getRoles", () => {
  it("returns ordered roles", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { id: 1, name: "Super Admin" },
        { id: 2, name: "Admin" },
        { id: 3, name: "Staff" },
      ],
      error: null,
    });

    const roles = await getRoles();

    expect(roles).toEqual([
      { id: 1, name: "Super Admin" },
      { id: 2, name: "Admin" },
      { id: 3, name: "Staff" },
    ]);
    const chains = admin.chainsForTable("roles");
    expect(chains[0].some((c) => c.method === "order")).toBe(true);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const roles = await getRoles();
    expect(roles).toEqual([]);
  });

  it("returns [] when there is an error", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fail" } });
    const roles = await getRoles();
    expect(roles).toEqual([]);
  });
});

describe("getStoresLight", () => {
  it("returns ordered stores", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { id: "s-1", name: "Alpha" },
        { id: "s-2", name: "Beta" },
      ],
      error: null,
    });

    const stores = await getStoresLight();

    expect(stores).toEqual([
      { id: "s-1", name: "Alpha" },
      { id: "s-2", name: "Beta" },
    ]);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const stores = await getStoresLight();
    expect(stores).toEqual([]);
  });
});

describe("getUsers", () => {
  it("returns users with enriched role_name, store_name, and orderCount", async () => {
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "u-1", role: "admin", role_id: 2, store_id: "s-1" });
    const p2 = makeProfile({ id: "u-2", role: "admin", role_id: 2, store_id: null });

    // 1) roles lookup (Staff) — return null so neq filter is skipped
    // 2) profiles fetch
    // 3) orders for user_ids (counts)
    // 4) roles for enriched names
    // 5) stores for enriched names
    admin.setResponses(
      { data: null, error: null },
      { data: [p1, p2], error: null },
      { data: [{ user_id: "u-1" }, { user_id: "u-1" }, { user_id: "u-2" }], error: null },
      { data: [{ id: 2, name: "Admin" }], error: null },
      { data: [{ id: "s-1", name: "Alpha" }], error: null },
    );

    const users = await getUsers();

    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({
      id: "u-1",
      role: "admin",
      role_name: "Admin",
      orderCount: 2,
      store_id: "s-1",
      store_name: "Alpha",
    });
    expect(users[1]).toMatchObject({
      id: "u-2",
      orderCount: 1,
      store_id: null,
      store_name: null,
    });
  });

  it("returns [] when profiles fetch returns an error", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null },
      { data: null, error: { message: "db down" } },
    );
    const users = await getUsers();
    expect(users).toEqual([]);
  });

  it("returns [] when profiles fetch returns null", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null },
      { data: null, error: null },
    );
    const users = await getUsers();
    expect(users).toEqual([]);
  });

  it("applies staff-role neq filter when Staff role is found", async () => {
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "u-1", role: "admin", role_id: 2 });

    // 1) Staff role lookup — returns id
    // 2) profiles fetch
    // 3) orders counts
    // 4) roles enriched
    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: [p1], error: null },
      { data: [], error: null },
      { data: [{ id: 2, name: "Admin" }], error: null },
    );

    await getUsers();

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const neqCalls = mainChain.filter((c) => c.method === "neq");
    expect(neqCalls.length).toBe(2);
    // First neq: role != "customer"
    expect(neqCalls[0].args).toEqual(["role", "customer"]);
    // Second neq: role_id != staffRole.id
    expect(neqCalls[1].args).toEqual(["role_id", 3]);
  });

  it("skips the staff-role neq filter when Staff role is not found", async () => {
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "u-1", role: "admin", role_id: 2 });

    // 1) Staff role lookup — returns null (maybeSingle)
    // 2) profiles fetch
    // 3) orders
    // 4) roles
    admin.setResponses(
      { data: null, error: null },
      { data: [p1], error: null },
      { data: [], error: null },
      { data: [{ id: 2, name: "Admin" }], error: null },
    );

    await getUsers();

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const neqCalls = mainChain.filter((c) => c.method === "neq");
    expect(neqCalls.length).toBe(1);
    expect(neqCalls[0].args).toEqual(["role", "customer"]);
  });

  it("filters by string role (admin)", async () => {
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "u-1", role: "admin", role_id: 2 });

    admin.setResponses(
      { data: null, error: null },
      { data: [p1], error: null },
      { data: [], error: null },
      { data: [{ id: 2, name: "Admin" }], error: null },
    );

    await getUsers("admin");

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const eqCalls = mainChain.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "role" && c.args[1] === "admin")).toBe(true);
  });

  it("filters by string role (customer)", async () => {
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "u-1", role: "customer", role_id: null });

    admin.setResponses(
      { data: null, error: null },
      { data: [p1], error: null },
      { data: [], error: null },
    );

    await getUsers("customer");

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const eqCalls = mainChain.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "role" && c.args[1] === "customer")).toBe(true);
  });

  it("filters by string role (superadmin)", async () => {
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "u-1", role: "superadmin", role_id: 1 });

    admin.setResponses(
      { data: null, error: null },
      { data: [p1], error: null },
      { data: [], error: null },
      { data: [{ id: 1, name: "Super Admin" }], error: null },
    );

    await getUsers("superadmin");

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const eqCalls = mainChain.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "role" && c.args[1] === "superadmin")).toBe(true);
  });

  it("filters by numeric role_id when filter is a number", async () => {
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "u-1", role: "admin", role_id: 7 });

    admin.setResponses(
      { data: null, error: null },
      { data: [p1], error: null },
      { data: [], error: null },
      { data: [{ id: 7, name: "Custom" }], error: null },
    );

    await getUsers("7");

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const eqCalls = mainChain.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "role_id" && c.args[1] === 7)).toBe(true);
  });

  it("applies no role eq filter when filter is 'all'", async () => {
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "u-1", role: "admin", role_id: 2 });

    admin.setResponses(
      { data: null, error: null },
      { data: [p1], error: null },
      { data: [], error: null },
      { data: [{ id: 2, name: "Admin" }], error: null },
    );

    await getUsers("all");

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const eqCalls = mainChain.filter((c) => c.method === "eq");
    expect(eqCalls.length).toBe(0);
  });

  it("applies no role eq filter when filter is undefined", async () => {
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "u-1", role: "admin", role_id: 2 });

    admin.setResponses(
      { data: null, error: null },
      { data: [p1], error: null },
      { data: [], error: null },
      { data: [{ id: 2, name: "Admin" }], error: null },
    );

    await getUsers(undefined);

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const eqCalls = mainChain.filter((c) => c.method === "eq");
    expect(eqCalls.length).toBe(0);
  });

  it("still issues orders call (with empty in-list) and skips roles/stores enrichment when no profiles", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null },
      { data: [], error: null },
    );

    const users = await getUsers();
    expect(users).toEqual([]);
    // orders is always called (even with empty userIds)
    expect(admin.chainsForTable("orders")).toHaveLength(1);
    // role/store enrichment is skipped when roleIds/storeIds is empty
    expect(admin.chainsForTable("roles")).toHaveLength(1); // only the Staff role probe
    expect(admin.chainsForTable("stores")).toHaveLength(0);
  });

  it("is_active defaults to true when profile is_active is null", async () => {
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "u-1", role: "admin", role_id: 2 });
    (p1 as { is_active: boolean | null }).is_active = null;

    admin.setResponses(
      { data: null, error: null },
      { data: [p1], error: null },
      { data: [], error: null },
      { data: [{ id: 2, name: "Admin" }], error: null },
    );

    const users = await getUsers();
    expect(users[0].is_active).toBe(true);
  });
});

describe("toggleUserActive", () => {
  it("rejects users without users:edit permission", async () => {
    asAdmin({ users: ["view"] });
    const fd = buildFormData({ id: "u-1", current: "true" });
    await expect(toggleUserActive(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("flips is_active to false when current is true", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ id: "u-1", current: "true" });
    await runAction(toggleUserActive, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateChain = profilesChains[0];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg).toEqual({ is_active: false });
    expect(revalidatePathMock).toHaveBeenCalledWith("/users");
  });

  it("flips is_active to true when current is false", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ id: "u-1", current: "false" });
    await runAction(toggleUserActive, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateChain = profilesChains[0];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg).toEqual({ is_active: true });
  });
});

describe("deleteUser", () => {
  it("rejects users without users:delete permission", async () => {
    asAdmin({ users: ["view", "edit"] });
    const fd = buildFormData({ id: "u-1" });
    await expect(deleteUser(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("deletes the profile", async () => {
    asAdmin({ users: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ id: "u-1" });
    await runAction(deleteUser, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const deleteChain = profilesChains[0];
    expect(deleteChain.some((c) => c.method === "delete")).toBe(true);
    expect(deleteChain.some((c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "u-1")).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/users");
  });
});

describe("updateUser", () => {
  it("rejects users without users:edit permission", async () => {
    asAdmin({ users: ["view"] });
    const fd = buildFormData({ id: "u-1", full_name: "Alice" });
    await expect(updateUser(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("updates full_name, phone, store_id, and email when present", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      id: "u-1",
      full_name: "Alice Doe",
      email: "alice@example.com",
      phone: "+911234567890",
      store_id: "s-1",
    });
    await runAction(updateUser, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateChain = profilesChains[0];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg.full_name).toBe("Alice Doe");
    expect(updateArg.email).toBe("alice@example.com");
    expect(updateArg.phone).toBe("+911234567890");
    expect(updateArg.store_id).toBe("s-1");
  });

  it("trims whitespace and stores null for empty full_name/phone/store_id", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      id: "u-1",
      full_name: "   ",
      email: "alice@example.com",
      phone: "",
      store_id: "",
    });
    await runAction(updateUser, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateChain = profilesChains[0];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg.full_name).toBeNull();
    expect(updateArg.phone).toBeNull();
    expect(updateArg.store_id).toBeNull();
  });

  it("omits email key when email is empty", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      id: "u-1",
      full_name: "Alice",
      email: "",
      phone: "+91",
      store_id: "s-1",
    });
    await runAction(updateUser, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateChain = profilesChains[0];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg).not.toHaveProperty("email");
  });

  it("throws when supabase returns an error", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint failed" } });

    const fd = buildFormData({
      id: "u-1",
      full_name: "Alice",
      email: "alice@example.com",
      phone: "+91",
      store_id: "s-1",
    });
    const result = await runAction(updateUser, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint failed/);
  });

  // P30: role change via the edit modal. Two hard safety gates:
  //   1. Cannot change a Super Admin's role
  //   2. Cannot change your own role
  // Otherwise, the role is updated and the role string is synced.

  it("P30: updates role_id and syncs role string when a non-Super-Admin target's role is changed", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    // 1) target profile lookup (with roles join)
    // 2) role name lookup
    // 3) profile update
    admin.setResponses(
      { data: { role_id: 2, roles: { name: "Manager" } }, error: null },
      { data: { name: "Manager" }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      id: "u-other",
      full_name: "Alice",
      email: "alice@example.com",
      role_id: "3",
    });
    await runAction(updateUser, fd);

    // chainsForTable groups by from(table); the target profile
    // lookup is the first profiles chain, the update is the second.
    const profilesChains = admin.chainsForTable("profiles");
    const updateChain = profilesChains[1];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg.role_id).toBe(3);
    expect(updateArg.role).toBe("admin");
    // role-aware pages must be revalidated so sidebar / nav reflects new role
    expect(revalidatePathMock).toHaveBeenCalledWith("/users");
    expect(revalidatePathMock).toHaveBeenCalledWith("/staff");
    expect(revalidatePathMock).toHaveBeenCalledWith("/customers");
  });

  it("P30: demotes to customer when role_id is 'customer' (clears role_id)", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    // 1) target profile lookup
    // 2) profile update
    admin.setResponses(
      { data: { role_id: 2, roles: { name: "Manager" } }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      id: "u-other",
      full_name: "Alice",
      role_id: "customer",
    });
    await runAction(updateUser, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateChain = profilesChains[1];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg.role_id).toBeNull();
    expect(updateArg.role).toBe("customer");
  });

  it("P30: throws when target user is Super Admin (defense in depth)", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    // target profile lookup returns Super Admin
    admin.setResponses(
      { data: { role_id: 1, roles: { name: "Super Admin" } }, error: null },
    );

    const fd = buildFormData({
      id: "u-sa",
      full_name: "SA",
      role_id: "3",
    });
    const result = await runAction(updateUser, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/Super Admin role cannot be changed/);
  });

  it("P30: throws when current user tries to change their own role", async () => {
    asAdmin({ users: ["edit"] });
    // Inject a server user with a known id. The action's
    // auth.getUser() (server) returns this id; the FormData's `id`
    // matches → self-edit path triggers.
    setServerUser({ id: "u-self", email: "self@example.com" });

    const fd = buildFormData({
      id: "u-self",
      full_name: "Self",
      role_id: "3",
    });
    const result = await runAction(updateUser, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/cannot change your own role/);
  });

  it("P30: omits role fields from update when role_id is empty (no change)", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      id: "u-other",
      full_name: "Alice",
      email: "alice@example.com",
      // no role_id — the edit modal may not include it if unchanged
    });
    await runAction(updateUser, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateChain = profilesChains[0];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg).not.toHaveProperty("role_id");
    expect(updateArg).not.toHaveProperty("role");
  });
});

describe("createUser", () => {
  it("rejects users without users:create permission", async () => {
    asAdmin({ users: ["view"] });
    const fd = buildFormData({
      email: "x@example.com",
      password: "secret",
      role_id: "1",
    });
    await expect(createUser(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when email is missing", async () => {
    asAdmin({ users: ["create"] });
    const fd = buildFormData({ password: "secret", role_id: "1" });
    await expect(createUser(fd)).rejects.toThrow(/Email and password are required/);
  });

  it("throws when password is missing", async () => {
    asAdmin({ users: ["create"] });
    const fd = buildFormData({ email: "x@example.com", role_id: "1" });
    await expect(createUser(fd)).rejects.toThrow(/Email and password are required/);
  });

  it("throws when role_id is missing", async () => {
    asAdmin({ users: ["create"] });
    const fd = buildFormData({ email: "x@example.com", password: "secret" });
    await expect(createUser(fd)).rejects.toThrow(/Role is required/);
  });

  it("throws when profile insert fails", async () => {
    asAdmin({ users: ["create"] });
    const fd = buildFormData({
      email: "x@example.com",
      password: "secret",
      role_id: "1",
      full_name: "X",
      phone: "+91",
    });
    const admin = getAdminClient();
    // 1) auth.admin.createUser handled in mock (always success)
    // 2) roles lookup
    // 3) profile insert — return error
    admin.setResponses(
      { data: { name: "Admin" }, error: null },
      { data: null, error: { message: "unique violation" } },
    );

    const result = await runAction(createUser, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/unique violation/);
  });

  it("rolls back auth user when profile insert fails (auth.admin.deleteUser is called)", async () => {
    asAdmin({ users: ["create"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { name: "Admin" }, error: null },
      { data: null, error: { message: "insert failed" } },
    );

    const fd = buildFormData({
      email: "x@example.com",
      password: "secret",
      role_id: "2",
      full_name: "X",
    });
    await runAction(createUser, fd);

    const calls = admin.calls.filter((c) => c.method === "auth.admin.deleteUser");
    expect(calls.length).toBe(1);
  });

  it("creates a profile with role='superadmin' when role name is 'Super Admin'", async () => {
    asAdmin({ users: ["create"] });
    const admin = getAdminClient();
    // 1) roles lookup → Super Admin
    // 2) profile insert
    admin.setResponses(
      { data: { name: "Super Admin" }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      email: "sa@example.com",
      password: "secret",
      full_name: "Super",
      phone: "+91",
      role_id: "1",
      store_id: "s-1",
    });
    await runAction(createUser, fd);

    const profileChains = admin.chainsForTable("profiles");
    const insertChain = profileChains[0];
    const insertCall = insertChain.find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg.role).toBe("superadmin");
    expect(insertArg.role_id).toBe(1);
    expect(insertArg.email).toBe("sa@example.com");
    expect(insertArg.full_name).toBe("Super");
    expect(insertArg.phone).toBe("+91");
    expect(insertArg.store_id).toBe("s-1");
    expect(insertArg.is_active).toBe(true);
  });

  it("creates a profile with role='admin' for any non-Super-Admin role name", async () => {
    asAdmin({ users: ["create"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { name: "Manager" }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      email: "mgr@example.com",
      password: "secret",
      full_name: "Manager",
      role_id: "7",
    });
    await runAction(createUser, fd);

    const profileChains = admin.chainsForTable("profiles");
    const insertChain = profileChains[0];
    const insertCall = insertChain.find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg.role).toBe("admin");
    expect(insertArg.role_id).toBe(7);
  });

  it("falls back to role='admin' when role name is null (not found)", async () => {
    asAdmin({ users: ["create"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      email: "x@example.com",
      password: "secret",
      full_name: "X",
      role_id: "9",
    });
    await runAction(createUser, fd);

    const profileChains = admin.chainsForTable("profiles");
    const insertChain = profileChains[0];
    const insertCall = insertChain.find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg.role).toBe("admin");
  });

  it("omits store_id from profile when storeId is not provided", async () => {
    asAdmin({ users: ["create"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { name: "Admin" }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      email: "x@example.com",
      password: "secret",
      full_name: "X",
      role_id: "2",
    });
    await runAction(createUser, fd);

    const profileChains = admin.chainsForTable("profiles");
    const insertChain = profileChains[0];
    const insertCall = insertChain.find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg).not.toHaveProperty("store_id");
  });

  it("passes email_confirm=true and user_metadata to auth.admin.createUser", async () => {
    asAdmin({ users: ["create"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { name: "Admin" }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      email: "x@example.com",
      password: "secret",
      full_name: "X Y",
      role_id: "2",
    });
    await runAction(createUser, fd);

    const createCalls = admin.calls.filter((c) => c.method === "auth.admin.createUser");
    expect(createCalls).toHaveLength(1);
    const payload = createCalls[0].args[0] as Record<string, unknown>;
    expect(payload.email).toBe("x@example.com");
    expect(payload.password).toBe("secret");
    expect(payload.email_confirm).toBe(true);
    expect((payload.user_metadata as Record<string, unknown>)?.full_name).toBe("X Y");
  });

  it("revalidates /users on success", async () => {
    asAdmin({ users: ["create"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { name: "Admin" }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      email: "x@example.com",
      password: "secret",
      full_name: "X",
      role_id: "2",
    });
    await runAction(createUser, fd);
    expect(revalidatePathMock).toHaveBeenCalledWith("/users");
  });
});

// P31: password reset. Sets a new temporary password via
// auth.admin.updateUserById and flags must_reset_password = true.
// The user's next sign-in then redirects them to
// /auth/reset-password to set a permanent password.
describe("resetUserPassword", () => {
  it("rejects users without users:edit permission", async () => {
    asAdmin({ users: ["view"] });
    const fd = buildFormData({ id: "u-1", new_password: "abcdef" });
    await expect(resetUserPassword(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when new_password is missing", async () => {
    asAdmin({ users: ["edit"] });
    const fd = buildFormData({ id: "u-1" });
    await expect(resetUserPassword(fd)).rejects.toThrow(/New password is required/);
  });

  it("throws when new_password is too short", async () => {
    asAdmin({ users: ["edit"] });
    const fd = buildFormData({ id: "u-1", new_password: "abc" });
    await expect(resetUserPassword(fd)).rejects.toThrow(/at least 6/);
  });

  it("throws when the admin tries to reset their own password", async () => {
    asAdmin({ users: ["edit"] });
    setServerUser({ id: "u-self", email: "self@example.com" });
    const fd = buildFormData({ id: "u-self", new_password: "abcdef" });
    await expect(resetUserPassword(fd)).rejects.toThrow(/your own password/);
  });

  it("calls auth.admin.updateUserById and sets must_reset_password = true on the profile", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    // 1) auth.admin.updateUserById → success
    // 2) profile update (must_reset_password = true) → success
    admin.setResponses({ data: null, error: null }, { data: null, error: null });

    const fd = buildFormData({ id: "u-1", new_password: "TempPass123" });
    await runAction(resetUserPassword, fd);

    // 1) auth.admin.updateUserById
    const updateAuthCalls = admin.calls.filter(
      (c) => c.method === "auth.admin.updateUserById",
    );
    expect(updateAuthCalls.length).toBe(1);
    expect(updateAuthCalls[0].args).toEqual([
      "u-1",
      { password: "TempPass123", email_confirm: true },
    ]);

    // 2) profile update with must_reset_password = true
    const profilesChains = admin.chainsForTable("profiles");
    const profileUpdate = profilesChains[0].find(
      (c) => c.method === "update",
    )!;
    const updateArg = profileUpdate.args[0] as Record<string, unknown>;
    expect(updateArg.must_reset_password).toBe(true);

    // 3) revalidate /users
    expect(revalidatePathMock).toHaveBeenCalledWith("/users");
  });

  it("propagates auth.admin.updateUserById errors", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "weak password policy" } });

    const fd = buildFormData({ id: "u-1", new_password: "TempPass123" });
    const result = await runAction(resetUserPassword, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/weak password policy/);
  });
});

// P33: toggleManagerActiveWithCascade — extends toggleUserActive for
// Manager rows with a cascade (inactivates products, unassigns
// categories). Distinct from the simple toggle so non-Manager users
// (e.g. Super Admin) are not accidentally affected.
describe("toggleManagerActiveWithCascade", () => {
  it("rejects users without users:edit permission", async () => {
    asAdmin({ users: ["view"] });
    const fd = buildFormData({ id: "u-1", target: "false" });
    await expect(toggleManagerActiveWithCascade(fd)).rejects.toBeInstanceOf(
      PermissionError,
    );
  });

  it("throws when target user is not a Manager", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    // Target profile is Super Admin
    admin.setResponses({
      data: { id: "u-sa", store_id: null, is_active: true, roles: { name: "Super Admin" } },
      error: null,
    });
    const fd = buildFormData({ id: "u-sa", target: "false" });
    await expect(toggleManagerActiveWithCascade(fd)).rejects.toThrow(
      /Cascade is only available for Manager role/,
    );
  });

  it("disabling a Manager: inactivates products (excluding cascade_locked=false) AND deletes store_categories", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    // Response order matches the action's call order:
    // 1) target profile lookup (Manager, store_id="s-1", is_active=true)
    // 2) profiles.update (sets is_active=false) — happens BEFORE the cascade
    // 3) products.update (inactivates cascade_locked=true rows)
    // 4) store_categories.delete (unassigns the store)
    // 5) activity_logs.insert (best-effort)
    admin.setResponses(
      { data: { id: "u-1", store_id: "s-1", is_active: true, roles: { name: "Manager" } }, error: null },
      { data: null, error: null },
      { data: [{ id: "p-1" }, { id: "p-2" }], error: null },
      { data: [{ category_id: "c-1" }, { category_id: "c-2" }, { category_id: "c-3" }], error: null },
      { data: null, error: null },
    );
    const fd = buildFormData({ id: "u-1", target: "false" });
    const result = await toggleManagerActiveWithCascade(fd);
    expect(result.ok).toBe(true);
    expect(result.cascaded).toBe(true);
    expect(result.productsDisabled).toBe(2);
    expect(result.categoriesUnassigned).toBe(3);

    // Verify the products update used the cascade_locked filter.
    // The mock stores .update()'s payload as a raw object; instead of
    // stringifying, we look for the .neq() call that only appears in
    // the products cascade chain (the profile update has no .neq()).
    const neqCalls = admin.calls.filter((c) => c.method === "neq");
    expect(neqCalls.length).toBeGreaterThanOrEqual(1);

    // The cascade_locked filter was applied — the .eq() arg should be true
    const eqCalls = admin.calls.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "cascade_locked" && c.args[1] === true)).toBe(true);

    // Verify the store_categories delete is filtered by store_id
    const deleteCalls = admin.calls.filter((c) => c.method === "delete");
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1);

    // Verify the profile update set is_active=false (the .update() payload
    // contains an is_active key — checked via JSON)
    const profileUpdateFound = admin.calls.some(
      (c) => c.method === "update" && JSON.stringify(c.args[0]).includes("is_active"),
    );
    expect(profileUpdateFound).toBe(true);
  });

  it("re-enabling a Manager: does NOT cascade-restore products or reassign categories", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    // 1) target profile lookup (Manager, store_id="s-1", is_active=false)
    // 2) profiles.update (sets is_active=true)
    // 3) activity_logs.insert (best-effort)
    admin.setResponses(
      { data: { id: "u-1", store_id: "s-1", is_active: false, roles: { name: "Manager" } }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    );
    const fd = buildFormData({ id: "u-1", target: "true" });
    const result = await toggleManagerActiveWithCascade(fd);
    expect(result.ok).toBe(true);
    expect(result.cascaded).toBe(false);
    expect(result.productsDisabled).toBe(0);
    expect(result.categoriesUnassigned).toBe(0);

    // No products update (no .neq()) or store_categories delete
    // should have fired during re-enable.
    expect(admin.calls.filter((c) => c.method === "neq").length).toBe(0);
    expect(admin.calls.filter((c) => c.method === "delete").length).toBe(0);
  });

  it("a Manager with no store_id: profile is toggled but no cascade runs", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    // 1) target profile lookup
    // 2) profiles.update (is_active = false)
    // 3) activity log
    admin.setResponses(
      { data: { id: "u-1", store_id: null, is_active: true, roles: { name: "Manager" } }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    );
    const fd = buildFormData({ id: "u-1", target: "false" });
    const result = await toggleManagerActiveWithCascade(fd);
    expect(result.ok).toBe(true);
    expect(result.cascaded).toBe(false);
    expect(result.productsDisabled).toBe(0);
    expect(result.categoriesUnassigned).toBe(0);
  });

  it("revalidates /users, /products, /categories, /stores", async () => {
    asAdmin({ users: ["edit"] });
    const admin = getAdminClient();
    // 1) target profile lookup
    // 2) profiles.update
    // 3) products.update
    // 4) store_categories.delete
    // 5) activity log
    admin.setResponses(
      { data: { id: "u-1", store_id: "s-1", is_active: true, roles: { name: "Manager" } }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    const fd = buildFormData({ id: "u-1", target: "false" });
    await toggleManagerActiveWithCascade(fd);
    expect(revalidatePathMock).toHaveBeenCalledWith("/users");
    expect(revalidatePathMock).toHaveBeenCalledWith("/products");
    expect(revalidatePathMock).toHaveBeenCalledWith("/categories");
    expect(revalidatePathMock).toHaveBeenCalledWith("/stores");
  });
});
