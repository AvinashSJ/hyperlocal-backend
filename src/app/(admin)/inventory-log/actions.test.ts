import { describe, it, expect, beforeEach } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../test/mocks/supabase-clients";
import {
  asAdmin,
  resetPermissionMock,
  assertPermissionMock,
} from "../../../../test/mocks/require-permission";
import { makeInventoryLog } from "../../../../test/fixtures/factories";

import { getInventoryLogs } from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  assertPermissionMock.mockClear();
});

describe("getInventoryLogs (read-only)", () => {
  it("returns logs ordered by created_at desc with product/variant joins", async () => {
    const admin = getAdminClient();
    const l1 = makeInventoryLog({ id: "log-1", change_type: "manual_adjustment" });
    const l2 = makeInventoryLog({ id: "log-2", change_type: "order_placed" });
    admin.setResponses({ data: [l1, l2], error: null });

    const result = await getInventoryLogs();
    expect(result).toHaveLength(2);

    const chains = admin.chainsForTable("inventory_log");
    const selectCall = chains[0].find((c) => c.method === "select")!;
    expect(selectCall.args[0]).toBe("*, products!inner(name, store_id), product_variants(name)");
    const orderCall = chains[0].find((c) => c.method === "order");
    expect(orderCall).toBeDefined();
    expect(orderCall!.args[0]).toBe("created_at");
    expect((orderCall!.args[1] as { ascending?: boolean })?.ascending).toBe(false);
  });

  it("does NOT call assertPermission (read-only, no perm gate)", async () => {
    // inventory_log is in PERMISSION_MODULES as ["view"] only. The actions
    // file does NOT call assertPermission — it's a free read. Test locks in
    // the no-permission-check behavior.
    asAdmin({ inventory_log: [] });
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });

    await getInventoryLogs();
    expect(assertPermissionMock).not.toHaveBeenCalled();
  });

  it("applies eq filter on products.store_id when storeId is provided", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getInventoryLogs("s-1");

    const chains = admin.chainsForTable("inventory_log");
    const eqCall = chains[0].find((c) => c.method === "eq");
    expect(eqCall).toBeDefined();
    expect(eqCall!.args).toEqual(["products.store_id", "s-1"]);
  });

  it("does NOT apply store_id eq when storeId is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getInventoryLogs(null);

    const chains = admin.chainsForTable("inventory_log");
    expect(chains[0].some((c) => c.method === "eq")).toBe(false);
  });

  it("does NOT apply store_id eq when storeId is undefined", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getInventoryLogs();

    const chains = admin.chainsForTable("inventory_log");
    expect(chains[0].some((c) => c.method === "eq")).toBe(false);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const result = await getInventoryLogs();
    expect(result).toEqual([]);
  });

  it("throws when error is returned", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "db down" } });
    await expect(getInventoryLogs()).rejects.toThrow(/db down/);
  });
});
