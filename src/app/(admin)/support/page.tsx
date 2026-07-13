import { requirePermission } from "@/lib/require-permission";
import { getSupportTickets } from "./actions";
import SupportTicketsClient from "./SupportTicketsClient";

export default async function SupportPage() {
  await requirePermission("support_tickets", "view");
  const tickets = await getSupportTickets();

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">Support Tickets</h4>
      </div>
      <SupportTicketsClient tickets={tickets} />
    </div>
  );
}
