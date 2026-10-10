"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { selectByIn } from "@/lib/in-batch";

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

type AuthUserRecord = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

/** Auth pages of 1000; hard stop so a runaway listing cannot loop forever. */
const AUTH_PAGE_SIZE = 1000;
const MAX_AUTH_PAGES = 10;

/**
 * Lists every auth user via the admin API, following pagination.
 * Returns null users when the listing fails (same contract as the original code).
 */
async function listAllAuthUsers(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<{ users: AuthUserRecord[] | null; error: unknown }> {
  const users: AuthUserRecord[] = [];

  for (let page = 1; page <= MAX_AUTH_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error || !data?.users) return { users: null, error };

    users.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        phone: u.phone ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })),
    );
    if (data.users.length < AUTH_PAGE_SIZE) break;
  }

  return { users, error: null };
}

export async function getCustomers(storeId?: string | null): Promise<CustomerUser[]> {
  const supabase = createAdminClient();

  // One auth listing serves both branches: the global branch derives its
  // candidate id set from it, and both branches use it for email/phone/dates.
  // (This used to call listUsers twice in the global branch.)
  const authUsers = await listAllAuthUsers(supabase);
  if (!authUsers.users) {
    console.error("Failed to list users:", authUsers.error);
    return [];
  }
  const authById = new Map(authUsers.users.map((u) => [u.id, u]));

  let userIds: string[];
  if (storeId) {
    const { data: orderUsers, error: probeError } = await supabase
      .from("orders")
      .select("user_id")
      .eq("store_id", storeId);
    if (probeError) throw new Error(probeError.message);
    userIds = [...new Set((orderUsers ?? []).map((o) => o.user_id))];
    if (userIds.length === 0) return [];
  } else {
    userIds = [...new Set(authUsers.users.map((u) => u.id))];
  }

  // Batched `.in()` filters: shipping all ids in one request exceeded the
  // 16 KB header cap, which stalled each query until Amplify timed out (504).
  const profiles = await selectByIn(userIds, (batch) =>
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, phone, role")
      .in("id", batch)
      .eq("role", "customer"),
  );

  const profileMap = new Map(
    profiles.map((p) => [
      p.id,
      { full_name: p.full_name, avatar_url: p.avatar_url, phone: p.phone },
    ]),
  );

  const addressColumns = "id, user_id, type, full_name, phone, pincode, address_line1, address_line2, landmark, city, state, is_default, is_deliverable";

  const addresses = await selectByIn(userIds, (batch) =>
    supabase.from("addresses").select(addressColumns).in("user_id", batch),
  );

  const addressesByUser = new Map<string, CustomerAddress[]>();
  for (const row of addresses) {
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

  const orderCounts = await selectByIn(userIds, (batch) => {
    const orderQ = supabase.from("orders").select("user_id").in("user_id", batch);
    if (storeId) orderQ.eq("store_id", storeId);
    return orderQ;
  });

  const orderCountMap = new Map<string, number>();
  for (const row of orderCounts) {
    orderCountMap.set(row.user_id, (orderCountMap.get(row.user_id) ?? 0) + 1);
  }

  const userRecords: AuthUserRecord[] = storeId
    ? userIds.map((id) => {
        const u = authById.get(id);
        return {
          id,
          email: u?.email ?? null,
          phone: u?.phone ?? null,
          created_at: u?.created_at ?? "",
          last_sign_in_at: u?.last_sign_in_at ?? null,
        };
      })
    : authUsers.users;

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
    });
}
