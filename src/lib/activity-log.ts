import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActivityLog } from "@/lib/types/supabase";

export type ActivityAction = "create" | "update" | "delete" | "bulk_import";

export type ActivityLogWithUser = ActivityLog & {
  profiles: { full_name: string | null }[] | null;
};

/**
 * Inserts a row into `activity_logs`. Best-effort: if the insert fails (DB
 * error, missing user, etc.), the error is logged to the console but NOT
 * re-thrown — the calling action (createProduct, updateProduct, etc.) should
 * never fail because the audit log failed.
 *
 * Uses `createClient()` to read `auth.getUser()` for the `user_id`, then
 * `createAdminClient()` for the insert (consistent with the rest of the
 * codebase: server client for user context, admin client for writes).
 */
export async function logActivity(args: {
  action: ActivityAction;
  entityType: string;
  entityId: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase.from("activity_logs").insert({
      user_id: user?.id ?? null,
      action: args.action,
      entity_type: args.entityType,
      entity_id: args.entityId,
      details: args.details ?? null,
    });
    if (error) {
      console.error("[activity-log] insert failed:", error.message);
    }
  } catch (e) {
    console.error("[activity-log] unexpected error:", (e as Error).message);
  }
}

/**
 * Fetches the most recent activity_log entries for a given entity, joined
 * with `profiles(full_name)` for display. Ordered newest first. Used by
 * the product edit page to render the audit timeline.
 */
export async function getEntityActivityLog(
  entityType: string,
  entityId: string,
  limit = 100,
): Promise<ActivityLogWithUser[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("activity_logs")
    .select("id, user_id, action, entity_type, entity_id, details, created_at, profiles(full_name)")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as ActivityLogWithUser[];
}
