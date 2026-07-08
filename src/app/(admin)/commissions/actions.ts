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

export type GenerateAllResult = {
  generated: number;
  skipped: number;
  total_stores: number;
  errors: { store_id: string; store_name: string; message: string }[];
};

const DEFAULT_COMMISSION_KEY = "default_commission_rate";

// P68: live aggregates. The /commissions list page is now a list of
// stores, each with a live-computed total commission / paid / balance.
// /commissions/[store_id] is the per-month breakdown, also fully live.

// P68: one row per store in the list, with live aggregates
export type CommissionStoreSummary = {
  id: string;
  name: string;
  code: string;
  commission_rate: number;          // resolved effective rate (per-store or default)
  period_count: number;             // number of commission rows
  last_period_end: string | null;   // max(period_end) across all rows, or null
  total_commission: number;         // live: sum of per-period commission_amount
  total_paid: number;               // live: sum of all commission_payments for the store
  total_balance: number;            // live: total_commission - total_paid
};

// P68: one row per commission period (per store, per month) with live values
export type CommissionPeriod = {
  id: string;                       // the store_commissions row id (for drill-in)
  period_start: string;
  period_end: string;
  total_revenue: number;            // live: sum of paid orders in this period
  commission_rate: number;          // the rate that was used
  commission_amount: number;        // live: total_revenue × rate / 100
  paid_amount: number;              // live: sum of commission_payments for this row
  balance_due: number;              // live: commission_amount - paid_amount
  status: "unpaid" | "partially_paid" | "paid";
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

function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  // last day of current month: day 0 of next month
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
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
 * P68: List of stores for the /commissions list page. Each store has
 * a live aggregate of total commission, total paid, and total balance
 * across all its commission periods. Computed from the current orders
 * table on every page load (4 batched queries, O(1) regardless of store
 * count or order volume).
 */
export async function getCommissionStoresForList(): Promise<CommissionStoreSummary[]> {
  await assertPermission("commissions", "view");
  const adminSupabase = createAdminClient();
  // Clear the in-memory cache so the live computation is fresh per request
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

  // 2) all paid orders
  const ordersRes = await adminSupabase
    .from("orders")
    .select("store_id, total_amount, placed_at")
    .eq("payment_status", "paid");
  const orders = (ordersRes.data ?? []) as { store_id: string | null; total_amount: number; placed_at: string }[];

  // 3) all commission rows (id, store_id, period_start, period_end)
  const commRes = await adminSupabase
    .from("store_commissions")
    .select("id, store_id, period_start, period_end");
  const commissions = (commRes.data ?? []) as { id: string; store_id: string; period_start: string; period_end: string }[];

  // 4) all commission_payments joined with their commission row
  const payRes = await adminSupabase
    .from("commission_payments")
    .select("commission_id, amount");
  const allPayments = (payRes.data ?? []) as { commission_id: string; amount: number }[];

  // Default rate (global) — cached per request
  const defaultRate = await getGlobalDefaultRate(adminSupabase);

  // Build maps for O(1) lookup
  const periodById = new Map<string, { store_id: string }>();
  for (const c of commissions) periodById.set(c.id, { store_id: c.store_id });

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

  // commission_amountByStore: sum of all live commission_amounts for the store
  // We need (store_id, period_start, period_end) → sum of paid orders
  // Build: ordersByStoreAndPeriod: Map<store_id, Map<period_id, sum>>
  // First, group commissions by store
  const periodsByStore = new Map<string, { id: string; start: string; end: string }[]>();
  for (const c of commissions) {
    const list = periodsByStore.get(c.store_id) ?? [];
    list.push({ id: c.id, start: c.period_start, end: c.period_end });
    periodsByStore.set(c.store_id, list);
  }

  // Build: period boundaries in epoch for quick compare
  function periodContains(periodStart: string, periodEnd: string, placedAt: string): boolean {
    return placedAt >= periodStart && placedAt <= `${periodEnd}T23:59:59.999Z`;
  }

  const summary: CommissionStoreSummary[] = stores.map((s) => {
    const periods = periodsByStore.get(s.id) ?? [];
    const rate = effectiveRateFor(s, defaultRate);

    // Sum revenue per period, then compute commission_amount per period, then total
    let totalCommission = 0;
    for (const period of periods) {
      const periodRevenue = orders
        .filter((o) => o.store_id === s.id && periodContains(period.start, period.end, o.placed_at))
        .reduce((sum, o) => sum + Number(o.total_amount), 0);
      totalCommission += periodRevenue * (rate / 100);
    }

    const totalPaid = paymentsByStore.get(s.id) ?? 0;
    const totalBalance = Math.max(totalCommission - totalPaid, 0);

    // last_period_end: max end across this store's periods
    const lastEnd = periods
      .map((p) => p.end)
      .reduce<string | null>((max, e) => (max === null || e > max ? e : max), null);

    return {
      id: s.id,
      name: s.name,
      code: s.code,
      commission_rate: rate,
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
 * P68: Per-store commission periods. Returns all commission rows for
 * the given store, with live-computed revenue / amount / paid / balance.
 * Auto-creates a row for the current month on first view if none exists.
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

  // 2) Commission rows for this store
  const commRes = await adminSupabase
    .from("store_commissions")
    .select("id, period_start, period_end, notes")
    .eq("store_id", storeId)
    .order("period_start", { ascending: false });
  let periods = (commRes.data ?? []) as {
    id: string; period_start: string; period_end: string; notes: string | null;
  }[];

  // 3) Auto-create the current month if missing
  const { start: curStart, end: curEnd } = getCurrentMonthRange();
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
      .select("id, period_start, period_end, notes")
      .single();
    if (insErr) {
      // Non-fatal: log and continue. The page still works with existing periods.
      console.warn(`[commissions] auto-create current month failed: ${insErr.message}`);
    } else if (inserted) {
      // Refetch the list so the new row is included
      const refetch = await adminSupabase
        .from("store_commissions")
        .select("id, period_start, period_end, notes")
        .eq("store_id", storeId)
        .order("period_start", { ascending: false });
      periods = (refetch.data ?? []) as typeof periods;
    }
  }

  // 4) Paid orders for this store
  const ordersRes = await adminSupabase
    .from("orders")
    .select("total_amount, placed_at")
    .eq("store_id", storeId)
    .eq("payment_status", "paid");
  const orders = (ordersRes.data ?? []) as { total_amount: number; placed_at: string }[];

  // 5) Commission payments for these commission rows
  const periodIds = periods.map((p) => p.id);
  const payRes = periodIds.length
    ? await adminSupabase
        .from("commission_payments")
        .select("commission_id, amount")
        .in("commission_id", periodIds)
    : { data: [] as { commission_id: string; amount: number }[] };
  const payments = (payRes.data ?? []) as { commission_id: string; amount: number }[];

  // 6) Default rate + effective rate for this store
  const defaultRate = await getGlobalDefaultRate(adminSupabase);
  const rate = effectiveRateFor(store, defaultRate);

  // 7) paid_by_period
  const paidByPeriod = new Map<string, number>();
  for (const p of payments) {
    paidByPeriod.set(p.commission_id, (paidByPeriod.get(p.commission_id) ?? 0) + Number(p.amount));
  }

  // 8) Build the live period list
  const result: CommissionPeriod[] = periods.map((p) => {
    const totalRevenue = orders
      .filter((o) => o.placed_at >= p.period_start && o.placed_at <= `${p.period_end}T23:59:59.999Z`)
      .reduce((sum, o) => sum + Number(o.total_amount), 0);
    const commissionAmount = totalRevenue * (rate / 100);
    const paidAmount = paidByPeriod.get(p.id) ?? 0;
    const balanceDue = Math.max(commissionAmount - paidAmount, 0);
    return {
      id: p.id,
      period_start: p.period_start,
      period_end: p.period_end,
      total_revenue: round2(totalRevenue),
      commission_rate: rate,
      commission_amount: round2(commissionAmount),
      paid_amount: round2(paidAmount),
      balance_due: round2(balanceDue),
      status: deriveStatus(commissionAmount, paidAmount),
      notes: p.notes,
    };
  });

  return { store: { ...store, commission_rate: rate }, periods: result };
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
