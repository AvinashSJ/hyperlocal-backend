"use client";

import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { deleteDeliveryRule, type getDeliveryRules } from "./actions";
import RuleForm from "./RuleForm";

type Rule = Awaited<ReturnType<typeof getDeliveryRules>>[number];

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

function formatCondition(value: number | null, suffix: string, type: "min" | "max"): string {
  if (value === null) return "";
  return type === "min" ? `≥ ${value}${suffix}` : `≤ ${value}${suffix}`;
}

export default function RulesClient({ rules: initial, actionPerms, storeId }: { rules: Rule[]; actionPerms?: ActionPermissions; storeId?: string | null }) {
  const [rules, setRules] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Delete rule "${name}"?`)) return;
    try {
      await deleteDeliveryRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Rule deleted");
    } catch {
      toast.error("Failed to delete rule");
    }
  }, []);

  const handleEdit = useCallback((rule: Rule) => {
    setEditing(rule);
    setShowForm(true);
  }, []);

  const handleNew = useCallback(() => {
    setEditing(null);
    setShowForm(true);
  }, []);

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setEditing(null);
  }, []);

  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">Delivery Rules ({rules.length})</h5>
        {actionPerms?.canCreate && (
          <button className="btn btn-primary btn-sm" onClick={handleNew}>
            <Icon icon="ri:add-line" width={16} className="me-1" />Add Rule
          </button>
        )}
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Priority</th>
              <th>Name</th>
              <th>Order Value</th>
              <th>Distance</th>
              <th>Charge</th>
              <th>Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">No delivery rules yet</td>
              </tr>
            )}
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td className="text-center">
                  <span className="badge bg-light text-dark border">{rule.priority}</span>
                </td>
                <td className="fw-semibold">{rule.name}</td>
                <td>
                  {(() => {
                    const min = formatCondition(rule.min_order_value, "", "min");
                    const max = formatCondition(rule.max_order_value, "", "max");
                    if (min && max) return <>{min} &amp; {max}</>;
                    if (min) return min;
                    if (max) return max;
                    return <span className="text-muted">Any</span>;
                  })()}
                </td>
                <td>
                  {(() => {
                    const min = formatCondition(rule.min_distance_km, " km", "min");
                    const max = formatCondition(rule.max_distance_km, " km", "max");
                    if (min && max) return <>{min} &amp; {max}</>;
                    if (min) return min;
                    if (max) return max;
                    return <span className="text-muted">Any</span>;
                  })()}
                </td>
                <td>₹{Number(rule.charge).toFixed(2)}</td>
                <td>
                  <span className={`badge ${rule.is_active ? "bg-success" : "bg-secondary"}`}>
                    {rule.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    {actionPerms?.canEdit && (
                      <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => handleEdit(rule)}>
                        <Icon icon="ri:pencil-line" width={16} />
                      </button>
                    )}
                    {actionPerms?.canDelete && (
                      <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => handleDelete(rule.id, rule.name)}>
                        <Icon icon="ri:delete-bin-6-line" width={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <RuleForm rule={editing} onClose={handleFormClose} storeId={storeId} />}
    </>
  );
}
