"use client";

import { useState, useRef } from "react";
import { Icon } from "@iconify/react";
import { bulkImportProducts } from "./actions";

type ImportResult = {
  imported: number;
  errors: { row: number; field: string; message: string }[];
};

const SAMPLE_CSV = `name,category_name,subcategory_name,brand,description,unit_of_measurement,mrp,selling_price,discount_percent,gst_rate,hsn_code,stock_quantity,low_stock_threshold,status,sku
Fresh Apples,Fruits,,Organic Farms,Fresh red apples,kg,120,100,16.67,5,0801,50,10,active,APL-001
Whole Wheat Bread,Bakery,,FreshBake,500g whole wheat loaf,piece,45,35,22.22,5,1905,20,5,active,BRD-001`;

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

export default function BulkImportModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-products.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) throw new Error("CSV is empty or has no data rows");
      const res = await bulkImportProducts(rows);
      setResult(res);
    } catch (e) {
      setResult({
        imported: 0,
        errors: [{ row: 0, field: "file", message: (e as Error).message }],
      });
    } finally {
      setImporting(false);
    }
  };

  const hasErrors = result && result.errors.length > 0;

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: 1050 }}
    >
      <div className="bg-white rounded-3 shadow" style={{ width: 540, maxHeight: "80vh", overflowY: "auto" }}>
        <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom">
          <h6 className="fw-bold mb-0">Import Products (CSV)</h6>
          <button className="btn-close" onClick={onClose} />
        </div>
        <div className="p-4">
          {result ? (
            <div>
              <div className={`alert ${hasErrors ? "alert-warning" : "alert-success"} py-2`}>
                <strong>{result.imported}</strong> product{result.imported !== 1 ? "s" : ""} imported successfully.
                {hasErrors && <> <strong>{result.errors.length}</strong> error{result.errors.length !== 1 ? "s" : ""}.</>}
              </div>
              {hasErrors && (
                <div className="mb-3">
                  <h6 className="small fw-semibold text-danger mb-2">Errors</h6>
                  <ul className="small mb-0" style={{ maxHeight: 200, overflowY: "auto" }}>
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.row} ({e.field}): {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="d-flex justify-content-end">
                <button className="btn btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <label className="form-label small fw-medium">Select CSV file</label>
                <input
                  ref={fileRef}
                  type="file"
                  className="form-control"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="d-flex gap-2 mb-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={handleDownloadSample}
                >
                  <Icon icon="ri:download-line" className="me-1" />
                  Download Sample Format
                </button>
              </div>

              <div className="alert alert-info small py-2 mb-0">
                CSV must include a header row. Required columns: <strong>name</strong>, <strong>category_name</strong>, <strong>selling_price</strong>.
                Optional: subcategory_name, description, brand, unit_of_measurement, mrp, discount_percent, gst_rate, hsn_code, stock_quantity, low_stock_threshold, status, sku.
              </div>

              <div className="d-flex justify-content-end gap-2 mt-3 pt-3 border-top">
                <button className="btn btn-outline-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={!file || importing}
                >
                  {importing ? (
                    <>
                      <Icon icon="ri:loader-4-line" className="spinner me-1" />
                      Importing...
                    </>
                  ) : (
                    "Import"
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
