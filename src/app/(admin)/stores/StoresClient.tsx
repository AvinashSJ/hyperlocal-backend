"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import type { StoreRow } from "./actions";
import {
  getStoreCategories,
  setStoreCategories,
  getLockedStoreCategories,
} from "./actions";
import type { LockedCategory } from "./actions";

type CategoryOption = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};

function Modal({
  title,
  children,
  onClose,
  width,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: width ?? 600, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>{title}</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row mb-2">
      <div className="col-4 text-muted small">{label}</div>
      <div className="col-8">{value ?? "\u2014"}</div>
    </div>
  );
}

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function StoresClient({
  stores,
  categories,
  roleName,
  actionPerms,
}: {
  stores: StoreRow[];
  categories: CategoryOption[];
  roleName: string;
  actionPerms?: ActionPermissions;
}) {
  const isSuperAdmin = roleName === "Super Admin";
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<StoreRow | null>(null);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [lockedCategories, setLockedCategories] = useState<LockedCategory[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [editingCategories, setEditingCategories] = useState(false);
  const [pendingCategoryIds, setPendingCategoryIds] = useState<string[]>([]);
  const [savingCategories, setSavingCategories] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return stores;
    const q = search.toLowerCase();
    return stores.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.slug?.toLowerCase() ?? "").includes(q) ||
      (s.phone ?? "").includes(q) ||
      (s.city?.toLowerCase() ?? "").includes(q) ||
      (s.email?.toLowerCase() ?? "").includes(q)
    );
  }, [stores, search]);

  const openView = useCallback((store: StoreRow) => {
    setViewing(store);
    setEditingCategories(false);
    setPendingCategoryIds([]);
    setAssignedIds([]);
    setLockedCategories([]);
  }, []);

  useEffect(() => {
    if (!viewing) return;
    let cancelled = false;
    const storeId = viewing.id;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadingAssigned(true);
    });
    Promise.all([
      getStoreCategories(storeId),
      getLockedStoreCategories(storeId),
    ])
      .then(([assigned, locked]) => {
        if (cancelled) return;
        const assignedIdsLocal = assigned.map((c) => c.id);
        setAssignedIds(assignedIdsLocal);
        setPendingCategoryIds(assignedIdsLocal);
        const lockedIds = new Set(locked.map((l) => l.categoryId));
        setLockedCategories(
          locked.filter((l) => assignedIdsLocal.includes(l.categoryId)),
        );
        setPendingCategoryIds((prev) => {
          const next = new Set(prev);
          lockedIds.forEach((id) => next.add(id));
          return Array.from(next);
        });
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Failed to load store categories");
      })
      .finally(() => {
        if (!cancelled) setLoadingAssigned(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewing]);

  const lockedIdSet = useMemo(
    () => new Set(lockedCategories.map((l) => l.categoryId)),
    [lockedCategories],
  );

  const lockedMap = useMemo(() => {
    const m = new Map<string, LockedCategory>();
    lockedCategories.forEach((l) => m.set(l.categoryId, l));
    return m;
  }, [lockedCategories]);

  const togglePendingCategory = (id: string) => {
    if (lockedIdSet.has(id)) {
      const info = lockedMap.get(id);
      const reason =
        info?.reason === "orders"
          ? "active orders"
          : info?.reason === "products"
          ? "existing products"
          : "existing products and active orders";
      toast.warning(
        `Cannot uncheck — this category has ${reason} linked to the store.`,
      );
      return;
    }
    setPendingCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const saveCategoryChanges = async () => {
    if (!viewing) return;
    setSavingCategories(true);
    const result = await runServerAction(
      setStoreCategories,
      viewing.id,
      pendingCategoryIds,
    );
    if (result.ok) {
      setAssignedIds(pendingCategoryIds);
      setEditingCategories(false);
      toast.success("Store categories updated");
    } else {
      toast.error(result.error.message);
    }
    setSavingCategories(false);
  };

  const parents = categories
    .filter((c) => !c.parent_id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childrenByParent = new Map<string, CategoryOption[]>();
  categories.forEach((c) => {
    if (c.parent_id) {
      const list = childrenByParent.get(c.parent_id) ?? [];
      list.push(c);
      childrenByParent.set(c.parent_id, list);
    }
  });

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">All Stores ({filtered.length})</h5>
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search stores..."
            style={{ width: 200 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {actionPerms?.canCreate && (
            <Link href="/settings?new=true" className="btn btn-primary btn-sm">
              <Icon icon="ri:add-line" width={16} className="me-1" />Add Store
            </Link>
          )}
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Phone</th>
              <th>City</th>
              <th className="text-center">Open</th>
              <th className="text-center">Active</th>
              <th className="text-center" style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-4">No stores found</td></tr>
            )}
            {filtered.map((store) => (
              <tr key={store.id}>
                <td>
                  <span className="fw-semibold">
                    {store.logo_url && (
                      <img src={store.logo_url} alt="" className="me-2 rounded" style={{ width: 24, height: 24, objectFit: "cover" }} />
                    )}
                    {store.name}
                  </span>
                </td>
                <td><code className="small">{store.slug}</code></td>
                <td>{store.phone ?? "\u2014"}</td>
                <td>{store.city ?? "\u2014"}</td>
                <td className="text-center">
                  <span className={`badge ${store.is_open ? "bg-success" : "bg-secondary"}`}>
                    {store.is_open ? "Yes" : "No"}
                  </span>
                </td>
                <td className="text-center">
                  <span className={`badge ${store.is_active ? "bg-success" : "bg-secondary"}`}>
                    {store.is_active ? "Yes" : "No"}
                  </span>
                </td>
                <td className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    <button className="btn btn-sm btn-outline-info" title="View" onClick={() => openView(store)}>
                      <Icon icon="ri:eye-line" width={15} />
                    </button>
                    {actionPerms?.canEdit && (
                      <Link href={`/settings?store_id=${store.id}`} className="btn btn-sm btn-outline-primary" title="Edit">
                        <Icon icon="ri:pencil-line" width={15} />
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          {viewing.logo_url && (
            <div className="text-center mb-3">
              <img src={viewing.logo_url} alt="Logo" className="border rounded" style={{ maxHeight: 80 }} />
            </div>
          )}
          <DetailRow label="Name" value={viewing.name} />
          <DetailRow label="Slug" value={<code>{viewing.slug}</code>} />
          <DetailRow label="Phone" value={viewing.phone} />
          <DetailRow label="Email" value={viewing.email} />
          <DetailRow label="Address" value={viewing.address} />
          <DetailRow label="City" value={viewing.city} />
          <DetailRow label="State" value={viewing.state} />
          <DetailRow label="Delivery Radius" value={viewing.delivery_radius_km ? `${viewing.delivery_radius_km} km` : null} />
          <DetailRow label="Commission Rate" value={viewing.commission_rate ? `${viewing.commission_rate}%` : null} />
          <DetailRow label="Open" value={
            <span className={`badge ${viewing.is_open ? "bg-success" : "bg-secondary"}`}>
              {viewing.is_open ? "Yes" : "No"}
            </span>
          } />
          <DetailRow label="Active" value={
            <span className={`badge ${viewing.is_active ? "bg-success" : "bg-secondary"}`}>
              {viewing.is_active ? "Yes" : "No"}
            </span>
          } />
          <DetailRow label="Created" value={new Date(viewing.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} />
          <DetailRow label="Last Updated" value={new Date(viewing.updated_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} />

          <div className="row mb-2 mt-2">
            <div className="col-4 text-muted small d-flex align-items-center">
              Categories
              {isSuperAdmin && !editingCategories && categories.length > 0 && (
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 ms-2"
                  onClick={() => {
                    setPendingCategoryIds(assignedIds);
                    setEditingCategories(true);
                  }}
                >
                  <Icon icon="ri:edit-line" width={13} /> Edit
                </button>
              )}
            </div>
            <div className="col-8">
              {loadingAssigned ? (
                <span className="text-muted small">Loading...</span>
              ) : editingCategories ? (
                <CategoryEditor
                  parents={parents}
                  childrenByParent={childrenByParent}
                  selected={pendingCategoryIds}
                  lockedMap={lockedMap}
                  onToggle={togglePendingCategory}
                />
              ) : assignedIds.length === 0 ? (
                <span className="text-muted small">No categories assigned (all available)</span>
              ) : (
                <div>
                  <div className="d-flex flex-wrap gap-1">
                    {assignedIds.map((id) => {
                      const cat = categories.find((c) => c.id === id);
                      if (!cat) return null;
                      const lock = lockedMap.get(id);
                      return (
                        <span
                          key={id}
                          className={`badge ${lock ? "bg-warning-subtle text-warning" : "bg-primary bg-opacity-10 text-primary"}`}
                          title={
                            lock
                              ? `Locked: ${lock.productCount} product(s), ${lock.activeOrderCount} active order(s)`
                              : undefined
                          }
                        >
                          {lock && <Icon icon="ri:lock-line" width={11} className="me-1" />}
                          {cat.name}
                        </span>
                      );
                    })}
                  </div>
                  {lockedCategories.length > 0 && (
                    <div className="form-text mt-1">
                      <Icon icon="ri:lock-line" width={12} className="me-1" />
                      Locked categories have products or active orders and cannot be unassigned.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {editingCategories && (
            <div className="d-flex gap-2 justify-content-end mt-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  setEditingCategories(false);
                  setPendingCategoryIds(assignedIds);
                }}
                disabled={savingCategories}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={saveCategoryChanges}
                disabled={savingCategories}
              >
                {savingCategories ? "Saving..." : "Save Categories"}
              </button>
            </div>
          )}

          <div className="d-flex gap-2 justify-content-end mt-3 pt-3 border-top">
            <Link href={`/settings?store_id=${viewing.id}`} className="btn btn-primary">
              <Icon icon="ri:pencil-line" width={16} className="me-1" />Edit Store
            </Link>
          </div>
        </Modal>
      )}

    </div>
  );
}

function CategoryEditor({
  parents,
  childrenByParent,
  selected,
  lockedMap,
  onToggle,
}: {
  parents: CategoryOption[];
  childrenByParent: Map<string, CategoryOption[]>;
  selected: string[];
  lockedMap: Map<string, LockedCategory>;
  onToggle: (id: string) => void;
}) {
  const renderRow = (cat: CategoryOption, isChild: boolean) => {
    const lock = lockedMap.get(cat.id);
    const isLocked = Boolean(lock);
    const lockReason = lock
      ? lock.reason === "orders"
        ? `${lock.activeOrderCount} active order(s)`
        : lock.reason === "products"
        ? `${lock.productCount} product(s)`
        : `${lock.productCount} product(s), ${lock.activeOrderCount} active order(s)`
      : "";
    return (
      <div className="form-check" key={cat.id}>
        <input
          type="checkbox"
          className="form-check-input"
          id={`store-modal-cat-${cat.id}`}
          checked={isLocked ? true : selected.includes(cat.id)}
          disabled={isLocked}
          onChange={() => onToggle(cat.id)}
        />
        <label
          className={`form-check-label ${isChild ? "small" : "fw-semibold"}`}
          htmlFor={`store-modal-cat-${cat.id}`}
          title={isLocked ? `Locked — has ${lockReason}` : undefined}
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
    <div
      className="border rounded p-2"
      style={{ maxHeight: 240, overflowY: "auto", background: "#fafafa" }}
    >
      {parents.length === 0 && (
        <div className="text-muted small p-2">No categories available</div>
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
  );
}
