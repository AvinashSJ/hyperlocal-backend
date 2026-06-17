"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type CustomerUser = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  profile: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  addressCount: number;
  orderCount: number;
};

export async function getCustomers(storeId?: string | null): Promise<CustomerUser[]> {
  const supabase = createAdminClient();

  let userIds: string[];
  if (storeId) {
    const { data: orderUsers } = await supabase
      .from("orders")
      .select("user_id")
      .eq("store_id", storeId);
    userIds = [...new Set((orderUsers ?? []).map((o) => o.user_id))];
    if (userIds.length === 0) return [];
  } else {
    const { data: users, error } = await supabase.auth.admin.listUsers();
    if (error || !users?.users) {
      console.error("Failed to list users:", error);
      return [];
    }
    userIds = users.users.map((u) => u.id);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .in("id", userIds)
    .eq("role", "customer");

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]),
  );

  const { data: addressCounts } = await supabase
    .from("addresses")
    .select("user_id")
    .in("user_id", userIds);

  const addressCountMap = new Map<string, number>();
  for (const row of addressCounts ?? []) {
    addressCountMap.set(row.user_id, (addressCountMap.get(row.user_id) ?? 0) + 1);
  }

  const orderQ = supabase.from("orders").select("user_id").in("user_id", userIds);
  if (storeId) orderQ.eq("store_id", storeId);

  const { data: orderCounts } = await orderQ;

  const orderCountMap = new Map<string, number>();
  for (const row of orderCounts ?? []) {
    orderCountMap.set(row.user_id, (orderCountMap.get(row.user_id) ?? 0) + 1);
  }

  let userRecords: { id: string; email: string | null; phone: string | null; created_at: string; last_sign_in_at: string | null }[];
  if (storeId) {
    const { data: users } = await supabase.auth.admin.listUsers();
    const userMap = new Map((users?.users ?? []).map((u) => [u.id, u]));
    userRecords = userIds.map((id) => {
      const u = userMap.get(id);
      return { id, email: u?.email ?? null, phone: u?.phone ?? null, created_at: u?.created_at ?? "", last_sign_in_at: u?.last_sign_in_at ?? null };
    });
  } else {
    const { data: users, error } = await supabase.auth.admin.listUsers();
    if (error || !users?.users) return [];
    userRecords = users.users.map((u) => ({
      id: u.id, email: u.email ?? null, phone: u.phone ?? null,
      created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null,
    }));
  }

  return userRecords
    .filter((u) => profileMap.has(u.id))
    .map((u) => ({
      id: u.id,
      email: u.email ?? null,
      phone: u.phone ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      profile: profileMap.get(u.id) ?? null,
      addressCount: addressCountMap.get(u.id) ?? 0,
      orderCount: orderCountMap.get(u.id) ?? 0,
    }));
}
