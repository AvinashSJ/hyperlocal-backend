"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

const VALID_UNITS = ["kg", "g", "liter", "ml", "piece", "pack", "dozen"] as const;
const VALID_GST = [0, 5, 12, 18, 28] as const;
const VALID_STATUS = ["active", "inactive", "out_of_stock"] as const;

type VariantInput = {
  name: string;
  sku: string;
  price: number;
  stock: number;
  variant_attributes: Record<string, unknown>;
};

export async function createProduct(formData: FormData) {
  await assertPermission("products", "create");
  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const brand = String(formData.get("brand") ?? "");
  const unit = String(formData.get("unit_of_measurement") ?? "piece");
  const mrp = Number(formData.get("mrp") ?? 0);
  const sellingPrice = Number(formData.get("selling_price") ?? 0);
  const discountPercent = Number(formData.get("discount_percent") ?? 0);
  const gstRate = Number(formData.get("gst_rate") ?? 0) as (typeof VALID_GST)[number];
  const hsnCode = String(formData.get("hsn_code") ?? "");
  const stockQty = Number(formData.get("stock_quantity") ?? 0);
  const lowStockThreshold = Number(formData.get("low_stock_threshold") ?? 10);
  const status = String(formData.get("status") ?? "active") as (typeof VALID_STATUS)[number];
  const sku = String(formData.get("sku") ?? "");
  const variantsRaw = String(formData.get("variants") ?? "[]");

  if (!name) throw new Error("Product name is required");
  if (!categoryId) throw new Error("Category is required");

  let variants: VariantInput[] = [];
  try {
    variants = JSON.parse(variantsRaw);
  } catch {
    // no variants
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .limit(1)
    .single();

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
      status,
      sku: sku || null,
      store_id: store?.id ?? null,
    })
    .select("id")
    .single();

  if (productError) throw new Error(productError.message);

  if (variants.length > 0) {
    const variantRows = variants.map((v) => ({
      product_id: product.id,
      name: v.name,
      sku: v.sku || null,
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
  await assertPermission("products", "edit");
  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const brand = String(formData.get("brand") ?? "");
  const unit = String(formData.get("unit_of_measurement") ?? "piece");
  const mrp = Number(formData.get("mrp") ?? 0);
  const sellingPrice = Number(formData.get("selling_price") ?? 0);
  const discountPercent = Number(formData.get("discount_percent") ?? 0);
  const gstRate = Number(formData.get("gst_rate") ?? 0) as (typeof VALID_GST)[number];
  const hsnCode = String(formData.get("hsn_code") ?? "");
  const stockQty = Number(formData.get("stock_quantity") ?? 0);
  const lowStockThreshold = Number(formData.get("low_stock_threshold") ?? 10);
  const status = String(formData.get("status") ?? "active") as (typeof VALID_STATUS)[number];
  const sku = String(formData.get("sku") ?? "");
  const variantsRaw = String(formData.get("variants") ?? "[]");

  if (!name) throw new Error("Product name is required");

  let variants: VariantInput[] = [];
  try {
    variants = JSON.parse(variantsRaw);
  } catch {
    // no variants
  }

  const { error: productError } = await supabase
    .from("products")
    .update({
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
      status,
      sku: sku || null,
    })
    .eq("id", id);

  if (productError) throw new Error(productError.message);

  await supabase.from("product_variants").delete().eq("product_id", id);

  if (variants.length > 0) {
    const variantRows = variants.map((v) => ({
      product_id: id,
      name: v.name,
      sku: v.sku || null,
      price: v.price,
      stock: v.stock,
      variant_attributes: v.variant_attributes,
    }));

    const { error: varError } = await supabase
      .from("product_variants")
      .insert(variantRows);

    if (varError) throw new Error(varError.message);
  }

  await supabase.from("product_images").delete().eq("product_id", id);

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

  revalidatePath("/products");
  redirect("/products");
}

export async function deleteProduct(id: string) {
  await assertPermission("products", "delete");
  const supabase = createAdminClient();

  await supabase.from("product_variants").delete().eq("product_id", id);
  await supabase.from("product_images").delete().eq("product_id", id);

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/products");
}

type ImportRow = Record<string, string>;

export async function bulkImportProducts(rows: ImportRow[]) {
  await assertPermission("products", "create");
  const supabase = createAdminClient();

  const { data: allCategories } = await supabase
    .from("categories")
    .select("id, name");
  const categoryMap = new Map(
    (allCategories ?? []).map((c) => [c.name.toLowerCase(), c.id]),
  );

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .limit(1)
    .single();

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
      const discountPercent = Number(r.discount_percent ?? 0) || 0;
      const gstRate = Number(r.gst_rate ?? 0) || 0;
      const stockQty = Number(r.stock_quantity ?? 0) || 0;
      const lowStockThreshold = r.low_stock_threshold ? Number(r.low_stock_threshold) || 0 : null;
      const status = r.status?.trim() || "active";

      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const { error: productError } = await supabase.from("products").insert({
        name,
        slug,
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
        store_id: store?.id ?? null,
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

  revalidatePath("/products");
  return { imported, errors };
}
