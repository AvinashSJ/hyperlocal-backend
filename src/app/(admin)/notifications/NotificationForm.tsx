"use client";

import { useActionState } from "react";
import { runServerAction } from "@/lib/run-server-action";
import { createNotification } from "./actions";

export default function NotificationForm({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(async (_prev: { error: string | null }, formData: FormData) => {
    const result = await runServerAction(createNotification, formData);
    if (result.ok) {
      onClose();
      return { error: null };
    }
    return { error: result.error.message };
  }, { error: null });

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div className="card" style={{ width: 480, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>Send Notification</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <form action={formAction}>
          <div className="card-body">
            {state.error && <div className="alert alert-danger py-2">{state.error}</div>}

            <div className="mb-3">
              <label className="form-label">User ID <span className="text-danger">*</span></label>
              <input type="text" name="user_id" className="form-control" placeholder="UUID of the user" required />
            </div>

            <div className="mb-3">
              <label className="form-label">Title <span className="text-danger">*</span></label>
              <input type="text" name="title" className="form-control" required />
            </div>

            <div className="mb-3">
              <label className="form-label">Body</label>
              <textarea name="body" className="form-control" rows={3} />
            </div>

            <div className="mb-3">
              <label className="form-label">Type</label>
              <input type="text" name="type" className="form-control" placeholder="e.g. order, promo, alert" />
            </div>
          </div>
          <div className="card-footer d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Sending..." : "Send Notification"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
