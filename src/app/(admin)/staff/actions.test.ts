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
    const fd = buildFormData({ full_name: "Alice" });
    await expect(createStaff(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when full_name is empty", async () => {
    asAdmin({ staff: ["create"] });
    const fd = buildFormData({ full_name: "" });
    await expect(createStaff(fd)).rejects.toThrow(/Name is required/);
  });

  it("throws when Staff role is not found", async () => {
    asAdmin({ staff: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ full_name: "Alice" });
    await expect(createStaff(fd)).rejects.toThrow(/Staff role not found/);
  });

  it("inserts a profile with role_id, role='admin', is_active=true and revalidates /staff", async () => {
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
      phone: "+91",
      staff_type: "delivery",
      store_id: "s-1",
    });
    await runAction(createStaff, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const insertCall = profilesChains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg).toEqual({
      full_name: "Alice",
      phone: "+91",
      staff_type: "delivery",
      store_id: "s-1",
      role_id: 3,
      role: "admin",
      is_active: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/staff");
  });

  it("stores null for phone/staff_type/store_id when empty strings", async () => {
    asAdmin({ staff: ["create"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: null, error: null },
    );

    const fd = buildFormData({ full_name: "Alice", phone: "", staff_type: "", store_id: "" });
    await runAction(createStaff, fd);

    const profilesChains = admin.chainsForTable("profiles");
    const insertCall = profilesChains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg.phone).toBeNull();
    expect(insertArg.staff_type).toBeNull();
    expect(insertArg.store_id).toBeNull();
  });

  it("throws when profile insert returns an error", async () => {
    asAdmin({ staff: ["create"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: 3 }, error: null },
      { data: null, error: { message: "constraint" } },
    );

    const fd = buildFormData({ full_name: "Alice" });
    const result = await runAction(createStaff, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
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
