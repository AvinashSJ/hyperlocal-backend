"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type CustomerAddress = {
  id: string;
  type: string | null;
  full_name: string | null;
  phone: string | null;
  pincode: string | null;
  address_line1: string | null;
  address_line2: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  is_default: boolean | null;
  is_deliverable: boolean | null;
};

export type CustomerUser = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  profile: {
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
  } | null;
  addresses: CustomerAddress[];
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
    const { data: users, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error || !users?.users) {
      console.error("Failed to list users:", error);
      return [];
    }
    userIds = users.users.map((u) => u.id);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, phone, role")
    .in("id", userIds)
    .eq("role", "customer");

  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      { full_name: p.full_name, avatar_url: p.avatar_url, phone: p.phone },
    ]),
  );

  const addressColumns = "id, user_id, type, full_name, phone, pincode, address_line1, address_line2, landmark, city, state, is_default, is_deliverable";

  const { data: addresses } = await supabase
    .from("addresses")
    .select(addressColumns)
    .in("user_id", userIds);

  const addressesByUser = new Map<string, CustomerAddress[]>();
  for (const row of addresses ?? []) {
    const list = addressesByUser.get(row.user_id) ?? [];
    list.push({
      id: row.id,
      type: row.type ?? null,
      full_name: row.full_name ?? null,
      phone: row.phone ?? null,
      pincode: row.pincode ?? null,
      address_line1: row.address_line1 ?? null,
      address_line2: row.address_line2 ?? null,
      landmark: row.landmark ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      is_default: row.is_default ?? null,
      is_deliverable: row.is_deliverable ?? null,
    });
    addressesByUser.set(row.user_id, list);
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
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const userMap = new Map((users?.users ?? []).map((u) => [u.id, u]));
    userRecords = userIds.map((id) => {
      const u = userMap.get(id);
      return { id, email: u?.email ?? null, phone: u?.phone ?? null, created_at: u?.created_at ?? "", last_sign_in_at: u?.last_sign_in_at ?? null };
    });
  } else {
    const { data: users, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error || !users?.users) return [];
    userRecords = users.users.map((u) => ({
      id: u.id, email: u.email ?? null, phone: u.phone ?? null,
      created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null,
    }));
  }

  return userRecords
    .filter((u) => profileMap.has(u.id))
    .map((u) => {
      const addrs = addressesByUser.get(u.id) ?? [];
      return {
        id: u.id,
        email: u.email ?? null,
        phone: profileMap.get(u.id)?.phone ?? u.phone ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        profile: profileMap.get(u.id) ?? null,
        addresses: addrs,
        addressCount: addrs.length,
        orderCount: orderCountMap.get(u.id) ?? 0,
      };
    });;
}
