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
  asAnonymous,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { buildFormData } from "../../../../test/fixtures/formdata";
import { makeProfile, makeStore } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getStoresLight,
  getStaff,
  createStaff,
  updateStaff,
  toggleStaffActive,
  deleteStaff,
  resetStaffPassword,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getStoresLight (staff module)", () => {
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

describe("getStaff", () => {
  it("rejects users without staff:view permission", async () => {
    asAdmin({ staff: [] });
    await expect(getStaff()).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns [] when Staff role is not found in roles table", async () => {
    asAdmin({ staff: ["view"] });
    const admin = getAdminClient();
    // roles probe returns null
    admin.setResponses({ data: null, error: null });
    const staff = await getStaff();
    expect(staff).toEqual([]);
  });

  it("returns staff profiles scoped to the Staff role_id, with enriched store_name", async () => {
    asAdmin({ staff: ["view"] });
    const admin = getAdminClient();
    const p1 = makeProfile({
      id: "st-1",
      full_name: "Staff A",
      role: "admin",
      role_id: 3,
      store_id: "s-1",
      staff_type: "delivery",
    });
    const p2 = makeProfile({
      id: "st-2",
      full_name: "Staff B",
      role: "admin",
      role_id: 3,
      store_id: "s-2",
      staff_type: "picker",
    });

    // 1) roles Staff lookup
    // 2) profiles fetch
    // 3) stores enrichment
    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: [p1, p2], error: null },
      { data: [{ id: "s-1", name: "Alpha" }, { id: "s-2", name: "Beta" }], error: null },
    );

    const staff = await getStaff();
    expect(staff).toHaveLength(2);
    expect(staff[0]).toMatchObject({
      id: "st-1",
      full_name: "Staff A",
      staff_type: "delivery",
      store_id: "s-1",
      store_name: "Alpha",
    });
    expect(staff[1]).toMatchObject({
      id: "st-2",
      store_id: "s-2",
      store_name: "Beta",
    });
  });

  it("applies eq filter for role_id = Staff role id", async () => {
    asAdmin({ staff: ["view"] });
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "st-1", role_id: 3, store_id: null });

    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: [p1], error: null },
    );

    await getStaff();

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const eqRoleId = mainChain.find((c) => c.method === "eq" && c.args[0] === "role_id");
    expect(eqRoleId).toBeDefined();
    expect(eqRoleId!.args[1]).toBe(3);
  });

  it("applies an additional eq for store_id when storeId is provided", async () => {
    asAdmin({ staff: ["view"] });
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "st-1", role_id: 3, store_id: "s-1" });

    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: [p1], error: null },
      { data: [{ id: "s-1", name: "Alpha" }], error: null },
    );

    await getStaff("s-1");

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const eqCalls = mainChain.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "role_id" && c.args[1] === 3)).toBe(true);
    expect(eqCalls.some((c) => c.args[0] === "store_id" && c.args[1] === "s-1")).toBe(true);
  });

  it("does NOT apply store_id eq filter when storeId is null", async () => {
    asAdmin({ staff: ["view"] });
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "st-1", role_id: 3, store_id: null });

    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: [p1], error: null },
    );

    await getStaff(null);

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const eqCalls = mainChain.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "store_id")).toBe(false);
  });

  it("does NOT apply store_id eq filter when storeId is undefined", async () => {
    asAdmin({ staff: ["view"] });
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "st-1", role_id: 3, store_id: null });

    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: [p1], error: null },
    );

    await getStaff();

    const profilesChains = admin.chainsForTable("profiles");
    const mainChain = profilesChains[0];
    const eqCalls = mainChain.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "store_id")).toBe(false);
  });

  it("applies order by created_at descending", async () => {
    asAdmin({ staff: ["view"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: [], error: null },
    );

    await getStaff();
    const profilesChains = admin.chainsForTable("profiles");
    const orderCall = profilesChains[0].find((c) => c.method === "order");
    expect(orderCall).toBeDefined();
    expect(orderCall!.args[0]).toBe("created_at");
    expect((orderCall!.args[1] as { ascending?: boolean })?.ascending).toBe(false);
  });

  it("returns [] when profiles fetch errors", async () => {
    asAdmin({ staff: ["view"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: null, error: { message: "db down" } },
    );
    const staff = await getStaff();
    expect(staff).toEqual([]);
  });

  it("skips store enrichment when no staff have a store_id", async () => {
    asAdmin({ staff: ["view"] });
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "st-1", role_id: 3, store_id: null });

    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: [p1], error: null },
    );

    const staff = await getStaff();
    expect(staff[0].store_name).toBeNull();
    expect(admin.chainsForTable("stores")).toHaveLength(0);
  });

  it("is_active defaults to true when null", async () => {
    asAdmin({ staff: ["view"] });
    const admin = getAdminClient();
    const p1 = makeProfile({ id: "st-1", role_id: 3, store_id: null });
    (p1 as { is_active: boolean | null }).is_active = null;

    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: [p1], error: null },
    );

    const staff = await getStaff();
    expect(staff[0].is_active).toBe(true);
  });
});

describe("createStaff", () => {
  it("rejects users without staff:create permission", async () => {
    asAdmin({ staff: ["view"] });
    const fd = buildFormData({
      full_name: "Alice",
      email: "alice@example.com",
      password: "secret123",
    });
    await expect(createStaff(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when full_name is empty", async () => {
    asAdmin({ staff: ["create"] });
    const fd = buildFormData({
      full_name: "",
      email: "alice@example.com",
      password: "secret123",
    });
    await expect(createStaff(fd)).rejects.toThrow(/Name is required/);
  });

  it("throws when email is missing", async () => {
    asAdmin({ staff: ["create"] });
    const fd = buildFormData({
      full_name: "Alice",
      password: "secret123",
    });
    await expect(createStaff(fd)).rejects.toThrow(/Email and password are required/);
  });

  it("throws when password is missing", async () => {
    asAdmin({ staff: ["create"] });
    const fd = buildFormData({
      full_name: "Alice",
      email: "alice@example.com",
    });
    await expect(createStaff(fd)).rejects.toThrow(/Email and password are required/);
  });

  it("throws when auth.admin.createUser returns an error and does not insert a profile", async () => {
    asAdmin({ staff: ["create"] });
    const admin = getAdminClient();
    // P38: the mock now supports injecting a one-shot error for
    // auth.admin.createUser via setNextCreateUserError. We use it to
    // assert that the action bails out at the auth step and never
    // touches the profiles table.
    admin.setNextCreateUserError({ message: "boom from supabase" });

    const fd = buildFormData({
      full_name: "Alice",
      email: "alice@example.com",
      password: "secret123",
      phone: "+91",
      staff_type: "delivery",
      store_id: "s-1",
    });
    await expect(createStaff(fd)).rejects.toThrow(/boom from supabase/);

    // No profile insert should have happened.
    const profileChains = admin.chainsForTable("profiles");
    expect(profileChains.length).toBe(0);

    // The auth call was made exactly once.
    const authCalls = admin.calls.filter(
      (c) => c.method === "auth.admin.createUser",
    );
    expect(authCalls.length).toBe(1);
  });

  it("surfaces a clear message when the email is already registered and does not insert a profile", async () => {
    asAdmin({ staff: ["create"] });
    const admin = getAdminClient();
    admin.setNextCreateUserError({
      message: "A user with this email address has already been registered",
    });

    const fd = buildFormData({
      full_name: "Alice",
      email: "dup@example.com",
      password: "secret123",
      store_id: "s-1",
    });
    await expect(createStaff(fd)).rejects.toThrow(
      /A user with this email already exists\. To convert them to staff, use the Users page/,
    );

    // No profile insert, no auth delete (we never created the auth user).
    expect(admin.chainsForTable("profiles").length).toBe(0);
    const deleteCalls = admin.calls.filter(
      (c) => c.method === "auth.admin.deleteUser",
    );
    expect(deleteCalls.length).toBe(0);
  });

  it("makes the auth.createUser call BEFORE the profile insert (call order matters for FK integrity)", async () => {
    asAdmin({ staff: ["create"] });
    const admin = getAdminClient();
    // Pre-queue role + insert responses (auth.createUser succeeds by default)
    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      full_name: "Alice",
      email: "alice@example.com",
      password: "secret123",
      phone: "+91",
      staff_type: "delivery",
      store_id: "s-1",
    });
    await runAction(createStaff, fd);

    const authCalls = admin.calls.filter(
      (c) => c.method === "auth.admin.createUser",
    );
    const profileChains = admin.chainsForTable("profiles");
    const insertCallIdx = profileChains[0].findIndex(
      (c) => c.method === "insert",
    );
    expect(authCalls.length).toBe(1);
    expect(authCalls[0].args[0]).toMatchObject({
      email: "alice@example.com",
      password: "secret123",
      email_confirm: true,
    });
    expect(insertCallIdx).toBeGreaterThanOrEqual(0);

    // The auth call index must be BEFORE the insert call index in the
    // shared calls array (call order is monotonic).
    const authIdx = admin.calls.findIndex(
      (c) => c.method === "auth.admin.createUser",
    );
    const insertIdx = admin.calls.findIndex(
      (c) => c.method === "from" && c.args[0] === "profiles",
    );
    expect(authIdx).toBeLessThan(insertIdx);
  });

  it("throws when Staff role is not found AND rolls back the auth user", async () => {
    asAdmin({ staff: ["create"] });
    const admin = getAdminClient();
    // Role lookup returns null → triggers the rollback path
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      full_name: "Alice",
      email: "alice@example.com",
      password: "secret123",
    });
    await expect(createStaff(fd)).rejects.toThrow(/Staff role not found/);

    // The auth user must be deleted so we don't leave an orphan
    // account that can't log in.
    const deleteCalls = admin.calls.filter(
      (c) => c.method === "auth.admin.deleteUser",
    );
    expect(deleteCalls.length).toBe(1);
  });

  it("inserts a profile with id=authUser.id, email, role_id, role='admin', is_active=true and revalidates /staff", async () => {
    asAdmin({ staff: ["create"] });
    const admin = getAdminClient();
    // 1) roles Staff lookup
    // 2) profiles insert
    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      full_name: "Alice",
      email: "alice@example.com",
      password: "secret123",
      phone: "+91",
      staff_type: "delivery",
      store_id: "s-1",
    });
    await runAction(createStaff, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const insertCall = profilesChains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    // P29 fix: profiles.id must equal auth.users.id (FK). The mock
    // generates a deterministic-ish id, so we just assert the type.
    expect(insertArg.id).toEqual(expect.any(String));
    expect((insertArg.id as string).length).toBeGreaterThan(0);
    expect(insertArg.email).toBe("alice@example.com");
    expect(insertArg.full_name).toBe("Alice");
    expect(insertArg.phone).toBe("+91");
    expect(insertArg.staff_type).toBe("delivery");
    expect(insertArg.store_id).toBe("s-1");
    expect(insertArg.role_id).toBe(3);
    expect(insertArg.role).toBe("admin");
    expect(insertArg.is_active).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/staff");
  });

  it("stores null for phone/staff_type/store_id when empty strings", async () => {
    asAdmin({ staff: ["create"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({
      full_name: "Alice",
      email: "alice@example.com",
      password: "secret123",
      phone: "",
      staff_type: "",
      store_id: "",
    });
    await runAction(createStaff, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const insertCall = profilesChains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg.phone).toBeNull();
    expect(insertArg.staff_type).toBeNull();
    expect(insertArg.store_id).toBeNull();
  });

  it("throws when profile insert returns an error AND rolls back the auth user", async () => {
    asAdmin({ staff: ["create"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: null, error: { message: "constraint" } },
    );

    const fd = buildFormData({
      full_name: "Alice",
      email: "alice@example.com",
      password: "secret123",
    });
    const result = await runAction(createStaff, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);

    // The auth user must be deleted so we don't leave an orphan
    // auth account paired with a profile that was never created.
    const deleteCalls = admin.calls.filter(
      (c) => c.method === "auth.admin.deleteUser",
    );
    expect(deleteCalls.length).toBe(1);
  });
});

describe("updateStaff", () => {
  it("rejects users without staff:edit permission", async () => {
    asAdmin({ staff: ["view"] });
    const fd = buildFormData({ id: "st-1", full_name: "Alice" });
    await expect(updateStaff(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("updates full_name, phone, staff_type, store_id", async () => {
    asAdmin({ staff: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      id: "st-1",
      full_name: "Alice Updated",
      phone: "+91",
      staff_type: "delivery",
      store_id: "s-2",
    });
    await runAction(updateStaff, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateCall = profilesChains[0].find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg).toEqual({
      full_name: "Alice Updated",
      phone: "+91",
      staff_type: "delivery",
      store_id: "s-2",
    });
    const eqCall = profilesChains[0].find((c) => c.method === "eq")!;
    expect(eqCall.args).toEqual(["id", "st-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/staff");
  });

  it("does NOT include full_name in update when empty (only set if truthy)", async () => {
    asAdmin({ staff: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      id: "st-1",
      full_name: "",
      phone: "+91",
      staff_type: "delivery",
      store_id: "s-1",
    });
    await runAction(updateStaff, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateCall = profilesChains[0].find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg).not.toHaveProperty("full_name");
  });

  it("always includes phone/staff_type in update (null when empty)", async () => {
    asAdmin({ staff: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      id: "st-1",
      full_name: "Alice",
      phone: "",
      staff_type: "",
      store_id: "s-1",
    });
    await runAction(updateStaff, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateCall = profilesChains[0].find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg.phone).toBeNull();
    expect(updateArg.staff_type).toBeNull();
  });

  it("does NOT include store_id in update when empty", async () => {
    asAdmin({ staff: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      id: "st-1",
      full_name: "Alice",
      phone: "+91",
      staff_type: "delivery",
      store_id: "",
    });
    await runAction(updateStaff, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateCall = profilesChains[0].find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg).not.toHaveProperty("store_id");
  });

  it("throws when update returns an error", async () => {
    asAdmin({ staff: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint" } });

    const fd = buildFormData({ id: "st-1", full_name: "Alice" });
    const result = await runAction(updateStaff, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
  });
});

describe("toggleStaffActive", () => {
  it("rejects users without staff:edit permission", async () => {
    asAdmin({ staff: ["view"] });
    const fd = buildFormData({ id: "st-1", current: "true" });
    await expect(toggleStaffActive(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("flips is_active to false when current is true", async () => {
    asAdmin({ staff: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ id: "st-1", current: "true" });
    await runAction(toggleStaffActive, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateCall = profilesChains[0].find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({ is_active: false });
    expect(revalidatePathMock).toHaveBeenCalledWith("/staff");
  });

  it("flips is_active to true when current is false", async () => {
    asAdmin({ staff: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ id: "st-1", current: "false" });
    await runAction(toggleStaffActive, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const updateCall = profilesChains[0].find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({ is_active: true });
  });
});

describe("deleteStaff", () => {
  it("rejects users without staff:delete permission", async () => {
    asAdmin({ staff: ["view", "edit"] });
    const fd = buildFormData({ id: "st-1" });
    await expect(deleteStaff(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("deletes the staff profile by id", async () => {
    asAdmin({ staff: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ id: "st-1" });
    await runAction(deleteStaff, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const deleteChain = profilesChains[0];
    expect(deleteChain.some((c) => c.method === "delete")).toBe(true);
    expect(deleteChain.find((c) => c.method === "eq")!.args).toEqual(["id", "st-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/staff");
  });

  it("throws when delete returns an error", async () => {
    asAdmin({ staff: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fk violation" } });

    const fd = buildFormData({ id: "st-1" });
    const result = await runAction(deleteStaff, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/fk violation/);
  });
});

describe("P28: Super Admin is blocked from staff actions", () => {
  // Even with full `staff: [...]` permissions in the role JSON, the actions
  // throw PermissionError when called by a Super Admin. This is the
  // server-side defense in depth (MasterLayout hides the menu; actions
  // enforce the rule).
  it("P28: getStaff throws PermissionError for Super Admin", async () => {
    asSuperAdmin();
    await expect(getStaff("s-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("P28: createStaff throws PermissionError for Super Admin", async () => {
    asSuperAdmin();
    const fd = buildFormData({
      full_name: "X",
      email: "x@example.com",
      password: "secret123",
      store_id: "s-1",
    });
    await expect(createStaff(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("P28: updateStaff throws PermissionError for Super Admin", async () => {
    asSuperAdmin();
    const fd = buildFormData({ id: "st-1", full_name: "Y" });
    await expect(updateStaff(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("P28: toggleStaffActive throws PermissionError for Super Admin", async () => {
    asSuperAdmin();
    const fd = buildFormData({ id: "st-1", current: "true" });
    await expect(toggleStaffActive(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("P28: deleteStaff throws PermissionError for Super Admin", async () => {
    asSuperAdmin();
    const fd = buildFormData({ id: "st-1" });
    await expect(deleteStaff(fd)).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("P28: Manager (store-scoped) with full staff permissions works", () => {
  it("P28: Manager with staff:view can list staff for their store", async () => {
    asAdmin({ staff: ["view", "create", "edit", "delete"] });
    const admin = getAdminClient();
    // roles lookup for the Staff role
    admin.enqueueResponse({
      data: { id: "staff-role-id" },
      error: null,
    });
    // staff profiles for the store
    admin.enqueueResponse({
      data: [makeProfile({ id: "st-1", store_id: "s-1" })],
      error: null,
    });
    // store enrichment lookup
    admin.enqueueResponse({
      data: [{ id: "s-1", name: "My Store" }],
      error: null,
    });

    const result = await getStaff("s-1");
    expect(result).toHaveLength(1);
    expect(result[0].store_name).toBe("My Store");
  });
});

// P31: password reset for staff. Mirrors resetUserPassword but
// lives in the staff module — the /staff edit modal has its own
// "Reset Password" section.
describe("resetStaffPassword", () => {
  it("rejects users without staff:edit permission", async () => {
    asAdmin({ staff: ["view"] });
    const fd = buildFormData({ id: "st-1", new_password: "abcdef" });
    await expect(resetStaffPassword(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws PermissionError for Super Admin (P28 defense)", async () => {
    asSuperAdmin();
    const fd = buildFormData({ id: "st-1", new_password: "abcdef" });
    await expect(resetStaffPassword(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when new_password is missing", async () => {
    asAdmin({ staff: ["edit"] });
    const fd = buildFormData({ id: "st-1" });
    await expect(resetStaffPassword(fd)).rejects.toThrow(/New password is required/);
  });

  it("throws when new_password is too short", async () => {
    asAdmin({ staff: ["edit"] });
    const fd = buildFormData({ id: "st-1", new_password: "abc" });
    await expect(resetStaffPassword(fd)).rejects.toThrow(/at least 6/);
  });

  it("calls auth.admin.updateUserById and sets must_reset_password = true", async () => {
    asAdmin({ staff: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null }, { data: null, error: null });

    const fd = buildFormData({ id: "st-1", new_password: "TempPass123" });
    await runAction(resetStaffPassword, fd);

    const updateAuthCalls = admin.calls.filter(
      (c) => c.method === "auth.admin.updateUserById",
    );
    expect(updateAuthCalls.length).toBe(1);
    expect(updateAuthCalls[0].args).toEqual([
      "st-1",
      { password: "TempPass123", email_confirm: true },
    ]);

    const profilesChains = admin.chainsForTable("profiles");
    const profileUpdate = profilesChains[0].find(
      (c) => c.method === "update",
    )!;
    const updateArg = profileUpdate.args[0] as Record<string, unknown>;
    expect(updateArg.must_reset_password).toBe(true);

    expect(revalidatePathMock).toHaveBeenCalledWith("/staff");
  });
});
