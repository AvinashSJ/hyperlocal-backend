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
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { buildFormData } from "../../../../test/fixtures/formdata";
import { makeDeliveryZone } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getDeliveryZones", () => {
  it("returns zones ordered by name asc, all stores when no storeId", async () => {
    const admin = getAdminClient();
    const z1 = makeDeliveryZone({ id: "z-1", name: "Alpha Zone", store_id: "s-1" });
    const z2 = makeDeliveryZone({ id: "z-2", name: "Beta Zone", store_id: "s-1" });
    admin.setResponses({ data: [z1, z2], error: null });

    const zones = await getDeliveryZones();
    expect(zones).toHaveLength(2);
    expect(zones[0].id).toBe("z-1");

    const chains = admin.chainsForTable("delivery_zones");
    expect(chains[0].some((c) => c.method === "order")).toBe(true);
    expect(chains[0].some((c) => c.method === "eq")).toBe(false);
  });

  it("applies store_id eq when storeId is provided", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getDeliveryZones("s-1");

    const chains = admin.chainsForTable("delivery_zones");
    const eqCall = chains[0].find((c) => c.method === "eq");
    expect(eqCall).toBeDefined();
    expect(eqCall!.args).toEqual(["store_id", "s-1"]);
  });

  it("does NOT apply store_id eq when storeId is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getDeliveryZones(null);

    const chains = admin.chainsForTable("delivery_zones");
    expect(chains[0].some((c) => c.method === "eq")).toBe(false);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const zones = await getDeliveryZones();
    expect(zones).toEqual([]);
  });

  it("throws when error is returned", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "db down" } });
    await expect(getDeliveryZones()).rejects.toThrow(/db down/);
  });
});

describe("createDeliveryZone", () => {
  it("rejects users without delivery_zones:create permission", async () => {
    asAdmin({ delivery_zones: ["view"] });
    const fd = buildFormData({ name: "Z", store_id: "s-1", pincodes: "560001" });
    await expect(createDeliveryZone(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when name is empty", async () => {
    asAdmin({ delivery_zones: ["create"] });
    const fd = buildFormData({ name: "", store_id: "s-1", pincodes: "560001" });
    await expect(createDeliveryZone(fd)).rejects.toThrow(/Zone name is required/);
  });

  it("throws when store_id is empty", async () => {
    asAdmin({ delivery_zones: ["create"] });
    const fd = buildFormData({ name: "Z", store_id: "", pincodes: "560001" });
    await expect(createDeliveryZone(fd)).rejects.toThrow(/Store ID is required/);
  });

  it("inserts a zone with parsed pincodes (comma-separated, trimmed, non-empty)", async () => {
    asAdmin({ delivery_zones: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "North Zone",
      store_id: "s-1",
      pincodes: " 560001 , 560002,560003, ,",
      radius_km: 5,
      delivery_charge: 30,
      free_delivery_min_order: 200,
      is_active: "on",
      is_express: "true",
    });
    await runAction(createDeliveryZone, fd);

    const chains = admin.chainsForTable("delivery_zones");
    const insertCall = chains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg).toEqual({
      name: "North Zone",
      store_id: "s-1",
      pincodes: ["560001", "560002", "560003"],
      radius_km: 5,
      delivery_charge: 30,
      free_delivery_min_order: 200,
      min_order_value: null,
      max_order_value: null,
      min_distance_km: null,
      max_distance_km: null,
      is_active: true,
      is_express: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/delivery-zones");
  });

  it("defaults pincodes to [] when field is missing or empty", async () => {
    asAdmin({ delivery_zones: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "Z", store_id: "s-1", pincodes: "" });
    await runAction(createDeliveryZone, fd);

    const insertArg = admin.chainsForTable("delivery_zones")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.pincodes).toEqual([]);
  });

  it("treats is_active='on' and is_active='true' both as true", async () => {
    asAdmin({ delivery_zones: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Z",
      store_id: "s-1",
      pincodes: "560001",
      is_active: "true",
      is_express: "on",
    });
    await runAction(createDeliveryZone, fd);

    const insertArg = admin.chainsForTable("delivery_zones")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_active).toBe(true);
    expect(insertArg.is_express).toBe(true);
  });

  it("treats is_active absent or 'off' as false", async () => {
    asAdmin({ delivery_zones: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Z",
      store_id: "s-1",
      pincodes: "560001",
      is_active: "off",
    });
    await runAction(createDeliveryZone, fd);

    const insertArg = admin.chainsForTable("delivery_zones")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_active).toBe(false);
    expect(insertArg.is_express).toBe(false);
  });

  it("defaults numeric fields to 0 when missing", async () => {
    asAdmin({ delivery_zones: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "Z", store_id: "s-1", pincodes: "560001" });
    await runAction(createDeliveryZone, fd);

    const insertArg = admin.chainsForTable("delivery_zones")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.radius_km).toBe(0);
    expect(insertArg.delivery_charge).toBe(0);
    expect(insertArg.free_delivery_min_order).toBe(0);
  });

  it("parses condition fields as null when empty, as numbers when provided", async () => {
    asAdmin({ delivery_zones: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Z",
      store_id: "s-1",
      pincodes: "560001",
      min_order_value: "100",
      max_order_value: "500",
      min_distance_km: "1.5",
      max_distance_km: "10",
    });
    await runAction(createDeliveryZone, fd);

    const insertArg = admin.chainsForTable("delivery_zones")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.min_order_value).toBe(100);
    expect(insertArg.max_order_value).toBe(500);
    expect(insertArg.min_distance_km).toBe(1.5);
    expect(insertArg.max_distance_km).toBe(10);
  });

  it("defaults condition fields to null when missing", async () => {
    asAdmin({ delivery_zones: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "Z", store_id: "s-1", pincodes: "560001" });
    await runAction(createDeliveryZone, fd);

    const insertArg = admin.chainsForTable("delivery_zones")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.min_order_value).toBeNull();
    expect(insertArg.max_order_value).toBeNull();
    expect(insertArg.min_distance_km).toBeNull();
    expect(insertArg.max_distance_km).toBeNull();
  });

  it("throws when insert returns an error", async () => {
    asAdmin({ delivery_zones: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint" } });
    const fd = buildFormData({ name: "Z", store_id: "s-1", pincodes: "560001" });
    const result = await runAction(createDeliveryZone, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
  });
});

describe("updateDeliveryZone", () => {
  it("rejects users without delivery_zones:edit permission", async () => {
    asAdmin({ delivery_zones: ["view"] });
    const fd = buildFormData({ name: "Z", store_id: "s-1", pincodes: "560001" });
    await expect(updateDeliveryZone("z-1", fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when name is empty", async () => {
    asAdmin({ delivery_zones: ["edit"] });
    const fd = buildFormData({ name: "", store_id: "s-1", pincodes: "560001" });
    await expect(updateDeliveryZone("z-1", fd)).rejects.toThrow(/Zone name is required/);
  });

  it("does NOT require store_id on update", async () => {
    asAdmin({ delivery_zones: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "Z", store_id: "", pincodes: "560001" });
    await runAction((f) => updateDeliveryZone("z-1", f), fd);

    const chains = admin.chainsForTable("delivery_zones");
    const updateCall = chains[0].find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg.store_id).toBe("");
  });

  it("updates the zone by id and revalidates", async () => {
    asAdmin({ delivery_zones: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Updated",
      store_id: "s-2",
      pincodes: "560001,560002",
      radius_km: 10,
      delivery_charge: 50,
      free_delivery_min_order: 500,
      min_order_value: "200",
      max_order_value: "1000",
      min_distance_km: "2",
      max_distance_km: "15",
      is_active: "on",
      is_express: "true",
    });
    await runAction((f) => updateDeliveryZone("z-1", f), fd);

    const chains = admin.chainsForTable("delivery_zones");
    const updateCall = chains[0].find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toMatchObject({
      name: "Updated",
      store_id: "s-2",
      pincodes: ["560001", "560002"],
      radius_km: 10,
      delivery_charge: 50,
      free_delivery_min_order: 500,
      min_order_value: 200,
      max_order_value: 1000,
      min_distance_km: 2,
      max_distance_km: 15,
      is_active: true,
      is_express: true,
    });
    const eqCall = chains[0].find((c) => c.method === "eq")!;
    expect(eqCall.args).toEqual(["id", "z-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/delivery-zones");
  });

  it("throws when update returns an error", async () => {
    asAdmin({ delivery_zones: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint" } });
    const fd = buildFormData({ name: "Z", store_id: "s-1", pincodes: "560001" });
    const result = await runAction((f) => updateDeliveryZone("z-1", f), fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
  });
});

describe("deleteDeliveryZone", () => {
  it("rejects users without delivery_zones:delete permission", async () => {
    asAdmin({ delivery_zones: ["view", "edit"] });
    await expect(deleteDeliveryZone("z-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("deletes the zone by id and revalidates", async () => {
    asAdmin({ delivery_zones: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    await deleteDeliveryZone("z-1");

    const chains = admin.chainsForTable("delivery_zones");
    expect(chains[0].some((c) => c.method === "delete")).toBe(true);
    expect(chains[0].find((c) => c.method === "eq")!.args).toEqual(["id", "z-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/delivery-zones");
  });

  it("throws when delete returns an error", async () => {
    asAdmin({ delivery_zones: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fk violation" } });
    await expect(deleteDeliveryZone("z-1")).rejects.toThrow(/fk violation/);
  });
});
