"use client";

import { useState, useCallback, useEffect, useMemo, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import { updateStore, updateStoreSetting } from "./actions";
import type { StoreSettingsData } from "./actions";
import {
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
} from "@/app/(admin)/delivery-zones/actions";
import {
  createDeliverySlot,
  updateDeliverySlot,
  deleteDeliverySlot,
} from "@/app/(admin)/delivery-slots/actions";
import {
  createGstNumber,
  updateGstNumber,
  deleteGstNumber,
} from "@/app/(admin)/gst-numbers/actions";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDays(days: number[]): string {
  if (!days || days.length === 0) return "\u2014";
  return days.map((d) => DAY_NAMES[d] ?? d).join(", ");
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 540, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>{title}</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="card mb-4">
      <div
        className="card-header d-flex align-items-center justify-content-between cursor-pointer"
        style={{ cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        <strong>{title}</strong>
        <span className="text-muted small">
          {count} record{count !== 1 ? "s" : ""}
          <Icon icon={open ? "ri:arrow-up-s-line" : "ri:arrow-down-s-line"} width={18} className="ms-1" />
        </span>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

function CheckRow({ children }: { children: React.ReactNode }) {
  return <div className="d-flex gap-3">{children}</div>;
}

function CheckField({ id, name, label, defaultChecked }: { id: string; name: string; label: string; defaultChecked: boolean }) {
  return (
    <div className="form-check">
      <input type="checkbox" name={name} className="form-check-input" id={id} defaultChecked={defaultChecked} />
      <label className="form-check-label" htmlFor={id}>{label}</label>
    </div>
  );
}

/* ──────────── DELIVERY ZONES ──────────── */

type ZoneRow = {
  id: string; name: string; store_id: string; pincodes: string[];
  radius_km: number; delivery_charge: number; free_delivery_min_order: number;
  is_active: boolean; is_express: boolean;
};

function ZonesSection({ initial, disabled }: { initial: ZoneRow[]; disabled?: boolean }) {
  const [zones, setZones] = useState(initial);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Delete zone "${name}"?`)) return;
    try {
      await deleteDeliveryZone(id);
      setZones((prev) => prev.filter((z) => z.id !== id));
      toast.success("Zone deleted");
    } catch { toast.error("Failed to delete zone"); }
  }, []);

  return (
      <InlineCrud<ZoneRow>
        label="Delivery Zones"
        items={zones}
        emptyMsg="No delivery zones yet"
        onDelete={handleDelete}
        FormComponent={ZoneFormBody}
        formTitle={(z) => z ? "Edit Zone" : "Add Zone"}
        disabled={disabled}
        columns={[
        { header: "Name", render: (z) => <span className="fw-semibold">{z.name}</span> },
        { header: "Pincodes", render: (z) => (
          <span style={{ maxWidth: 180, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {z.pincodes?.length ? z.pincodes.join(", ") : "\u2014"}
          </span>
        )},
        { header: "Radius", render: (z) => `${z.radius_km} km` },
        { header: "Charge", render: (z) => `₹${Number(z.delivery_charge).toFixed(2)}` },
        { header: "Status", render: (z) => (
          <div className="d-flex gap-1">
            <span className={`badge ${z.is_active ? "bg-success" : "bg-secondary"}`}>{z.is_active ? "Active" : "Inactive"}</span>
            {z.is_express && <span className="badge bg-info">Express</span>}
          </div>
        )},
      ]}
    />
  );
}

function ZoneFormBody({ item: zone, onActionDone }: { item: ZoneRow | null; onActionDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (_prev: { error: string | null }, formData: FormData) => {
    const action = zone ? updateDeliveryZone.bind(null, zone.id) : createDeliveryZone;
    const result = await runServerAction(action, formData);
    if (result.ok) {
      onActionDone();
      return { error: null };
    }
    return { error: result.error.message };
  }, { error: null });

  return (
    <form action={formAction}>
      {state.error && <div className="alert alert-danger py-2">{state.error}</div>}
      <Field label="Name *">
        <input type="text" name="name" className="form-control" defaultValue={zone?.name ?? ""} required />
      </Field>
      <Field label="Store ID *">
        <input type="text" name="store_id" className="form-control" defaultValue={zone?.store_id ?? ""} required placeholder="UUID" />
      </Field>
      <Field label={`Pincodes ${zone ? "" : "(comma-separated)"}`}>
        <input type="text" name="pincodes" className="form-control" defaultValue={zone?.pincodes?.join(", ") ?? ""} placeholder="e.g. 110001, 110002" />
      </Field>
      <div className="row mb-3">
        <div className="col-4">
          <Field label="Radius (km)">
            <input type="number" name="radius_km" className="form-control" defaultValue={zone?.radius_km ?? 0} min={0} step="0.1" />
          </Field>
        </div>
        <div className="col-4">
          <Field label="Delivery Charge">
            <input type="number" name="delivery_charge" className="form-control" defaultValue={zone?.delivery_charge ?? 0} min={0} step="0.01" />
          </Field>
        </div>
        <div className="col-4">
          <Field label="Free Min Order">
            <input type="number" name="free_delivery_min_order" className="form-control" defaultValue={zone?.free_delivery_min_order ?? 0} min={0} step="0.01" />
          </Field>
        </div>
      </div>
      <CheckRow>
        <CheckField id="zoneActive" name="is_active" label="Active" defaultChecked={zone?.is_active ?? true} />
        <CheckField id="zoneExpress" name="is_express" label="Express" defaultChecked={zone?.is_express ?? false} />
      </CheckRow>
      <div className="d-flex gap-2 justify-content-end mt-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving..." : zone ? "Update Zone" : "Create Zone"}
        </button>
      </div>
    </form>
  );
}

/* ──────────── DELIVERY SLOTS ──────────── */

type SlotRow = {
  id: string; name: string; zone_id: string; start_time: string; end_time: string;
  available_days: number[]; capacity: number; is_active: boolean;
};

function SlotsSection({ initial, disabled }: { initial: SlotRow[]; disabled?: boolean }) {
  const [slots, setSlots] = useState(initial);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Delete slot "${name}"?`)) return;
    try {
      await deleteDeliverySlot(id);
      setSlots((prev) => prev.filter((s) => s.id !== id));
      toast.success("Slot deleted");
    } catch { toast.error("Failed to delete slot"); }
  }, []);

  return (
      <InlineCrud<SlotRow>
        label="Delivery Slots"
        items={slots}
        emptyMsg="No delivery slots yet"
        onDelete={handleDelete}
        FormComponent={SlotFormBody}
        formTitle={(s) => s ? "Edit Slot" : "Add Slot"}
        disabled={disabled}
        columns={[
        { header: "Name", render: (s) => <span className="fw-semibold">{s.name}</span> },
        { header: "Zone ID", render: (s) => <code className="small">{s.zone_id}</code> },
        { header: "Time", render: (s) => `${s.start_time} - ${s.end_time}` },
        { header: "Days", render: (s) => formatDays(s.available_days) },
        { header: "Capacity", render: (s) => s.capacity },
        { header: "Status", render: (s) => (
          <span className={`badge ${s.is_active ? "bg-success" : "bg-secondary"}`}>
            {s.is_active ? "Active" : "Inactive"}
          </span>
        )},
      ]}
    />
  );
}

function SlotFormBody({ item: slot, onActionDone }: { item: SlotRow | null; onActionDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (_prev: { error: string | null }, formData: FormData) => {
    const action = slot ? updateDeliverySlot.bind(null, slot.id) : createDeliverySlot;
    const result = await runServerAction(action, formData);
    if (result.ok) {
      onActionDone();
      return { error: null };
    }
    return { error: result.error.message };
  }, { error: null });

  return (
    <form action={formAction}>
      {state.error && <div className="alert alert-danger py-2">{state.error}</div>}
      <Field label="Name *">
        <input type="text" name="name" className="form-control" defaultValue={slot?.name ?? ""} required />
      </Field>
      <Field label="Zone ID *">
        <input type="text" name="zone_id" className="form-control" defaultValue={slot?.zone_id ?? ""} required placeholder="UUID" />
      </Field>
      <div className="row mb-3">
        <div className="col-6">
          <Field label="Start Time *">
            <input type="time" name="start_time" className="form-control" defaultValue={slot?.start_time ?? ""} required />
          </Field>
        </div>
        <div className="col-6">
          <Field label="End Time *">
            <input type="time" name="end_time" className="form-control" defaultValue={slot?.end_time ?? ""} required />
          </Field>
        </div>
      </div>
      <Field label={`Available Days ${slot ? "" : "(comma-separated: 0=Sun..6=Sat)"}`}>
        <input type="text" name="available_days" className="form-control" defaultValue={slot?.available_days?.join(",") ?? ""} placeholder="e.g. 1,2,3,4,5" />
      </Field>
      <div className="row mb-3">
        <div className="col-6">
          <Field label="Capacity">
            <input type="number" name="capacity" className="form-control" defaultValue={slot?.capacity ?? 0} min={0} />
          </Field>
        </div>
        <div className="col-6 d-flex align-items-end pb-3">
          <CheckField id="slotActive" name="is_active" label="Active" defaultChecked={slot?.is_active ?? true} />
        </div>
      </div>
      <div className="d-flex gap-2 justify-content-end mt-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving..." : slot ? "Update Slot" : "Create Slot"}
        </button>
      </div>
    </form>
  );
}

/* ──────────── GST NUMBERS ──────────── */

type GstRow = {
  id: string; store_id: string; gstin: string; legal_name: string; business_address: string;
  state_code: string; is_primary: boolean; is_active: boolean; current_turnover: number;
  financial_year: string; threshold_amount: number; stores?: { name: string } | null;
};

function GstSection({ initial, disabled, storeId }: { initial: GstRow[]; disabled?: boolean; storeId?: string }) {
  const [gstNumbers, setGstNumbers] = useState(initial);

  const handleDelete = useCallback(async (id: string, gstin: string) => {
    if (!confirm(`Delete GST "${gstin}"?`)) return;
    try {
      await deleteGstNumber(id);
      setGstNumbers((prev) => prev.filter((g) => g.id !== id));
      toast.success("GST number deleted");
    } catch { toast.error("Failed to delete GST number"); }
  }, []);

  return (
      <InlineCrud<GstRow>
        label="GST Numbers"
        items={gstNumbers}
        emptyMsg="No GST numbers yet"
        onDelete={handleDelete}
        FormComponent={GstFormBody}
        formExtraProps={{ storeId }}
        formTitle={(g) => g ? "Edit GST Number" : "Add GST Number"}
        disabled={disabled}
        columns={[
        { header: "Store", render: (g) => <span className="fw-semibold">{g.stores?.name ?? "\u2014"}</span> },
        { header: "GSTIN", render: (g) => <code>{g.gstin}</code> },
        { header: "Legal Name", render: (g) => g.legal_name || "\u2014" },
        { header: "Primary", render: (g) => (
          <span className={`badge ${g.is_primary ? "bg-info" : "bg-light text-muted"}`}>
            {g.is_primary ? "Primary" : "\u2014"}
          </span>
        )},
        { header: "Status", render: (g) => (
          <span className={`badge ${g.is_active ? "bg-success" : "bg-secondary"}`}>
            {g.is_active ? "Active" : "Inactive"}
          </span>
        )},
      ]}
    />
  );
}

function GstFormBody({ item: gst, onActionDone, storeId }: { item: GstRow | null; onActionDone: () => void; storeId?: string }) {
  const [state, formAction, pending] = useActionState(async (_prev: { error: string | null }, formData: FormData) => {
    const action = gst ? updateGstNumber.bind(null, gst.id) : createGstNumber;
    const result = await runServerAction(action, formData);
    if (result.ok) {
      onActionDone();
      return { error: null };
    }
    return { error: result.error.message };
  }, { error: null });

  return (
    <form action={formAction}>
      {state.error && <div className="alert alert-danger py-2">{state.error}</div>}
      {storeId && !gst ? (
        <input type="hidden" name="store_id" value={storeId} />
      ) : (
        <Field label="Store ID *">
          <input type="text" name="store_id" className="form-control" defaultValue={gst?.store_id ?? ""} required placeholder="UUID" />
        </Field>
      )}
      <Field label="GSTIN *">
        <input type="text" name="gstin" className="form-control" defaultValue={gst?.gstin ?? ""} required placeholder="e.g. 29ABCDE1234F1Z5" />
      </Field>
      <Field label="Legal Name *">
        <input type="text" name="legal_name" className="form-control" defaultValue={gst?.legal_name ?? ""} required />
      </Field>
      <Field label="Business Address">
        <textarea name="business_address" className="form-control" rows={2} defaultValue={gst?.business_address ?? ""} />
      </Field>
      <div className="row mb-3">
        <div className="col-4">
          <Field label="State Code">
            <input type="text" name="state_code" className="form-control" defaultValue={gst?.state_code ?? ""} placeholder="e.g. 29" />
          </Field>
        </div>
        <div className="col-4">
          <Field label="Financial Year">
            <input type="text" name="financial_year" className="form-control" defaultValue={gst?.financial_year ?? ""} placeholder="e.g. 2025-26" />
          </Field>
        </div>
        <div className="col-4">
          <Field label="Threshold Amount">
            <input type="number" name="threshold_amount" className="form-control" defaultValue={gst?.threshold_amount ?? 0} min={0} step="0.01" />
          </Field>
        </div>
      </div>
      <div className="row mb-3">
        <div className="col-6">
          <Field label="Current Turnover">
            <input type="number" name="current_turnover" className="form-control" defaultValue={gst?.current_turnover ?? 0} min={0} step="0.01" />
          </Field>
        </div>
        <div className="col-3 d-flex align-items-end pb-3">
          <CheckField id="gstPrimary" name="is_primary" label="Primary" defaultChecked={gst?.is_primary ?? false} />
        </div>
        <div className="col-3 d-flex align-items-end pb-3">
          <CheckField id="gstActive" name="is_active" label="Active" defaultChecked={gst?.is_active ?? true} />
        </div>
      </div>
      <div className="d-flex gap-2 justify-content-end mt-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving..." : gst ? "Update GST Number" : "Create GST Number"}
        </button>
      </div>
    </form>
  );
}

/* ──────────── GENERIC INLINE CRUD ──────────── */

type Column<T> = { header: string; render: (item: T) => React.ReactNode };

function InlineCrud<T extends { id: string }>({
  label,
  items,
  emptyMsg,
  onDelete,
  FormComponent,
  formTitle,
  columns,
  disabled,
  formExtraProps,
}: {
  label: string;
  items: T[];
  emptyMsg: string;
  onDelete: (id: string, name: string) => void;
  FormComponent: React.ComponentType<{ item: T | null; onActionDone: () => void } & Record<string, unknown>>;
  formTitle: (item: T | null) => string;
  columns: Column<T>[];
  disabled?: boolean;
  formExtraProps?: Record<string, unknown>;
}) {
  const [editing, setEditing] = useState<T | null>(null);
  const [adding, setAdding] = useState(false);

  const handleFormClose = useCallback(() => {
    setEditing(null);
    setAdding(false);
  }, []);

  const openAdd = useCallback(() => setAdding(true), []);
  const openEdit = useCallback((item: T) => setEditing(item), []);

  const show = adding || editing !== null;

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <span className="text-muted small">{items.length} record{items.length !== 1 ? "s" : ""}</span>
        {!disabled && (
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <Icon icon="ri:add-line" width={16} className="me-1" />Add {label.split(" ")[0]}
          </button>
        )}
      </div>
      <div className="table-responsive">
        <table className="table table-hover table-sm align-middle mb-0">
          <thead className="table-light">
            <tr>
              {columns.map((c) => <th key={c.header}>{c.header}</th>)}
              <th className="text-center" style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="text-center text-muted py-3">{emptyMsg}</td></tr>
            )}
            {items.map((item) => (
              <tr key={item.id}>
                {columns.map((c) => <td key={c.header}>{c.render(item)}</td>)}
                    <td className="text-center">
                      <div className="d-flex gap-1 justify-content-center">
                        <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => openEdit(item)} disabled={disabled}>
                          <Icon icon="ri:pencil-line" width={15} />
                        </button>
                        <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => onDelete(item.id, (item as Record<string, unknown>).name as string || String(item.id))} disabled={disabled}>
                          <Icon icon="ri:delete-bin-6-line" width={15} />
                        </button>
                      </div>
                    </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {show && (
        <Modal title={formTitle(editing)} onClose={handleFormClose}>
          <FormComponent item={editing} onActionDone={handleFormClose} {...(formExtraProps ?? {})} />
        </Modal>
      )}
    </>
  );
}

/* ──────────── CATEGORY EDITOR ──────────── */

function CategoryEditor({
  categories,
  initialSelected,
  lockedCategoryIds = [],
}: {
  categories: CategoryOption[];
  initialSelected: string[];
  lockedCategoryIds?: string[];
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const lockedSet = useMemo(() => new Set(lockedCategoryIds), [lockedCategoryIds]);

  // Full parent→children map for auto-check cascade (unfiltered)
  const allChildrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of categories) {
      if (c.parent_id) {
        const list = map.get(c.parent_id) ?? [];
        list.push(c.id);
        map.set(c.parent_id, list);
      }
    }
    return map;
  }, [categories]);

  const getAllDescendants = useCallback(
    (parentId: string): string[] => {
      const result: string[] = [];
      const walk = (ids: string[]) => {
        for (const id of ids) {
          result.push(id);
          const kids = allChildrenByParent.get(id);
          if (kids) walk(kids);
        }
      };
      walk([parentId]);
      return result;
    },
    [allChildrenByParent],
  );

  useEffect(() => {
    const h = document.getElementById("categoryIdsHidden") as HTMLInputElement | null;
    if (h) h.value = selected.join(",");
  }, [selected]);

  const toggle = (id: string) => {
    if (lockedSet.has(id)) return;
    const wasChecked = selected.includes(id);
    const descendants = getAllDescendants(id);
    setSelected((prev) => {
      const set = new Set(prev);
      if (wasChecked) {
        // Uncheck the category and all its descendants (skip locked)
        set.delete(id);
        for (const d of descendants) {
          if (!lockedSet.has(d)) set.delete(d);
        }
      } else {
        // Check the category and all its descendants
        set.add(id);
        for (const d of descendants) set.add(d);
      }
      return Array.from(set);
    });
  };

  const clearAll = () => {
    setSelected((prev) => prev.filter((id) => lockedSet.has(id)));
  };

  const filtered = search.trim()
    ? categories.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      )
    : categories;

  const parents = filtered
    .filter((c) => !c.parent_id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childrenByParent = new Map<string, CategoryOption[]>();
  filtered.forEach((c) => {
    if (c.parent_id) {
      const list = childrenByParent.get(c.parent_id) ?? [];
      list.push(c);
      childrenByParent.set(c.parent_id, list);
    }
  });

  const renderRow = (cat: CategoryOption, isChild: boolean) => {
    const isLocked = lockedSet.has(cat.id);
    return (
      <div className="form-check" key={cat.id}>
        <input
          type="checkbox"
          className="form-check-input"
          id={`cat-edit-${cat.id}`}
          checked={isLocked ? true : selected.includes(cat.id)}
          disabled={isLocked}
          onChange={() => toggle(cat.id)}
        />
        <label
          className={`form-check-label ${isChild ? "small" : "fw-semibold"}`}
          htmlFor={`cat-edit-${cat.id}`}
          title={isLocked ? "Locked — has products or active orders" : undefined}
        >
          {isLocked && (
            <Icon
              icon="ri:lock-line"
              width={isChild ? 11 : 13}
              className="me-1 text-warning"
            />
          )}
          {cat.name}
          {isLocked && (
            <span className="text-muted small ms-1">(locked)</span>
          )}
        </label>
      </div>
    );
  };

  return (
    <div>
      <div className="d-flex gap-2 align-items-center mb-2">
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 240 }}
        />
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={clearAll}
          disabled={
            selected.length === 0 ||
            selected.every((id) => lockedSet.has(id))
          }
        >
          Clear all
        </button>
        <small className="text-muted ms-auto">
          {selected.length} selected
          {lockedCategoryIds.length > 0 && (
            <span className="ms-2">
              · <Icon icon="ri:lock-line" width={11} /> {lockedCategoryIds.length} locked
            </span>
          )}
        </small>
      </div>
      <div
        className="border rounded p-2"
        style={{ maxHeight: 260, overflowY: "auto", background: "#fafafa" }}
      >
        {parents.length === 0 && (
          <div className="text-muted small p-2">No categories found</div>
        )}
        {parents.map((parent) => {
          const children = (childrenByParent.get(parent.id) ?? [])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div key={parent.id} className="mb-2">
              {renderRow(parent, false)}
              {children.length > 0 && (
                <div className="ms-4 mt-1">
                  {children.map((child) => renderRow(child, true))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {lockedCategoryIds.length > 0 && (
        <div className="form-text mt-2">
          <Icon icon="ri:lock-line" width={12} className="me-1" />
          Locked categories have products or active orders and cannot be unassigned.
        </div>
      )}
    </div>
  );
}

/* ──────────── ORIGINAL FORM SECTIONS ──────────── */

function StoreInfoSection({
  store,
  isSuperAdmin,
  createMode,
  categories,
  assignedCategoryIds = [],
  lockedCategoryIds = [],
  managers,
  primaryGstin,
}: {
  store: StoreSettingsData["store"];
  isSuperAdmin: boolean;
  createMode?: boolean;
  categories: CategoryOption[];
  assignedCategoryIds?: string[];
  lockedCategoryIds?: string[];
  managers: ManagerOption[];
  primaryGstin?: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      if (createMode) {
        const { createStore } = await import("./actions");
        const r = await runServerAction(createStore, formData);
        if (r.ok) {
          toast.success("Store created");
          router.push(`/settings?store_id=${r.value.id}`);
          return { error: null };
        }
        return { error: r.error.message };
      }
      const r = await runServerAction(updateStore, formData);
      if (r.ok) {
        toast.success("Store info saved");
        return { error: null };
      }
      return { error: r.error.message };
    },
    { error: null },
  );

  if (!store && !createMode) return <p className="text-muted">No store found</p>;

  return (
    <div className="card mb-4">
      <div className="card-header"><strong>Store Info</strong></div>
      <div className="card-body">
        <form action={formAction}>
          {!createMode && store && <input type="hidden" name="id" value={store.id} />}
          {state.error && <div className="alert alert-danger py-2">{state.error}</div>}

          {createMode && (
            <div className="alert alert-info py-2">
              Fill in the required fields below and click <strong>Create Store</strong>. After creation, all sections below will be editable.
            </div>
          )}

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Store Name <span className="text-danger">*</span></label>
              <input name="name" className="form-control" defaultValue={store?.name ?? ""} required />
            </div>

            {createMode && (
              <div className="col-md-6">
                <label className="form-label">Store Manager <span className="text-danger">*</span></label>
                <select name="owner_id" className="form-select" required>
                  <option value="">-- Select a manager --</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name ? `${m.full_name} (${m.email ?? ""})` : m.email ?? m.id}
                    </option>
                  ))}
                </select>
                <div className="form-text">Only users with no existing store assignment are listed.</div>
              </div>
            )}
            <div className="col-md-6">
              <label className="form-label">Slug <span className="text-danger">*</span></label>
              <input name="slug" className="form-control" defaultValue={store?.slug ?? ""} required />
            </div>

            {createMode && (
              <div className="col-md-6">
                <label className="form-label">Store Code <span className="text-danger">*</span></label>
                <input name="code" className="form-control text-uppercase" defaultValue={store?.code ?? ""} required pattern="[A-Za-z0-9_]{4,16}" maxLength={16} placeholder="e.g. STORE01" onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }} />
                <div className="form-text">4-16 characters: letters, digits, and underscores. Auto-uppercased. Used for invoice numbering.</div>
              </div>
            )}

            {/* P64: Primary GSTIN quick-edit. Lives on the store edit form so
                the admin can set/change the primary GSTIN without diving into
                the full GST Numbers section below. The full management UI
                (legal name, business address, state code, turnover, etc.)
                remains in the GST Numbers section card.
                P66: also rendered in create mode (optional) so a new
                store can be created with a primary GSTIN in one go. */}
            <div className="col-md-6">
              <label className="form-label">Primary GSTIN</label>
              <input
                name="gstin"
                className="form-control"
                defaultValue={store ? (primaryGstin ?? "") : ""}
                placeholder="e.g. 29ABCDE1234F1Z5"
                pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}"
                maxLength={15}
                disabled={!store && !createMode}
              />
              <div className="form-text">
                {createMode
                  ? "Optional. The GSTIN used for invoicing. You can add additional GST numbers after the store is created."
                  : "The GSTIN used for invoicing."}
                {!createMode && store && (
                  <>{" "}<Link href={`/gst-numbers?store_id=${store.id}`}>
                    Manage all GST numbers →
                  </Link></>
                )}
              </div>
            </div>

            <div className="col-md-6">
              <label className="form-label">Logo URL</label>
              <input name="logo_url" type="url" className="form-control" defaultValue={store?.logo_url ?? ""} placeholder="https://..." />
              {store?.logo_url && (
                <img src={store.logo_url} alt="Logo" className="mt-1 border rounded" style={{ maxHeight: 48 }} />
              )}
            </div>

            {isSuperAdmin && (
              <div className="col-md-6">
                <label className="form-label">Banner URL</label>
                <input name="banner_url" type="url" className="form-control" defaultValue={store?.banner_url ?? ""} placeholder="https://..." />
                {store?.banner_url && (
                  <img src={store.banner_url} alt="Banner" className="mt-1 border rounded" style={{ maxHeight: 48 }} />
                )}
              </div>
            )}

            <div className="col-md-4">
              <label className="form-label">Phone</label>
              <input name="phone" type="tel" className="form-control" defaultValue={store?.phone ?? ""} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Email</label>
              <input name="email" type="email" className="form-control" defaultValue={store?.email ?? ""} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Delivery Radius (km)</label>
              <input name="delivery_radius_km" type="number" className="form-control" defaultValue={store?.delivery_radius_km ?? ""} min={0} />
            </div>

            <div className="col-12">
              <label className="form-label">Address</label>
              <textarea name="address" className="form-control" rows={2} defaultValue={store?.address ?? ""} />
            </div>
            <div className="col-md-6">
              <label className="form-label">City</label>
              <input name="city" className="form-control" defaultValue={store?.city ?? ""} />
            </div>
            <div className="col-md-6">
              <label className="form-label">State</label>
              <input name="state" className="form-control" defaultValue={store?.state ?? ""} />
            </div>

            {isSuperAdmin && (
              <div className="col-md-4">
                <label className="form-label">Commission Rate (%)</label>
                <input name="commission_rate" type="number" className="form-control" defaultValue={store?.commission_rate ?? ""} min={0} step={0.1} />
              </div>
            )}
            {isSuperAdmin && (
              <div className="col-md-4">
                <label className="form-label">Order ID Prefix</label>
                <input name="order_id_prefix" type="text" className="form-control" defaultValue={store?.order_id_prefix ?? ""} placeholder="e.g. ASORD, AS-ORD" maxLength={20} />
                <div className="form-text">Prefix used for order numbering (e.g. ASORD-001). Leave empty for default.</div>
              </div>
            )}

            {categories.length > 0 && (createMode || isSuperAdmin) && (
              <div className="col-12">
                <label className="form-label">
                  {createMode ? "Assign Categories" : "Assigned Categories"}
                </label>
                {createMode ? (
                  <div className="d-flex flex-wrap gap-2 mt-1">
                    {categories.map((cat) => (
                      <div className="form-check form-check-inline" key={cat.id}>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id={`cat-${cat.id}`}
                          value={cat.id}
                          onChange={(e) => {
                            const h = document.getElementById("categoryIdsHidden") as HTMLInputElement;
                            const checked = h.value ? h.value.split(",").filter(Boolean) : [];
                            if (e.target.checked) {
                              checked.push(cat.id);
                            } else {
                              const idx = checked.indexOf(cat.id);
                              if (idx > -1) checked.splice(idx, 1);
                            }
                            h.value = checked.join(",");
                          }}
                        />
                        <label className="form-check-label" htmlFor={`cat-${cat.id}`}>{cat.name}</label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <CategoryEditor
                    categories={categories}
                    initialSelected={assignedCategoryIds}
                    lockedCategoryIds={lockedCategoryIds}
                  />
                )}
                <input type="hidden" name="category_ids" id="categoryIdsHidden" value={createMode ? "" : assignedCategoryIds.join(",")} />
                {!createMode && (
                  <div className="form-text">
                    Toggle categories to change which products this store can sell. Leave empty to allow all categories.
                  </div>
                )}
              </div>
            )}

            <div className="col-12">
              <div className="d-flex gap-4">
                <div className="form-check form-switch mb-0">
                  <input type="checkbox" name="is_open" className="form-check-input" role="switch" id="isOpen" defaultChecked={store?.is_open ?? true} />
                  <label className="form-check-label" htmlFor="isOpen">Store Open</label>
                </div>
                {isSuperAdmin && (
                  <div className="form-check form-switch mb-0">
                    <input type="checkbox" name="is_active" className="form-check-input" role="switch" id="isActive" defaultChecked={store?.is_active ?? true} />
                    <label className="form-check-label" htmlFor="isActive">Active</label>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button type="submit" className="btn btn-primary mt-3" disabled={pending}>
            {pending ? "Creating..." : createMode ? "Create Store" : "Save Store Info"}
          </button>

          {createMode && (
            <Link href="/stores" className="btn btn-outline-secondary mt-3 ms-2">Cancel</Link>
          )}
        </form>
      </div>
    </div>
  );
}

function PoliciesSection({ policies, disabled }: { policies: StoreSettingsData["policies"]; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const r = await runServerAction(updateStoreSetting, "store_policies", formData);
      if (r.ok) {
        toast.success("Policies saved");
        return { error: null };
      }
      return { error: r.error.message };
    },
    { error: null },
  );

  return (
    <div className="card mb-4">
      <div className="card-header"><strong>Store Policies</strong></div>
      <div className="card-body">
        <form action={formAction}>
          <fieldset disabled={disabled}>
          {disabled && <div className="text-muted small mb-2"><em>Save store details first to configure policies</em></div>}
          {state.error && <div className="alert alert-danger py-2">{state.error}</div>}

          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Min Order Value</label>
              <div className="input-group">
                <span className="input-group-text">₹</span>
                <input name="min_order" type="number" className="form-control" defaultValue={policies.min_order} min={0} />
              </div>
            </div>
            <div className="col-md-4">
              <label className="form-label">Max Order Value</label>
              <div className="input-group">
                <span className="input-group-text">₹</span>
                <input name="max_order" type="number" className="form-control" defaultValue={policies.max_order ?? ""} min={0} placeholder="No limit" />
              </div>
            </div>
            <div className="col-md-4">
              <label className="form-label">Order Acceptance Hours</label>
              <div className="d-flex gap-2">
                <input name="open_time" type="time" className="form-control" defaultValue={policies.open_time} />
                <span className="align-self-center">to</span>
                <input name="close_time" type="time" className="form-control" defaultValue={policies.close_time} />
              </div>
            </div>

            <div className="col-12">
              <label className="form-label">Cancellation Policy</label>
              <textarea name="cancellation_policy" className="form-control" rows={3} defaultValue={policies.cancellation_policy} />
            </div>
            <div className="col-12">
              <label className="form-label">Return Policy</label>
              <textarea name="return_policy" className="form-control" rows={3} defaultValue={policies.return_policy} />
            </div>
            <div className="col-12">
              <label className="form-label">Refund Policy</label>
              <textarea name="refund_policy" className="form-control" rows={3} defaultValue={policies.refund_policy} />
            </div>
            <div className="col-12">
              <label className="form-label">Terms &amp; Conditions</label>
              <textarea name="terms_conditions" className="form-control" rows={4} defaultValue={policies.terms_conditions} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary mt-3" disabled={pending || disabled}>
            {pending ? "Saving..." : "Save Policies"}
          </button>
          </fieldset>
        </form>
      </div>
    </div>
  );
}

function PaymentSection({ payment, disabled }: { payment: StoreSettingsData["payment"]; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const r = await runServerAction(updateStoreSetting, "payment_config", formData);
      if (r.ok) {
        toast.success("Payment config saved");
        return { error: null };
      }
      return { error: r.error.message };
    },
    { error: null },
  );

  return (
    <div className="card mb-4">
      <div className="card-header"><strong>Payment Configuration</strong></div>
      <div className="card-body">
        <form action={formAction}>
          <fieldset disabled={disabled}>
          {disabled && <div className="text-muted small mb-2"><em>Save store details first to configure payment</em></div>}
          {state.error && <div className="alert alert-danger py-2">{state.error}</div>}

          <div className="row g-3">
            <div className="col-12">
              <div className="d-flex gap-4">
                <div className="form-check form-switch mb-0">
                  <input type="checkbox" name="cod_enabled" className="form-check-input" role="switch" id="codEnabled" defaultChecked={payment.cod_enabled} />
                  <label className="form-check-label" htmlFor="codEnabled">Cash on Delivery</label>
                </div>
                <div className="form-check form-switch mb-0">
                  <input type="checkbox" name="online_payment_enabled" className="form-check-input" role="switch" id="onlineEnabled" defaultChecked={payment.online_payment_enabled} />
                  <label className="form-check-label" htmlFor="onlineEnabled">Online Payment</label>
                </div>
              </div>
            </div>

            <div className="col-md-4">
              <label className="form-label">COD Min Amount</label>
              <div className="input-group">
                <span className="input-group-text">₹</span>
                <input name="cod_min_amount" type="number" className="form-control" defaultValue={payment.cod_min_amount} min={0} />
              </div>
            </div>
            <div className="col-md-4">
              <label className="form-label">COD Max Amount</label>
              <div className="input-group">
                <span className="input-group-text">₹</span>
                <input name="cod_max_amount" type="number" className="form-control" defaultValue={payment.cod_max_amount ?? ""} min={0} placeholder="No limit" />
              </div>
            </div>
            <div className="col-md-4">
              <label className="form-label">COD Charge</label>
              <div className="input-group">
                <span className="input-group-text">₹</span>
                <input name="cod_charge" type="number" className="form-control" defaultValue={payment.cod_charge} min={0} step={0.5} />
              </div>
            </div>

            <div className="col-md-4">
              <label className="form-label">Payment Gateway</label>
              <select name="gateway" className="form-select" defaultValue={payment.gateway}>
                <option value="razorpay">Razorpay</option>
                <option value="stripe">Stripe</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">API Key</label>
              <input name="api_key" className="form-control" defaultValue={payment.api_key} placeholder="rzp_live_..." />
            </div>
            <div className="col-md-4">
              <label className="form-label">API Secret</label>
              <input name="api_secret" type="password" className="form-control" defaultValue={payment.api_secret} placeholder="••••••••" />
            </div>
          </div>

          <button type="submit" className="btn btn-primary mt-3" disabled={pending || disabled}>
            {pending ? "Saving..." : "Save Payment Config"}
          </button>
          </fieldset>
        </form>
      </div>
    </div>
  );
}

function GstSettingsSection({ gst, disabled }: { gst: StoreSettingsData["gst"]; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const r = await runServerAction(updateStoreSetting, "gst_config", formData);
      if (r.ok) {
        toast.success("GST settings saved");
        return { error: null };
      }
      return { error: r.error.message };
    },
    { error: null },
  );

  return (
    <div className="card mb-4">
      <div className="card-header"><strong>GST Settings</strong></div>
      <div className="card-body">
        <form action={formAction}>
          <fieldset disabled={disabled}>
          {disabled && <div className="text-muted small mb-2"><em>Save store details first to configure GST</em></div>}
          {state.error && <div className="alert alert-danger py-2">{state.error}</div>}

          <div className="row g-3">
            <div className="col-12">
              <div className="form-check form-switch mb-0">
                <input type="checkbox" name="gst_enabled" className="form-check-input" role="switch" id="gstEnabled" defaultChecked={gst.gst_enabled} />
                <label className="form-check-label" htmlFor="gstEnabled">Enable GST</label>
              </div>
            </div>

            <div className="col-md-4">
              <label className="form-label">Default GST Rate (%)</label>
              <select name="default_gst_rate" className="form-select" defaultValue={gst.default_gst_rate}>
                <option value={0}>0% (Nil Rated)</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">HSN Code Prefix</label>
              <input name="hsn_prefix" className="form-control" defaultValue={gst.hsn_prefix} placeholder="e.g. 2106" />
            </div>
          </div>

          <button type="submit" className="btn btn-primary mt-3" disabled={pending || disabled}>
            {pending ? "Saving..." : "Save GST Settings"}
          </button>
          </fieldset>
        </form>
      </div>
    </div>
  );
}

type CategoryOption = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};
type ManagerOption = { id: string; full_name: string | null; email: string | null };

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function SettingsClient({
  data,
  roleName,
  createMode,
  categories,
  assignedCategoryIds = [],
  lockedCategoryIds = [],
  managers,
  actionPerms,
  primaryGstin,
}: {
  data: StoreSettingsData | null;
  roleName: string;
  createMode?: boolean;
  categories: CategoryOption[];
  assignedCategoryIds?: string[];
  lockedCategoryIds?: string[];
  managers: ManagerOption[];
  actionPerms?: ActionPermissions;
  primaryGstin?: string | null;
}) {
  const isSuperAdmin = roleName === "Super Admin";

  const defaults: StoreSettingsData = {
    store: null,
    policies: { min_order: 0, max_order: null, open_time: "08:00", close_time: "22:00", cancellation_policy: "", return_policy: "", refund_policy: "", terms_conditions: "" },
    payment: { cod_enabled: true, online_payment_enabled: false, cod_min_amount: 0, cod_max_amount: null, cod_charge: 0, gateway: "razorpay", api_key: "", api_secret: "" },
    gst: { gst_enabled: false, default_gst_rate: 18, hsn_prefix: "" },
    zones: [],
    slots: [],
    gstNumbers: [],
  };

  const displayData = data ?? defaults;
  const isCreate = createMode ?? false;

  return (
    <>
      <StoreInfoSection
        store={displayData.store}
        isSuperAdmin={isSuperAdmin}
        createMode={isCreate}
        categories={categories}
        assignedCategoryIds={assignedCategoryIds}
        lockedCategoryIds={lockedCategoryIds}
        managers={managers}
        primaryGstin={primaryGstin}
      />
      <PoliciesSection policies={displayData.policies} disabled={isCreate} />
      <PaymentSection payment={displayData.payment} disabled={isCreate} />
      <GstSettingsSection gst={displayData.gst} disabled={isCreate} />

      <hr className="my-4" />
      <h5 className="fw-bold mb-3">Additional Configuration</h5>

      <SectionCard title="Delivery Zones" count={(displayData.zones as ZoneRow[]).length} defaultOpen>
        <ZonesSection initial={displayData.zones as ZoneRow[]} disabled={isCreate || !actionPerms?.canEdit} />
      </SectionCard>

      <SectionCard title="Delivery Slots" count={(displayData.slots as SlotRow[]).length}>
        <SlotsSection initial={displayData.slots as SlotRow[]} disabled={isCreate || !actionPerms?.canEdit} />
      </SectionCard>

      <SectionCard title="GST Numbers" count={(displayData.gstNumbers as GstRow[]).length}>
        <GstSection initial={displayData.gstNumbers as GstRow[]} storeId={displayData.store?.id} disabled={isCreate || !actionPerms?.canEdit} />
      </SectionCard>
    </>
  );
}
