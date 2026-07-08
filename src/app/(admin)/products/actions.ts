"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import { computeDiscountPercent } from "./discount";
import { logActivity } from "@/lib/activity-log";
import type { Product } from "@/lib/types/supabase";

const VALID_UNITS = ["kg", "g", "liter", "ml", "piece", "pack", "dozen"] as const;
const VALID_GST = [0, 5, 12, 18, 28] as const;
const VALID_STATUS = ["active", "inactive", "out_of_stock"] as const;

type VariantInput = {
  name: string;
  sku: string;
  mrp: number;
  price: number;
  stock: number;
  variant_attributes: Record<string, unknown>;
};

export async function createProduct(formData: FormData) {
  const { isSuperAdmin } = await assertPermission("products", "create");
  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const brand = String(formData.get("brand") ?? "");
  const unit = String(formData.get("unit_of_measurement") ?? "piece");
  const mrp = Number(formData.get("mrp") ?? 0);
  const sellingPrice = Number(formData.get("selling_price") ?? 0);
  const discountPercent = computeDiscountPercent(mrp, sellingPrice);
  const gstRate = Number(formData.get("gst_rate") ?? 0) as (typeof VALID_GST)[number];
  const hsnCode = String(formData.get("hsn_code") ?? "");
  const stockQty = Number(formData.get("stock_quantity") ?? 0);
  const lowStockThreshold = Number(formData.get("low_stock_threshold") ?? 10);
  const purchaseRateRaw = formData.get("purchase_rate");
  const purchaseRate = purchaseRateRaw ? Number(purchaseRateRaw) : null;
  const status = String(formData.get("status") ?? "active") as (typeof VALID_STATUS)[number];
  const sku = String(formData.get("sku") ?? "");
  const variantsRaw = String(formData.get("variants") ?? "[]");
  // P33: cascade_locked — when true (default), the product
  // participates in the manager-disable cascade (gets
  // status='inactive' when its store's manager is disabled). When
  // false, the product stays active even when the manager is
  // disabled. Only Super Admin can flip this on the form.
  const cascadeLockedRaw = formData.get("cascade_locked");
  const cascadeLocked =
    cascadeLockedRaw === null ? true : cascadeLockedRaw === "true";

  if (!name) throw new Error("Product name is required");
  if (!categoryId) throw new Error("Category is required");

  let variants: VariantInput[] = [];
  try {
    variants = JSON.parse(variantsRaw);
  } catch {
    // no variants
  }

  // B22 fix: use the current user's store instead of the first store in the DB
  const { storeId: userStoreId } = await getStoreScope();
  if (!isSuperAdmin && !userStoreId) {
    throw new Error("Your account is not assigned to a store. Contact a Super Admin.");
  }

  const productSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      name,
      description: description || null,
      category_id: categoryId || null,
      brand: brand || null,
      unit_of_measurement: unit,
      mrp,
      selling_price: sellingPrice,
      discount_percent: discountPercent,
      gst_rate: gstRate,
      hsn_code: hsnCode || null,
      stock_quantity: stockQty,
      low_stock_threshold: lowStockThreshold || null,
      purchase_rate: purchaseRate,
      status,
      sku: sku || null,
      store_id: userStoreId ?? null,
      cascade_locked: cascadeLocked,
    })
    .select("id")
    .single();

  if (productError) throw new Error(productError.message);

  // P25: best-effort audit log — does not block the action if it fails
  await logActivity({
    action: "create",
    entityType: "product",
    entityId: product.id,
    details: { name, category_id: categoryId, status },
  });

  if (variants.length > 0) {
    const variantRows = variants.map((v) => ({
      product_id: product.id,
      name: v.name,
      sku: v.sku || null,
      mrp: Number(v.mrp) || 0,
      price: v.price,
      stock: v.stock,
      variant_attributes: v.variant_attributes,
    }));

    const { error: varError } = await supabase
      .from("product_variants")
      .insert(variantRows);

    if (varError) throw new Error(varError.message);
  }

  const imagesRaw = String(formData.get("images") ?? "[]");
  let images: { image_url: string; is_primary: boolean; sort_order: number }[] = [];
  try { images = JSON.parse(imagesRaw); } catch { /* no images */ }

  if (images.length > 0) {
    const imageRows = images.map((img) => ({
      product_id: product.id,
      image_url: img.image_url,
      is_primary: img.is_primary,
      sort_order: img.sort_order,
    }));

    const { error: imgError } = await supabase
      .from("product_images")
      .insert(imageRows);

    if (imgError) throw new Error(imgError.message);
  }

  revalidatePath("/products");
  redirect("/products");
}

export async function updateProduct(id: string, formData: FormData) {
  const { isSuperAdmin } = await assertPermission("products", "edit");
  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const brand = String(formData.get("brand") ?? "");
  const unit = String(formData.get("unit_of_measurement") ?? "piece");
  const mrp = Number(formData.get("mrp") ?? 0);
  const sellingPrice = Number(formData.get("selling_price") ?? 0);
  const discountPercent = computeDiscountPercent(mrp, sellingPrice);
  const gstRate = Number(formData.get("gst_rate") ?? 0) as (typeof VALID_GST)[number];
  const hsnCode = String(formData.get("hsn_code") ?? "");
  const stockQty = Number(formData.get("stock_quantity") ?? 0);
  const lowStockThreshold = Number(formData.get("low_stock_threshold") ?? 10);
  const purchaseRateRaw = formData.get("purchase_rate");
  const purchaseRate = purchaseRateRaw ? Number(purchaseRateRaw) : null;
  const status = String(formData.get("status") ?? "active") as (typeof VALID_STATUS)[number];
  const sku = String(formData.get("sku") ?? "");
  const variantsRaw = String(formData.get("variants") ?? "[]");
  // P33: cascade_locked. Only Super Admin can flip this. Manager
  // submissions are ignored (the form field won't render for them,
  // and if it's spoofed, we keep the existing value).
  const cascadeLockedRaw = formData.get("cascade_locked");
  const cascadeLocked =
    cascadeLockedRaw === null ? null : cascadeLockedRaw === "true";

  if (!name) throw new Error("Product name is required");

  let variants: VariantInput[] = [];
  try {
    variants = JSON.parse(variantsRaw);
  } catch {
    // no variants
  }

  // P33: build the update payload. cascade_locked is only sent when
  // the caller is Super Admin AND explicitly posted a value.
  const updatePayload: Record<string, unknown> = {
    name,
    description: description || null,
    category_id: categoryId || null,
    brand: brand || null,
    unit_of_measurement: unit,
    mrp,
    selling_price: sellingPrice,
    discount_percent: discountPercent,
    gst_rate: gstRate,
    hsn_code: hsnCode || null,
    stock_quantity: stockQty,
    low_stock_threshold: lowStockThreshold || null,
    purchase_rate: purchaseRate,
    status,
    sku: sku || null,
  };
  if (isSuperAdmin && cascadeLocked !== null) {
    updatePayload.cascade_locked = cascadeLocked;
  }

  const { error: productError } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", id);

  if (productError) throw new Error(productError.message);

  const { error: variantDeleteError } = await supabase
    .from("product_variants")
    .delete()
    .eq("product_id", id);
  if (variantDeleteError) throw new Error(variantDeleteError.message);

  if (variants.length > 0) {
    const variantRows = variants.map((v) => ({
      product_id: id,
      name: v.name,
      sku: v.sku || null,
      mrp: Number(v.mrp) || 0,
      price: v.price,
      stock: v.stock,
      variant_attributes: v.variant_attributes,
    }));

    const { error: varError } = await supabase
      .from("product_variants")
      .insert(variantRows);

    if (varError) throw new Error(varError.message);
  }

  const { error: imageDeleteError } = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", id);
  if (imageDeleteError) throw new Error(imageDeleteError.message);

  const imagesRaw = String(formData.get("images") ?? "[]");
  let images: { image_url: string; is_primary: boolean; sort_order: number }[] = [];
  try { images = JSON.parse(imagesRaw); } catch { /* no images */ }

  if (images.length > 0) {
    const imageRows = images.map((img) => ({
      product_id: id,
      image_url: img.image_url,
      is_primary: img.is_primary,
      sort_order: img.sort_order,
    }));

    const { error: imgError } = await supabase
      .from("product_images")
      .insert(imageRows);

    if (imgError) throw new Error(imgError.message);
  }

  // P25: best-effort audit log — just records the list of fields the user
  // touched (no full diff for v1; a richer diff can be added later)
  const fieldsReceived = Array.from(formData.keys()).filter(
    (k) => k !== "variants" && k !== "images",
  );
  await logActivity({
    action: "update",
    entityType: "product",
    entityId: id,
    details: { fields_received: fieldsReceived },
  });

  revalidatePath("/products");
  redirect("/products");
}

export async function deleteProduct(id: string) {
  await assertPermission("products", "delete");
  const supabase = createAdminClient();

  const { error: variantDeleteError } = await supabase
    .from("product_variants")
    .delete()
    .eq("product_id", id);
  if (variantDeleteError) throw new Error(variantDeleteError.message);

  const { error: imageDeleteError } = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", id);
  if (imageDeleteError) throw new Error(imageDeleteError.message);

  // P25: best-effort audit log — capture the product name BEFORE the delete
  // so the log entry is useful for forensics
  const { data: productRow } = await supabase
    .from("products")
    .select("name")
    .eq("id", id)
    .single();
  const deletedName = productRow?.name ?? null;

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity({
    action: "delete",
    entityType: "product",
    entityId: id,
    details: { name: deletedName },
  });

  revalidatePath("/products");
}

export type ProductActivityTrailEntry = {
  orderId: string;
  orderNumber: string;
  status: string;
  placedAt: string;
  totalAmount: number;
  customerName: string | null;
  quantity: number;
  unitPrice: number;
  variantName: string | null;
  // P26: snapshot fields from order_items (survive product/variant deletion)
  productName: string | null;
  productSku: string | null;
};

export type ProductActivityTrailInventoryEntry = {
  id: string;
  variantId: string | null;
  variantName: string | null;
  quantityChange: number;
  runningBalance: number;
  reasonCode: string;
  notes: string | null;
  createdAt: string;
};

export type ProductActivityTrail = {
  orders: ProductActivityTrailEntry[];
  orderTracks: { orderId: string; status: string; notes: string | null; createdAt: string }[];
  inventoryLog: ProductActivityTrailInventoryEntry[];
  summary: {
    orderCount: number;
    totalUnitsSold: number;
    totalRevenue: number;
    inventoryEvents: number;
  };
};

export async function getProductActivityTrail(
  productId: string,
): Promise<ProductActivityTrail> {
  await assertPermission("products", "delete");

  const supabase = createAdminClient();

  const empty: ProductActivityTrail = {
    orders: [],
    orderTracks: [],
    inventoryLog: [],
    summary: { orderCount: 0, totalUnitsSold: 0, totalRevenue: 0, inventoryEvents: 0 },
  };

  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select(
      // P26: include the snapshot columns (product_name, product_sku, variant_name)
      // so the audit trail is self-describing even after the product is deleted.
      "id, order_id, quantity, unit_price, product_id, variant_id, product_name, product_sku, variant_name, orders!inner(id, order_number, status, placed_at, total_amount, user_id, profiles(full_name))",
    )
    .eq("product_id", productId)
    .order("id", { ascending: true });
  if (itemsErr) throw new Error(itemsErr.message);

  type JoinedOrder = {
    id: string;
    order_number: string;
    status: string;
    placed_at: string;
    total_amount: number;
    user_id: string;
    profiles: { full_name: string | null } | null;
  };
  type JoinedItem = {
    id: string;
    order_id: string;
    quantity: number;
    unit_price: number;
    product_id: string;
    variant_id: string | null;
    // P26 snapshots
    product_name: string | null;
    product_sku: string | null;
    variant_name: string | null;
    orders: JoinedOrder;
  };

  const joinedItems = (items ?? []) as unknown as JoinedItem[];

  if (joinedItems.length === 0) {
    return empty;
  }

  const orderIds = Array.from(new Set(joinedItems.map((i) => i.order_id)));

  const { data: tracks, error: tracksErr } = await supabase
    .from("order_tracks")
    .select("order_id, status, notes, created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  if (tracksErr) throw new Error(tracksErr.message);

  const { data: il, error: ilErr } = await supabase
    .from("inventory_log")
    .select("id, variant_id, quantity_change, running_balance, reason_code, notes, created_at, product_variants(name)")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  if (ilErr) throw new Error(ilErr.message);

  type JoinedVariant = { name: string } | null;
  type JoinedInventory = {
    id: string;
    variant_id: string | null;
    quantity_change: number;
    running_balance: number;
    reason_code: string;
    notes: string | null;
    created_at: string;
    product_variants: JoinedVariant;
  };
  const joinedIl = (il ?? []) as unknown as JoinedInventory[];

  const orders: ProductActivityTrailEntry[] = joinedItems.map((it) => ({
    orderId: it.orders.id,
    orderNumber: it.orders.order_number,
    status: it.orders.status,
    placedAt: it.orders.placed_at,
    totalAmount: Number(it.orders.total_amount),
    customerName: it.orders.profiles?.full_name ?? null,
    quantity: Number(it.quantity),
    unitPrice: Number(it.unit_price),
    variantName: it.variant_name, // P26: snapshot, not null anymore
    // P26: snapshot fields
    productName: it.product_name,
    productSku: it.product_sku,
  }));

  const orderTracks: ProductActivityTrail["orderTracks"] = (tracks ?? []).map(
    (t) => ({
      orderId: t.order_id as string,
      status: t.status as string,
      notes: (t.notes as string | null) ?? null,
      createdAt: t.created_at as string,
    }),
  );

  const inventoryLog: ProductActivityTrailInventoryEntry[] = joinedIl.map(
    (row) => ({
      id: row.id,
      variantId: row.variant_id,
      variantName: row.product_variants?.name ?? null,
      quantityChange: Number(row.quantity_change),
      runningBalance: Number(row.running_balance),
      reasonCode: row.reason_code,
      notes: row.notes,
      createdAt: row.created_at,
    }),
  );

  const orderCount = new Set(orders.map((o) => o.orderId)).size;
  const totalUnitsSold = orders.reduce((sum, o) => sum + o.quantity, 0);
  const totalRevenue = orders.reduce((sum, o) => sum + o.quantity * o.unitPrice, 0);

  return {
    orders,
    orderTracks,
    inventoryLog,
    summary: {
      orderCount,
      totalUnitsSold,
      totalRevenue,
      inventoryEvents: inventoryLog.length,
    },
  };
}

type ImportRow = Record<string, string>;

export async function bulkImportProducts(rows: ImportRow[]) {
  const { isSuperAdmin } = await assertPermission("products", "create");
  const supabase = createAdminClient();

  // B22 fix: use the current user's store instead of the first store in the DB
  const { storeId: userStoreId } = await getStoreScope();
  if (!isSuperAdmin && !userStoreId) {
    throw new Error("Your account is not assigned to a store. Contact a Super Admin.");
  }

  // P23: only import into categories the current user can see. Super Admin
  // sees all; store-scoped users see assigned + all descendants. A CSV row
  // whose category_name is not in the visible list falls through to
  // category_id: null (preserved behavior on line 452).
  const { getCategoriesForStore } = await import("@/lib/categories");
  const visibleCategories = await getCategoriesForStore(userStoreId ?? null);
  const categoryMap = new Map(
    visibleCategories.map((c) => [c.name.toLowerCase(), c.id]),
  );

  let imported = 0;
  const errors: { row: number; field: string; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;

    try {
      const name = r.name?.trim();
      if (!name) {
        errors.push({ row: rowNum, field: "name", message: "Product name is required" });
        continue;
      }

      const categoryName = r.category_name?.trim();
      const categoryId = categoryName ? categoryMap.get(categoryName.toLowerCase()) ?? null : null;

      const sellingPrice = Number(r.selling_price ?? 0);
      if (!sellingPrice && sellingPrice !== 0) {
        errors.push({ row: rowNum, field: "selling_price", message: "Invalid selling price" });
        continue;
      }

      const mrp = Number(r.mrp ?? 0) || 0;
      // Use CSV-provided discount_percent if present, otherwise auto-compute
      // from MRP and selling_price. CSV users can still override per row.
      const hasExplicitDiscount = r.discount_percent != null && r.discount_percent !== "";
      const discountPercent = hasExplicitDiscount
        ? Number(r.discount_percent) || 0
        : computeDiscountPercent(mrp, sellingPrice);
      const gstRate = Number(r.gst_rate ?? 0) || 0;
      const stockQty = Number(r.stock_quantity ?? 0) || 0;
      const lowStockThreshold = r.low_stock_threshold ? Number(r.low_stock_threshold) || 0 : null;
      const status = r.status?.trim() || "active";

      const { error: productError } = await supabase.from("products").insert({
        name,
        description: r.description?.trim() || null,
        category_id: categoryId,
        brand: r.brand?.trim() || null,
        unit_of_measurement: r.unit_of_measurement?.trim() || "piece",
        mrp,
        selling_price: sellingPrice,
        discount_percent: discountPercent,
        gst_rate: gstRate,
        hsn_code: r.hsn_code?.trim() || null,
        stock_quantity: stockQty,
        low_stock_threshold: lowStockThreshold,
        status,
        sku: r.sku?.trim() || null,
        store_id: userStoreId ?? null,
      });

      if (productError) {
        errors.push({ row: rowNum, field: "db", message: productError.message });
        continue;
      }

      imported++;
    } catch (e) {
      errors.push({ row: rowNum, field: "unknown", message: (e as Error).message });
    }
  }

  // P25: best-effort audit log — single summary row for the import session
  await logActivity({
    action: "bulk_import",
    entityType: "product",
    entityId: null,
    details: { imported, errors: errors.length },
  });

  revalidatePath("/products");
  return { imported, errors };
}

/**
 * P49: Public query for the most recent N products in a store (or all
 * products when `storeId` is null/undefined). Reuses the same query
 * shape the /products list page uses internally.
 *
 * Currently used by `getStoreRelations` in the stores module to populate
 * the per-store drill-down in the store view modal.
 *
 * Return type: the `categories` field is included via the
 * `select("*, categories(name)")` join. We expose it as the base
 * `Product` type (which doesn't have `categories`) plus an optional
 * `categories` field. Callers that don't need the joined name can
 * just ignore it; callers that do can use the `categories` field.
 */
export type ProductWithCategory = Product & { categories: { name: string } | null };
export async function getProducts(
  storeId?: string | null,
): Promise<ProductWithCategory[]> {
  const supabase = createAdminClient();
  let productQuery = supabase
    .from("products")
    .select("*, categories(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (storeId) productQuery = productQuery.eq("store_id", storeId);
  const { data } = await productQuery;
  return (data ?? []) as unknown as ProductWithCategory[];
}
