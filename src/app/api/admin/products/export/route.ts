import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission, PermissionError } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";

// CSV columns. MUST match the header in BulkImportModal.tsx (SAMPLE_CSV) so
// that users can round-trip: export → edit → re-import without manual remapping.
const COLUMNS = [
  "name",
  "category_name",
  "brand",
  "description",
  "unit_of_measurement",
  "mrp",
  "selling_price",
  "discount_percent",
  "gst_rate",
  "hsn_code",
  "stock_quantity",
  "low_stock_threshold",
  "status",
  "sku",
] as const;

// Safety cap to avoid OOM on very large stores.
const MAX_EXPORT_ROWS = 10_000;

// RFC 4180: wrap in double quotes if the value contains a comma, double-quote,
// or newline; double any internal double-quotes.
function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCSV(rows: Record<string, unknown>[]): string {
  const header = COLUMNS.join(",");
  const body = rows.map((r) => COLUMNS.map((c) => csvEscape(r[c])).join(","));
  return [header, ...body].join("\n");
}

type ProductRow = {
  name: string;
  description: string | null;
  sku: string | null;
  brand: string | null;
  unit_of_measurement: string;
  mrp: number;
  selling_price: number;
  discount_percent: number;
  gst_rate: number;
  hsn_code: string | null;
  stock_quantity: number;
  low_stock_threshold: number | null;
  status: string;
  categories: { name: string } | { name: string }[] | null;
};

export async function GET() {
  await assertPermission("products", "view");
  const { storeId } = await getStoreScope();

  const supabase = createAdminClient();
  let query = supabase
    .from("products")
    .select("name, description, sku, brand, unit_of_measurement, mrp, selling_price, discount_percent, gst_rate, hsn_code, stock_quantity, low_stock_threshold, status, categories(name)")
    .order("name", { ascending: true })
    .limit(MAX_EXPORT_ROWS);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ((data ?? []) as unknown as ProductRow[]).map((p) => {
    const cat = Array.isArray(p.categories) ? p.categories[0] : p.categories;
    return {
      name: p.name,
      category_name: cat?.name ?? "",
      brand: p.brand,
      description: p.description,
      unit_of_measurement: p.unit_of_measurement,
      mrp: p.mrp,
      selling_price: p.selling_price,
      discount_percent: p.discount_percent,
      gst_rate: p.gst_rate,
      hsn_code: p.hsn_code,
      stock_quantity: p.stock_quantity,
      low_stock_threshold: p.low_stock_threshold,
      status: p.status,
      sku: p.sku,
    };
  });

  const csv = toCSV(rows);
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

// Re-export so callers can import { PermissionError } from this module
// if they need to type-narrow the rejection.
export { PermissionError };
