"use client";

import { useState, useRef, useCallback } from "react";
import { Icon } from "@iconify/react";
import { bulkImportProducts } from "./actions";

type ImportError = {
  row: number;
  field: string;
  message: string;
};

type ImportResult = {
  imported: number;
  errors: ImportError[];
};

type Phase = "idle" | "importing" | "done";

const BATCH_SIZE = 50;

const SAMPLE_CSV = `name,category_name,subcategory_name,brand,description,unit_of_measurement,purchase_rate,mrp,selling_price,discount_percent,gst_rate,hsn_code,stock_quantity,low_stock_threshold,status,sku
Fresh Apples,Fruits,,Organic Farms,Fresh red apples,kg,80,120,100,16.67,5,0801,50,10,active,APL-001
Whole Wheat Bread,Bakery,,FreshBake,500g whole wheat loaf,piece,20,45,35,22.22,5,1905,20,5,active,BRD-001`;

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

function downloadCSV(filename: string, columns: string[], rows: Record<string, unknown>[]) {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(",");
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(","));
  const csv = [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkImportModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [imported, setImported] = useState(0);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
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

  const handleDownloadReport = useCallback(() => {
    if (csvRows.length === 0) return;
    const errorByRow = new Map(errors.map((e) => [e.row, e.message]));
    const columns = [...Object.keys(csvRows[0]), "status", "error"];
    const body = csvRows.map((r, i) => ({
      ...r,
      status: errorByRow.has(i + 2) ? "error" : "success",
      error: errorByRow.get(i + 2) ?? "",
    }));
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(`import-report-${date}.csv`, columns, body);
  }, [csvRows, errors]);

  const handleImport = async () => {
    if (!file) return;
    setPhase("importing");
    setProgress({ processed: 0, total: 0 });
    setImported(0);
    setErrors([]);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) throw new Error("CSV is empty or has no data rows");

      setCsvRows(rows);
      const total = rows.length;
      setProgress({ processed: 0, total });

      let processed = 0;
      let totalImported = 0;
      const allErrors: ImportError[] = [];

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        try {
          const res: ImportResult = await bulkImportProducts(batch);
          totalImported += res.imported;
          allErrors.push(...res.errors);
        } catch (e) {
          allErrors.push(...batch.map((_, j) => ({
            row: i + j + 2,
            field: "batch",
            message: (e as Error).message,
          })));
        }

        processed = Math.min(i + BATCH_SIZE, total);
        setProgress({ processed, total });
        setImported(totalImported);
        setErrors([...allErrors]);

        if (i + BATCH_SIZE < rows.length) {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    } catch (e) {
      setErrors([{
        row: 0,
        field: "file",
        message: (e as Error).message,
      }]);
    }

    setPhase("done");
  };

  const hasErrors = errors.length > 0;
  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: 1050 }}
    >
      <div className="bg-white rounded-3 shadow" style={{ width: 560, maxHeight: "80vh", overflowY: "auto" }}>
        <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom">
          <h6 className="fw-bold mb-0">Import Products (CSV)</h6>
          {phase !== "importing" && <button className="btn-close" onClick={onClose} />}
        </div>
        <div className="p-4">
          {phase === "idle" && (
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
                Optional: subcategory_name, description, brand, unit_of_measurement, purchase_rate, mrp, discount_percent, gst_rate, hsn_code, stock_quantity, low_stock_threshold, status, sku.
              </div>

              <div className="d-flex justify-content-end gap-2 mt-3 pt-3 border-top">
                <button className="btn btn-outline-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={!file}
                >
                  <Icon icon="ri:upload-2-line" className="me-1" />
                  Import
                </button>
              </div>
            </>
          )}

          {phase === "importing" && (
            <div>
              <div className="d-flex justify-content-between mb-1">
                <small className="fw-medium">Importing products...</small>
                <small className="text-muted">{progress.processed}/{progress.total}</small>
              </div>
              <div className="progress mb-3" style={{ height: 22 }}>
                <div
                  className="progress-bar progress-bar-striped progress-bar-animated"
                  role="progressbar"
                  style={{ width: `${pct}%` }}
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  {pct}%
                </div>
              </div>
              <div className="d-flex gap-4">
                <small className="text-success fw-medium">
                  <Icon icon="ri:check-line" className="me-1" />
                  Imported: {imported}
                </small>
                {hasErrors && (
                  <small className="text-danger fw-medium">
                    <Icon icon="ri:error-warning-line" className="me-1" />
                    Errors: {errors.length}
                  </small>
                )}
              </div>
            </div>
          )}

          {phase === "done" && (
            <div>
              <div className={`alert ${hasErrors ? "alert-warning" : "alert-success"} py-2`}>
                <Icon icon={hasErrors ? "ri:alert-line" : "ri:check-double-line"} className="me-1" />
                <strong>{imported}</strong> product{imported !== 1 ? "s" : ""} imported successfully.
                {hasErrors && <> <strong>{errors.length}</strong> error{errors.length !== 1 ? "s" : ""}.</>}
              </div>

              {hasErrors && (
                <div className="mb-3">
                  <h6 className="small fw-semibold text-danger mb-2">
                    <Icon icon="ri:error-warning-line" className="me-1" />
                    Errors
                  </h6>
                  <div className="border rounded p-2" style={{ maxHeight: 220, overflowY: "auto" }}>
                    <table className="table table-sm table-borderless mb-0">
                      <tbody>
                        {errors.map((e, i) => (
                          <tr key={i}>
                            <td className="text-muted" style={{ width: 60 }}>Row {e.row}</td>
                            <td><span className="badge bg-secondary me-1">{e.field}</span>{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                <button
                  className="btn btn-outline-success btn-sm"
                  onClick={handleDownloadReport}
                >
                  <Icon icon="ri:download-2-line" className="me-1" />
                  Download Report
                </button>
                <button className="btn btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
