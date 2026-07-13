"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import { logActivity } from "@/lib/activity-log";
import type { SupportTicket } from "@/lib/types/supabase";

export type TicketListItem = {
  id: string;
  subject: string;
  status: SupportTicket["status"];
  priority: SupportTicket["priority"];
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  assigned_name: string | null;
};

export type TicketDetail = SupportTicket & {
  customer_name: string | null;
  assigned_name: string | null;
};

export async function getSupportTickets(): Promise<TicketListItem[]> {
  await assertPermission("support_tickets", "view");
  const supabase = createAdminClient();
  const { storeId } = await getStoreScope();

  let query = supabase
    .from("support_tickets")
    .select("id, subject, status, priority, created_at, updated_at, profiles!support_tickets_user_id_fkey(full_name), assigned:profiles!support_tickets_assigned_to_fkey(full_name)")
    .order("created_at", { ascending: false });

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    subject: r.subject as string,
    status: r.status as SupportTicket["status"],
    priority: r.priority as SupportTicket["priority"],
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    customer_name: (r.profiles as { full_name: string } | null)?.full_name ?? null,
    assigned_name: (r.assigned as { full_name: string } | null)?.full_name ?? null,
  }));
}

export async function getSupportTicket(id: string): Promise<TicketDetail | null> {
  await assertPermission("support_tickets", "view");
  const supabase = createAdminClient();
  const { storeId } = await getStoreScope();

  let query = supabase
    .from("support_tickets")
    .select("*, profiles!support_tickets_user_id_fkey(full_name), assigned:profiles!support_tickets_assigned_to_fkey(full_name)")
    .eq("id", id);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query.single();
  if (error) return null;

  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    store_id: r.store_id as string | null,
    subject: r.subject as string,
    message: r.message as string,
    status: r.status as SupportTicket["status"],
    priority: r.priority as SupportTicket["priority"],
    assigned_to: r.assigned_to as string | null,
    admin_response: r.admin_response as string | null,
    resolved_at: r.resolved_at as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    customer_name: (r.profiles as { full_name: string } | null)?.full_name ?? null,
    assigned_name: (r.assigned as { full_name: string } | null)?.full_name ?? null,
  };
}

export async function updateTicketStatus(
  id: string,
  status: SupportTicket["status"],
): Promise<void> {
  await assertPermission("support_tickets", "edit");
  const supabase = createAdminClient();
  const { storeId } = await getStoreScope();

  const updateData: Record<string, unknown> = { status };
  if (status === "resolved" || status === "closed") {
    updateData.resolved_at = new Date().toISOString();
  } else {
    updateData.resolved_at = null;
  }

  let query = supabase.from("support_tickets").update(updateData).eq("id", id);
  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { error } = await query;
  if (error) throw new Error(error.message);

  await logActivity({
    action: "update",
    entityType: "support_ticket",
    entityId: id,
    details: { status },
  });

  revalidatePath("/support");
  revalidatePath(`/support/${id}`);
}

export async function respondToTicket(id: string, response: string): Promise<void> {
  await assertPermission("support_tickets", "edit");
  const supabase = createAdminClient();
  const { storeId } = await getStoreScope();

  let query = supabase.from("support_tickets").update({ admin_response: response }).eq("id", id);
  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { error } = await query;
  if (error) throw new Error(error.message);

  await logActivity({
    action: "update",
    entityType: "support_ticket",
    entityId: id,
    details: { action: "admin_response" },
  });

  revalidatePath(`/support/${id}`);
}

export async function assignTicket(id: string, userId: string | null): Promise<void> {
  await assertPermission("support_tickets", "edit");
  const supabase = createAdminClient();
  const { storeId } = await getStoreScope();

  let query = supabase.from("support_tickets").update({ assigned_to: userId }).eq("id", id);
  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { error } = await query;
  if (error) throw new Error(error.message);

  await logActivity({
    action: "update",
    entityType: "support_ticket",
    entityId: id,
    details: { action: "assign", assigned_to: userId },
  });

  revalidatePath("/support");
  revalidatePath(`/support/${id}`);
}
