"use client";

import { Icon } from "@iconify/react";
import { v4 as uuidv4 } from "uuid";

type Variant = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
  variant_attributes: Record<string, unknown> | null;
};

export default function VariantEditor({
  variants,
  onChange,
}: {
  variants: Variant[];
  onChange: (variants: Variant[]) => void;
}) {
  const addVariant = () => {
    onChange([
      ...variants,
      {
        id: uuidv4(),
        name: "",
        sku: "",
        price: 0,
        stock: 0,
        variant_attributes: {},
      },
    ]);
  };

  const removeVariant = (id: string) => {
    onChange(variants.filter((v) => v.id !== id));
  };

  const updateVariant = (
    id: string,
    field: keyof Variant,
    value: string | number,
  ) => {
    onChange(
      variants.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );
  };

  return (
    <div>
      {variants.length === 0 && (
        <p className="text-muted" style={{ fontSize: "0.85rem" }}>
          No variants added. Add weight/size variants (e.g., 1kg, 500g, 5 pack).
        </p>
      )}

      {variants.map((variant, idx) => (
        <div
          key={variant.id}
          className="d-flex align-items-center gap-2 mb-2 p-2 border rounded"
          style={{ fontSize: "0.85rem" }}
        >
          <span className="text-muted" style={{ minWidth: 20 }}>
            {idx + 1}
          </span>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Name (e.g., 1kg)"
            value={variant.name}
            onChange={(e) => updateVariant(variant.id, "name", e.target.value)}
            style={{ maxWidth: 160 }}
          />
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="SKU"
            value={variant.sku ?? ""}
            onChange={(e) => updateVariant(variant.id, "sku", e.target.value)}
            style={{ maxWidth: 120 }}
          />
          <input
            type="number"
            step="0.01"
            className="form-control form-control-sm"
            placeholder="Price"
            value={variant.price}
            onChange={(e) =>
              updateVariant(variant.id, "price", Number(e.target.value))
            }
            style={{ maxWidth: 100 }}
          />
          <input
            type="number"
            step="0.01"
            className="form-control form-control-sm"
            placeholder="Stock"
            value={variant.stock}
            onChange={(e) =>
              updateVariant(variant.id, "stock", Number(e.target.value))
            }
            style={{ maxWidth: 80 }}
          />
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => removeVariant(variant.id)}
          >
            <Icon icon="ri:close-line" />
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-sm btn-outline-primary mt-2"
        onClick={addVariant}
      >
        <Icon icon="ri:add-line" className="me-1" />
        Add Variant
      </button>
    </div>
  );
}
