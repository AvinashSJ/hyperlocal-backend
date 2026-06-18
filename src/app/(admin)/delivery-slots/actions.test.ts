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
import { makeDeliverySlot } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getDeliverySlots,
  createDeliverySlot,
  updateDeliverySlot,
  deleteDeliverySlot,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getDeliverySlots", () => {
  it("returns slots ordered by start_time asc, with inner join on delivery_zones", async () => {
    const admin = getAdminClient();
    const s1 = makeDeliverySlot({ id: "sl-1", name: "Morning", start_time: "08:00", zone_id: "z-1" });
    const s2 = makeDeliverySlot({ id: "sl-2", name: "Evening", start_time: "18:00", zone_id: "z-1" });
    admin.setResponses({ data: [s1, s2], error: null });

    const slots = await getDeliverySlots();
    expect(slots).toHaveLength(2);

    const chains = admin.chainsForTable("delivery_slots");
    const selectCall = chains[0].find((c) => c.method === "select")!;
    expect(selectCall.args[0]).toBe("*, delivery_zones!inner(store_id)");
    const orderCall = chains[0].find((c) => c.method === "order");
    expect(orderCall).toBeDefined();
    expect(orderCall!.args[0]).toBe("start_time");
  });

  it("applies eq filter on delivery_zones.store_id when storeId provided", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getDeliverySlots("s-1");

    const chains = admin.chainsForTable("delivery_slots");
    const eqCall = chains[0].find((c) => c.method === "eq");
    expect(eqCall).toBeDefined();
    expect(eqCall!.args).toEqual(["delivery_zones.store_id", "s-1"]);
  });

  it("does NOT apply eq when storeId is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getDeliverySlots(null);

    const chains = admin.chainsForTable("delivery_slots");
    expect(chains[0].some((c) => c.method === "eq")).toBe(false);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const slots = await getDeliverySlots();
    expect(slots).toEqual([]);
  });

  it("throws when error is returned", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "db down" } });
    await expect(getDeliverySlots()).rejects.toThrow(/db down/);
  });
});

describe("createDeliverySlot", () => {
  it("rejects users without delivery_slots:create permission", async () => {
    asAdmin({ delivery_slots: ["view"] });
    const fd = buildFormData({
      name: "Morning",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
    });
    await expect(createDeliverySlot(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when name is empty", async () => {
    asAdmin({ delivery_slots: ["create"] });
    const fd = buildFormData({
      name: "",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
    });
    await expect(createDeliverySlot(fd)).rejects.toThrow(/Slot name is required/);
  });

  it("throws when zone_id is empty", async () => {
    asAdmin({ delivery_slots: ["create"] });
    const fd = buildFormData({
      name: "Morning",
      zone_id: "",
      start_time: "08:00",
      end_time: "10:00",
    });
    await expect(createDeliverySlot(fd)).rejects.toThrow(/Zone ID is required/);
  });

  it("throws when start_time is empty", async () => {
    asAdmin({ delivery_slots: ["create"] });
    const fd = buildFormData({
      name: "Morning",
      zone_id: "z-1",
      start_time: "",
      end_time: "10:00",
    });
    await expect(createDeliverySlot(fd)).rejects.toThrow(/Start and end times are required/);
  });

  it("throws when end_time is empty", async () => {
    asAdmin({ delivery_slots: ["create"] });
    const fd = buildFormData({
      name: "Morning",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "",
    });
    await expect(createDeliverySlot(fd)).rejects.toThrow(/Start and end times are required/);
  });

  it("inserts a slot with parsed available_days (comma-separated ints, NaN filtered)", async () => {
    asAdmin({ delivery_slots: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Morning Slot",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
      available_days: "1, 2, 3,foo,5",
      capacity: 50,
      is_active: "on",
    });
    await runAction(createDeliverySlot, fd);

    const chains = admin.chainsForTable("delivery_slots");
    const insertCall = chains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg).toEqual({
      name: "Morning Slot",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
      available_days: [1, 2, 3, 5],
      capacity: 50,
      is_active: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/delivery-slots");
  });

  it("defaults available_days to [] when missing or empty", async () => {
    asAdmin({ delivery_slots: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "X",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
      available_days: "",
    });
    await runAction(createDeliverySlot, fd);

    const insertArg = admin.chainsForTable("delivery_slots")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.available_days).toEqual([]);
  });

  it("defaults capacity to 0 when missing", async () => {
    asAdmin({ delivery_slots: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "X",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
    });
    await runAction(createDeliverySlot, fd);

    const insertArg = admin.chainsForTable("delivery_slots")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.capacity).toBe(0);
  });

  it("treats is_active='true' as true", async () => {
    asAdmin({ delivery_slots: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "X",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
      is_active: "true",
    });
    await runAction(createDeliverySlot, fd);

    const insertArg = admin.chainsForTable("delivery_slots")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_active).toBe(true);
  });

  it("treats is_active absent as false", async () => {
    asAdmin({ delivery_slots: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "X",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
    });
    await runAction(createDeliverySlot, fd);

    const insertArg = admin.chainsForTable("delivery_slots")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_active).toBe(false);
  });

  it("throws when insert returns an error", async () => {
    asAdmin({ delivery_slots: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint" } });
    const fd = buildFormData({
      name: "X",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
    });
    const result = await runAction(createDeliverySlot, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
  });
});

describe("updateDeliverySlot", () => {
  it("rejects users without delivery_slots:edit permission", async () => {
    asAdmin({ delivery_slots: ["view"] });
    const fd = buildFormData({
      name: "X",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
    });
    await expect(updateDeliverySlot("sl-1", fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when name is empty (only name check on update)", async () => {
    asAdmin({ delivery_slots: ["edit"] });
    const fd = buildFormData({
      name: "",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
    });
    await expect(updateDeliverySlot("sl-1", fd)).rejects.toThrow(/Slot name is required/);
  });

  it("does NOT require zone_id/start_time/end_time on update", async () => {
    asAdmin({ delivery_slots: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "X",
      zone_id: "",
      start_time: "",
      end_time: "",
    });
    await runAction((f) => updateDeliverySlot("sl-1", f), fd);

    const chains = admin.chainsForTable("delivery_slots");
    const updateArg = chains[0].find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(updateArg.zone_id).toBe("");
    expect(updateArg.start_time).toBe("");
    expect(updateArg.end_time).toBe("");
  });

  it("updates the slot by id with parsed available_days", async () => {
    asAdmin({ delivery_slots: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Updated Slot",
      zone_id: "z-2",
      start_time: "09:00",
      end_time: "11:00",
      available_days: "1,2,3",
      capacity: 100,
      is_active: "on",
    });
    await runAction((f) => updateDeliverySlot("sl-1", f), fd);

    const chains = admin.chainsForTable("delivery_slots");
    const updateCall = chains[0].find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toMatchObject({
      name: "Updated Slot",
      zone_id: "z-2",
      start_time: "09:00",
      end_time: "11:00",
      available_days: [1, 2, 3],
      capacity: 100,
      is_active: true,
    });
    const eqCall = chains[0].find((c) => c.method === "eq")!;
    expect(eqCall.args).toEqual(["id", "sl-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/delivery-slots");
  });

  it("throws when update returns an error", async () => {
    asAdmin({ delivery_slots: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint" } });
    const fd = buildFormData({
      name: "X",
      zone_id: "z-1",
      start_time: "08:00",
      end_time: "10:00",
    });
    const result = await runAction((f) => updateDeliverySlot("sl-1", f), fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
  });
});

describe("deleteDeliverySlot", () => {
  it("rejects users without delivery_slots:delete permission", async () => {
    asAdmin({ delivery_slots: ["view", "edit"] });
    await expect(deleteDeliverySlot("sl-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("deletes the slot by id and revalidates", async () => {
    asAdmin({ delivery_slots: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    await deleteDeliverySlot("sl-1");

    const chains = admin.chainsForTable("delivery_slots");
    expect(chains[0].some((c) => c.method === "delete")).toBe(true);
    expect(chains[0].find((c) => c.method === "eq")!.args).toEqual(["id", "sl-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/delivery-slots");
  });

  it("throws when delete returns an error", async () => {
    asAdmin({ delivery_slots: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fk violation" } });
    await expect(deleteDeliverySlot("sl-1")).rejects.toThrow(/fk violation/);
  });
});
