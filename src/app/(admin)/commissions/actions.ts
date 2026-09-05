"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/require-permission";

export type CommissionRow = {
  id: string;
  store_id: string;
  store_name: string | null;
  period_start: string;
  period_end: string;
  total_revenue: number;
  commission_rate: number;
  commission_amount: number;
  balance_due: number;
  status: "unpaid" | "partially_paid" | "paid";
  notes: string | null;
  created_at: string;
  payment_count?: number;
};

export type CommissionPayment = {
  id: string;
  commission_id: string;
  amount: number;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type SimpleStore = {
  id: string;
  name: string;
  commission_rate: number | null;
};

const DEFAULT_COMMISSION_KEY = "default_commission_rate";

// Weekly snapshot commissions. The /commissions list page is a list of
// stores, each with totals summed from LOCKED per-week commission rows.
// /commissions/[store_id] is the per-week breakdown. Revenue and commission
// are snapshotted once when the current week is generated (see
// generateCommissionForPeriod); generated periods never change. Only the
// paid/balance columns move after that, via commission_payments.

// one row per store in the list, with snapshot totals
export type CommissionStoreSummary = {
  id: string;
  name: string;
  code: string;
  commission_rate: number;          // resolved effective rate (per-store or default)
  period_count: number;             // number of commission rows
  last_period_end: string | null;   // max(period_end) across all rows, or null
  total_commission: number;         // sum of stored commission_amount across periods (locked)
  total_paid: number;               // sum of all commission_payments for the store
  total_balance: number;            // total_commission - total_paid
};

// one row per commission period (per store, per week) with snapshot values
export type CommissionPeriod = {
  id: string;                       // the store_commissions row id (for drill-in)
  period_start: string;
  period_end: string;
  total_revenue: number;            // stored: subtotal of paid+delivered orders in the week (snapshot)
  commission_rate: number;          // the rate that was used (stored on the row)
  commission_amount: number;        // stored: total_revenue × rate / 100 (snapshot)
  paid_amount: number;              // live: sum of commission_payments for this row
  balance_due: number;              // commission_amount - paid_amount
  status: "unpaid" | "partially_paid" | "paid";
  generated: boolean;               // true when the week's revenue was snapshotted (stored revenue > 0)
  notes: string | null;
};

export type StoreCommissionsResult = {
  store: {
    id: string;
    name: string;
    code: string;
    commission_rate: number | null;
  };
  periods: CommissionPeriod[];
};

/**
 * P27 / P68: Resolve the effective commission rate for a store.
 * Order of precedence:
 *   1. The store's own `commission_rate` (if set and > 0)
 *   2. The global default from `settings` (key: `default_commission_rate`,
 *      value shape: `{ rate: number }`)
 *   3. 0 (caller is expected to throw if the effective rate is 0)
 */
async function resolveCommissionRate(
  adminSupabase: ReturnType<typeof createAdminClient>,
  store: { id: string; name: string; commission_rate: number | null },
): Promise<number> {
  const storeRate = Number(store.commission_rate ?? 0);
  if (storeRate > 0) return storeRate;

  const { data: setting } = await adminSupabase
    .from("settings")
    .select("value")
    .eq("key", DEFAULT_COMMISSION_KEY)
    .maybeSingle();
  const defaultRate = Number(
    (setting?.value as { rate?: number } | null)?.rate ?? 0,
  );
  return defaultRate;
}

/**
 * P27: Resolve the current user's id for `created_by`. Uses the server
 * client (which has the user's session) instead of the admin client
 * (service-role key has no real user context).
 */
async function resolveUserId(): Promise<string | null> {
  try {
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Weekly commission period: the 7-day window from the most recent Sunday
 * (00:00 UTC) to the following Sunday, matching the convention the old
 * cron-based generator used (period_start = Sunday, period_end = Sunday,
 * inclusive dates). Today Saturday Sep 5 2026 → start 2026-08-30, end 2026-09-06.
 */
function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function getCurrentWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 = Sunday
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow),
  );
  const endDate = new Date(startDate.getTime() + 7 * 86400000);
  return { start: toISODate(startDate), end: toISODate(endDate) };
}

function deriveStatus(commissionAmount: number, paid: number): "unpaid" | "partially_paid" | "paid" {
  const balance = commissionAmount - paid;
  if (balance <= 0) return "paid";
  if (paid > 0) return "partially_paid";
  return "unpaid";
}

export async function getStoresLight(): Promise<SimpleStore[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select("id, name, commission_rate")
    .order("name");
  return (data ?? []) as SimpleStore[];
}

// P68: get effective rate for a single store, with a small in-memory cache
// so we don't double-query the settings table when the same store
// appears multiple times in a request.
const _settingsRateCache = new Map<string, number>();

async function getGlobalDefaultRate(
  adminSupabase: ReturnType<typeof createAdminClient>,
): Promise<number> {
  if (_settingsRateCache.has("__default__")) {
    return _settingsRateCache.get("__default__")!;
  }
  const { data: setting } = await adminSupabase
    .from("settings")
    .select("value")
    .eq("key", DEFAULT_COMMISSION_KEY)
    .maybeSingle();
  const rate = Number((setting?.value as { rate?: number } | null)?.rate ?? 0);
  _settingsRateCache.set("__default__", rate);
  return rate;
}

function effectiveRateFor(
  store: { commission_rate: number | null },
  defaultRate: number,
): number {
  const r = Number(store.commission_rate ?? 0);
  return r > 0 ? r : defaultRate;
}

/**
 * List of stores for the /commissions list page. Each store has totals
 * summed from its STORED (locked) per-week commission rows plus live
 * payments. Nothing is recomputed from orders here — generated weeks are
 * immutable; ungenerated weeks contribute 0 until generateCommissionForPeriod
 * snapshots them. (3 batched queries.)
 */
export async function getCommissionStoresForList(): Promise<CommissionStoreSummary[]> {
  await assertPermission("commissions", "view");
  const adminSupabase = createAdminClient();
  _settingsRateCache.clear();

  // 1) stores
  const storesRes = await adminSupabase
    .from("stores")
    .select("id, name, code, commission_rate")
    .order("name");
  const stores = (storesRes.data ?? []) as {
    id: string; name: string; code: string; commission_rate: number | null;
  }[];

  if (stores.length === 0) return [];

  // 2) all commission rows (id, store_id, period bounds, locked commission_amount)
  const commRes = await adminSupabase
    .from("store_commissions")
    .select("id, store_id, period_start, period_end, commission_amount");
  const commissions = (commRes.data ?? []) as {
    id: string;
    store_id: string;
    period_start: string;
    period_end: string;
    commission_amount: number;
  }[];

  // 3) all commission_payments joined with their commission row
  const payRes = await adminSupabase
    .from("commission_payments")
    .select("commission_id, amount");
  const allPayments = (payRes.data ?? []) as { commission_id: string; amount: number }[];

  // Default rate (global) — cached per request, for the rate column only
  const defaultRate = await getGlobalDefaultRate(adminSupabase);

  const periodById = new Map<string, { store_id: string }>();
  for (const c of commissions) periodById.set(c.id, { store_id: c.store_id });

  // commissionAmountByStore: sum of stored (locked) amounts per store
  const amountByStore = new Map<string, number>();
  for (const c of commissions) {
    amountByStore.set(
      c.store_id,
      (amountByStore.get(c.store_id) ?? 0) + Number(c.commission_amount),
    );
  }

  // paymentsByStore: sum of all payments for the store
  const paymentsByStore = new Map<string, number>();
  for (const p of allPayments) {
    const period = periodById.get(p.commission_id);
    if (!period) continue;
    paymentsByStore.set(
      period.store_id,
      (paymentsByStore.get(period.store_id) ?? 0) + Number(p.amount),
    );
  }

  const summary: CommissionStoreSummary[] = stores.map((s) => {
    const totalCommission = amountByStore.get(s.id) ?? 0;
    const totalPaid = paymentsByStore.get(s.id) ?? 0;
    const totalBalance = Math.max(totalCommission - totalPaid, 0);

    // count + last_period_end derive straight from the commission rows
    const periods = commissions.filter((c) => c.store_id === s.id);
    const lastEnd = periods
      .map((p) => p.period_end)
      .reduce<string | null>((max, e) => (max === null || e > max ? e : max), null);

    return {
      id: s.id,
      name: s.name,
      code: s.code,
      commission_rate: effectiveRateFor(s, defaultRate),
      period_count: periods.length,
      last_period_end: lastEnd,
      total_commission: round2(totalCommission),
      total_paid: round2(totalPaid),
      total_balance: round2(totalBalance),
    };
  });

  return summary;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Per-store commission periods. Returns all commission rows for the given
 * store with their SNAPSHOT revenue/rate/amount (locked once generated),
 * live paid from commission_payments, and balance/status derived from
 * (stored amount, live paid). Auto-creates an empty row for the current
 * week on first view if it does not already exist — it shows ₹0 until the
 * Generate action snapshots it.
 */
export async function getCommissionPeriodsForStore(
  storeId: string,
): Promise<StoreCommissionsResult> {
  await assertPermission("commissions", "view");
  const adminSupabase = createAdminClient();
  _settingsRateCache.clear();

  // 1) Store
  const storeRes = await adminSupabase
    .from("stores")
    .select("id, name, code, commission_rate")
    .eq("id", storeId)
    .maybeSingle();
  const store = (storeRes.data ?? null) as
    | { id: string; name: string; code: string; commission_rate: number | null }
    | null;
  if (!store) {
    return {
      store: { id: storeId, name: "—", code: "—", commission_rate: null },
      periods: [],
    };
  }

  // 2) Commission rows for this store (with stored money columns)
  const commRes = await adminSupabase
    .from("store_commissions")
    .select(
      "id, period_start, period_end, total_revenue, commission_rate, commission_amount, status, notes",
    )
    .eq("store_id", storeId)
    .order("period_start", { ascending: false });
  let periods = (commRes.data ?? []) as {
    id: string;
    period_start: string;
    period_end: string;
    total_revenue: number;
    commission_rate: number;
    commission_amount: number;
    status: string;
    notes: string | null;
  }[];

  // 3) Auto-create the current week if missing
  const { start: curStart, end: curEnd } = getCurrentWeekRange();
  const hasCurrent = periods.some((p) => p.period_start === curStart);
  if (!hasCurrent) {
    const defaultRate = await getGlobalDefaultRate(adminSupabase);
    const rate = effectiveRateFor(store, defaultRate);
    const { data: inserted, error: insErr } = await adminSupabase
      .from("store_commissions")
      .insert({
        store_id: storeId,
        period_start: curStart,
        period_end: curEnd,
        total_revenue: 0,
        commission_rate: rate,
        commission_amount: 0,
        balance_due: 0,
        status: "paid",
        notes: null,
      })
      .select("id, period_start, period_end, total_revenue, commission_rate, commission_amount, status, notes")
      .single();
    if (insErr) {
      // Non-fatal: log and continue. The page still works with existing periods.
      console.warn(`[commissions] auto-create current week failed: ${insErr.message}`);
    } else if (inserted) {
      const refetch = await adminSupabase
        .from("store_commissions")
        .select("id, period_start, period_end, total_revenue, commission_rate, commission_amount, status, notes")
        .eq("store_id", storeId)
        .order("period_start", { ascending: false });
      periods = (refetch.data ?? []) as typeof periods;
    }
  }

  // 4) Commission payments for these commission rows
  const periodIds = periods.map((p) => p.id);
  const payRes = periodIds.length
    ? await adminSupabase
        .from("commission_payments")
        .select("commission_id, amount")
        .in("commission_id", periodIds)
    : { data: [] as { commission_id: string; amount: number }[] };
  const payments = (payRes.data ?? []) as { commission_id: string; amount: number }[];

  // 5) paid_by_period
  const paidByPeriod = new Map<string, number>();
  for (const p of payments) {
    paidByPeriod.set(p.commission_id, (paidByPeriod.get(p.commission_id) ?? 0) + Number(p.amount));
  }

  // 6) Build the period list. Amount fields come from the LOCKED stored
  // values (set by generateCommissionForPeriod). Only paid is live.
  const result: CommissionPeriod[] = periods.map((p) => {
    const totalRevenue = Number(p.total_revenue);
    const commissionAmount = Number(p.commission_amount);
    const paidAmount = paidByPeriod.get(p.id) ?? 0;
    const balanceDue = Math.max(commissionAmount - paidAmount, 0);
    return {
      id: p.id,
      period_start: p.period_start,
      period_end: p.period_end,
      total_revenue: round2(totalRevenue),
      commission_rate: Number(p.commission_rate),
      commission_amount: round2(commissionAmount),
      paid_amount: round2(paidAmount),
      balance_due: round2(balanceDue),
      status: deriveStatus(commissionAmount, paidAmount),
      generated: totalRevenue > 0,
      notes: p.notes,
    };
  });

  return {
    store: { ...store, commission_rate: effectiveRateFor(store, await getGlobalDefaultRate(adminSupabase)) },
    periods: result,
  };
}

/**
 * P46: Fetch a single commission by id (replaces the wasteful
 * `getCommissions().find()` in the detail page). Permission-gated by
 * `commissions:view`. Returns null when the row does not exist so
 * the caller can render a "not found" state.
 */
export async function getCommissionById(id: string): Promise<CommissionRow | null> {
  await assertPermission("commissions", "view");
  if (!id) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_commissions")
    .select("*, stores(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Failed to fetch commission:", error);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    store_id: data.store_id,
    store_name: (data.stores as { name: string } | null)?.name ?? null,
    period_start: data.period_start,
    period_end: data.period_end,
    total_revenue: Number(data.total_revenue),
    commission_rate: Number(data.commission_rate),
    commission_amount: Number(data.commission_amount),
    balance_due: Number(data.balance_due),
    status: data.status,
    notes: data.notes,
    created_at: data.created_at,
    payment_count: 0, // Detail page fetches payments separately
  };
}

export async function getCommissionPayments(commissionId: string): Promise<CommissionPayment[]> {
  await assertPermission("commissions", "view");
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("commission_payments")
    .select("*, profiles(full_name)")
    .eq("commission_id", commissionId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Failed to fetch payments:", error);
    return [];
  }

  return data.map((p) => ({
    id: p.id,
    commission_id: p.commission_id,
    amount: Number(p.amount),
    notes: p.notes,
    created_by: p.created_by,
    created_by_name: (p.profiles as { full_name: string } | null)?.full_name ?? null,
    created_at: p.created_at,
  }));
}

/**
 * Snapshot a commission period from its paid orders and lock it.
 *
 * Revenue basis (matches the original weekly generator):
 *   - orders with payment_status = 'paid' AND status = 'delivered'
 *   - windowed on delivered_at within [period_start, period_end]
 *   - revenue = Σ subtotal (excludes delivery_charge + tax)
 *   - commission = revenue × effective_rate / 100
 *
 * The row's total_revenue / commission_rate / commission_amount /
 * balance_due / status are written once and LEFT ALONE afterwards. A
 * second call refuses to run, so a generated week can never be
 * "regenerated" into a later week — the previous week's orders stay
 * attributed to the previous week only.
 */
export async function generateCommissionForPeriod(formData: FormData): Promise<void> {
  await assertPermission("commissions", "edit");

  const periodId = formData.get("period_id") as string;
  if (!periodId) throw new Error("Valid period is required");

  const adminSupabase = createAdminClient();
  _settingsRateCache.clear();

  const { data: row } = await adminSupabase
    .from("store_commissions")
    .select("id, store_id, period_start, period_end, total_revenue, commission_amount")
    .eq("id", periodId)
    .maybeSingle();
  if (!row) throw new Error("Commission period not found");
  if (Number(row.total_revenue) > 0 || Number(row.commission_amount) > 0) {
    throw new Error("Commission already generated for this period");
  }

  const { data: store } = await adminSupabase
    .from("stores")
    .select("id, name, commission_rate")
    .eq("id", row.store_id)
    .maybeSingle();
  if (!store) throw new Error("Store not found");
  const rate = await resolveCommissionRate(adminSupabase, store);
  if (rate <= 0) {
    throw new Error(`No commission rate configured for ${store.name}`);
  }

  const ordersRes = await adminSupabase
    .from("orders")
    .select("subtotal")
    .eq("store_id", row.store_id)
    .eq("payment_status", "paid")
    .eq("status", "delivered")
    .gte("delivered_at", `${row.period_start}T00:00:00.000Z`)
    .lte("delivered_at", `${row.period_end}T23:59:59.999Z`);
  if (ordersRes.error) throw new Error(ordersRes.error.message);
  const revenue = round2(
    (ordersRes.data ?? []).reduce((sum, o) => sum + Number(o.subtotal), 0),
  );

  const commission = round2(revenue * (rate / 100));
  const { error: updateError } = await adminSupabase
    .from("store_commissions")
    .update({
      total_revenue: revenue,
      commission_rate: rate,
      commission_amount: commission,
      balance_due: commission,
      status: commission > 0 ? "unpaid" : "paid",
    })
    .eq("id", periodId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/commissions");
  revalidatePath(`/commissions/store/${row.store_id}`);
  revalidatePath(`/commissions/${periodId}`);
}

export async function recordPayment(formData: FormData) {
  await assertPermission("commissions", "edit");
  const supabase = createAdminClient();

  const commissionId = formData.get("commission_id") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const notes = formData.get("notes") as string;

  if (!commissionId || isNaN(amount) || amount <= 0) {
    throw new Error("Valid commission ID and amount are required");
  }

  const { data: commission } = await supabase
    .from("store_commissions")
    .select("id, balance_due, status")
    .eq("id", commissionId)
    .single();

  if (!commission) throw new Error("Commission not found");

  if (amount > Number(commission.balance_due)) {
    throw new Error(`Amount (₹${amount}) exceeds balance due (₹${Number(commission.balance_due)})`);
  }

  // P27: use the server client for the user lookup (admin client has no
  // session context). This ensures `created_by` is correctly attributed.
  const userId = await resolveUserId();

  const { error: paymentError } = await supabase.from("commission_payments").insert({
    commission_id: commissionId,
    amount,
    notes: notes || null,
    created_by: userId,
  });

  if (paymentError) throw new Error(paymentError.message);

  const newBalance = Number(commission.balance_due) - amount;
  const newStatus = newBalance <= 0 ? "paid" : "partially_paid";

  const { error: updateError } = await supabase
    .from("store_commissions")
    .update({ balance_due: newBalance, status: newStatus })
    .eq("id", commissionId);

  if (updateError) throw new Error(updateError.message);

  // P46: revalidate both the list and the detail page so router.refresh()
  // picks up the new balance_due + status on the detail page immediately.
  revalidatePath("/commissions");
  revalidatePath(`/commissions/${commissionId}`);
}

export async function deleteCommissionPayment(formData: FormData) {
  await assertPermission("commissions", "delete");
  const supabase = createAdminClient();

  const paymentId = formData.get("payment_id") as string;
  const commissionId = formData.get("commission_id") as string;

  const { data: payment } = await supabase
    .from("commission_payments")
    .select("amount")
    .eq("id", paymentId)
    .single();

  if (!payment) throw new Error("Payment not found");

  const { data: commission } = await supabase
    .from("store_commissions")
    .select("id, balance_due, commission_amount, status")
    .eq("id", commissionId)
    .single();

  if (!commission) throw new Error("Commission not found");

  const newBalance = Number(commission.balance_due) + Number(payment.amount);
  let newStatus: string;
  if (newBalance >= Number(commission.commission_amount)) {
    newStatus = "unpaid";
  } else if (newBalance > 0) {
    newStatus = "partially_paid";
  } else {
    newStatus = "paid";
  }

  // P46 fix (P12 pattern from AGENTS.md): discard-the-delete bug. The
  // previous code awaited the delete without checking the response,
  // so a failed delete (FK/RLS/permission) would let the update
  // still run and corrupt balance_due. Now we throw on delete error
  // and skip the update entirely.
  const { error: deleteError } = await supabase
    .from("commission_payments")
    .delete()
    .eq("id", paymentId);

  if (deleteError) throw new Error(deleteError.message);

  const { error: updateError } = await supabase
    .from("store_commissions")
    .update({ balance_due: newBalance, status: newStatus })
    .eq("id", commissionId);

  if (updateError) throw new Error(updateError.message);

  // P46: revalidate both the list and the detail page.
  revalidatePath("/commissions");
  revalidatePath(`/commissions/${commissionId}`);
}
