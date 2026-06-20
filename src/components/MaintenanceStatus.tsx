"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { runServerAction } from "@/lib/run-server-action";
import { updateAppMaintenance, updateStoreMaintenance } from "@/app/(admin)/settings/actions";

type AppMaintenanceValue = {
  enabled: boolean;
  reason: "maintenance" | "technical" | "operations";
  message: string;
  etaHours: number | null;
};

type StoreMaintenanceValue = AppMaintenanceValue;

const REASONS: AppMaintenanceValue["reason"][] = [
  "maintenance",
  "technical",
  "operations",
];

const REASON_LABEL: Record<AppMaintenanceValue["reason"], string> = {
  maintenance: "Scheduled Maintenance",
  technical: "Technical Issue",
  operations: "Operations Constraint",
};

type Props = {
  isSuperAdmin: boolean;
  isStoreScoped: boolean;
  app: AppMaintenanceValue;
  store: StoreMaintenanceValue;
  storeId: string | null;
};

export default function MaintenanceStatus({
  isSuperAdmin,
  isStoreScoped,
  app,
  store,
  storeId,
}: Props) {
  const router = useRouter();
  const [openPopover, setOpenPopover] = useState<"app" | "store" | null>(null);
  const [appEnabled, setAppEnabled] = useState(app.enabled);
  const [appReason, setAppReason] = useState<AppMaintenanceValue["reason"]>(
    app.reason,
  );
  const [appMessage, setAppMessage] = useState(app.message);
  const [appEta, setAppEta] = useState(app.etaHours?.toString() ?? "");
  const [storeEnabled, setStoreEnabled] = useState(store.enabled);
  const [storeReason, setStoreReason] = useState<StoreMaintenanceValue["reason"]>(
    store.reason,
  );
  const [storeMessage, setStoreMessage] = useState(store.message);
  const [storeEta, setStoreEta] = useState(store.etaHours?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenPopover(null);
      }
    }
    if (openPopover) {
      document.addEventListener("mousedown", onClickAway);
      return () => document.removeEventListener("mousedown", onClickAway);
    }
  }, [openPopover]);

  // P35: clicking the navbar switch toggles the maintenance state
  // immediately (Option A semantics) and opens the popover for the
  // remaining config (reason / message / ETA). Optimistic update with
  // rollback on failure.
  const toggleAndOpen = async (target: "app" | "store") => {
    if (target === "app") {
      const newEnabled = !appEnabled;
      setAppEnabled(newEnabled);
      setOpenPopover("app");
      const fd = new FormData();
      fd.append("enabled", String(newEnabled));
      fd.append("reason", appReason);
      fd.append("message", appMessage);
      if (appEta) fd.append("etaHours", appEta);
      setBusy(true);
      setError(null);
      const result = await runServerAction(updateAppMaintenance, fd);
      setBusy(false);
      if (!result.ok) {
        setAppEnabled(!newEnabled);
        setError(result.error.message);
      } else {
        router.refresh();
      }
    } else {
      if (!storeId) return;
      const newEnabled = !storeEnabled;
      setStoreEnabled(newEnabled);
      setOpenPopover("store");
      const fd = new FormData();
      fd.append("store_id", storeId);
      fd.append("enabled", String(newEnabled));
      fd.append("reason", storeReason);
      fd.append("message", storeMessage);
      if (storeEta) fd.append("etaHours", storeEta);
      setBusy(true);
      setError(null);
      const result = await runServerAction(updateStoreMaintenance, fd);
      setBusy(false);
      if (!result.ok) {
        setStoreEnabled(!newEnabled);
        setError(result.error.message);
      } else {
        router.refresh();
      }
    }
  };

  // P35: the popover's switch is interactive too (per the user's
  // "popover can also toggle" choice). It just calls the same
  // toggleAndOpen flow without re-opening the popover.
  const toggleFromPopover = (target: "app" | "store") => {
    if (target === "app") {
      setAppEnabled(!appEnabled);
      void persistAppToggle();
    } else {
      if (!storeId) return;
      setStoreEnabled(!storeEnabled);
      void persistStoreToggle();
    }
  };

  // Persist the toggle WITHOUT opening the popover. Used when the
  // user toggles from inside the popover.
  const persistAppToggle = async () => {
    const fd = new FormData();
    fd.append("enabled", String(appEnabled));
    fd.append("reason", appReason);
    fd.append("message", appMessage);
    if (appEta) fd.append("etaHours", appEta);
    setBusy(true);
    setError(null);
    const result = await runServerAction(updateAppMaintenance, fd);
    setBusy(false);
    if (!result.ok) {
      setAppEnabled(!appEnabled);
      setError(result.error.message);
    } else {
      router.refresh();
    }
  };

  const persistStoreToggle = async () => {
    if (!storeId) return;
    const fd = new FormData();
    fd.append("store_id", storeId);
    fd.append("enabled", String(storeEnabled));
    fd.append("reason", storeReason);
    fd.append("message", storeMessage);
    if (storeEta) fd.append("etaHours", storeEta);
    setBusy(true);
    setError(null);
    const result = await runServerAction(updateStoreMaintenance, fd);
    setBusy(false);
    if (!result.ok) {
      setStoreEnabled(!storeEnabled);
      setError(result.error.message);
    } else {
      router.refresh();
    }
  };

  // P35: the popover's Save button now persists ONLY the config
  // (reason / message / ETA), not the toggle. The toggle was already
  // persisted when the user clicked the navbar switch (or the
  // popover's own switch).
  const saveConfig = async (target: "app" | "store") => {
    if (target === "app") {
      setBusy(true);
      setError(null);
      const fd = new FormData();
      fd.append("enabled", String(appEnabled));
      fd.append("reason", appReason);
      fd.append("message", appMessage);
      if (appEta) fd.append("etaHours", appEta);
      const result = await runServerAction(updateAppMaintenance, fd);
      setBusy(false);
      if (result.ok) {
        setOpenPopover(null);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    } else {
      if (!storeId) return;
      setBusy(true);
      setError(null);
      const fd = new FormData();
      fd.append("store_id", storeId);
      fd.append("enabled", String(storeEnabled));
      fd.append("reason", storeReason);
      fd.append("message", storeMessage);
      if (storeEta) fd.append("etaHours", storeEta);
      const result = await runServerAction(updateStoreMaintenance, fd);
      setBusy(false);
      if (result.ok) {
        setOpenPopover(null);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    }
  };

  return (
    <div ref={ref} className="d-flex align-items-center gap-2 me-2 position-relative">
      {isSuperAdmin && (
        // P35: switch-slider-styled button. Clicking toggles the
        // state immediately AND opens the popover for the remaining
        // config. The form-check-input inside is read-only — it's the
        // visual indicator, the parent <button> handles the click.
        <button
          type="button"
          className={`btn btn-sm d-flex align-items-center gap-2 px-2 py-1 ${
            app.enabled ? "btn-danger" : "btn-outline-success"
          }`}
          onClick={() => void toggleAndOpen("app")}
          data-testid="app-maintenance-pill"
          title={
            app.enabled
              ? "App is in maintenance mode. Click to bring it back online."
              : "App is online. Click to enable maintenance."
          }
          disabled={busy}
        >
          <span className="form-check form-switch d-inline-block m-0 p-0">
            <input
              className="form-check-input m-0"
              type="checkbox"
              role="switch"
              checked={appEnabled}
              readOnly
              tabIndex={-1}
            />
          </span>
          <span style={{ fontSize: "0.85rem" }}>
            App: {app.enabled ? "Maintenance" : "Online"}
          </span>
        </button>
      )}
      {isStoreScoped && storeId && (
        <button
          type="button"
          className={`btn btn-sm d-flex align-items-center gap-2 px-2 py-1 ${
            store.enabled ? "btn-danger" : "btn-outline-success"
          }`}
          onClick={() => void toggleAndOpen("store")}
          data-testid="store-maintenance-pill"
          title={
            store.enabled
              ? "Your store is in maintenance mode. Click to reopen."
              : "Your store is open. Click to close."
          }
          disabled={busy}
        >
          <span className="form-check form-switch d-inline-block m-0 p-0">
            <input
              className="form-check-input m-0"
              type="checkbox"
              role="switch"
              checked={storeEnabled}
              readOnly
              tabIndex={-1}
            />
          </span>
          <span style={{ fontSize: "0.85rem" }}>
            Store: {store.enabled ? "Closed" : "Open"}
          </span>
        </button>
      )}

      {openPopover && (
        <div
          className="card shadow-sm position-absolute"
          style={{
            top: "calc(100% + 6px)",
            right: 0,
            width: 340,
            zIndex: 1060,
          }}
        >
          <div className="card-header d-flex justify-content-between align-items-center">
            <strong style={{ fontSize: "0.9rem" }}>
              {openPopover === "app" ? "App maintenance" : "Store maintenance"}
            </strong>
            <button
              type="button"
              className="btn-close"
              onClick={() => setOpenPopover(null)}
            />
          </div>
          <div className="card-body">
            {error && (
              <div className="alert alert-danger py-2 small">{error}</div>
            )}
            {openPopover === "app" ? (
              <>
                <div className="form-check form-switch mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="app-enabled"
                    checked={appEnabled}
                    onChange={() => toggleFromPopover("app")}
                  />
                  <label className="form-check-label" htmlFor="app-enabled">
                    Enable maintenance
                  </label>
                </div>
                <div className="mb-2">
                  <label className="form-label small">Reason</label>
                  <select
                    className="form-select form-select-sm"
                    value={appReason}
                    onChange={(e) =>
                      setAppReason(e.target.value as AppMaintenanceValue["reason"])
                    }
                    disabled={!appEnabled}
                  >
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {REASON_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-2">
                  <label className="form-label small">Message to admins</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={appMessage}
                    onChange={(e) => setAppMessage(e.target.value)}
                    placeholder="Optional — shown on the maintenance page"
                    disabled={!appEnabled}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Estimated hours until back online</label>
                  <input
                    type="number"
                    min={0}
                    className="form-control form-control-sm"
                    value={appEta}
                    onChange={(e) => setAppEta(e.target.value)}
                    placeholder="Optional"
                    disabled={!appEnabled}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm w-100"
                  onClick={() => void saveConfig("app")}
                  disabled={busy}
                  data-testid="app-maintenance-save"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <small className="text-muted d-block mt-2">
                  The toggle fires immediately. This Save button
                  persists only the reason / message / ETA. Maintenance
                  blocks all non-Super-Admin admin routes. The customer
                  app reads the same flag via the public API.
                </small>
              </>
            ) : (
              <>
                <div className="form-check form-switch mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="store-enabled"
                    checked={storeEnabled}
                    onChange={() => toggleFromPopover("store")}
                  />
                  <label className="form-check-label" htmlFor="store-enabled">
                    Close my store
                  </label>
                </div>
                <div className="mb-2">
                  <label className="form-label small">Reason</label>
                  <select
                    className="form-select form-select-sm"
                    value={storeReason}
                    onChange={(e) =>
                      setStoreReason(e.target.value as StoreMaintenanceValue["reason"])
                    }
                    disabled={!storeEnabled}
                  >
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {REASON_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-2">
                  <label className="form-label small">Message to admins</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={storeMessage}
                    onChange={(e) => setStoreMessage(e.target.value)}
                    placeholder="Optional — shown on the maintenance page"
                    disabled={!storeEnabled}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Estimated hours until back online</label>
                  <input
                    type="number"
                    min={0}
                    className="form-control form-control-sm"
                    value={storeEta}
                    onChange={(e) => setStoreEta(e.target.value)}
                    placeholder="Optional"
                    disabled={!storeEnabled}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm w-100"
                  onClick={() => void saveConfig("store")}
                  disabled={busy || !storeId}
                  data-testid="store-maintenance-save"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <small className="text-muted d-block mt-2">
                  The toggle fires immediately. This Save button
                  persists only the reason / message / ETA. Closing
                  the store cascades: products are marked inactive and
                  categories unassigned (mirrors the manager-disable
                  cascade for this store).
                </small>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
