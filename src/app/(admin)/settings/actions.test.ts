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
import { makeStore } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getStoreSettings,
  updateStore,
  createStore,
  updateStoreSetting,
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
    admin.enqueueResponse({ data: { id: "new-store" }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      name: "New Store",
      slug: "new-store",
      owner_id: "u-owner",
    });
    const result = await createStore(fd);

    expect(result).toEqual({ id: "new-store" });

    const storeInsert = admin.chainsForTable("stores")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(storeInsert.name).toBe("New Store");
    expect(storeInsert.slug).toBe("new-store");
    expect(storeInsert.owner_id).toBe("u-owner");

    expect(revalidatePathMock).toHaveBeenCalledWith("/stores");
  });

  it("skips owner update when no owner_id is given", async () => {
    asAdmin({ stores: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { id: "new-store" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ name: "X", slug: "x" });
    await createStore(fd);

    const profileUpdate = admin.chainsForTable("profiles");
    expect(profileUpdate).toHaveLength(0);
  });

  it("throws when the store insert fails", async () => {
    asAdmin({ stores: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "insert failed" } });

    const fd = buildFormData({ name: "X", slug: "x" });
    await expect(createStore(fd)).rejects.toThrow("insert failed");
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
