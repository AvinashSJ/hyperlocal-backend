import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type StoreScope = {
  storeId: string | null;
  isStoreScoped: boolean;
};

export async function getStoreScope(): Promise<StoreScope> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { storeId: null, isStoreScoped: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("store_id, role_id")
    .eq("id", user.id)
    .single();

  if (!profile?.store_id) return { storeId: null, isStoreScoped: false };

  const adminSupabase = createAdminClient();
  const { data: roleData } = await adminSupabase
    .from("roles")
    .select("name")
    .eq("id", profile.role_id)
    .single();

  if (roleData?.name === "Super Admin") {
    return { storeId: null, isStoreScoped: false };
  }

  return { storeId: profile.store_id, isStoreScoped: true };
}

export function withStoreScope<T>(
  q: { eq: (col: string, val: unknown) => T },
  storeId: string | null,
  column = "store_id",
): T {
  if (!storeId) return q as unknown as T;
  return q.eq(column, storeId);
}
