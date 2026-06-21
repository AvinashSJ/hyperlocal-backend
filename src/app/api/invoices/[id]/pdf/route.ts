import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { PermissionError, assertPermission } from "@/lib/require-permission";
import { getInvoice } from "@/app/(admin)/invoices/actions";
import { getStoreScope } from "@/lib/store-scope";
import InvoicePDF from "@/app/(admin)/invoices/[id]/InvoicePDF";

/**
 * P39: GET /api/invoices/:id/pdf
 *
 * Server-side PDF rendering for an invoice. The PDF uses the
 * real store name / address / primary GSTIN (enriched by
 * getInvoice), and the order's snapshot columns for product
 * names (P26).
 *
 * Auth: requires `invoices:view`. The download URL is
 * stable and can be embedded in <a href> tags (which the
 * Invoices list and the order detail use).
 *
 * Store-scoping: Manager / Staff are restricted to invoices
 * whose order belongs to their store. The check uses
 * getStoreScope() to read the caller's store_id, then
 * compares against the invoice's order.store_id. The PDF is
 * not generated if the caller's store doesn't match (we
 * return 404 to avoid leaking that the invoice exists).
 *
 * Content-Disposition: `attachment; filename="invoice-<N>.pdf"`
 * so the browser saves the file with a sensible name.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    await assertPermission("invoices", "view");
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json(
        { error: "forbidden", message: err.message },
        { status: 403 },
      );
    }
    throw err;
  }

  // Fetch the invoice (this re-checks the permission; that's
  // intentional defense in depth — getInvoice is also called
  // from the page).
  const invoice = await getInvoice(id);

  // Store-scope guard. Super Admin bypasses this (getStoreScope
  // returns isStoreScoped: false for them).
  const { storeId, isStoreScoped } = await getStoreScope();
  const orderStoreId = invoice.orders?.store_id ?? null;
  if (isStoreScoped && storeId && orderStoreId && orderStoreId !== storeId) {
    return NextResponse.json(
      { error: "not_found", message: "Invoice not found" },
      { status: 404 },
    );
  }

  // renderToBuffer requires a React element whose type narrows to
  // a PDF Document. InvoicePDF returns a <Document> so the
  // element is structurally compatible — we cast through unknown
  // because @react-pdf/renderer's type for the element is tighter
  // than React.createElement infers for our component.
  const element = createElement(InvoicePDF, {
    invoice,
  }) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoice.invoice_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
