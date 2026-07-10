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
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { buildFormData } from "../../../../test/fixtures/formdata";
import { makeStore } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getStoreSettings,
  updateStore,
  createStore,
  updateStoreSetting,
  getAppMaintenance,
  getStoreMaintenanceMap,
  getCategoryDeletionGraceDays,
  updateAppMaintenance,
  updateStoreMaintenance,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getStoreSettings", () => {
  it("returns the first store when no storeId is provided", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const store = makeStore({ id: "s-1", name: "First Store" });
    admin.enqueueResponse({ data: store, error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });

    const result = await getStoreSettings();
    expect(result.store?.id).toBe("s-1");
  });

  it("returns null store when no stores exist", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });

    const result = await getStoreSettings();
    expect(result.store).toBeNull();
  });

  it("falls back to DEFAULT_POLICIES when no settings row", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: makeStore(), error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });

    const result = await getStoreSettings();
    expect(result.policies.min_order).toBe(0);
    expect(result.policies.open_time).toBe("08:00");
  });

  it("falls back to DEFAULT_PAYMENT when no payment_config", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: makeStore(), error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });

    const result = await getStoreSettings();
    expect(result.payment.cod_enabled).toBe(true);
    expect(result.payment.gateway).toBe("razorpay");
  });

  it("falls back to DEFAULT_GST when no gst_config", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: makeStore(), error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: [], error: null });

    const result = await getStoreSettings();
    expect(result.gst.gst_enabled).toBe(true);
    expect(result.gst.default_gst_rate).toBe(18);
  });

  it("merges saved settings with the defaults", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    // Note: Promise.all with mixed chains + async functions consumes responses
    // in microtask order: zones, gst, settings, slots (not the array order).
    // The settings response (with 3 keys) is therefore consumed 3rd, not 1st.
    admin.enqueueResponse({ data: makeStore(), error: null });
    admin.enqueueResponse({ data: [], error: null });             // zones
    admin.enqueueResponse({ data: [], error: null });             // gst
    admin.enqueueResponse({                                       // settings
      data: [
        { key: "store_policies", value: { open_time: "06:00" } },
        { key: "payment_config", value: { gateway: "stripe" } },
        { key: "gst_config", value: { default_gst_rate: 12 } },
      ],
      error: null,
    });
    admin.enqueueResponse({ data: [], error: null });             // slots

    const result = await getStoreSettings();
    expect(result.policies.open_time).toBe("06:00");
    expect(result.policies.min_order).toBe(0);
    expect(result.payment.gateway).toBe("stripe");
    expect(result.payment.cod_enabled).toBe(true);
    expect(result.gst.default_gst_rate).toBe(12);
  });
});

describe("updateStore", () => {
  it("rejects users without stores:edit permission", async () => {
    asAdmin({ stores: ["view"] });
    const fd = buildFormData({ id: "s-1", name: "New Name" });
    await expect(updateStore(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("updates scalar fields and revalidates /settings and /stores", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      id: "s-1",
      name: "Updated Name",
      slug: "updated-slug",
      phone: "+911111111111",
      is_open: "on",
    });
    await runAction(updateStore, fd);

    const updateArg = admin.chainsForTable("stores")[0]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(updateArg.name).toBe("Updated Name");
    expect(updateArg.slug).toBe("updated-slug");
    expect(updateArg.is_open).toBe(true);
    expect(updateArg.is_active).toBe(false);

    expect(revalidatePathMock).toHaveBeenCalledWith("/settings");
    expect(revalidatePathMock).toHaveBeenCalledWith("/stores");
  });

  it("converts missing numeric fields to null", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ id: "s-1", name: "X" });
    await runAction(updateStore, fd);

    const updateArg = admin.chainsForTable("stores")[0]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(updateArg.delivery_radius_km).toBeNull();
    expect(updateArg.commission_rate).toBeNull();
  });

  it("returns an error when the store update query fails", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "db error" } });

    const fd = buildFormData({ id: "s-1", name: "X" });
    const result = await runAction(updateStore, fd);
    expect(result.error?.message).toBe("db error");
  });

  it("refuses to remove a category that is locked by products", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({
      data: [{ id: "c-1", name: "Cat1", parent_id: null, sort_order: 0 }, { id: "c-2", name: "Cat2", parent_id: null, sort_order: 0 }],
      error: null,
    });
    admin.enqueueResponse({
      data: [{ category_id: "c-1" }, { category_id: "c-2" }],
      error: null,
    });
    admin.enqueueResponse({
      count: 2,
      data: [{ category_id: "c-1" }, { category_id: "c-1" }],
      error: null,
    });
    admin.enqueueResponse({ count: 0, data: [], error: null });

    const fd = buildFormData({
      id: "s-1",
      name: "X",
      category_ids: "c-2",
    });
    const result = await runAction(updateStore, fd);
    expect(result.error?.message).toMatch(/Cannot remove/);
  });

  it("replaces store_categories when no removed category is locked", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({
      data: [{ id: "c-1", name: "Cat1", parent_id: null, sort_order: 0 }, { id: "c-2", name: "Cat2", parent_id: null, sort_order: 0 }, { id: "c-3", name: "Cat3", parent_id: null, sort_order: 0 }],
      error: null,
    });
    admin.enqueueResponse({
      data: [{ category_id: "c-1" }],
      error: null,
    });
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      id: "s-1",
      name: "X",
      category_ids: "c-2,c-3",
    });
    await runAction(updateStore, fd);

    const tablesTouched = admin.calls
      .filter((c) => c.method === "from")
      .map((c) => c.args[0]);
    expect(tablesTouched.filter((t) => t === "store_categories").length).toBeGreaterThanOrEqual(2);
  });
});

describe("updateStore GSTIN sub-handler (P64a): primary GSTIN on store edit form", () => {
  it("creates a new primary gst_numbers row when form has gstin and no primary exists", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    // No category_ids in formData → category_ids branch skipped.
    // Queries: (1) store update, (2) maybeSingle (no primary), (3) insert
    admin.enqueueResponse({ data: null, error: null }); // store update
    admin.enqueueResponse({ data: null, error: null }); // maybeSingle: no primary
    admin.setRpcResult("demote_other_primaries", { data: 0, error: null }); // demote
    admin.enqueueResponse({ data: null, error: null }); // insert gst_numbers

    const fd = buildFormData({
      id: "s-1",
      name: "Store A",
      gstin: "29ABCDE1234F1Z5",
    });
    await runAction(updateStore, fd);

    const gstChains = admin.chainsForTable("gst_numbers");
    const gstInsert = gstChains.flatMap((c) => c).find((c) => c.method === "insert");
    expect(gstInsert).toBeDefined();
    const insertArg = gstInsert!.args[0] as Record<string, unknown>;
    expect(insertArg).toMatchObject({
      store_id: "s-1",
      gstin: "29ABCDE1234F1Z5",
      legal_name: "Store A",
      is_primary: true,
      is_active: true,
    });
  });

  it("updates the existing primary gst_numbers row when form has gstin and primary exists", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    // No category_ids → only 3 queries: store update, maybeSingle (primary), update
    admin.enqueueResponse({ data: null, error: null }); // store update
    admin.enqueueResponse({ data: { id: "g-1", gstin: "29OLDDD0000F1Z5" }, error: null }); // maybeSingle: primary exists
    admin.enqueueResponse({ data: null, error: null }); // update

    const fd = buildFormData({
      id: "s-1",
      name: "Store A",
      gstin: "29NEWST1234F1Z5",
    });
    await runAction(updateStore, fd);

    const gstChains = admin.chainsForTable("gst_numbers");
    const gstUpdate = gstChains.flatMap((c) => c).find((c) => c.method === "update");
    expect(gstUpdate).toBeDefined();
    expect(gstUpdate!.args[0]).toMatchObject({ gstin: "29NEWST1234F1Z5" });
    // The second chain (update) ends with eq("id", "g-1")
    const allEqs = gstChains.flatMap((c) => c).filter((c) => c.method === "eq");
    const updateEq = allEqs.find((e) => (e.args as unknown[])[1] === "g-1");
    expect(updateEq).toBeDefined();
    expect(updateEq!.args).toEqual(["id", "g-1"]);
  });

  it("deletes the primary gst_numbers row when form has empty gstin and primary exists", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null }); // store update
    admin.enqueueResponse({ data: { id: "g-1" }, error: null }); // maybeSingle: primary exists
    admin.enqueueResponse({ data: null, error: null }); // delete

    const fd = buildFormData({
      id: "s-1",
      name: "Store A",
      gstin: "",
    });
    await runAction(updateStore, fd);

    const gstChains = admin.chainsForTable("gst_numbers");
    const gstDelete = gstChains.flatMap((c) => c).find((c) => c.method === "delete");
    expect(gstDelete).toBeDefined();
    const allEqs = gstChains.flatMap((c) => c).filter((c) => c.method === "eq");
    const deleteEq = allEqs.find((e) => (e.args as unknown[])[1] === "g-1");
    expect(deleteEq).toBeDefined();
    expect(deleteEq!.args).toEqual(["id", "g-1"]);
  });

  it("no-ops on empty gstin when no primary exists (does not throw)", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    // Form has no category_ids, so the category_ids branch is skipped.
    // Only 2 queries run: (1) store update, (2) maybeSingle for primary.
    admin.enqueueResponse({ data: null, error: null }); // store update
    admin.enqueueResponse({ data: null, error: null }); // maybeSingle: no primary

    const fd = buildFormData({ id: "s-1", name: "Store A", gstin: "" });
    const result = await runAction(updateStore, fd);
    expect(result.ok).toBe(true);

    const gstChains = admin.chainsForTable("gst_numbers");
    const methods = gstChains.flatMap((chain) => chain.map((c) => c.method));
    expect(methods).not.toContain("insert");
    expect(methods).not.toContain("update");
    expect(methods).not.toContain("delete");
  });

  it("does NOT include gstin in the stores table update payload (defense)", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null }); // maybeSingle (no primary)
    admin.enqueueResponse({ data: null, error: null }); // insert gst_numbers

    const fd = buildFormData({
      id: "s-1",
      name: "Store A",
      gstin: "29ABCDE1234F1Z5",
    });
    await runAction(updateStore, fd);

    const storeUpdateArg = admin.chainsForTable("stores")[0]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(storeUpdateArg).not.toHaveProperty("gstin");
  });

  it("does NOT touch gst_numbers when the form omits the gstin field entirely (defense)", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    // No gstin field at all
    const fd = buildFormData({ id: "s-1", name: "Store A" });
    await runAction(updateStore, fd);

    // No gst_numbers chains should have been created
    const gstChains = admin.chainsForTable("gst_numbers");
    expect(gstChains).toHaveLength(0);
  });
});

describe("createStore", () => {
  it("rejects users without stores:create permission", async () => {
    asAdmin({ stores: ["view"] });
    const fd = buildFormData({ name: "X", slug: "x" });
    await expect(createStore(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when name is missing", async () => {
    asAdmin({ stores: ["create"] });
    const fd = buildFormData({ slug: "x" });
    await expect(createStore(fd)).rejects.toThrow(/Store name is required/);
  });

  it("throws when slug is missing", async () => {
    asAdmin({ stores: ["create"] });
    const fd = buildFormData({ name: "X" });
    await expect(createStore(fd)).rejects.toThrow(/Slug is required/);
  });

  it("inserts the store, sets owner store_id, and revalidates /stores", async () => {
    asAdmin({ stores: ["create"] });
    const admin = getAdminClient();
    // 1. uniqueness check for auto-generated code
    admin.enqueueResponse({ data: null, error: null });
    // 2. store insert
    admin.enqueueResponse({ data: { id: "new-store" }, error: null });
    // 3. profile update
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      name: "New Store",
      slug: "new-store",
      owner_id: "u-owner",
    });
    const result = await createStore(fd);

    expect(result).toEqual({ id: "new-store" });

    const storeInsert = admin.chainsForTable("stores")[1]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(storeInsert.name).toBe("New Store");
    expect(storeInsert.slug).toBe("new-store");
    expect(storeInsert.code).toMatch(/^[A-Z0-9_]{4,16}$/);
    expect(storeInsert.owner_id).toBe("u-owner");

    expect(revalidatePathMock).toHaveBeenCalledWith("/stores");
  });

  it("skips owner update when no owner_id is given", async () => {
    asAdmin({ stores: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: { id: "new-store" }, error: null });

    const fd = buildFormData({ name: "X", slug: "x" });
    await createStore(fd);

    const profileUpdate = admin.chainsForTable("profiles");
    expect(profileUpdate).toHaveLength(0);
  });

  it("throws when the store insert fails", async () => {
    asAdmin({ stores: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "insert failed" } });

    const fd = buildFormData({ name: "X", slug: "x" });
    await expect(createStore(fd)).rejects.toThrow("insert failed");
  });

  // P66: auto-create primary GSTIN on store create
  it("creates a primary gst_numbers row when form has a valid gstin", async () => {
    asAdmin({ stores: ["create"] });
    const admin = getAdminClient();
    // Order: (1) code uniqueness check, (2) store insert, (3) owner update, (4) demote RPC, (5) gst insert
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: { id: "new-store" }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.setRpcResult("demote_other_primaries", { data: 0, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      name: "New Store",
      slug: "new-store",
      owner_id: "u-owner",
      gstin: "29ABCDE1234F1Z5",
    });
    await createStore(fd);

    const gstChains = admin.chainsForTable("gst_numbers");
    const gstInsert = gstChains.flatMap((c) => c).find((c) => c.method === "insert");
    expect(gstInsert).toBeDefined();
    const insertArg = gstInsert!.args[0] as Record<string, unknown>;
    expect(insertArg).toMatchObject({
      store_id: "new-store",
      gstin: "29ABCDE1234F1Z5",
      legal_name: "New Store",
      is_primary: true,
      is_active: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/gst-numbers");
  });

  it("does NOT create a gst_numbers row when form omits the gstin field (optional)", async () => {
    asAdmin({ stores: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: { id: "new-store" }, error: null });

    const fd = buildFormData({ name: "X", slug: "x" });
    await createStore(fd);

    const gstChains = admin.chainsForTable("gst_numbers");
    expect(gstChains).toHaveLength(0);
  });

  it("throws when the gstin field has an invalid format", async () => {
    asAdmin({ stores: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: { id: "new-store" }, error: null });

    const fd = buildFormData({
      name: "X",
      slug: "x",
      gstin: "not-a-gstin",
    });
    await expect(createStore(fd)).rejects.toThrow(/15-character/);
  });
});

describe("updateStoreSetting", () => {
  it.each([
    "store_policies",
    "payment_config",
    "gst_config",
  ])("updates existing %s setting", async (key) => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { id: "set-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ min_order: "100" });
    await updateStoreSetting(key, fd);

    const updateArg = admin.chainsForTable("settings")[1]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(updateArg.group_name).toBe(key === "store_policies" ? "store" : key === "payment_config" ? "payment" : "gst");
  });

  it.each([
    "store_policies",
    "payment_config",
    "gst_config",
  ])("inserts new %s setting when none exists", async (key) => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ min_order: "100" });
    await updateStoreSetting(key, fd);

    const insertArg = admin.chainsForTable("settings")[1]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.key).toBe(key);
  });

  it("throws on unknown setting key", async () => {
    asAdmin({ stores: ["edit"] });
    const fd = buildFormData({});
    await expect(updateStoreSetting("unknown_key", fd)).rejects.toThrow(/Unknown setting key/);
  });

  it("revalidates /settings on success", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { id: "set-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ min_order: "100" });
    await updateStoreSetting("store_policies", fd);
    expect(revalidatePathMock).toHaveBeenCalledWith("/settings");
  });
});

// P34: maintenance / grace-period settings
describe("getAppMaintenance", () => {
  it("returns the default when the setting is missing", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const result = await getAppMaintenance();
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("maintenance");
    expect(result.message).toBe("");
    expect(result.etaHours).toBeNull();
  });

  it("normalizes a valid stored value", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: {
        value: { enabled: true, reason: "technical", message: "Down", etaHours: 4 },
      },
      error: null,
    });
    const result = await getAppMaintenance();
    expect(result.enabled).toBe(true);
    expect(result.reason).toBe("technical");
    expect(result.message).toBe("Down");
    expect(result.etaHours).toBe(4);
  });

  it("falls back to 'maintenance' for an unknown reason", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: { value: { enabled: true, reason: "weird", message: "" } },
      error: null,
    });
    const result = await getAppMaintenance();
    expect(result.reason).toBe("maintenance");
  });

  it("clamps negative etaHours to null", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: { value: { enabled: true, reason: "operations", message: "", etaHours: -3 } },
      error: null,
    });
    const result = await getAppMaintenance();
    expect(result.etaHours).toBeNull();
  });
});

describe("getStoreMaintenanceMap", () => {
  it("returns an empty map when the setting is missing", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const result = await getStoreMaintenanceMap();
    expect(result).toEqual({});
  });

  it("returns a normalized map of storeId → maintenance", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: {
        value: {
          "s-1": { enabled: true, reason: "technical", message: "Down", etaHours: 2 },
          "s-2": { enabled: false, reason: "maintenance", message: "", etaHours: null },
        },
      },
      error: null,
    });
    const result = await getStoreMaintenanceMap();
    expect(result["s-1"]?.enabled).toBe(true);
    expect(result["s-1"]?.reason).toBe("technical");
    expect(result["s-2"]?.enabled).toBe(false);
  });
});

describe("getCategoryDeletionGraceDays", () => {
  it("returns 30 (default) when the setting is missing", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const result = await getCategoryDeletionGraceDays();
    expect(result).toBe(30);
  });

  it("returns the configured value when stored as a number", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: { value: 14 }, error: null });
    const result = await getCategoryDeletionGraceDays();
    expect(result).toBe(14);
  });
});

describe("updateAppMaintenance", () => {
  it("rejects non-Super-Admin callers", async () => {
    asAdmin({ settings: ["edit"] });
    const fd = buildFormData({ enabled: "true", reason: "maintenance" });
    const result = await runAction(updateAppMaintenance, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/Only Super Admin/);
  });

  it("Super Admin toggles on with a reason, message, and ETA", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: "set-1" }, error: null }, // existing lookup
      { data: null, error: null }, // update
    );
    const fd = buildFormData({
      enabled: "true",
      reason: "operations",
      message: "Brief outage",
      etaHours: "3",
    });
    await updateAppMaintenance(fd);

    // The mock records .update()'s payload as a raw object. The
    // action issues one .update() call on the settings table (after
    // the existing-row lookup). Find the .update() call whose
    // associated .from() was "settings" — easier: just find any
    // .update() call and check its payload.
    const updateCalls = admin.calls.filter((c) => c.method === "update");
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const payload = JSON.stringify(updateCalls[0].args[0]);
    expect(payload).toContain("operations");
    expect(payload).toContain("Brief outage");
    expect(payload).toContain("3");
  });

  it("Super Admin toggles off", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: "set-1" }, error: null },
      { data: null, error: null },
    );
    const fd = buildFormData({ enabled: "false", reason: "maintenance" });
    await updateAppMaintenance(fd);
    const updateCalls = admin.calls.filter((c) => c.method === "update");
    const payload = JSON.stringify(updateCalls[0].args[0]);
    expect(payload).toContain('"enabled":false');
  });

  it("revalidates the maintenance page and the layout", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: "set-1" }, error: null },
      { data: null, error: null },
    );
    const fd = buildFormData({ enabled: "true", reason: "maintenance" });
    await updateAppMaintenance(fd);
    expect(revalidatePathMock).toHaveBeenCalledWith("/maintenance");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});

describe("updateStoreMaintenance", () => {
  it("Manager can only toggle their own store", async () => {
    // Manager for s-1 trying to toggle s-2 → throws
    asAdmin({ settings: ["edit"] });
    setServerUser({ id: "mgr-1", email: "mgr@example.com" });
    const admin = getAdminClient();
    // 1) profile lookup to check caller's store
    admin.setResponses({
      data: { store_id: "s-1" },
      error: null,
    });
    const fd = buildFormData({ store_id: "s-2", enabled: "true" });
    const result = await runAction(updateStoreMaintenance, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/their own store/);
  });

  it("Super Admin toggling a store OFF cascades (inactivates products, unassigns categories)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    // 1) existing setting lookup
    // 2) settings.update
    // 3) products.update (cascade)
    // 4) store_categories.delete (cascade)
    admin.setResponses(
      { data: { id: "set-1", value: {} }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    );
    const fd = buildFormData({
      store_id: "s-1",
      enabled: "false",
      reason: "maintenance",
    });
    await updateStoreMaintenance(fd);

    // verify a products update with cascade_locked filter was issued
    const eqCalls = admin.calls.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "cascade_locked" && c.args[1] === true)).toBe(true);
    // verify a store_categories delete was issued
    expect(admin.calls.filter((c) => c.method === "delete").length).toBeGreaterThanOrEqual(1);
  });

  it("Super Admin toggling a store ON does NOT cascade", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: "set-1", value: {} }, error: null },
      { data: null, error: null },
    );
    const fd = buildFormData({
      store_id: "s-1",
      enabled: "true",
      reason: "maintenance",
    });
    await updateStoreMaintenance(fd);

    // No products update (no .neq()) and no delete should have fired
    expect(admin.calls.filter((c) => c.method === "neq").length).toBe(0);
    expect(admin.calls.filter((c) => c.method === "delete").length).toBe(0);
  });
});
