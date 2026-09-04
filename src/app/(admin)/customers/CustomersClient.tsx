"use client";

import { useState, useMemo } from "react";
import { Icon } from "@iconify/react";
import type { CustomerUser } from "./actions";
// P63: client-side date renderer. Avoids hydration mismatches caused
// by server/client timezone divergence in toLocaleDateString.
import ClientDate from "@/components/ClientDate";

const PAGE_SIZE = 25;

function formatAddress(a: CustomerUser["addresses"][number]): string {
  const parts: string[] = [];
  if (a.address_line1) parts.push(a.address_line1);
  if (a.address_line2) parts.push(a.address_line2);
  if (a.landmark) parts.push(a.landmark);
  const cityState = [a.city, a.state].filter(Boolean).join(", ");
  if (cityState) parts.push(cityState);
  if (a.pincode) parts.push(a.pincode);
  return parts.join(", ");
}

export default function CustomersClient({
  customers,
}: {
  customers: CustomerUser[];
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedAddresses, setExpandedAddresses] = useState<Set<string>>(
    () => new Set(),
  );

  const filtered = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter((c) => {
      const addrText = (c.addresses ?? [])
        .map(formatAddress)
        .join(" ")
        .toLowerCase();
      return (
        (c.email?.toLowerCase() ?? "").includes(q) ||
        (c.phone?.toLowerCase() ?? "").includes(q) ||
        (c.profile?.full_name?.toLowerCase() ?? "").includes(q) ||
        addrText.includes(q)
      );
    });
  }, [customers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const changePage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    setPage(clamped);
  };

  const toggleAddresses = (customerId: string) => {
    setExpandedAddresses((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  };

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">All Customers ({filtered.length})</h5>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search name, email, phone or address..."
          style={{ width: 280 }}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Customer</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Addresses</th>
              <th className="text-center">Orders</th>
              <th>Joined</th>
              <th>Last Login</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  No customers found
                </td>
              </tr>
            ) : (
              pageItems.map((c) => (
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
                  <td>
                    {c.addresses.length === 0 ? (
                      <span className="text-muted">
                        <span className="badge bg-secondary bg-opacity-10 text-secondary me-2">
                          0
                        </span>
                        —
                      </span>
                    ) : (
                      <div className="small" style={{ minWidth: 260 }}>
                        <span className="badge bg-secondary bg-opacity-10 text-secondary me-2">
                          {c.addresses.length}
                        </span>
                        {c.addresses
                          .slice(0, expandedAddresses.has(c.id) ? c.addresses.length : 1)
                          .map((a) => (
                            <div key={a.id} className="mb-1">
                              {a.is_default && (
                                <span className="badge bg-success bg-opacity-10 text-success me-1">
                                  Default
                                </span>
                              )}
                              {!a.is_deliverable && (
                                <span className="badge bg-danger bg-opacity-10 text-danger me-1">
                                  Not deliverable
                                </span>
                              )}
                              {a.type && (
                                <span className="badge bg-secondary bg-opacity-10 text-secondary me-1 text-uppercase">
                                  {a.type}
                                </span>
                              )}
                              <div className="mt-1 text-muted">{formatAddress(a)}</div>
                            </div>
                          ))}
                        {c.addresses.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0 mt-1"
                            onClick={() => toggleAddresses(c.id)}
                          >
                            {expandedAddresses.has(c.id)
                              ? `Show less`
                              : `+${c.addresses.length - 1} more`}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="text-center">
                    <span className="badge bg-primary bg-opacity-10 text-primary">
                      {c.orderCount}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>
                    <ClientDate value={c.created_at} format="date" />
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>
                    <ClientDate value={c.last_sign_in_at} format="date" fallback="—" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > PAGE_SIZE && (
        <div className="d-flex align-items-center justify-content-between mt-3">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={currentPage === 1}
            onClick={() => changePage(currentPage - 1)}
          >
            <Icon icon="mdi:chevron-left" /> Prev
          </button>
          <span className="text-muted small">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={currentPage === totalPages}
            onClick={() => changePage(currentPage + 1)}
          >
            Next <Icon icon="mdi:chevron-right" />
          </button>
        </div>
      )}
    </div>
  );
}
