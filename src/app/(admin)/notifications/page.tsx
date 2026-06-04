import { requirePermission } from "@/lib/require-permission";
import { canAccess } from "@/lib/permissions";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { getNotifications } from "./actions";
import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage() {
  const { permissions } = await requirePermission("notifications", "view");
  const notifications = await getNotifications();
  const canSend = canAccess(permissions, "notifications", "send");
  const canDelete = canAccess(permissions, "notifications", "delete");

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">Notifications</h4>
        {canSend && (
          <Link href="/notifications/new" className="btn btn-primary">
            <Icon icon="ri:add-line" className="me-1" />
            Send Notification
          </Link>
        )}
      </div>

      <NotificationsClient notifications={notifications} canSend={canSend} canDelete={canDelete} />
    </div>
  );
}
