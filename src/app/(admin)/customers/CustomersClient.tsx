"use client";

import { useState, useMemo } from "react";
import { Icon } from "@iconify/react";
import Link from "next/link";
import type { CustomerUser } from "./actions";

export default function CustomersClient({
  customers,
}: {
  customers: CustomerUser[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (c.email?.toLowerCase() ?? "").includes(q) ||
        (c.phone?.toLowerCase() ?? "").includes(q) ||
        (c.profile?.full_name?.toLowerCase() ?? "").includes(q)
      );
    });
  }, [customers, search]);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">All Customers ({filtered.length})</h5>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search name, email or phone..."
          style={{ width: 260 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Customer</th>
              <th>Email</th>
              <th>Phone</th>
              <th className="text-center">Addresses</th>
              <th className="text-center">Orders</th>
              <th>Joined</th>
              <th>Last Login</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  No customers found
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <div
                        className="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center"
                        style={{ width: 36, height: 36, fontSize: "0.8rem" }}
                      >
                        {(c.profile?.full_name || c.email || "U")[0].toUpperCase()}
                      </div>
                      <span className="fw-medium">
                        {c.profile?.full_name ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td>{c.email ?? "—"}</td>
                  <td>{c.phone ?? "—"}</td>
                  <td className="text-center">
                    <span className="badge bg-secondary bg-opacity-10 text-secondary">
                      {c.addressCount}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className="badge bg-primary bg-opacity-10 text-primary">
                      {c.orderCount}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>
                    {c.last_sign_in_at
                      ? new Date(c.last_sign_in_at).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
