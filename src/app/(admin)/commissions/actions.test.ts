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

describe("getCommissionStoresForList (P68): live aggregates per store", () => {
  it("rejects users without commissions:view permission", async () => {
    asAdmin({});
    await expect(getCommissionStoresForList()).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns an empty list when there are no stores", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });
    // No orders, no commissions, no payments, no settings — none of
    // these queries are made when there are no stores (early return).
    const result = await getCommissionStoresForList();
    expect(result).toEqual([]);
  });

  it("returns stores with live aggregates (revenue × rate - paid = balance)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    // 1) stores. s-2 has commission_rate: 0 to mean "no per-store rate"
    // (the makeStore factory uses ?? 10 as default, so 0 is the only way
    // to express "no rate" via the factory).
    admin.enqueueResponse({
      data: [
        makeStore({ id: "s-1", name: "FreshCart", code: "FCD", commission_rate: 10 }),
        makeStore({ id: "s-2", name: "GreenMart", code: "GRM", commission_rate: 0 }),
      ],
      error: null,
    });
    // 2) paid orders
    admin.enqueueResponse({
      data: [
        { store_id: "s-1", total_amount: 1000, placed_at: "2026-04-15T00:00:00.000Z" },
        { store_id: "s-1", total_amount: 500,  placed_at: "2026-04-20T00:00:00.000Z" },
        { store_id: "s-2", total_amount: 2000, placed_at: "2026-04-10T00:00:00.000Z" },
      ],
      error: null,
    });
    // 3) commission rows
    admin.enqueueResponse({
      data: [
        { id: "p-1", store_id: "s-1", period_start: "2026-04-01", period_end: "2026-04-30" },
        { id: "p-2", store_id: "s-1", period_start: "2026-03-01", period_end: "2026-03-31" },
        { id: "p-3", store_id: "s-2", period_start: "2026-04-01", period_end: "2026-04-30" },
      ],
      error: null,
    });
    // 4) payments
    admin.enqueueResponse({
      data: [
        { commission_id: "p-1", amount: 50 },
        { commission_id: "p-3", amount: 200 },
      ],
      error: null,
    });
    // 5) settings (global default rate lookup) — returns nothing → default 0
    admin.enqueueResponse({ data: null, error: null });

    const result = await getCommissionStoresForList();
    expect(result).toHaveLength(2);

    const s1 = result.find((r) => r.id === "s-1")!;
    // s-1: April period has revenue 1500 (1000+500) at 10% = 150. March
    // period has no orders in the date range, so 0. Total = 150.
    expect(s1.commission_rate).toBe(10);
    expect(s1.period_count).toBe(2);
    expect(s1.total_commission).toBe(150);
    expect(s1.total_paid).toBe(50);
    expect(s1.total_balance).toBe(100);
    // last_period_end: max(end) = "2026-04-30"
    expect(s1.last_period_end).toBe("2026-04-30");

    const s2 = result.find((r) => r.id === "s-2")!;
    // s-2: no per-store rate (null), no global default → 0
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
      data: [
        makeStore({ id: "s-1", name: "NoRate", code: "NR", commission_rate: 0 }),
      ],
      error: null,
    });
    admin.enqueueResponse({
      data: [{ store_id: "s-1", total_amount: 1000, placed_at: "2026-04-10T00:00:00.000Z" }],
      error: null,
    });
    admin.enqueueResponse({
      data: [
        { id: "p-1", store_id: "s-1", period_start: "2026-04-01", period_end: "2026-04-30" },
      ],
      error: null,
    });
    admin.enqueueResponse({ data: [], error: null });
    // settings: rate = 7
    admin.enqueueResponse({ data: { value: { rate: 7 } }, error: null });

    const result = await getCommissionStoresForList();
    expect(result[0].commission_rate).toBe(7);
    expect(result[0].total_commission).toBe(70);
  });
});

describe("getCommissionPeriodsForStore (P68): live per-period aggregates", () => {
  it("rejects users without commissions:view permission", async () => {
    asAdmin({});
    await expect(getCommissionPeriodsForStore("s-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns empty result when the store does not exist", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    // Auto-create inserts if a period is missing, but here no periods
    // exist. We need an enqueueResponse for the refetch query (the
    // post-insert refetch) — but the auto-create only runs when there
    // are no current-month periods. So no refetch happens.
    const result = await getCommissionPeriodsForStore("missing");
    expect(result.store.name).toBe("—");
    expect(result.periods).toEqual([]);
  });

  it("returns periods with live revenue, commission, paid, balance, and status", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    // We need the current month in the commission rows so the
    // auto-create path is skipped. Use a fixed past month + the actual
    // current month so the test is deterministic.
    const now = new Date();
    const curStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const curEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const periodCur = { id: "p-cur", period_start: curStart, period_end: curEnd, notes: null };
    const periodPast = { id: "p-past", period_start: "2025-04-01", period_end: "2025-04-30", notes: null };

    // 1) store
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", name: "FreshCart", code: "FCD", commission_rate: 10 }),
      error: null,
    });
    // 2) commission rows for s-1 (includes current month → no auto-create)
    admin.enqueueResponse({
      data: [periodCur, periodPast],
      error: null,
    });
    // 3) paid orders (with 1 in current month, 1 in past)
    admin.enqueueResponse({
      data: [
        { total_amount: 1000, placed_at: "2025-04-15T00:00:00.000Z" },
        { total_amount: 500,  placed_at: curStart + "T00:00:00.000Z" },
      ],
      error: null,
    });
    // 4) payments
    admin.enqueueResponse({
      data: [{ commission_id: "p-cur", amount: 20 }],
      error: null,
    });
    // 5) settings (default rate, used by effectiveRateFor)
    admin.enqueueResponse({ data: null, error: null });

    const result = await getCommissionPeriodsForStore("s-1");
    expect(result.periods).toHaveLength(2);

    // p-cur: 500 revenue, 10% = 50 commission, 20 paid, 30 balance
    const pCur = result.periods.find((p) => p.id === "p-cur")!;
    expect(pCur.total_revenue).toBe(500);
    expect(pCur.commission_amount).toBe(50);
    expect(pCur.paid_amount).toBe(20);
    expect(pCur.balance_due).toBe(30);
    expect(pCur.status).toBe("partially_paid");

    // p-past: 1000 revenue, 10% = 100 commission, 0 paid, 100 balance
    const pPast = result.periods.find((p) => p.id === "p-past")!;
    expect(pPast.total_revenue).toBe(1000);
    expect(pPast.commission_amount).toBe(100);
    expect(pPast.paid_amount).toBe(0);
    expect(pPast.balance_due).toBe(100);
    expect(pPast.status).toBe("unpaid");
  });

  it("auto-creates a current-month row on first view if missing", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const now = new Date();
    const curStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const curEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // 1) store
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", name: "FreshCart", code: "FCD", commission_rate: 10 }),
      error: null,
    });
    // 2) commission rows for s-1 (empty — current month missing)
    admin.enqueueResponse({ data: [], error: null });
    // 3) settings (for getGlobalDefaultRate inside auto-create)
    admin.enqueueResponse({ data: null, error: null });
    // 4) INSERT current month row
    admin.enqueueResponse({
      data: { id: "p-new", period_start: curStart, period_end: curEnd, notes: null },
      error: null,
    });
    // 5) refetch commission rows (now includes the new row)
    admin.enqueueResponse({
      data: [{ id: "p-new", period_start: curStart, period_end: curEnd, notes: null }],
      error: null,
    });
    // 6) paid orders (empty for the new period)
    admin.enqueueResponse({ data: [], error: null });
    // 7) payments (none for the new row)
    admin.enqueueResponse({ data: [], error: null });

    const result = await getCommissionPeriodsForStore("s-1");
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].id).toBe("p-new");
    // No orders this month → revenue 0, commission 0, status paid
    expect(result.periods[0].total_revenue).toBe(0);
    expect(result.periods[0].status).toBe("paid");
  });

  it("does NOT auto-create when the current-month row already exists", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const now = new Date();
    const curStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const curEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // 1) store
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", name: "FreshCart", code: "FCD", commission_rate: 10 }),
      error: null,
    });
    // 2) commission rows (already has the current month)
    admin.enqueueResponse({
      data: [{ id: "p-existing", period_start: curStart, period_end: curEnd, notes: null }],
      error: null,
    });
    // 3) paid orders
    admin.enqueueResponse({ data: [], error: null });
    // 4) payments
    admin.enqueueResponse({ data: [], error: null });
    // 5) settings
    admin.enqueueResponse({ data: null, error: null });

    const result = await getCommissionPeriodsForStore("s-1");
    expect(result.periods).toHaveLength(1);

    // No INSERT should have been made
    const insertCalls = admin.calls.filter((c) => c.method === "insert");
    expect(insertCalls).toHaveLength(0);
  });

  it("P68: 'paid' status is derived from paid_amount (not from stored status)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const now = new Date();
    const curStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const curEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 10 }),
      error: null,
    });
    // Use the current month so auto-create is skipped
    admin.enqueueResponse({
      data: [{ id: "p-1", period_start: curStart, period_end: curEnd, notes: null }],
      error: null,
    });
    admin.enqueueResponse({
      data: [{ total_amount: 1000, placed_at: curStart + "T00:00:00.000Z" }],
      error: null,
    });
    // paid_amount = 100 = full commission (10% of 1000)
    admin.enqueueResponse({ data: [{ commission_id: "p-1", amount: 100 }], error: null });
    admin.enqueueResponse({ data: null, error: null });

    const result = await getCommissionPeriodsForStore("s-1");
    expect(result.periods[0].status).toBe("paid");
    expect(result.periods[0].balance_due).toBe(0);
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
