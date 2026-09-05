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
  getCommissionStoresForList,
  getCommissionPeriodsForStore,
  getCommissionPayments,
  getCommissionById,
  generateCommissionForPeriod,
  recordPayment,
  deleteCommissionPayment,
  getStoresLight,
} from "./actions";

// Mirrors getCurrentWeekRange() in actions.ts: the current Sunday-to-Sunday
// window (UTC), so tests can build period rows that skip the auto-create.
function getCurWeek(): { start: string; end: string } {
  const now = new Date();
  const dow = now.getUTCDay();
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow),
  );
  const endDate = new Date(startDate.getTime() + 7 * 86400000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { start: fmt(startDate), end: fmt(endDate) };
}

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

describe("getCommissionById (P46)", () => {
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

describe("getCommissionStoresForList: snapshot totals per store", () => {
  it("rejects users without commissions:view permission", async () => {
    asAdmin({});
    await expect(getCommissionStoresForList()).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns an empty list when there are no stores", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });
    // No commissions, no payments, no settings — none of these queries
    // are made when there are no stores (early return).
    const result = await getCommissionStoresForList();
    expect(result).toEqual([]);
  });

  it("sums STORED commission_amount per store (no order math), paid from payments", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    // 1) stores. s-2 has commission_rate: 0 to mean "no per-store rate"
    admin.enqueueResponse({
      data: [
        makeStore({ id: "s-1", name: "FreshCart", code: "FCD", commission_rate: 10 }),
        makeStore({ id: "s-2", name: "GreenMart", code: "GRM", commission_rate: 0 }),
      ],
      error: null,
    });
    // 2) commission rows (locked amounts)
    admin.enqueueResponse({
      data: [
        { id: "p-1", store_id: "s-1", period_start: "2026-04-05", period_end: "2026-04-12", commission_amount: 100 },
        { id: "p-2", store_id: "s-1", period_start: "2026-04-12", period_end: "2026-04-19", commission_amount: 50 },
        { id: "p-3", store_id: "s-2", period_start: "2026-04-05", period_end: "2026-04-12", commission_amount: 0 },
      ],
      error: null,
    });
    // 3) payments
    admin.enqueueResponse({
      data: [
        { commission_id: "p-1", amount: 50 },
        { commission_id: "p-3", amount: 200 },
      ],
      error: null,
    });
    // 4) settings (global default rate lookup) — returns nothing → default 0
    admin.enqueueResponse({ data: null, error: null });

    const result = await getCommissionStoresForList();
    expect(result).toHaveLength(2);

    const s1 = result.find((r) => r.id === "s-1")!;
    expect(s1.commission_rate).toBe(10);
    expect(s1.period_count).toBe(2);
    // total_commission = 100 + 50 (STORED, no orders consulted)
    expect(s1.total_commission).toBe(150);
    expect(s1.total_paid).toBe(50);
    expect(s1.total_balance).toBe(100);
    // last_period_end: max(end) = "2026-04-19"
    expect(s1.last_period_end).toBe("2026-04-19");

    const s2 = result.find((r) => r.id === "s-2")!;
    expect(s2.commission_rate).toBe(0);
    expect(s2.period_count).toBe(1);
    expect(s2.total_commission).toBe(0);
    expect(s2.total_paid).toBe(200);
    expect(s2.total_balance).toBe(0);
  });

  it("falls back to the global default rate when the store has no per-store rate", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeStore({ id: "s-1", name: "NoRate", code: "NR", commission_rate: 0 })],
      error: null,
    });
    admin.enqueueResponse({
      data: [{ id: "p-1", store_id: "s-1", period_start: "2026-04-05", period_end: "2026-04-12", commission_amount: 70 }],
      error: null,
    });
    admin.enqueueResponse({ data: [], error: null });
    // settings: rate = 7
    admin.enqueueResponse({ data: { value: { rate: 7 } }, error: null });

    const result = await getCommissionStoresForList();
    expect(result[0].commission_rate).toBe(7);
    // total_commission is the stored amount, not revenue × rate
    expect(result[0].total_commission).toBe(70);
  });
});

describe("getCommissionPeriodsForStore: weekly snapshot periods", () => {
  it("rejects users without commissions:view permission", async () => {
    asAdmin({});
    await expect(getCommissionPeriodsForStore("s-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns empty result when the store does not exist", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    const result = await getCommissionPeriodsForStore("missing");
    expect(result.store.name).toBe("—");
    expect(result.periods).toEqual([]);
  });

  it("uses STORED revenue/rate/amount per period and live paid from payments", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const cur = getCurWeek();
    const periodCur = {
      id: "p-cur",
      period_start: cur.start,
      period_end: cur.end,
      total_revenue: 500,
      commission_rate: 10,
      commission_amount: 50,
      status: "unpaid",
      notes: null,
    };
    const periodPast = {
      id: "p-past",
      period_start: "2025-04-06",
      period_end: "2025-04-13",
      total_revenue: 1000,
      commission_rate: 10,
      commission_amount: 100,
      status: "unpaid",
      notes: null,
    };

    // 1) store
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", name: "FreshCart", code: "FCD", commission_rate: 10 }),
      error: null,
    });
    // 2) commission rows (includes current week → no auto-create; NO orders query)
    admin.enqueueResponse({ data: [periodCur, periodPast], error: null });
    // 3) payments
    admin.enqueueResponse({ data: [{ commission_id: "p-cur", amount: 20 }], error: null });
    // 4) settings (default rate for the store header)
    admin.enqueueResponse({ data: null, error: null });

    const result = await getCommissionPeriodsForStore("s-1");
    expect(result.periods).toHaveLength(2);

    const pCur = result.periods.find((p) => p.id === "p-cur")!;
    expect(pCur.total_revenue).toBe(500);
    expect(pCur.commission_amount).toBe(50);
    expect(pCur.paid_amount).toBe(20);
    expect(pCur.balance_due).toBe(30);
    expect(pCur.status).toBe("partially_paid");
    expect(pCur.generated).toBe(true);

    const pPast = result.periods.find((p) => p.id === "p-past")!;
    expect(pPast.total_revenue).toBe(1000);
    expect(pPast.commission_amount).toBe(100);
    expect(pPast.paid_amount).toBe(0);
    expect(pPast.balance_due).toBe(100);
    expect(pPast.status).toBe("unpaid");
    expect(pPast.generated).toBe(true);
  });

  it("auto-creates an empty current-week row on first view if missing", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const cur = getCurWeek();

    // 1) store
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", name: "FreshCart", code: "FCD", commission_rate: 10 }),
      error: null,
    });
    // 2) commission rows for s-1 (empty — current week missing)
    admin.enqueueResponse({ data: [], error: null });
    // 3) settings (for getGlobalDefaultRate inside auto-create)
    admin.enqueueResponse({ data: null, error: null });
    // 4) INSERT current week row
    admin.enqueueResponse({
      data: { id: "p-new", period_start: cur.start, period_end: cur.end, total_revenue: 0, commission_rate: 10, commission_amount: 0, status: "paid", notes: null },
      error: null,
    });
    // 5) refetch commission rows (now includes the new row)
    admin.enqueueResponse({
      data: [{ id: "p-new", period_start: cur.start, period_end: cur.end, total_revenue: 0, commission_rate: 10, commission_amount: 0, status: "paid", notes: null }],
      error: null,
    });
    // 6) payments (none for the new row)
    admin.enqueueResponse({ data: [], error: null });

    const result = await getCommissionPeriodsForStore("s-1");
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].id).toBe("p-new");
    // No orders consulted → revenue 0, commission 0, status paid, NOT generated
    expect(result.periods[0].total_revenue).toBe(0);
    expect(result.periods[0].commission_amount).toBe(0);
    expect(result.periods[0].status).toBe("paid");
    expect(result.periods[0].generated).toBe(false);
  });

  it("does NOT auto-create when the current-week row already exists", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const cur = getCurWeek();

    // 1) store
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", name: "FreshCart", code: "FCD", commission_rate: 10 }),
      error: null,
    });
    // 2) commission rows (already has the current week)
    admin.enqueueResponse({
      data: [{ id: "p-existing", period_start: cur.start, period_end: cur.end, total_revenue: 0, commission_rate: 10, commission_amount: 0, status: "paid", notes: null }],
      error: null,
    });
    // 3) payments
    admin.enqueueResponse({ data: [], error: null });
    // 4) settings
    admin.enqueueResponse({ data: null, error: null });

    const result = await getCommissionPeriodsForStore("s-1");
    expect(result.periods).toHaveLength(1);

    const insertCalls = admin.calls.filter((c) => c.method === "insert");
    expect(insertCalls).toHaveLength(0);
  });

  it("derives 'paid' from (stored amount, paid) even when the stored status is 'unpaid'", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const cur = getCurWeek();

    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 10 }),
      error: null,
    });
    // Stored: 100 commission, but stored status says "unpaid" — paid of 100
    // from the payments table fully covers it → shown as paid.
    admin.enqueueResponse({
      data: [{ id: "p-1", period_start: cur.start, period_end: cur.end, total_revenue: 1000, commission_rate: 10, commission_amount: 100, status: "unpaid", notes: null }],
      error: null,
    });
    admin.enqueueResponse({ data: [{ commission_id: "p-1", amount: 100 }], error: null });
    admin.enqueueResponse({ data: null, error: null });

    const result = await getCommissionPeriodsForStore("s-1");
    expect(result.periods[0].status).toBe("paid");
    expect(result.periods[0].balance_due).toBe(0);
  });
});

describe("generateCommissionForPeriod: weekly snapshot", () => {
  it("rejects users without commissions:edit permission", async () => {
    asAdmin({ commissions: ["view"] });
    const fd = buildFormData({ period_id: "p-1" });
    await expect(generateCommissionForPeriod(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when period_id is missing", async () => {
    asAdmin({ commissions: ["edit"] });
    const fd = buildFormData({});
    await expect(generateCommissionForPeriod(fd)).rejects.toThrow(/Valid period/);
  });

  it("throws when the period does not exist", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    const fd = buildFormData({ period_id: "missing" });
    await expect(generateCommissionForPeriod(fd)).rejects.toThrow(/Commission period not found/);
  });

  it("refuses to re-generate a period that was already generated", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "p-1", store_id: "s-1", period_start: "2026-08-23", period_end: "2026-08-30", total_revenue: 5514, commission_amount: 55.14 },
      error: null,
    });
    const fd = buildFormData({ period_id: "p-1" });
    await expect(generateCommissionForPeriod(fd)).rejects.toThrow(/already generated/);
  });

  it("throws when the store has no commission rate configured", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "p-1", store_id: "s-1", period_start: "2026-08-30", period_end: "2026-09-06", total_revenue: 0, commission_amount: 0 },
      error: null,
    });
    // store with no per-store rate, and no global default (settings → null)
    admin.enqueueResponse({ data: makeStore({ id: "s-1", commission_rate: 0 }), error: null });
    admin.enqueueResponse({ data: null, error: null }); // settings lookup

    const fd = buildFormData({ period_id: "p-1" });
    await expect(generateCommissionForPeriod(fd)).rejects.toThrow(/No commission rate configured/);
  });

  it("throws when the orders query fails", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "p-1", store_id: "s-1", period_start: "2026-08-30", period_end: "2026-09-06", total_revenue: 0, commission_amount: 0 },
      error: null,
    });
    admin.enqueueResponse({ data: makeStore({ id: "s-1", commission_rate: 10 }), error: null });
    admin.enqueueResponse({ data: null, error: { message: "boom" } }); // orders

    const fd = buildFormData({ period_id: "p-1" });
    await expect(generateCommissionForPeriod(fd)).rejects.toThrow(/boom/);
  });

  it("snapshots the week: Σ subtotal of paid+delivered orders × rate, then locks the row", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "p-1", store_id: "s-1", period_start: "2026-08-30", period_end: "2026-09-06", total_revenue: 0, commission_amount: 0 },
      error: null,
    });
    admin.enqueueResponse({ data: makeStore({ id: "s-1", name: "FreshCart", commission_rate: 10 }), error: null });
    // 1550 total subtotal in the window → 10% commission = 155
    admin.enqueueResponse({
      data: [{ subtotal: 1500 }, { subtotal: 50 }],
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null }); // update

    const fd = buildFormData({ period_id: "p-1" });
    await generateCommissionForPeriod(fd);

    const updateCall = admin.chainsForTable("store_commissions").flatMap((c) => c)
      .find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({
      total_revenue: 1550,
      commission_rate: 10,
      commission_amount: 155,
      balance_due: 155,
      status: "unpaid",
    });

    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions");
    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions/store/s-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions/p-1");
  });

  it("uses the global default rate when the store has no per-store rate", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "p-1", store_id: "s-1", period_start: "2026-08-30", period_end: "2026-09-06", total_revenue: 0, commission_amount: 0 },
      error: null,
    });
    admin.enqueueResponse({ data: makeStore({ id: "s-1", name: "NoRate", commission_rate: 0 }), error: null });
    admin.enqueueResponse({ data: { value: { rate: 7 } }, error: null }); // settings default
    admin.enqueueResponse({ data: [{ subtotal: 1000 }], error: null });
    admin.enqueueResponse({ data: null, error: null }); // update

    const fd = buildFormData({ period_id: "p-1" });
    await generateCommissionForPeriod(fd);

    const updateCall = admin.chainsForTable("store_commissions").flatMap((c) => c)
      .find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({
      total_revenue: 1000,
      commission_rate: 7,
      commission_amount: 70,
      balance_due: 70,
      status: "unpaid",
    });
  });

  it("sets status to 'paid' when the week has no deliverable revenue", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "p-1", store_id: "s-1", period_start: "2026-08-30", period_end: "2026-09-06", total_revenue: 0, commission_amount: 0 },
      error: null,
    });
    admin.enqueueResponse({ data: makeStore({ id: "s-1", name: "FreshCart", commission_rate: 10 }), error: null });
    admin.enqueueResponse({ data: [], error: null }); // no orders
    admin.enqueueResponse({ data: null, error: null }); // update

    const fd = buildFormData({ period_id: "p-1" });
    await generateCommissionForPeriod(fd);

    const updateCall = admin.chainsForTable("store_commissions").flatMap((c) => c)
      .find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({
      total_revenue: 0,
      commission_rate: 10,
      commission_amount: 0,
      balance_due: 0,
      status: "paid",
    });
  });
});

describe("recordPayment", () => {
  it("rejects users without commissions:edit permission", async () => {
    asAdmin({ commissions: ["view"] });
    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await expect(recordPayment(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when amount is missing", async () => {
    asAdmin({ commissions: ["edit"] });
    const fd = buildFormData({ commission_id: "c-1" });
    await expect(recordPayment(fd)).rejects.toThrow(/amount.*required/);
  });

  it("throws when the commission does not exist", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    const fd = buildFormData({ commission_id: "missing", amount: "100" });
    await expect(recordPayment(fd)).rejects.toThrow(/Commission not found/);
  });

  it("P46 fix: throws when the payment insert fails (does not skip silently)", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 1000, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: { message: "fk violation" } });

    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await expect(recordPayment(fd)).rejects.toThrow(/fk violation/);
  });

  it("records a payment, updates balance_due and status to 'partially_paid'", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 1000, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null }); // payment insert
    admin.enqueueResponse({ data: null, error: null }); // update

    const fd = buildFormData({ commission_id: "c-1", amount: "400" });
    await recordPayment(fd);

    // The update is the second chain on store_commissions (first is the
    // select to fetch the commission).
    const updateCall = admin.chainsForTable("store_commissions").flatMap((c) => c)
      .find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({ balance_due: 600, status: "partially_paid" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions");
    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions/c-1");
  });

  it("sets status to 'paid' when the payment fully covers the balance", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 500, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ commission_id: "c-1", amount: "500" });
    await recordPayment(fd);

    const updateCall = admin.chainsForTable("store_commissions").flatMap((c) => c)
      .find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({ balance_due: 0, status: "paid" });
  });
});

describe("deleteCommissionPayment", () => {
  it("rejects users without commissions:delete permission", async () => {
    asAdmin({ commissions: ["view", "edit"] });
    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await expect(deleteCommissionPayment(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("P46 fix: throws when the payment delete fails (does not corrupt balance)", async () => {
    asAdmin({ commissions: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { amount: 100 }, error: null });
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 500, commission_amount: 1000, status: "partially_paid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: { message: "fk violation" } });

    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await expect(deleteCommissionPayment(fd)).rejects.toThrow(/fk violation/);
  });

  it("restores balance_due and recomputes status after delete", async () => {
    asAdmin({ commissions: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { amount: 200 }, error: null });
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 300, commission_amount: 1000, status: "partially_paid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null }); // delete
    admin.enqueueResponse({ data: null, error: null }); // update

    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await deleteCommissionPayment(fd);

    // new balance = 300 + 200 = 500, status = partially_paid (500 > 0 but < 1000)
    const updateCall = admin.chainsForTable("store_commissions").flatMap((c) => c)
      .find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({ balance_due: 500, status: "partially_paid" });
  });
});
