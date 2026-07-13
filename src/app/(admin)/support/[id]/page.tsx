import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/require-permission";
import { getSupportTicket } from "../actions";
import SupportTicketDetailClient from "./SupportTicketDetailClient";

export default async function SupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("support_tickets", "view");
  const { id } = await params;
  const ticket = await getSupportTicket(id);
  if (!ticket) notFound();

  return <SupportTicketDetailClient ticket={ticket} />;
}
