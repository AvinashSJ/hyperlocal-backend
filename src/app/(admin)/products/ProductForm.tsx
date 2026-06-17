"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { createProduct, updateProduct } from "./actions";
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
  status: string;
  store_id: string | null;
  variants?: ProductVariant[];
  images?: ProductImage[];
};

type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
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

const UNITS = ["kg", "g", "liter", "ml", "piece", "pack", "dozen"];
const GST_RATES = [0, 5, 12, 18, 28];
const STATUSES = ["active", "inactive", "out_of_stock"];

export default function ProductForm({
  product,
  categories,
}: {
  product: Product | null;
  categories: Category[];
}) {
  const router = useRouter();
  const isEditing = !!product;
  const [saving, setSaving] = useState(false);

  const [variants, setVariants] = useState<ProductVariant[]>(
    product?.variants ?? [],
  );
  const [images, setImages] = useState<ProductImage[]>(
    product?.images ?? [],
  );
  const [showImagePicker, setShowImagePicker] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    try {
      const formData = new FormData(e.currentTarget);
      formData.set("variants", JSON.stringify(variants));
      formData.set("images", JSON.stringify(images));

      if (isEditing) {
        await updateProduct(product!.id, formData);
        toast.success("Product updated");
      } else {
        await createProduct(formData);
        toast.success("Product created");
      }

      router.push("/products");
    } catch (err) {
      toast.error((err as Error).message);
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

                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label">MRP (₹)</label>
                    <input
                      name="mrp"
                      type="number"
                      step="0.01"
                      className="form-control"
                      required
                      defaultValue={product?.mrp ?? 0}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Selling Price (₹) *</label>
                    <input
                      name="selling_price"
                      type="number"
                      step="0.01"
                      className="form-control"
                      required
                      defaultValue={product?.selling_price ?? 0}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Discount %</label>
                    <input
                      name="discount_percent"
                      type="number"
                      step="0.01"
                      className="form-control"
                      defaultValue={product?.discount_percent ?? 0}
                    />
                  </div>
                </div>

                <div className="row g-3 mt-2">
                  <div className="col-md-4">
                    <label className="form-label">Stock Quantity</label>
                    <input
                      name="stock_quantity"
                      type="number"
                      step="0.01"
                      className="form-control"
                      defaultValue={product?.stock_quantity ?? 0}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Low Stock Threshold</label>
                    <input
                      name="low_stock_threshold"
                      type="number"
                      step="0.01"
                      className="form-control"
                      defaultValue={product?.low_stock_threshold ?? 10}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Unit of Measurement</label>
                    <select
                      name="unit_of_measurement"
                      className="form-select"
                      defaultValue={product?.unit_of_measurement ?? "piece"}
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
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
                    Select a subcategory (indented) to assign this product to it, or pick a parent with "(all)" to keep it at the parent level.
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
