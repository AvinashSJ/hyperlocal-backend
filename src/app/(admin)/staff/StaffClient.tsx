"use client";

import { useState, useMemo, useRef } from "react";
import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { createStaff, updateStaff, toggleStaffActive, deleteStaff } from "./actions";
import type { StaffRow, SimpleStore } from "./actions";

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function StaffClient({
  staff,
  stores,
  storeId,
  actionPerms,
}: {
  staff: StaffRow[];
  stores: SimpleStore[];
  storeId: string | null;
  actionPerms?: ActionPermissions;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editItem, setEditItem] = useState<StaffRow | null>(null);
  const [deleteItem, setDeleteItem] = useState<StaffRow | null>(null);
  const [createError, setCreateError] = useState("");
  const [editError, setEditError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (s.full_name?.toLowerCase() ?? "").includes(q) ||
        (s.phone?.toLowerCase() ?? "").includes(q)
      );
    });
  }, [staff, search]);

  const staffTypeBadge = (type: string | null) => {
    if (type === "packing") return "bg-info bg-opacity-10 text-info";
    if (type === "delivery") return "bg-warning bg-opacity-10 text-warning";
    return "bg-light text-muted";
  };

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">
          All Staff ({filtered.length})
          {actionPerms?.canCreate && (
            <button
              className="btn btn-sm btn-primary ms-3"
              onClick={() => {
                setShowCreateModal(true);
                setCreateError("");
              }}
            >
              <Icon icon="mdi:plus" className="me-1" />
              Add Staff
            </button>
          )}
        </h5>
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search name or phone..."
            style={{ width: 260 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Staff Type</th>
              {!storeId && <th>Store</th>}
              <th className="text-center">Status</th>
              <th>Added</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={storeId ? 6 : 7} className="text-center text-muted py-4">
                  No staff found
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <div
                        className="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center"
                        style={{ width: 36, height: 36, fontSize: "0.8rem" }}
                      >
                        {(s.full_name ?? "S")[0].toUpperCase()}
                      </div>
                      <span className="fw-medium">{s.full_name ?? "—"}</span>
                    </div>
                  </td>
                  <td>{s.phone ?? "—"}</td>
                  <td>
                    <span className={`badge ${staffTypeBadge(s.staff_type)}`}>
                      {s.staff_type ? s.staff_type.charAt(0).toUpperCase() + s.staff_type.slice(1) : "—"}
                    </span>
                  </td>
                  {!storeId && (
                    <td style={{ fontSize: "0.85rem" }}>{s.store_name ?? "—"}</td>
                  )}
                  <td className="text-center">
                    <span
                      className={`badge ${
                        s.is_active
                          ? "bg-success bg-opacity-10 text-success"
                          : "bg-danger bg-opacity-10 text-danger"
                      }`}
                    >
                      {s.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="d-flex gap-1 justify-content-center align-items-center">
                      {actionPerms?.canEdit && (
                        <>
                          <button
                            className="btn btn-sm btn-outline-primary"
                            title="Edit"
                            onClick={() => setEditItem(s)}
                          >
                            <Icon icon="mdi:pencil" />
                          </button>
                          <form action={toggleStaffActive} method="POST">
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="current" value={String(s.is_active)} />
                            <button
                              type="submit"
                              className={`btn btn-sm ${
                                s.is_active ? "btn-outline-danger" : "btn-outline-success"
                              }`}
                              title={s.is_active ? "Disable" : "Enable"}
                            >
                              <Icon icon={s.is_active ? "mdi:account-off" : "mdi:account-check"} />
                            </button>
                          </form>
                        </>
                      )}
                      {actionPerms?.canDelete && (
                        <button
                          className="btn btn-sm btn-outline-danger"
                          title="Delete"
                          onClick={() => setDeleteItem(s)}
                        >
                          <Icon icon="mdi:delete-outline" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Staff</h5>
                <button type="button" className="btn-close" onClick={() => { setShowCreateModal(false); setCreateError(""); }} />
              </div>
              <form
                ref={formRef}
                action={async (fd) => {
                  try {
                    setCreateError("");
                    await createStaff(fd);
                    setShowCreateModal(false);
                    router.refresh();
                  } catch (e: unknown) {
                    setCreateError(e instanceof Error ? e.message : "Failed to create staff");
                  }
                }}
              >
                <div className="modal-body">
                  {createError && <div className="alert alert-danger py-2">{createError}</div>}
                  <div className="mb-3">
                    <label className="form-label">Full Name <span className="text-danger">*</span></label>
                    <input type="text" name="full_name" className="form-control" placeholder="Enter full name" required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Phone</label>
                    <input type="text" name="phone" className="form-control" placeholder="Enter phone number" />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Staff Type</label>
                    <select name="staff_type" className="form-select">
                      <option value="">Select type</option>
                      <option value="packing">Packing</option>
                      <option value="delivery">Delivery</option>
                    </select>
                  </div>
                  {!storeId && (
                    <div className="mb-3">
                      <label className="form-label">Store</label>
                      <select name="store_id" className="form-select">
                        <option value="">Select store</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowCreateModal(false); setCreateError(""); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Add Staff</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {editItem && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Staff</h5>
                <button type="button" className="btn-close" onClick={() => { setEditItem(null); setEditError(""); }} />
              </div>
              <form
                ref={editFormRef}
                action={async (fd) => {
                  try {
                    setEditError("");
                    await updateStaff(fd);
                    setEditItem(null);
                    router.refresh();
                  } catch (e: unknown) {
                    setEditError(e instanceof Error ? e.message : "Failed to update staff");
                  }
                }}
              >
                <input type="hidden" name="id" value={editItem.id} />
                <div className="modal-body">
                  {editError && <div className="alert alert-danger py-2">{editError}</div>}
                  <div className="mb-3">
                    <label className="form-label">Full Name <span className="text-danger">*</span></label>
                    <input type="text" name="full_name" className="form-control" defaultValue={editItem.full_name ?? ""} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Phone</label>
                    <input type="text" name="phone" className="form-control" defaultValue={editItem.phone ?? ""} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Staff Type</label>
                    <select name="staff_type" className="form-select" defaultValue={editItem.staff_type ?? ""}>
                      <option value="">Select type</option>
                      <option value="packing">Packing</option>
                      <option value="delivery">Delivery</option>
                    </select>
                  </div>
                  {!storeId && (
                    <div className="mb-3">
                      <label className="form-label">Store</label>
                      <select name="store_id" className="form-select" defaultValue={editItem.store_id ?? ""}>
                        <option value="">Select store</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { setEditItem(null); setEditError(""); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deleteItem && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-sm">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Delete Staff</h5>
                <button type="button" className="btn-close" onClick={() => setDeleteItem(null)} />
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  Are you sure you want to delete <strong>{deleteItem.full_name ?? "this staff member"}</strong>?
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDeleteItem(null)}>Cancel</button>
                <form action={deleteStaff} method="POST">
                  <input type="hidden" name="id" value={deleteItem.id} />
                  <button type="submit" className="btn btn-danger" onClick={() => setTimeout(() => setDeleteItem(null), 100)}>Delete</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
