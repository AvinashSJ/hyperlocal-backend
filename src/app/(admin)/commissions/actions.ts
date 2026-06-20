"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
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

/**
 * P27: Resolve the effective commission rate for a store.
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

export async function getStoresLight(): Promise<SimpleStore[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select("id, name, commission_rate")
    .order("name");
  return (data ?? []) as SimpleStore[];
}

export async function getCommissions(storeId?: string | null): Promise<CommissionRow[]> {
  await assertPermission("commissions", "view");
  const supabase = createAdminClient();

  let query = supabase
    .from("store_commissions")
    .select("*, stores(name)")
    .order("created_at", { ascending: false });

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error("Failed to fetch commissions:", error);
    return [];
  }

  const commissionIds = data.map((c) => c.id);
  const { data: paymentCounts } = await supabase
    .from("commission_payments")
    .select("commission_id")
    .in("commission_id", commissionIds);

  const countMap = new Map<string, number>();
  for (const p of paymentCounts ?? []) {
    countMap.set(p.commission_id, (countMap.get(p.commission_id) ?? 0) + 1);
  }

  return data.map((c) => ({
    id: c.id,
    store_id: c.store_id,
    store_name: (c.stores as { name: string } | null)?.name ?? null,
    period_start: c.period_start,
    period_end: c.period_end,
    total_revenue: Number(c.total_amount),
    commission_rate: Number(c.commission_rate),
    commission_amount: Number(c.commission_amount),
    balance_due: Number(c.balance_due),
    status: c.status,
    notes: c.notes,
    created_at: c.created_at,
    payment_count: countMap.get(c.id) ?? 0,
  }));
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
 * P27: Per-store commission generation. Extracted as a shared helper so
 * `generateCommission` (single-store) and `generateAllCommissions` (bulk)
 * use identical math.
 */
async function generateForSingleStore(
  adminSupabase: ReturnType<typeof createAdminClient>,
  store: { id: string; name: string; commission_rate: number | null },
  periodStart: string,
  periodEnd: string,
  notes: string,
  userId: string | null,
): Promise<{ inserted: boolean; revenue: number; commission: number; rate: number; reason?: string }> {
  const rate = await resolveCommissionRate(adminSupabase, store);
  if (rate <= 0) {
    return {
      inserted: false,
      revenue: 0,
      commission: 0,
      rate: 0,
      reason: "No commission rate available (no per-store rate, no global default)",
    };
  }

  const { data: orders } = await adminSupabase
    .from("orders")
    .select("total_amount")
    .eq("store_id", store.id)
    .eq("payment_status", "paid")
    .gte("placed_at", periodStart)
    .lte("placed_at", `${periodEnd}T23:59:59.999Z`);

  const totalRevenue = (orders ?? []).reduce((sum, o) => sum + Number(o.total_amount), 0);
  const commissionAmount = totalRevenue * (rate / 100);

  // P27: also persist the rate that was used. If the store has no rate
  // and the default was used, future audit will show the actual rate applied.
  const { error } = await adminSupabase.from("store_commissions").insert({
    store_id: store.id,
    period_start: periodStart,
    period_end: periodEnd,
    total_revenue: totalRevenue,
    commission_rate: rate,
    commission_amount: commissionAmount,
    balance_due: commissionAmount,
    status: commissionAmount > 0 ? "unpaid" : "paid",
    notes: notes || null,
    created_by: userId,
  });

  if (error) {
    return {
      inserted: false,
      revenue: totalRevenue,
      commission: commissionAmount,
      rate,
      reason: error.message,
    };
  }

  return { inserted: true, revenue: totalRevenue, commission: commissionAmount, rate };
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

export async function generateCommission(formData: FormData) {
  await assertPermission("commissions", "create");
  const adminSupabase = createAdminClient();

  const storeId = formData.get("store_id") as string;
  const periodStart = formData.get("period_start") as string;
  const periodEnd = formData.get("period_end") as string;
  const notes = formData.get("notes") as string;

  if (!storeId || !periodStart || !periodEnd) {
    throw new Error("Store, period start, and period end are required");
  }
  if (periodStart > periodEnd) {
    throw new Error("period_start must be on or before period_end");
  }

  const { data: store } = await adminSupabase
    .from("stores")
    .select("id, name, commission_rate")
    .eq("id", storeId)
    .single();

  if (!store) throw new Error("Store not found");

  const userId = await resolveUserId();

  const result = await generateForSingleStore(
    adminSupabase,
    store,
    periodStart,
    periodEnd,
    notes,
    userId,
  );

  if (!result.inserted) {
    throw new Error(
      result.reason ??
        `Store "${store.name}" has no commission rate. Set a per-store rate or set a global default.`,
    );
  }

  revalidatePath("/commissions");
  return result;
}

/**
 * P27: Bulk-generate commissions for ALL stores for the same period.
 * Duplicates are allowed (each generation creates a new row, even for
 * the same store + period — the `created_at` timestamp distinguishes them).
 */
export async function generateAllCommissions(
  formData: FormData,
): Promise<GenerateAllResult> {
  await assertPermission("commissions", "create");
  const adminSupabase = createAdminClient();

  const periodStart = formData.get("period_start") as string;
  const periodEnd = formData.get("period_end") as string;
  const notes = formData.get("notes") as string;

  if (!periodStart || !periodEnd) {
    throw new Error("Both period_start and period_end are required");
  }
  if (periodStart > periodEnd) {
    throw new Error("period_start must be on or before period_end");
  }

  // P27: include ALL stores (the user clarified — "All stores", not just active).
  // Inactive stores can still have commissions generated for past periods.
  const { data: stores } = await adminSupabase
    .from("stores")
    .select("id, name, commission_rate")
    .order("name");

  if (!stores || stores.length === 0) {
    revalidatePath("/commissions");
    return { generated: 0, skipped: 0, total_stores: 0, errors: [] };
  }

  const userId = await resolveUserId();

  const summary: GenerateAllResult = {
    generated: 0,
    skipped: 0,
    total_stores: stores.length,
    errors: [],
  };

  // Process each store sequentially (DB-side — single-threaded insert). The
  // total is bounded by the number of stores (typically <100) and each
  // iteration is fast. Promise.all would help with parallel queries but
  // could overwhelm the DB on large store counts. Sequential is safer.
  for (const store of stores) {
    const result = await generateForSingleStore(
      adminSupabase,
      store,
      periodStart,
      periodEnd,
      notes,
      userId,
    );
    if (result.inserted) {
      summary.generated++;
    } else {
      summary.skipped++;
      summary.errors.push({
        store_id: store.id,
        store_name: store.name,
        message: result.reason ?? "Unknown error",
      });
    }
  }

  revalidatePath("/commissions");
  return summary;
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

  revalidatePath("/commissions");
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

  revalidatePath("/commissions");
}
