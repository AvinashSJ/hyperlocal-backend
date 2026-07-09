"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import { createProduct, updateProduct } from "./actions";
import { formatDiscountLabel } from "./discount";
import VariantEditor from "./VariantEditor";
import ImagePickerModal from "@/components/ImagePickerModal";

type Product = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category_id: string | null;
  brand: string | null;
  unit_of_measurement: string;
  mrp: number;
  selling_price: number;
  discount_percent: number;
  gst_rate: number;
  hsn_code: string | null;
  is_gst_exempted: boolean;
  min_order_qty: number;
  max_order_qty: number | null;
  stock_quantity: number;
  low_stock_threshold: number | null;
  purchase_rate: number | null;
  status: string;
  store_id: string | null;
  cascade_locked?: boolean; // P33: Super-Admin-only cascade flag
  categories?: { name: string } | null;
  variants?: ProductVariant[];
  images?: ProductImage[];
};

type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  mrp: number;
  price: number;
  stock: number;
  variant_attributes: Record<string, unknown> | null;
};

type ProductImage = {
  id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
};

type Category = { id: string; name: string; parent_id: string | null; sort_order: number };

const UNITS = ["kg", "gram", "ml", "ltr", "pcs", "pack", "dozen", "box", "bundle", "pouch", "unit", "tin"];
const GST_RATES = [0, 5, 12, 18, 28];
const STATUSES = ["active", "inactive", "out_of_stock"];

export default function ProductForm({
  product,
  categories,
  isSuperAdmin = false,
}: {
  product: Product | null;
  categories: Category[];
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const isEditing = !!product;
  const [saving, setSaving] = useState(false);

  const [mrp, setMrp] = useState<number>(product?.mrp ?? 0);
  const [sellingPrice, setSellingPrice] = useState<number>(product?.selling_price ?? 0);
  const [stockQty, setStockQty] = useState<number>(product?.stock_quantity ?? 0);

  const [variants, setVariants] = useState<ProductVariant[]>(
    product?.variants ?? [],
  );
  const [images, setImages] = useState<ProductImage[]>(
    product?.images ?? [],
  );
  const [showImagePicker, setShowImagePicker] = useState(false);

  const hasVariants = variants.length > 0;
  const derivedMrp = useMemo(
    () => (hasVariants ? Math.min(...variants.map((v) => Number(v.mrp) || 0)) : 0),
    [variants, hasVariants],
  );
  const derivedSelling = useMemo(
    () => (hasVariants ? Math.min(...variants.map((v) => Number(v.price) || 0)) : 0),
    [variants, hasVariants],
  );

  const effectiveMrp = hasVariants ? derivedMrp : mrp;
  const effectiveSelling = hasVariants ? derivedSelling : sellingPrice;
  const discountLabel = useMemo(
    () => formatDiscountLabel(effectiveMrp, effectiveSelling),
    [effectiveMrp, effectiveSelling],
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    formData.set("variants", JSON.stringify(variants));
    formData.set("images", JSON.stringify(images));

    if (hasVariants) {
      formData.set("mrp", String(derivedMrp));
      formData.set("selling_price", String(derivedSelling));
    }

    const action = isEditing
      ? updateProduct.bind(null, product!.id)
      : createProduct;
    const result = await runServerAction(action, formData);

    if (result.ok) {
      toast.success(isEditing ? "Product updated" : "Product created");
      router.push("/products");
    } else {
      toast.error(result.error.message);
      setSaving(false);
    }
  };

  const handleImageSelect = (urls: string[]) => {
    const existing = new Set(images.map((i) => i.image_url));
    const newImages = urls
      .filter((url) => !existing.has(url))
      .map((url, i) => ({
        id: `new_${Date.now()}_${i}`,
        image_url: url,
        is_primary: images.length === 0 && i === 0,
        sort_order: images.length + i,
      }));
    setImages([...images, ...newImages]);
    setShowImagePicker(false);
  };

  const setPrimary = (imageUrl: string) => {
    setImages(
      images.map((i) => ({
        ...i,
        is_primary: i.image_url === imageUrl,
      })),
    );
  };

  const removeImage = (imageUrl: string) => {
    setImages(images.filter((i) => i.image_url !== imageUrl));
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">
          {isEditing ? "Edit Product" : "Add Product"}
        </h4>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="row g-3">
          <div className="col-lg-8">
            <div className="card mb-3">
              <div className="card-body">
                <h6 className="card-title fw-semibold mb-3">Basic Information</h6>

                <div className="mb-3">
                  <label className="form-label">Product Name *</label>
                  <input
                    name="name"
                    type="text"
                    className="form-control"
                    required
                    defaultValue={product?.name ?? ""}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Description</label>
                  <textarea
                    name="description"
                    className="form-control"
                    rows={4}
                    defaultValue={product?.description ?? ""}
                  />
                </div>

                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label">SKU</label>
                    <input
                      name="sku"
                      type="text"
                      className="form-control"
                      defaultValue={product?.sku ?? ""}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Brand</label>
                    <input
                      name="brand"
                      type="text"
                      className="form-control"
                      defaultValue={product?.brand ?? ""}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">HSN Code</label>
                    <input
                      name="hsn_code"
                      type="text"
                      className="form-control"
                      defaultValue={product?.hsn_code ?? ""}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="card mb-3">
              <div className="card-body">
                <h6 className="card-title fw-semibold mb-3">Pricing & Inventory</h6>

                {hasVariants ? (
                  <div data-testid="product-pricing-readonly">
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">MRP (₹)</label>
                        <div className="form-control-plaintext fw-semibold" data-testid="product-pricing-mrp">
                          ₹{derivedMrp}
                        </div>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Selling Price (₹)</label>
                        <div className="form-control-plaintext fw-semibold" data-testid="product-pricing-selling">
                          ₹{derivedSelling}
                        </div>
                        {discountLabel !== "No discount" && discountLabel !== "—" && (
                          <span
                            className="badge bg-success-subtle text-success mt-1"
                            data-testid="discount-badge"
                          >
                            {discountLabel}
                          </span>
                        )}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Discount</label>
                        <div
                          className="form-control-plaintext"
                          data-testid="discount-display"
                        >
                          {discountLabel}
                        </div>
                        <small className="text-muted d-block">
                          Auto-calculated from variant MRP/selling
                        </small>
                      </div>
                    </div>
                    <div className="alert alert-info py-2 px-3 mb-0 mt-2 small">
                      <Icon icon="ri:information-line" className="me-1" />
                      Derived from variants (min MRP: ₹{derivedMrp}, min Selling: ₹{derivedSelling}). Add MRP and Selling per variant in the Variants section below.
                    </div>
                  </div>
                ) : (
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label">MRP (₹)</label>
                      <input
                        name="mrp"
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control"
                        required
                        value={mrp}
                        onChange={(e) => setMrp(Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Selling Price (₹) *</label>
                      <input
                        name="selling_price"
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control"
                        required
                        value={sellingPrice}
                        onChange={(e) => setSellingPrice(Number(e.target.value) || 0)}
                      />
                      {discountLabel !== "No discount" && discountLabel !== "—" && (
                        <span
                          className="badge bg-success-subtle text-success mt-1"
                          data-testid="discount-badge"
                        >
                          {discountLabel}
                        </span>
                      )}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Discount</label>
                      <div
                        className="form-control-plaintext"
                        data-testid="discount-display"
                      >
                        {discountLabel}
                      </div>
                      <small className="text-muted d-block">
                        Auto-calculated from MRP and Selling Price
                      </small>
                    </div>
                  </div>
                )}

                <div className="row g-3 mt-2">
                  <div className="col-md-3">
                    <label className="form-label">Stock Quantity</label>
                    <input
                      name="stock_quantity"
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control"
                      value={stockQty}
                      onChange={(e) => setStockQty(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Low Stock Threshold</label>
                    <input
                      name="low_stock_threshold"
                      type="number"
                      step="0.01"
                      className="form-control"
                      defaultValue={product?.low_stock_threshold ?? 10}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Purchase Rate (₹)</label>
                    <input
                      name="purchase_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control"
                      defaultValue={product?.purchase_rate ?? ""}
                      placeholder="Cost per unit"
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Unit of Measurement</label>
                    <select
                      name="unit_of_measurement"
                      className="form-select"
                      defaultValue={product?.unit_of_measurement ?? "pcs"}
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {isSuperAdmin && (
                  // P33: Super-Admin-only toggle. When ON (default),
                  // the product participates in the manager-disable
                  // cascade (status → 'inactive'). When OFF, the
                  // product stays active even when its store's manager
                  // is disabled. Manager submissions are ignored server-side.
                  <div className="form-check form-switch mt-3 ms-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="cascade_locked"
                      name="cascade_locked"
                      value="true"
                      defaultChecked={product?.cascade_locked ?? true}
                      data-testid="cascade-locked-switch"
                    />
                    <label className="form-check-label ms-2" htmlFor="cascade_locked">
                      Lock to manager cascade (uncheck to keep active when manager is disabled)
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="card mb-3">
              <div className="card-body">
                <h6 className="card-title fw-semibold mb-3">Variants</h6>
                <VariantEditor variants={variants} onChange={setVariants} />
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="card mb-3">
              <div className="card-body">
                <h6 className="card-title fw-semibold mb-3">Organization</h6>

                <div className="mb-3">
                  <label className="form-label">Category *</label>
                  <select
                    name="category_id"
                    className="form-select"
                    required
                    defaultValue={product?.category_id ?? ""}
                  >
                    <option value="">Select category</option>
                    {product?.category_id &&
                      !categories.some((c) => c.id === product.category_id) && (
                        <option value={product.category_id}>
                          Current: {product.categories?.name ?? product.category_id} (out of scope)
                        </option>
                      )}
                    {(() => {
                      const parents = categories
                        .filter((c) => !c.parent_id)
                        .sort((a, b) => a.name.localeCompare(b.name));
                      const childrenByParent = new Map<string, typeof categories>();
                      categories.forEach((c) => {
                        if (c.parent_id) {
                          const list = childrenByParent.get(c.parent_id) ?? [];
                          list.push(c);
                          childrenByParent.set(c.parent_id, list);
                        }
                      });
                      return parents.map((parent) => {
                        const children = (childrenByParent.get(parent.id) ?? [])
                          .slice()
                          .sort((a, b) => a.name.localeCompare(b.name));
                        if (children.length === 0) {
                          return (
                            <option key={parent.id} value={parent.id}>
                              {parent.name}
                            </option>
                          );
                        }
                        return (
                          <optgroup key={parent.id} label={parent.name}>
                            <option value={parent.id}>{parent.name} (all)</option>
                            {children.map((child) => (
                              <option key={child.id} value={child.id}>
                                {"\u2003\u2514\u00A0"}{child.name}
                              </option>
                            ))}
                          </optgroup>
                        );
                      });
                    })()}
                  </select>
                  <small className="text-muted d-block mt-1">
                    Select a subcategory (indented) to assign this product to it, or pick a parent with &quot;(all)&quot; to keep it at the parent level.
                  </small>
                </div>

                <div className="mb-3">
                  <label className="form-label">Status</label>
                  <select
                    name="status"
                    className="form-select"
                    defaultValue={product?.status ?? "active"}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3">
                  <label className="form-label">GST Rate</label>
                  <select
                    name="gst_rate"
                    className="form-select"
                    defaultValue={product?.gst_rate ?? 0}
                  >
                    {GST_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="card mb-3">
              <div className="card-body">
                <h6 className="card-title fw-semibold mb-3">
                  Product Images
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary float-end"
                    onClick={() => setShowImagePicker(true)}
                  >
                    <Icon icon="ri:add-line" className="me-1" />
                    Add
                  </button>
                </h6>

                {images.length === 0 ? (
                  <p className="text-muted small mb-0">No images added yet</p>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {images
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((img) => (
                        <div
                          key={img.id}
                          className="d-flex align-items-center gap-2 p-1 rounded"
                          style={{ background: "#f8f9fa" }}
                        >
                          <img
                            src={img.image_url}
                            alt=""
                            style={{
                              width: 48,
                              height: 48,
                              objectFit: "cover",
                              borderRadius: 4,
                            }}
                          />
                          <div className="flex-grow-1">
                            <button
                              type="button"
                              className={`btn btn-sm p-0 me-1 ${
                                img.is_primary ? "text-warning" : "text-muted"
                              }`}
                              onClick={() => setPrimary(img.image_url)}
                              title={img.is_primary ? "Primary" : "Set as primary"}
                            >
                              <Icon
                                icon={
                                  img.is_primary
                                    ? "ri:star-fill"
                                    : "ri:star-line"
                                }
                                width={18}
                              />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm text-danger p-0"
                            onClick={() => removeImage(img.image_url)}
                            title="Remove"
                          >
                            <Icon icon="ri:close-line" width={18} />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card mb-3">
              <div className="card-body">
                <h6 className="card-title fw-semibold mb-3">Publish</h6>
                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Icon icon="ri:loader-4-line" className="spinner me-1" />
                      Saving...
                    </>
                  ) : isEditing ? (
                    "Update Product"
                  ) : (
                    "Create Product"
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary w-100 mt-2"
                  onClick={() => router.push("/products")}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
      {showImagePicker && (
        <ImagePickerModal
          selectedUrls={images.map((i) => i.image_url)}
          onSelect={handleImageSelect}
          onClose={() => setShowImagePicker(false)}
        />
      )}
    </div>
  );
}
