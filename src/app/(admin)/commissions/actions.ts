"use server";

import { createAdminClient } from "@/lib/supabase/admin";
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
};

export async function getStoresLight(): Promise<SimpleStore[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("stores").select("id, name").order("name");
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
    total_revenue: Number(c.total_revenue),
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

export async function generateCommission(formData: FormData) {
  await assertPermission("commissions", "create");
  const supabase = createAdminClient();

  const storeId = formData.get("store_id") as string;
  const periodStart = formData.get("period_start") as string;
  const periodEnd = formData.get("period_end") as string;
  const notes = formData.get("notes") as string;

  if (!storeId || !periodStart || !periodEnd) {
    throw new Error("Store, period start, and period end are required");
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, commission_rate")
    .eq("id", storeId)
    .single();

  if (!store) throw new Error("Store not found");

  const { data: orders } = await supabase
    .from("orders")
    .select("total_amount")
    .eq("store_id", storeId)
    .eq("payment_status", "paid")
    .gte("placed_at", periodStart)
    .lte("placed_at", `${periodEnd}T23:59:59.999Z`);

  const totalRevenue = (orders ?? []).reduce((sum, o) => sum + Number(o.total_amount), 0);
  const rate = Number(store.commission_rate ?? 0);
  const commissionAmount = totalRevenue * (rate / 100);

  const { data: profile } = await supabase.auth.getUser();
  const userId = profile.user?.id;

  const { error } = await supabase.from("store_commissions").insert({
    store_id: storeId,
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

  if (error) throw new Error(error.message);

  revalidatePath("/commissions");
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

  const { data: profile } = await supabase.auth.getUser();
  const userId = profile.user?.id;

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
