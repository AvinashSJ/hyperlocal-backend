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
import {
  makeStore,
  makeCommission,
  makeCommissionPayment,
} from "../../../../test/fixtures/factories";

import {
  getCommissions,
  getCommissionPayments,
  getCommissionById,
  generateCommission,
  generateAllCommissions,
  recordPayment,
  deleteCommissionPayment,
  getStoresLight,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
  // P27: pre-set the server user so createClient().auth.getUser() returns a
  // real user. Without this, the queue's default response ({ data: { user: null } })
  // would be returned and the action's created_by would be null.
  setServerUser({ id: "u-1", email: "admin@test.com" });
});

describe("getStoresLight", () => {
  it("returns the light store list with commission_rate", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        makeStore({ id: "s-1", commission_rate: 5 }),
        makeStore({ id: "s-2", commission_rate: null }),
      ],
      error: null,
    });

    const result = await getStoresLight();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("commission_rate");
  });
});

describe("getCommissions", () => {
  it("rejects users without commissions:view permission", async () => {
    asAdmin({});
    await expect(getCommissions()).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns the commission list with payment counts", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeCommission({ id: "c-1" }), makeCommission({ id: "c-2" })],
      error: null,
    });
    admin.enqueueResponse({
      data: [
        { commission_id: "c-1" },
        { commission_id: "c-1" },
        { commission_id: "c-2" },
      ],
      error: null,
    });

    const result = await getCommissions();
    expect(result).toHaveLength(2);
    const c1 = result.find((c) => c.id === "c-1");
    expect(c1?.payment_count).toBe(2);
  });

  it("filters by storeId when provided", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    await getCommissions("s-1");
    const commissionChain = admin.chainsForTable("store_commissions")[0];
    expect(commissionChain.find((c) => c.method === "eq")).toEqual({
      method: "eq",
      args: ["store_id", "s-1"],
    });
  });

  it("returns empty array when data is null", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: [], error: null });

    const result = await getCommissions();
    expect(result).toEqual([]);
  });

  // P46 regression: getCommissions used to map `c.total_amount` (a
  // column on the `orders` table, not on `store_commissions`) which
  // produced NaN and rendered as "₹NaN" in the list. This test
  // asserts the value round-trips as the real `total_revenue` number.
  it("P46: returns total_revenue as a finite number (not NaN from wrong column)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeCommission({ id: "c-1", total_revenue: 12345.67, commission_amount: 1234.57, balance_due: 1234.57 })],
      error: null,
    });
    admin.enqueueResponse({ data: [], error: null });

    const result = await getCommissions();
    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.total_revenue).toBe(12345.67);
    expect(Number.isNaN(row.total_revenue)).toBe(false);
    expect(row.commission_amount).toBe(1234.57);
    expect(row.balance_due).toBe(1234.57);
  });
});

describe("getCommissionById", () => {
  it("rejects users without commissions:view permission", async () => {
    asAdmin({});
    await expect(getCommissionById("c-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns null when id is empty", async () => {
    asSuperAdmin();
    const result = await getCommissionById("");
    expect(result).toBeNull();
  });

  it("returns null when the commission does not exist", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    const result = await getCommissionById("missing");
    expect(result).toBeNull();
  });

  it("returns the commission when found", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { ...makeCommission({ id: "c-1" }), stores: { name: "FreshCart" } },
      error: null,
    });
    const result = await getCommissionById("c-1");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("c-1");
    expect(result?.store_name).toBe("FreshCart");
  });
});

describe("getCommissionPayments", () => {
  it("rejects users without commissions:view permission", async () => {
    asAdmin({});
    await expect(getCommissionPayments("c-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns payments for a commission", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeCommissionPayment({ commission_id: "c-1" })],
      error: null,
    });

    const result = await getCommissionPayments("c-1");
    expect(result).toHaveLength(1);
  });

  it("returns empty array when data is null", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    const result = await getCommissionPayments("c-1");
    expect(result).toEqual([]);
  });
});

describe("generateCommission", () => {
  it("rejects users without commissions:create permission", async () => {
    asAdmin({ commissions: ["view"] });
    const fd = buildFormData({ store_id: "s-1", period_start: "2025-01-01", period_end: "2025-01-31" });
    await expect(generateCommission(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when store_id is missing", async () => {
    asAdmin({ commissions: ["create"] });
    const fd = buildFormData({ period_start: "2025-01-01", period_end: "2025-01-31" });
    await expect(generateCommission(fd)).rejects.toThrow(/Store.*required/);
  });

  it("throws when period_start is missing", async () => {
    asAdmin({ commissions: ["create"] });
    const fd = buildFormData({ store_id: "s-1", period_end: "2025-01-31" });
    await expect(generateCommission(fd)).rejects.toThrow(/period start.*required/);
  });

  it("throws when period_end is missing", async () => {
    asAdmin({ commissions: ["create"] });
    const fd = buildFormData({ store_id: "s-1", period_start: "2025-01-01" });
    await expect(generateCommission(fd)).rejects.toThrow(/period end.*required/);
  });

  it("throws when period_start > period_end", async () => {
    asAdmin({ commissions: ["create"] });
    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-31",
      period_end: "2025-01-01",
    });
    await expect(generateCommission(fd)).rejects.toThrow(/on or before/);
  });

  it("throws when the store is not found", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "Not found" } });

    const fd = buildFormData({ store_id: "s-1", period_start: "2025-01-01", period_end: "2025-01-31" });
    await expect(generateCommission(fd)).rejects.toThrow("Store not found");
  });

  it("computes commission_amount = total_revenue * (rate/100) and uses server user as created_by", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 10 }),
      error: null,
    });
    admin.enqueueResponse({
      data: [
        { total_amount: 1000 },
        { total_amount: 500 },
        { total_amount: 2500 },
      ],
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null }); // store_commissions insert

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    await generateCommission(fd);

    const insertArg = admin.chainsForTable("store_commissions")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.total_revenue).toBe(4000);
    expect(insertArg.commission_rate).toBe(10);
    expect(insertArg.commission_amount).toBe(400);
    expect(insertArg.balance_due).toBe(400);
    expect(insertArg.status).toBe("unpaid");
    // P27: created_by comes from the server user's session
    expect(insertArg.created_by).toBe("u-1");
  });

  it("sets status to 'unpaid' when commission_amount > 0", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 10 }),
      error: null,
    });
    admin.enqueueResponse({
      data: [{ total_amount: 1000 }],
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    await generateCommission(fd);

    const insertArg = admin.chainsForTable("store_commissions")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.status).toBe("unpaid");
  });

  it("P27: falls back to the global default commission rate when the store has none", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    // store has commission_rate = 0 (treated the same as null by the source)
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 0 }),
      error: null,
    });
    // settings lookup returns a default rate of 7%
    admin.enqueueResponse({
      data: { value: { rate: 7 } },
      error: null,
    });
    // orders → 1000 → 7% = 70
    admin.enqueueResponse({
      data: [{ total_amount: 1000 }],
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    await generateCommission(fd);

    const insertArg = admin.chainsForTable("store_commissions")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.commission_rate).toBe(7);
    expect(insertArg.commission_amount).toBe(70);
  });

  it("P27: throws when no rate is available (no per-store, no global default)", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    // commission_rate = 0 means "no rate" (treated same as null)
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 0 }),
      error: null,
    });
    // settings lookup returns nothing (no global default)
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    await expect(generateCommission(fd)).rejects.toThrow(/No commission rate/);
  });

  it("revalidates /commissions on success", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 10 }),
      error: null,
    });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    await generateCommission(fd);

    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions");
  });

  it("stores notes when provided", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 5 }),
      error: null,
    });
    admin.enqueueResponse({ data: [{ total_amount: 100 }], error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
      notes: "Monthly settlement",
    });
    await generateCommission(fd);

    const insertArg = admin.chainsForTable("store_commissions")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.notes).toBe("Monthly settlement");
  });
});

describe("generateAllCommissions (P27 bulk action)", () => {
  it("rejects users without commissions:create permission", async () => {
    asAdmin({ commissions: ["view"] });
    const fd = buildFormData({ period_start: "2025-01-01", period_end: "2025-01-31" });
    await expect(generateAllCommissions(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when period is missing", async () => {
    asAdmin({ commissions: ["create"] });
    const fd = buildFormData({});
    await expect(generateAllCommissions(fd)).rejects.toThrow(/required/);
  });

  it("throws when period_start > period_end", async () => {
    asAdmin({ commissions: ["create"] });
    const fd = buildFormData({
      period_start: "2025-01-31",
      period_end: "2025-01-01",
    });
    await expect(generateAllCommissions(fd)).rejects.toThrow(/on or before/);
  });

  it("returns a zero summary when there are no stores", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    const fd = buildFormData({
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    const result = await generateAllCommissions(fd);
    expect(result).toEqual({
      generated: 0,
      skipped: 0,
      total_stores: 0,
      errors: [],
    });
  });

  it("P27: generates one commission row per store (success case)", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    // 1) fetch all stores
    admin.enqueueResponse({
      data: [
        makeStore({ id: "s-1", name: "Store 1", commission_rate: 10 }),
        makeStore({ id: "s-2", name: "Store 2", commission_rate: 5 }),
      ],
      error: null,
    });
    // For each store, we need 1 enqueueResponse for orders (no settings lookup
    // because per-store rate > 0).
    admin.enqueueResponse({ data: [{ total_amount: 1000 }], error: null }); // s-1 orders
    admin.enqueueResponse({ data: null, error: null });                  // s-1 insert
    admin.enqueueResponse({ data: [{ total_amount: 2000 }], error: null }); // s-2 orders
    admin.enqueueResponse({ data: null, error: null });                  // s-2 insert

    const fd = buildFormData({
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    const result = await generateAllCommissions(fd);

    expect(result.generated).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.total_stores).toBe(2);
    expect(result.errors).toEqual([]);

    // Verify 2 insert calls happened on store_commissions
    const allInserts = admin.chainsForTable("store_commissions")
      .flatMap((c) => c.filter((call) => call.method === "insert"));
    expect(allInserts).toHaveLength(2);
  });

  it("P27: aggregates skipped stores (no rate available) in the errors array", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    // 3 stores: 1 with rate, 2 without (commission_rate: 0 is the canonical
    // "no rate" value; the makeStore factory defaults to 10 which would mask
    // the test intent).
    admin.enqueueResponse({
      data: [
        makeStore({ id: "s-1", name: "Has Rate", commission_rate: 10 }),
        makeStore({ id: "s-2", name: "No Rate A", commission_rate: 0 }),
        makeStore({ id: "s-3", name: "No Rate B", commission_rate: 0 }),
      ],
      error: null,
    });
    // s-1: orders (1000) → 10% = 100, then insert
    admin.enqueueResponse({ data: [{ total_amount: 1000 }], error: null });
    admin.enqueueResponse({ data: null, error: null });
    // s-2: settings lookup (no global default) → no insert
    admin.enqueueResponse({ data: null, error: null });
    // s-3: settings lookup (no global default) → no insert
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    const result = await generateAllCommissions(fd);

    expect(result.generated).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.total_stores).toBe(3);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].store_name).toBe("No Rate A");
    expect(result.errors[1].store_name).toBe("No Rate B");
  });

  it("P27: revalidates /commissions on success (zero-store case still revalidates)", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    const fd = buildFormData({
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    await generateAllCommissions(fd);

    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions");
  });
});

describe("recordPayment", () => {
  it("rejects users without commissions:edit permission", async () => {
    asAdmin({ commissions: ["view"] });
    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await expect(recordPayment(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when amount is NaN", async () => {
    asAdmin({ commissions: ["edit"] });
    const fd = buildFormData({ commission_id: "c-1", amount: "not-a-number" });
    await expect(recordPayment(fd)).rejects.toThrow(/amount/);
  });

  it("throws when amount is <= 0", async () => {
    asAdmin({ commissions: ["edit"] });
    const fd = buildFormData({ commission_id: "c-1", amount: "0" });
    await expect(recordPayment(fd)).rejects.toThrow(/amount/);
  });

  it("throws when the commission is not found", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "Not found" } });

    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await expect(recordPayment(fd)).rejects.toThrow("Commission not found");
  });

  it("throws when amount exceeds balance_due", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 500, status: "unpaid" },
      error: null,
    });

    const fd = buildFormData({ commission_id: "c-1", amount: "1000" });
    await expect(recordPayment(fd)).rejects.toThrow(/exceeds balance/);
  });

  it("P27: uses server user as created_by on the payment record", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 100, status: "unpaid" },
      error: null,
    });
    // P27: no more enqueueResponse for auth.getUser (it uses the server user
    // set in beforeEach).
    admin.enqueueResponse({ data: null, error: null }); // commission_payments insert
    admin.enqueueResponse({ data: null, error: null }); // store_commissions update

    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await recordPayment(fd);

    const paymentInsert = admin.chainsForTable("commission_payments")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(paymentInsert.created_by).toBe("u-1");
  });

  it("transitions status to 'paid' when newBalance = 0", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 100, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await recordPayment(fd);

    const commissionUpdate = admin.chainsForTable("store_commissions")[1]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(commissionUpdate.balance_due).toBe(0);
    expect(commissionUpdate.status).toBe("paid");
  });

  it("transitions status to 'partially_paid' when newBalance > 0", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 1000, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ commission_id: "c-1", amount: "300" });
    await recordPayment(fd);

    const commissionUpdate = admin.chainsForTable("store_commissions")[1]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(commissionUpdate.balance_due).toBe(700);
    expect(commissionUpdate.status).toBe("partially_paid");
  });

  it("stores the payment record with the right amount and notes", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 1000, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      commission_id: "c-1",
      amount: "250",
      notes: "First installment",
    });
    await recordPayment(fd);

    const paymentInsert = admin.chainsForTable("commission_payments")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(paymentInsert.commission_id).toBe("c-1");
    expect(paymentInsert.amount).toBe(250);
    expect(paymentInsert.notes).toBe("First installment");
  });

  it("revalidates /commissions AND the detail page on success", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 100, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await recordPayment(fd);

    // P46: revalidate both the list and the detail page so router.refresh()
    // picks up the new balance_due + status on the detail page immediately.
    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions");
    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions/c-1");
  });
});

describe("deleteCommissionPayment", () => {
  it("rejects users without commissions:delete permission", async () => {
    asAdmin({ commissions: ["view", "edit"] });
    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await expect(deleteCommissionPayment(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when the payment is not found", async () => {
    asAdmin({ commissions: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "Not found" } });

    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await expect(deleteCommissionPayment(fd)).rejects.toThrow("Payment not found");
  });
});
