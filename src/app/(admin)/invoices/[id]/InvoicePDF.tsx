import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import type { InvoiceDetail, InvoiceStore } from "../actions";

Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica", fontWeight: "normal" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20, borderBottomWidth: 2, borderBottomColor: "#222", paddingBottom: 10 },
  storeName: { fontSize: 18, fontWeight: "bold" },
  storeInfo: { fontSize: 9, marginTop: 2, color: "#555" },
  invoiceTitle: { fontSize: 16, fontWeight: "bold", textAlign: "right" },
  invoiceSubtitle: { fontSize: 9, color: "#555", textAlign: "right" },

  section: { flexDirection: "row", marginBottom: 15 },
  halfBox: { width: "50%" },
  label: { fontSize: 8, color: "#888", marginBottom: 2 },
  value: { fontSize: 10, marginBottom: 4 },

  table: { width: "100%", borderWidth: 1, borderColor: "#ccc", marginBottom: 15 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f0f0f0", borderBottomWidth: 1, borderBottomColor: "#ccc" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eee" },
  cellNo: { width: "4%", padding: 4, textAlign: "center" },
  cellProduct: { width: "22%", padding: 4 },
  cellHsn: { width: "8%", padding: 4, textAlign: "center" },
  cellQty: { width: "7%", padding: 4, textAlign: "center" },
  cellRate: { width: "9%", padding: 4, textAlign: "right" },
  cellTaxable: { width: "12%", padding: 4, textAlign: "right" },
  cellCgst: { width: "12%", padding: 4, textAlign: "right" },
  cellSgst: { width: "12%", padding: 4, textAlign: "right" },
  cellTotal: { width: "14%", padding: 4, textAlign: "right" },
  headerText: { fontSize: 9, fontWeight: "bold" },

  totalsSection: { marginLeft: "auto", width: "45%", marginBottom: 20 },
  slabBlock: { marginBottom: 6 },
  slabTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 2 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: "#eee" },
  totalLabel: { fontSize: 9 },
  totalValue: { fontSize: 9, textAlign: "right" },
  grandTotal: { fontWeight: "bold", fontSize: 12, paddingTop: 5 },
  separator: { borderTopWidth: 1, borderTopColor: "#222", marginVertical: 4 },

  footer: { marginTop: 20, borderTopWidth: 1, borderTopColor: "#ccc", paddingTop: 10, fontSize: 8, color: "#666", textAlign: "center" },
});

function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const convert = (num: number): string => {
    if (num < 20) return a[num];
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? " " + a[num % 10] : "");
    if (num < 1000) return a[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convert(num % 100) : "");
    if (num < 100000) return convert(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + convert(num % 1000) : "");
    return convert(Math.floor(num / 100000)) + " Lakh" + (num % 100000 ? " " + convert(num % 100000) : "");
  };

  const [whole, frac] = n.toFixed(2).split(".");
  const w = convert(parseInt(whole));
  const f = parseInt(frac);
  return w + " Rupees" + (f > 0 ? " and " + convert(f) + " Paise" : "") + " Only";
}

type GstSlab = {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
};

function computeGstSlabs(items: { gst_rate: number; gst_amount: number; total_price: number }[]): GstSlab[] {
  const map = new Map<number, GstSlab>();
  for (const item of items) {
    const rate = item.gst_rate;
    if (!map.has(rate)) {
      map.set(rate, { rate, taxableAmount: 0, cgst: 0, sgst: 0 });
    }
    const slab = map.get(rate)!;
    slab.taxableAmount += Number(item.total_price) - Number(item.gst_amount);
    slab.cgst += Number(item.gst_amount) / 2;
    slab.sgst += Number(item.gst_amount) / 2;
  }
  return Array.from(map.values()).sort((a, b) => b.rate - a.rate);
}

function resolveGstin(order: InvoiceDetail["orders"], store: InvoiceStore | null): string | null {
  return order?.gstin ?? store?.gstin ?? null;
}

function buildStoreAddressLines(store: InvoiceStore | null): string[] {
  if (!store) return [];
  const lines: string[] = [];
  if (store.address) lines.push(store.address);
  const cityLine = [store.city, store.state, store.pincode].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (store.phone) lines.push(`Phone: ${store.phone}`);
  if (store.email) lines.push(`Email: ${store.email}`);
  return lines;
}

export default function InvoicePDF({ invoice }: { invoice: InvoiceDetail }) {
  const order = invoice.orders;
  const addr = order?.addresses;
  const items = order?.order_items ?? [];
  const store = invoice.store;
  const gstin = resolveGstin(order, store);
  const storeAddressLines = buildStoreAddressLines(store);
  const storeName = store?.name ?? "—";
  const legalName = store?.legal_name ?? storeName;
  const slabs = computeGstSlabs(items);
  const totalCgst = slabs.reduce((s, slab) => s + slab.cgst, 0);
  const totalSgst = slabs.reduce((s, slab) => s + slab.sgst, 0);
  const totalTaxable = slabs.reduce((s, slab) => s + slab.taxableAmount, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.storeName}>{legalName}</Text>
            {storeAddressLines.map((line, idx) => (
              <Text key={idx} style={styles.storeInfo}>{line}</Text>
            ))}
            {gstin ? (
              <Text style={styles.storeInfo}>GSTIN: {gstin}</Text>
            ) : (
              <Text style={styles.storeInfo}>GSTIN: —</Text>
            )}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>TAX INVOICE</Text>
            <Text style={styles.invoiceSubtitle}>#{invoice.invoice_number}</Text>
            <Text style={styles.invoiceSubtitle}>Date: {new Date(invoice.invoice_date).toLocaleDateString("en-IN")}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.halfBox}>
            <Text style={styles.label}>BILL TO</Text>
            <Text style={styles.value}>{addr?.full_name ?? "—"}</Text>
            <Text style={styles.value}>{addr?.phone ?? "—"}</Text>
            <Text style={styles.value}>
              {addr ? `${addr.address_line1}, ${addr.city}, ${addr.state} — ${addr.pincode}` : "—"}
            </Text>
            <Text style={styles.value}>GSTIN: {order?.gstin ?? "—"}</Text>
          </View>
          <View style={styles.halfBox}>
            <Text style={styles.label}>ORDER DETAILS</Text>
            <Text style={styles.value}>Order #: {order?.order_number ?? "—"}</Text>
            <Text style={styles.value}>Order Date: {order?.placed_at ? new Date(order.placed_at).toLocaleDateString("en-IN") : "—"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.cellNo}><Text style={styles.headerText}>#</Text></Text>
            <Text style={styles.cellProduct}><Text style={styles.headerText}>Product</Text></Text>
            <Text style={styles.cellHsn}><Text style={styles.headerText}>HSN</Text></Text>
            <Text style={styles.cellQty}><Text style={styles.headerText}>Qty</Text></Text>
            <Text style={styles.cellRate}><Text style={styles.headerText}>Rate</Text></Text>
            <Text style={styles.cellTaxable}><Text style={styles.headerText}>Taxable</Text></Text>
            <Text style={styles.cellCgst}><Text style={styles.headerText}>CGST</Text></Text>
            <Text style={styles.cellSgst}><Text style={styles.headerText}>SGST</Text></Text>
            <Text style={styles.cellTotal}><Text style={styles.headerText}>Total</Text></Text>
          </View>
          {items.map((item, i) => {
            const taxable = Number(item.total_price) - Number(item.gst_amount);
            const cgst = Number(item.gst_amount) / 2;
            const sgst = Number(item.gst_amount) / 2;
            const variant = item.variant_name ?? item.product_variants?.name;
            const productLabel = variant
              ? `${item.product_name ?? item.products?.name ?? "Deleted Product"} — ${variant}`
              : item.product_name ?? item.products?.name ?? "Deleted Product";

            return (
              <View key={item.id} style={styles.tableRow}>
                <Text style={styles.cellNo}>{i + 1}</Text>
                <Text style={styles.cellProduct}>{productLabel}</Text>
                <Text style={styles.cellHsn}>{item.product_hsn_code ?? item.products?.hsn_code ?? "—"}</Text>
                <Text style={styles.cellQty}>{item.quantity}</Text>
                <Text style={styles.cellRate}>₹{Number(item.unit_price).toFixed(2)}</Text>
                <Text style={styles.cellTaxable}>₹{taxable.toFixed(2)}</Text>
                <Text style={styles.cellCgst}>₹{cgst.toFixed(2)}</Text>
                <Text style={styles.cellSgst}>₹{sgst.toFixed(2)}</Text>
                <Text style={styles.cellTotal}>₹{Number(item.total_price).toFixed(2)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totalsSection}>
          {slabs.map((slab) => (
            <View key={slab.rate} style={styles.slabBlock}>
              <Text style={styles.slabTitle}>Items at {slab.rate}% GST</Text>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>  Taxable</Text>
                <Text style={styles.totalValue}>₹{slab.taxableAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>  CGST @ {slab.rate / 2}%</Text>
                <Text style={styles.totalValue}>₹{slab.cgst.toFixed(2)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>  SGST @ {slab.rate / 2}%</Text>
                <Text style={styles.totalValue}>₹{slab.sgst.toFixed(2)}</Text>
              </View>
            </View>
          ))}

          <View style={styles.separator} />

          <View style={styles.totalRow}>
            <Text style={{ fontSize: 9, fontWeight: "bold" }}>Total Taxable</Text>
            <Text style={{ fontSize: 9, fontWeight: "bold", textAlign: "right" }}>₹{totalTaxable.toFixed(2)}</Text>
          </View>
          {totalCgst > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total CGST</Text>
              <Text style={styles.totalValue}>₹{totalCgst.toFixed(2)}</Text>
            </View>
          )}
          {totalSgst > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total SGST</Text>
              <Text style={styles.totalValue}>₹{totalSgst.toFixed(2)}</Text>
            </View>
          )}
          <View style={{ ...styles.totalRow, ...styles.grandTotal }}>
            <Text>Total</Text>
            <Text>₹{Number(invoice.total_amount).toFixed(2)}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 9, marginBottom: 20 }}>
          Amount in words: {numberToWords(Number(invoice.total_amount))}
        </Text>

        <Text style={{ fontSize: 8, color: "#888" }}>
          This is a computer-generated invoice and does not require a physical signature.
        </Text>

        <Text style={styles.footer}>
          {legalName}{gstin ? ` | GSTIN: ${gstin}` : ""} | Invoice #{invoice.invoice_number}
        </Text>
      </Page>
    </Document>
  );
}
