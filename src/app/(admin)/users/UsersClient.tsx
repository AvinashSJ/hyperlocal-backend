"use client";

import { useState, useMemo, useRef } from "react";
import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { updateUserRole, toggleUserActive, createUser, updateUser, deleteUser } from "./actions";
import type { UserRow, SimpleRole, SimpleStore } from "./actions";

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function UsersClient({
  users,
  roles,
  stores,
  currentRole,
  actionPerms,
}: {
  users: UserRow[];
  roles: SimpleRole[];
  stores: SimpleStore[];
  currentRole: string;
  actionPerms?: ActionPermissions;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [createError, setCreateError] = useState("");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editError, setEditError] = useState("");
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (u.email?.toLowerCase() ?? "").includes(q) ||
        (u.phone?.toLowerCase() ?? "").includes(q) ||
        (u.full_name?.toLowerCase() ?? "").includes(q)
      );
    });
  }, [users, search]);

  const getRoleName = (u: UserRow): string => {
    return u.role_name ?? u.role;
  };

  const getRoleBadgeClass = (roleName: string): string => {
    const r = roleName.toLowerCase();
    if (r.includes("super")) return "bg-warning bg-opacity-10 text-warning";
    if (r === "manager" || r === "admin") return "bg-info bg-opacity-10 text-info";
    if (r === "staff") return "bg-secondary bg-opacity-10 text-secondary";
    return "bg-light text-muted";
  };

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">
          All Users ({filtered.length})
          {actionPerms?.canCreate && (
            <button
              className="btn btn-sm btn-primary ms-3"
              onClick={() => {
                setShowCreateModal(true);
                setCreateError("");
                setSelectedRoleId("");
              }}
            >
              <Icon icon="mdi:plus" className="me-1" />
              Add User
            </button>
          )}
        </h5>
        <div className="d-flex gap-2">
          <select
            className="form-select form-select-sm"
            style={{ width: 150 }}
            value={currentRole}
            onChange={(e) => {
              const v = e.target.value;
              router.push(v === "all" ? "/users" : `/users?role=${v}`);
            }}
          >
            <option value="all">All Roles</option>
            {roles.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search name, email or phone..."
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
              <th>User</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Store</th>
              <th className="text-center">Active</th>
              <th className="text-center">Orders</th>
              <th>Joined</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-muted py-4">
                  No users found
                </td>
              </tr>
            ) : (
              filtered.map((u) => {
                const roleName = getRoleName(u);
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div
                          className="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center"
                          style={{ width: 36, height: 36, fontSize: "0.8rem" }}
                        >
                          {(u.full_name || u.email || "U")[0].toUpperCase()}
                        </div>
                        <span className="fw-medium">
                          {u.full_name ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td>{u.email ?? "—"}</td>
                    <td>{u.phone ?? "—"}</td>
                    <td>
                      <span className={`badge ${getRoleBadgeClass(roleName)}`}>
                        {roleName}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {u.store_name ?? "—"}
                    </td>
                    <td className="text-center">
                      <span
                        className={`badge ${
                          u.is_active
                            ? "bg-success bg-opacity-10 text-success"
                            : "bg-danger bg-opacity-10 text-danger"
                        }`}
                      >
                        {u.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="badge bg-primary bg-opacity-10 text-primary">
                        {u.orderCount}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="d-flex gap-1 justify-content-center align-items-center">
                        {actionPerms?.canEdit && (
                          <form action={updateUserRole}>
                            <input type="hidden" name="id" value={u.id} />
                            <select
                              name="role_id"
                              className="form-select form-select-sm"
                              style={{ width: 140 }}
                              defaultValue={u.role_id ?? ""}
                              onChange={(e) => {
                                e.target.form?.requestSubmit();
                              }}
                            >
                              <option value="" disabled>Select role</option>
                              {roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                              <option value="customer">Customer</option>
                            </select>
                          </form>
                        )}
                        {actionPerms?.canEdit && (
                          <form action={toggleUserActive}>
                          <input type="hidden" name="id" value={u.id} />
                          <input
                            type="hidden"
                            name="current"
                            value={String(u.is_active)}
                          />
                          <button
                            type="submit"
                            className={`btn btn-sm ${
                              u.is_active ? "btn-outline-danger" : "btn-outline-success"
                            }`}
                            title={u.is_active ? "Disable" : "Enable"}
                          >
                            <Icon
                              icon={
                                u.is_active
                                  ? "mdi:account-off"
                                  : "mdi:account-check"
                              }
                            />
                          </button>
                        </form>
                        )}
                        {actionPerms?.canEdit && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            title="Edit"
                            onClick={() => {
                              setEditingUser(u);
                              setEditError("");
                            }}
                          >
                            <Icon icon="mdi:pencil" />
                          </button>
                        )}
                        {actionPerms?.canDelete && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            title="Delete"
                            onClick={() => {
                              setDeletingUser(u);
                              setDeleteError("");
                            }}
                          >
                            <Icon icon="mdi:trash-can-outline" />
                          </button>
                        )}

                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create User</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError("");
                  }}
                />
              </div>
              <form
                ref={formRef}
                action={async (fd) => {
                  try {
                    setCreateError("");
                    await createUser(fd);
                    setShowCreateModal(false);
                    setSelectedRoleId("");
                    router.refresh();
                  } catch (e: unknown) {
                    setCreateError(e instanceof Error ? e.message : "Failed to create user");
                  }
                }}
              >
                <div className="modal-body">
                  {createError && (
                    <div className="alert alert-danger py-2">{createError}</div>
                  )}
                  <div className="mb-3">
                    <label className="form-label">Full Name</label>
                    <input
                      type="text"
                      name="full_name"
                      className="form-control"
                      placeholder="Enter full name"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Email <span className="text-danger">*</span></label>
                    <input
                      type="email"
                      name="email"
                      className="form-control"
                      placeholder="Enter email address"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Phone</label>
                    <input
                      type="text"
                      name="phone"
                      className="form-control"
                      placeholder="Enter phone number"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Password <span className="text-danger">*</span></label>
                    <input
                      type="password"
                      name="password"
                      className="form-control"
                      placeholder="Set a temporary password"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Role <span className="text-danger">*</span></label>
                    <select
                      name="role_id"
                      className="form-select"
                      value={selectedRoleId}
                      onChange={(e) => setSelectedRoleId(e.target.value)}
                      required
                    >
                      <option value="">Select role</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedRoleId && roles.find((r) => String(r.id) === selectedRoleId)?.name !== "Super Admin" && (
                    <div className="mb-3">
                      <label className="form-label">Store</label>
                      <select name="store_id" className="form-select">
                        <option value="">No store</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreateError("");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Create User
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit User</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setEditingUser(null);
                    setEditError("");
                  }}
                />
              </div>
              <form
                action={async (fd) => {
                  try {
                    setEditError("");
                    await updateUser(fd);
                    setEditingUser(null);
                    router.refresh();
                  } catch (e: unknown) {
                    setEditError(e instanceof Error ? e.message : "Failed to update user");
                  }
                }}
              >
                <input type="hidden" name="id" value={editingUser.id} />
                <div className="modal-body">
                  {editError && (
                    <div className="alert alert-danger py-2">{editError}</div>
                  )}
                  <div className="mb-3">
                    <label className="form-label">Full Name</label>
                    <input
                      type="text"
                      name="full_name"
                      className="form-control"
                      defaultValue={editingUser.full_name ?? ""}
                      placeholder="Enter full name"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      name="email"
                      className="form-control"
                      defaultValue={editingUser.email ?? ""}
                      placeholder="Enter email address"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Phone</label>
                    <input
                      type="text"
                      name="phone"
                      className="form-control"
                      defaultValue={editingUser.phone ?? ""}
                      placeholder="Enter phone number"
                    />
                  </div>
                  {editingUser.role_name !== "Super Admin" && (
                    <div className="mb-3">
                      <label className="form-label">Store</label>
                      <select
                        name="store_id"
                        className="form-select"
                        defaultValue={editingUser.store_id ?? ""}
                      >
                        <option value="">No store</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditingUser(null);
                      setEditError("");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deletingUser && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Delete User</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setDeletingUser(null);
                    setDeleteError("");
                  }}
                />
              </div>
              <form
                action={async (fd) => {
                  try {
                    setDeleteError("");
                    await deleteUser(fd);
                    setDeletingUser(null);
                    router.refresh();
                  } catch (e: unknown) {
                    setDeleteError(e instanceof Error ? e.message : "Failed to delete user");
                  }
                }}
              >
                <input type="hidden" name="id" value={deletingUser.id} />
                <div className="modal-body">
                  {deleteError && (
                    <div className="alert alert-danger py-2">{deleteError}</div>
                  )}
                  <p className="mb-2">
                    Are you sure you want to delete{" "}
                    <strong>
                      {deletingUser.full_name || deletingUser.email || deletingUser.phone}
                    </strong>
                    ?
                  </p>
                  <p className="text-muted small mb-0">
                    This will permanently remove the user's profile. This action cannot be undone.
                  </p>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setDeletingUser(null);
                      setDeleteError("");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-danger">
                    Delete User
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
