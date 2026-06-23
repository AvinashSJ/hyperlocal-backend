import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type StoreScope = {
  storeId: string | null;
  isStoreScoped: boolean;
  /**
   * P47: the caller's role name (e.g. "Super Admin", "Manager", "Staff",
   * or a custom role). Populated by `getStoreScope` so callers can decide
   * whether to show the "not assigned to a store" guard.
   */
  roleName: string | null;
};

/**
 * P47: Error thrown by `assertStoreScope` when a non-Super-Admin user has
 * `profile.store_id IS NULL`. Pages catch this and redirect to the
 * `/unassigned-store` page (see `src/app/(admin)/unassigned-store/page.tsx`).
 */
export class UnassignedStoreError extends Error {
  constructor() {
    super("Your account is not assigned to a store. Contact a Super Admin.");
    this.name = "UnassignedStoreError";
  }
}

export async function getStoreScope(): Promise<StoreScope> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { storeId: null, isStoreScoped: false, roleName: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("store_id, role_id")
    .eq("id", user.id)
    .single();

  if (!profile?.store_id) {
    // P47: surface the silent data leak via a console.warn. The
    // hard guard for pages is `assertStoreScope` (called separately
    // by /orders, /customers, /invoices). This warning is dev/CI
    // noise by design — it makes the leak visible without forcing
    // every caller to add the guard.
    console.warn(
      "[store-scope] non-Super-Admin user has profile.store_id = NULL; downstream queries will skip the store_id filter and return all data",
    );
    return { storeId: null, isStoreScoped: false, roleName: null };
  }

  const adminSupabase = createAdminClient();
  const { data: roleData } = await adminSupabase
    .from("roles")
    .select("name")
    .eq("id", profile.role_id)
    .single();

  if (roleData?.name === "Super Admin") {
    return { storeId: null, isStoreScoped: false, roleName: roleData.name };
  }

  return {
    storeId: profile.store_id,
    isStoreScoped: true,
    roleName: roleData?.name ?? null,
  };
}

/**
 * P47: Hard guard. Call this from a page after `getStoreScope()` to
 * throw a redirect-able error when a non-Super-Admin user has no
 * `store_id`. Use together with `redirect()` in the page to send the
 * user to `/unassigned-store` with a clear message.
 *
 * Example:
 *   const scope = await getStoreScope();
 *   assertStoreScope(scope);  // throws if non-SA and storeId is null
 *
 *   if (!scope.isSuperAdmin && !scope.storeId) {
 *     // (defensive: assertStoreScope already threw, but TS doesn't know)
 *     redirect("/unassigned-store");
 *   }
 */
export function assertStoreScope(scope: StoreScope): void {
  if (scope.roleName === "Super Admin") return;
  if (scope.isStoreScoped && scope.storeId) return;
  // roleName is null (anon / no profile / no role_id) — treat as non-scoped.
  // roleName is "Manager" / "Staff" / custom with no store_id → throw.
  // roleName is "customer" (no permissions anyway) → throw (defensive).
  throw new UnassignedStoreError();
}

export function withStoreScope<T>(
  q: { eq: (col: string, val: unknown) => T },
  storeId: string | null,
  column = "store_id",
): T {
  if (!storeId) return q as unknown as T;
  return q.eq(column, storeId);
}

