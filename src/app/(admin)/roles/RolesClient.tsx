"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { createRole, updateRole, deleteRole } from "./actions";
import { PERMISSION_MODULES } from "@/lib/permissions";
import type { PermissionModule, PermissionAction } from "@/lib/permissions";
import type { RoleRow } from "./actions";
// P63: client-side date renderer. Avoids hydration mismatches caused
// by server/client timezone divergence in toLocaleDateString.
import ClientDate from "@/components/ClientDate";

const ACTION_LABELS: Record<string, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  upload: "Upload",
  send: "Send",
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  products: "Products",
  categories: "Categories",
  orders: "Orders",
  invoices: "Invoices",
  customers: "Customers",
  delivery_zones: "Delivery Zones",
  delivery_slots: "Delivery Slots",
  gst_numbers: "GST Numbers",
  inventory_log: "Inventory Log",
  banners: "Banners",
  media: "Media",
  notifications: "Notifications",
  users: "Users",
  roles: "Roles",
  settings: "Settings",
  staff: "Staff",
  reports: "Reports",
  returns: "Returns",
  commissions: "Commissions",
  stores: "Stores",
};

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function RolesClient({ roles, actionPerms }: { roles: RoleRow[]; actionPerms?: ActionPermissions }) {
  const router = useRouter();
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPermissions, setFormPermissions] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    const fd = new FormData();
    fd.set("id", String(id));
    setDeleting(id);
    try {
      await deleteRole(fd);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete role");
    } finally {
      setDeleting(null);
    }
  };

  const openNew = () => {
    setEditingRole(null);
    setFormName("");
    setFormDescription("");
    const defaults: Record<string, string[]> = {};
    for (const mod of Object.keys(PERMISSION_MODULES) as PermissionModule[]) {
      defaults[mod] = [];
    }
    setFormPermissions(defaults);
    setError("");
    setShowForm(true);
  };

  const openEdit = (role: RoleRow) => {
    setEditingRole(role);
    setFormName(role.name);
    setFormDescription(role.description ?? "");
    const perms: Record<string, string[]> = {};
    for (const mod of Object.keys(PERMISSION_MODULES) as PermissionModule[]) {
      perms[mod] = role.permissions[mod] ?? [];
    }
    setFormPermissions(perms);
    setError("");
    setShowForm(true);
  };

  const togglePermission = (mod: PermissionModule, action: PermissionAction) => {
    setFormPermissions((prev) => {
      const current = prev[mod] ?? [];
      if (current.includes(action)) {
        return { ...prev, [mod]: current.filter((a) => a !== action) };
      }
      return { ...prev, [mod]: [...current, action] };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError("Role name is required");
      return;
    }
    setSaving(true);
    setError("");

    const fd = new FormData();
    fd.set("name", formName.trim());
    fd.set("description", formDescription.trim());
    fd.set("permissions", JSON.stringify(formPermissions));

    try {
      if (editingRole) {
        fd.set("id", String(editingRole.id));
        await updateRole(fd);
      } else {
        await createRole(fd);
      }
      setShowForm(false);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const modules = Object.keys(PERMISSION_MODULES) as PermissionModule[];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">All Roles ({roles.length})</h5>
        {actionPerms?.canCreate && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <Icon icon="mdi:plus" className="me-1" />
            Add Role
          </button>
        )}
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Role</th>
              <th>Description</th>
              <th>Permissions</th>
              <th className="text-center">Users</th>
              <th>Created</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
                  No roles found
                </td>
              </tr>
            ) : (
              roles.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="fw-medium">{r.name}</span>
                  </td>
                  <td className="text-muted" style={{ fontSize: "0.85rem" }}>
                    {r.description ?? "—"}
                  </td>
                  <td>
                    {r.permissionSummary.length === 0 ? (
                      <span className="text-muted small">No permissions</span>
                    ) : (
                      <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 320 }}>
                        {r.permissionSummary.slice(0, 4).map((p) => (
                          <span key={p} className="badge bg-light text-dark border" style={{ fontSize: "0.7rem" }}>
                            {p}
                          </span>
                        ))}
                        {r.permissionSummary.length > 4 && (
                          <span className="badge bg-secondary" style={{ fontSize: "0.7rem" }}>
                            +{r.permissionSummary.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="text-center">
                    <button
                      className="btn btn-sm btn-link text-decoration-none p-0"
                      onClick={() => setExpandedUsers(expandedUsers === r.id ? null : r.id)}
                      title={r.assignedUsers.length > 0 ? "Click to see users" : "No users assigned"}
                    >
                      <span className="badge bg-primary bg-opacity-10 text-primary">
                        {r.userCount}
                      </span>
                    </button>
                    {expandedUsers === r.id && r.assignedUsers.length > 0 && (
                      <div className="text-start mt-1" style={{ fontSize: "0.8rem" }}>
                        {r.assignedUsers.map((u) => (
                          <div key={u.id} className="text-muted">
                            {u.full_name || u.email || u.id.slice(0, 8)}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>
                    <ClientDate value={r.created_at} format="date" />
                  </td>
                  <td>
                    <div className="d-flex gap-1 justify-content-center">
                      {actionPerms?.canEdit && (
                        <button
                          className="btn btn-sm btn-outline-primary"
                          title="Edit"
                          onClick={() => openEdit(r)}
                        >
                          <Icon icon="mdi:pencil" />
                        </button>
                      )}
                      {actionPerms?.canDelete && !r.is_system && (
                        <button
                          className="btn btn-sm btn-outline-danger"
                          title="Delete"
                          disabled={deleting === r.id}
                          onClick={() => handleDelete(r.id)}
                        >
                          <Icon icon="mdi:delete" />
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

      {showForm && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ background: "rgba(0,0,0,0.4)", zIndex: 1050 }}
            onClick={() => setShowForm(false)}
          />
          <div
            className="position-fixed bg-white rounded shadow"
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 1060,
              width: "90%",
              maxWidth: 720,
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
              <h6 className="mb-0 fw-bold">
                {editingRole ? "Edit Role" : "New Role"}
              </h6>
              <button
                className="btn-close"
                onClick={() => setShowForm(false)}
              />
            </div>
            <form onSubmit={handleSave} className="p-3">
              {error && (
                <div className="alert alert-danger py-2 small">{error}</div>
              )}
              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Role Name</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    disabled={editingRole?.is_system}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Description</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>
              </div>

              <label className="form-label small fw-medium mb-2">Permissions</label>
              <div className="table-responsive">
                <table className="table table-sm table-bordered mb-0" style={{ fontSize: "0.825rem" }}>
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 160 }}>Module</th>
                      {(Object.values(PERMISSION_MODULES)[0] as readonly string[]).map((action) => (
                        <th key={action} className="text-center">
                          {ACTION_LABELS[action]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((mod) => {
                      const actions = PERMISSION_MODULES[mod];
                      return (
                        <tr key={mod}>
                          <td className="fw-medium">{MODULE_LABELS[mod]}</td>
                          {actions.map((action) => (
                            <td key={action} className="text-center">
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={(formPermissions[mod] ?? []).includes(action)}
                                onChange={() => togglePermission(mod, action as PermissionAction)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={saving}
                >
                  {saving ? "Saving..." : editingRole ? "Update Role" : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
