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
import { makeDeliveryRule } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getDeliveryRules,
  createDeliveryRule,
  updateDeliveryRule,
  deleteDeliveryRule,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getDeliveryRules", () => {
  it("returns rules ordered by priority asc, all stores when no storeId", async () => {
    const admin = getAdminClient();
    const r1 = makeDeliveryRule({ id: "r-1", name: "Near Store", priority: 0, store_id: "s-1" });
    const r2 = makeDeliveryRule({ id: "r-2", name: "Far Store", priority: 10, store_id: "s-1" });
    admin.setResponses({ data: [r1, r2], error: null });

    const rules = await getDeliveryRules();
    expect(rules).toHaveLength(2);
    expect(rules[0].priority).toBe(0);

    const chains = admin.chainsForTable("delivery_rules");
    expect(chains[0].some((c) => c.method === "order")).toBe(true);
    expect(chains[0].some((c) => c.method === "eq")).toBe(false);
  });

  it("applies store_id eq when storeId is provided", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getDeliveryRules("s-1");

    const chains = admin.chainsForTable("delivery_rules");
    const eqCall = chains[0].find((c) => c.method === "eq");
    expect(eqCall).toBeDefined();
    expect(eqCall!.args).toEqual(["store_id", "s-1"]);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const rules = await getDeliveryRules();
    expect(rules).toEqual([]);
  });

  it("throws when error is returned", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "db down" } });
    await expect(getDeliveryRules()).rejects.toThrow("db down");
  });
});

describe("createDeliveryRule", () => {
  it("rejects users without delivery_rules:create permission", async () => {
    asAdmin({ delivery_rules: ["view"] });
    const fd = buildFormData({ name: "Test", store_id: "s-1", charge: "30" });
    await expect(createDeliveryRule(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("inserts a rule with all fields", async () => {
    asAdmin({ delivery_rules: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Near Store Free",
      store_id: "s-1",
      min_order_value: "500",
      max_order_value: "3000",
      min_distance_km: "0",
      max_distance_km: "3",
      charge: "0",
      priority: "1",
      is_active: "on",
    });
    await runAction(createDeliveryRule, fd);

    const chains = admin.chainsForTable("delivery_rules");
    const insertCall = chains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg).toEqual({
      name: "Near Store Free",
      store_id: "s-1",
      min_order_value: 500,
      max_order_value: 3000,
      min_distance_km: 0,
      max_distance_km: 3,
      charge: 0,
      priority: 1,
      is_active: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/delivery-rules");
  });

  it("stores null for empty optional fields", async () => {
    asAdmin({ delivery_rules: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Simple Rule",
      store_id: "s-1",
      charge: "50",
    });
    await runAction(createDeliveryRule, fd);

    const chains = admin.chainsForTable("delivery_rules");
    const insertCall = chains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg.min_order_value).toBeNull();
    expect(insertArg.max_order_value).toBeNull();
    expect(insertArg.min_distance_km).toBeNull();
    expect(insertArg.max_distance_km).toBeNull();
    expect(insertArg.priority).toBe(0);
    expect(insertArg.is_active).toBe(false);
  });

  it("throws when name is missing", async () => {
    asAdmin({ delivery_rules: ["create"] });
    const fd = buildFormData({ store_id: "s-1", charge: "30" });
    await expect(createDeliveryRule(fd)).rejects.toThrow("Rule name is required");
  });

  it("throws when store_id is missing", async () => {
    asAdmin({ delivery_rules: ["create"] });
    const fd = buildFormData({ name: "Test", charge: "30" });
    await expect(createDeliveryRule(fd)).rejects.toThrow("Store ID is required");
  });

  it("throws when insert returns an error", async () => {
    asAdmin({ delivery_rules: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint" } });

    const fd = buildFormData({ name: "Dup", store_id: "s-1", charge: "30" });
    const result = await runAction(createDeliveryRule, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
  });
});

describe("updateDeliveryRule", () => {
  it("rejects users without delivery_rules:edit permission", async () => {
    asAdmin({ delivery_rules: ["view"] });
    const fd = buildFormData({ name: "X", charge: "30" });
    await expect(updateDeliveryRule("r-1", fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("updates rule fields", async () => {
    asAdmin({ delivery_rules: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Updated Rule",
      store_id: "s-1",
      min_order_value: "1000",
      charge: "25",
      priority: "5",
      is_active: "on",
    });
    await runAction((id: string, formData: FormData) => updateDeliveryRule(id, formData), "r-1", fd);

    const chains = admin.chainsForTable("delivery_rules");
    const updateCall = chains[0].find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg.name).toBe("Updated Rule");
    expect(updateArg.charge).toBe(25);
    expect(updateArg.priority).toBe(5);
    expect(updateArg.is_active).toBe(true);

    const eqCall = chains[0].find((c) => c.method === "eq")!;
    expect(eqCall.args).toEqual(["id", "r-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/delivery-rules");
  });

  it("throws when name is missing", async () => {
    asAdmin({ delivery_rules: ["edit"] });
    const fd = buildFormData({ charge: "30" });
    await expect(updateDeliveryRule("r-1", fd)).rejects.toThrow("Rule name is required");
  });

  it("throws when update returns an error", async () => {
    asAdmin({ delivery_rules: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint" } });

    const fd = buildFormData({ name: "X", charge: "30" });
    const result = await runAction((id: string, formData: FormData) => updateDeliveryRule(id, formData), "r-1", fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
  });
});

describe("deleteDeliveryRule", () => {
  it("rejects users without delivery_rules:delete permission", async () => {
    asAdmin({ delivery_rules: ["view"] });
    await expect(deleteDeliveryRule("r-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("deletes the rule", async () => {
    asAdmin({ delivery_rules: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    await deleteDeliveryRule("r-1");

    const chains = admin.chainsForTable("delivery_rules");
    expect(chains).toHaveLength(1);
    expect(chains[0].some((c) => c.method === "delete")).toBe(true);
    expect(chains[0].find((c) => c.method === "eq")!.args).toEqual(["id", "r-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/delivery-rules");
  });

  it("throws when delete returns an error", async () => {
    asAdmin({ delivery_rules: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fk violation" } });

    await expect(deleteDeliveryRule("r-1")).rejects.toThrow("fk violation");
  });
});
