"use client";

import { Icon } from "@iconify/react";
import { v4 as uuidv4 } from "uuid";
import { formatDiscountLabel } from "./discount";

type Variant = {
  id: string;
  name: string;
  sku: string | null;
  mrp: number;
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
        mrp: 0,
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
      {variants.length === 0 ? (
        <p className="text-muted" style={{ fontSize: "0.85rem" }}>
          No variants added. Add weight/size variants (e.g., 1kg, 500g, 5 pack).
        </p>
      ) : (
        <div className="table-responsive">
          <table
            className="table table-sm align-middle mb-0"
            style={{ fontSize: "0.85rem" }}
            data-testid="variant-table"
          >
            <thead>
              <tr className="text-muted">
                <th
                  scope="col"
                  style={{ width: "36px", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
                  data-testid="variant-header-index"
                >
                  #
                </th>
                <th
                  scope="col"
                  style={{ fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
                  data-testid="variant-header-name"
                >
                  Name
                </th>
                <th
                  scope="col"
                  style={{ width: "120px", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
                  data-testid="variant-header-sku"
                >
                  SKU
                </th>
                <th
                  scope="col"
                  style={{ width: "100px", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
                  data-testid="variant-header-mrp"
                >
                  MRP (₹)
                </th>
                <th
                  scope="col"
                  style={{ width: "110px", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
                  data-testid="variant-header-price"
                >
                  Selling (₹)
                </th>
                <th
                  scope="col"
                  style={{ width: "110px", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
                  data-testid="variant-header-discount"
                >
                  Discount
                </th>
                <th
                  scope="col"
                  style={{ width: "90px", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
                  data-testid="variant-header-stock"
                >
                  Stock
                </th>
                <th
                  scope="col"
                  style={{ width: "60px", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
                  data-testid="variant-header-action"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant, idx) => (
                <tr key={variant.id} data-testid="variant-row">
                  <td className="text-muted">{idx + 1}</td>
                  <td>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Name (e.g., 1kg)"
                      value={variant.name}
                      onChange={(e) =>
                        updateVariant(variant.id, "name", e.target.value)
                      }
                      data-testid="variant-name-input"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="SKU"
                      value={variant.sku ?? ""}
                      onChange={(e) =>
                        updateVariant(variant.id, "sku", e.target.value)
                      }
                      data-testid="variant-sku-input"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control form-control-sm"
                      placeholder="MRP"
                      value={variant.mrp}
                      onChange={(e) =>
                        updateVariant(variant.id, "mrp", Number(e.target.value))
                      }
                      data-testid="variant-mrp-input"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control form-control-sm"
                      placeholder="Price"
                      value={variant.price}
                      onChange={(e) =>
                        updateVariant(variant.id, "price", Number(e.target.value))
                      }
                      data-testid="variant-price-input"
                    />
                  </td>
                  <td>
                    <div
                      className="form-control-plaintext"
                      data-testid="variant-discount-display"
                    >
                      {formatDiscountLabel(variant.mrp, variant.price)}
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control form-control-sm"
                      placeholder="Stock"
                      value={variant.stock}
                      onChange={(e) =>
                        updateVariant(variant.id, "stock", Number(e.target.value))
                      }
                      data-testid="variant-stock-input"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => removeVariant(variant.id)}
                      data-testid="variant-remove-button"
                      title="Remove variant"
                    >
                      <Icon icon="ri:close-line" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        className="btn btn-sm btn-outline-primary mt-3"
        onClick={addVariant}
        data-testid="variant-add-button"
      >
        <Icon icon="ri:add-line" className="me-1" />
        Add Variant
      </button>
    </div>
  );
}
