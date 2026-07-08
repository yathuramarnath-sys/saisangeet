import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { api } from "../../lib/api";
import {
  dayEndSeed, itemSalesSeed, gstSeed, paymentSeed, discountVoidSeed, staffSalesSeed,
  categorySalesSeed
} from "./reports.seed";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n)     { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function pct(a, b)  { return b ? ((a / b) * 100).toFixed(1) + "%" : "0%"; }

// Strip JSX elements (badges, <strong> etc.) down to plain text for non-HTML exports.
function plainCell(c) {
  if (c == null) return "";
  if (typeof c === "object" && c.props) return plainCell(c.props.children);
  if (Array.isArray(c)) return c.map(plainCell).join("");
  return String(c);
}
function plainRows(rows) { return rows.map(r => r.map(plainCell)); }

function downloadCSV(filename, headers, rows) {
  const plain = plainRows(rows);
  const lines = [headers.join(","), ...plain.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))];
  const blob  = new Blob([lines.join("\n")], { type: "text/csv" });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href = url; a.download = filename + ".csv"; a.click();
  URL.revokeObjectURL(url);
}

function downloadExcel(filename, headers, rows) {
  const plain = plainRows(rows);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...plain]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, filename + ".xlsx");
}

function downloadPDF(filename, title, headers, rows) {
  const plain = plainRows(rows);
  const doc = new jsPDF({ orientation: headers.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title || filename, 14, 16);
  autoTable(doc, {
    head: [headers],
    body: plain,
    startY: 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [26, 122, 58] },
  });
  doc.save(filename + ".pdf");
}

function printReport() { window.print(); }

const PAYMENT_COLORS = {
  Cash: "#4CAF50", UPI: "#2196F3", Card: "#9C27B0",
  Swiggy: "#FF5722", Zomato: "#F44336"
};

// ── Shared UI ────────────────────────────────────────────────────────────────
function SectionHead({ title, eyebrow }) {
  return (
    <div className="rpt-section-head">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h3>{title}</h3>
    </div>
  );
}

function KpiCard({ label, value, sub, dark }) {
  return (
    <div className={`rpt-kpi${dark ? " rpt-kpi-hi" : ""}`}>
      <span className="rpt-kpi-label">{label}</span>
      <strong className="rpt-kpi-value">{value}</strong>
      {sub && <span className="rpt-kpi-sub">{sub}</span>}
    </div>
  );
}

function BarRow({ label, value, total, amount, color }) {
  const w = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rpt-bar-row">
      <span className="rpt-bar-label">{label}</span>
      <div className="rpt-bar-track">
        <div className="rpt-bar-fill" style={{ width: `${w}%`, background: color || "#1a7a3a" }} />
      </div>
      <span className="rpt-bar-count">{value}</span>
      <span className="rpt-bar-amt">{fmt(amount)}</span>
    </div>
  );
}

function ExportBar({ onCSV, onPDF, onExcel }) {
  return (
    <div className="rpt-export-bar">
      <button className="rpt-export-btn" onClick={onCSV}>⬇ CSV</button>
      <button className="rpt-export-btn" onClick={onPDF}>⬇ PDF</button>
      <button className="rpt-export-btn" onClick={onExcel}>⬇ Excel</button>
    </div>
  );
}

// ── Table helper ─────────────────────────────────────────────────────────────
function RptTable({ cols, rows, foot }) {
  return (
    <div className="rpt-table-wrap">
      <table className="rpt-tbl">
        <thead>
          <tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 1 ? "alt" : ""}>
              {r.map((c, j) => <td key={j}>{c}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr>{foot.map((c, i) => <td key={i}><strong>{c}</strong></td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Shared empty state ───────────────────────────────────────────────────────
function NoDataState({ date }) {
  return (
    <div className="rpt-body">
      <div className="rpt-empty-state">
        <div className="rpt-empty-icon">📊</div>
        <strong>No orders found</strong>
        <p>
          There are no closed orders for <em>{date}</em>.
          Once bills are settled on the POS, data will appear here.
        </p>
        <p className="rpt-empty-hint">
          Tip: If you expect data here, make sure <code>ENABLE_DATABASE=true</code> is
          set in your Railway environment so historical orders are loaded from Postgres.
        </p>
      </div>
    </div>
  );
}

// ── 1. Day End Summary ───────────────────────────────────────────────────────
function DayEndSummary({ outlet, date, data }) {
  // Show empty state when API returned real data with zero orders
  if (data && data.summary?.totalOrders === 0) return <NoDataState date={date} />;

  const d = data || dayEndSeed;
  const totalPayAmt = d.paymentModes.reduce((s, p) => s + p.amount, 0);

  const exportHeaders = ["Item", "Category", "Qty", "Rate", "Amount"];
  const exportRows    = d.items.map(i => [i.name, i.category, i.qty, i.rate, i.amount]);

  return (
    <div className="rpt-body">
      <ExportBar
        onCSV={()   => downloadCSV(`DayEndSummary_${date}`, exportHeaders, exportRows)}
        onPDF={()   => downloadPDF(`DayEndSummary_${date}`, "Day End Summary", exportHeaders, exportRows)}
        onExcel={() => downloadExcel(`DayEndSummary_${date}`, exportHeaders, exportRows)}
      />

      <div className="rpt-kpi-row">
        <KpiCard dark label="Total Sales"        value={fmt(d.summary.totalSales)}         sub={`${d.summary.totalOrders} orders`} />
        <KpiCard      label="Avg Order Value"    value={fmt(d.summary.avgOrderValue)}       sub="per bill" />
        <KpiCard      label="Net After Discount" value={fmt(d.summary.netAfterDiscount)}    sub={`Saved ${fmt(d.summary.totalDiscount)}`} />
        <KpiCard      label="Total GST"          value={fmt(d.summary.totalTax)}            sub="CGST + SGST" />
        <KpiCard      label="Cancellations"      value={d.summary.totalCancelled}           sub={fmt(d.summary.cancelledValue)} />
      </div>

      <div className="rpt-two-col">
        <div className="panel rpt-panel">
          <SectionHead title="Payment Mode Breakdown" eyebrow="How customers paid" />
          <div className="rpt-bars">
            {d.paymentModes.map(p => (
              <BarRow key={p.mode} label={p.mode} value={p.orders}
                total={d.summary.totalOrders} amount={p.amount} color={PAYMENT_COLORS[p.mode]} />
            ))}
          </div>
          <div className="rpt-panel-total"><span>Total</span><strong>{fmt(totalPayAmt)}</strong></div>
        </div>

        <div className="panel rpt-panel">
          <SectionHead title="Order Type Breakdown" eyebrow="Dine In · Takeaway · Delivery" />
          <div className="rpt-order-types">
            {d.orderTypes.map(t => (
              <div key={t.type} className="rpt-type-card">
                <div className="rpt-type-icon">{t.type === "Dine In" ? "🍽️" : t.type === "Takeaway" ? "🛍️" : "🛵"}</div>
                <div className="rpt-type-info"><strong>{t.type}</strong><span>{t.orders} orders</span></div>
                <div className="rpt-type-right"><strong>{fmt(t.amount)}</strong><span>{pct(t.amount, d.summary.totalSales)}</span></div>
              </div>
            ))}
          </div>
          <SectionHead title="Session-wise Sales" eyebrow="Breakfast · Lunch · Dinner" />
          <div className="rpt-bars" style={{ marginTop: 8 }}>
            {d.sessions.map(s => (
              <BarRow key={s.session} label={s.session} value={s.orders}
                total={d.summary.totalOrders} amount={s.amount} color="#1a7a3a" />
            ))}
          </div>
        </div>
      </div>

      <div className="panel rpt-panel">
        <SectionHead title="Category-wise Sales" eyebrow="By menu category" />
        <div className="rpt-cat-grid">
          {d.categories.map(c => (
            <div key={c.category} className="rpt-cat-card">
              <strong>{c.category}</strong>
              <span className="rpt-cat-qty">{c.qty} items sold</span>
              <span className="rpt-cat-amt">{fmt(c.amount)}</span>
              <div className="rpt-cat-bar">
                <div style={{ width: pct(c.amount, d.summary.totalSales), background: "#1a7a3a", height: "100%", borderRadius: 4 }} />
              </div>
              <span className="rpt-cat-pct">{pct(c.amount, d.summary.totalSales)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel rpt-panel">
        <SectionHead title="Item-wise Sales" eyebrow="All items sold today" />
        <RptTable
          cols={["#", "Item Name", "Category", "Qty Sold", "Rate (₹)", "Amount (₹)", "% of Sales"]}
          rows={[...d.items].sort((a, b) => b.amount - a.amount).map((item, i) => [
            i + 1, item.name, item.category, item.qty, fmt(item.rate), fmt(item.amount),
            pct(item.amount, d.summary.totalSales)
          ])}
          foot={["", "Total", "", d.items.reduce((s, i) => s + i.qty, 0), "",
            fmt(d.items.reduce((s, i) => s + i.amount, 0)), ""]}
        />
      </div>

      <div className="rpt-two-col">
        <div className="panel rpt-panel">
          <SectionHead title="Tax Summary" eyebrow="GST Breakdown" />
          <div className="rpt-summary-list">
            {[["Taxable Amount", d.tax.taxableAmount], ["CGST", d.tax.cgst],
              ["SGST", d.tax.sgst], ["Total GST", d.tax.totalTax]].map(([l, v], i, arr) => (
              <div key={l} className={`rpt-summary-row${i === arr.length - 1 ? " rpt-summary-total" : ""}`}>
                <span>{l}</span><strong>{fmt(v)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="panel rpt-panel">
          <SectionHead title="Discount Summary" eyebrow="Discounts applied today" />
          <div className="rpt-summary-list">
            {d.discounts.map(disc => (
              <div key={disc.type} className="rpt-summary-row">
                <span>{disc.type}<br /><em className="rpt-disc-count">{disc.count} bills</em></span>
                <strong className="rpt-disc-amt">− {fmt(disc.amount)}</strong>
              </div>
            ))}
            <div className="rpt-summary-row rpt-summary-total">
              <span>Total Discounts</span>
              <strong>− {fmt(d.discounts.reduce((s, x) => s + x.amount, 0))}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="panel rpt-panel">
        <SectionHead title="Cancellations &amp; Voids" eyebrow={`${d.cancellations.length} bills cancelled`} />
        <RptTable
          cols={["Bill No", "Outlet", "Amount", "Reason", "Time"]}
          rows={d.cancellations.map(c => [c.bill, c.outlet, fmt(c.amount), c.reason, c.time])}
          foot={["", "Total", fmt(d.cancellations.reduce((s, c) => s + c.amount, 0)), "", ""]}
        />
      </div>
    </div>
  );
}

// ── 2. Item Sales Report ─────────────────────────────────────────────────────
function ItemSalesReport({ outlet, date, data }) {
  if (data && !data.itemSales?.length) return <NoDataState date={date} />;
  const [cat, setCat] = useState("All");
  const items = data?.itemSales?.length ? data.itemSales : itemSalesSeed;
  const cats = ["All", ...new Set(items.map(i => i.category))];
  const filtered = cat === "All" ? items : items.filter(i => i.category === cat);
  const totalAmt = items.reduce((s, i) => s + i.amount, 0);
  const mostSold   = data?.mostSoldItem;
  const topRevenue = data?.topRevenueItem;

  const exportHeaders = ["Rank", "Item", "Category", "Qty Sold", "Orders", "Rate", "Amount", "% of Sales"];
  const exportRows    = filtered.map(i => [i.rank, i.name, i.category, i.qty, i.orders, i.rate, i.amount,
    pct(i.amount, totalAmt)]);

  return (
    <div className="rpt-body">
      <ExportBar
        onCSV={()   => downloadCSV(`ItemSales_${date}`, exportHeaders, exportRows)}
        onPDF={()   => downloadPDF(`ItemSales_${date}`, "Item Sales Report", exportHeaders, exportRows)}
        onExcel={() => downloadExcel(`ItemSales_${date}`, exportHeaders, exportRows)}
      />
      <div className="rpt-kpi-row">
        <KpiCard dark label="Total Revenue"   value={fmt(totalAmt)}   sub={`${items.length} items`} />
        <KpiCard label="Most Sold Item"    value={mostSold   ? mostSold.name   : "—"} sub={mostSold   ? `${mostSold.qty} qty`       : "No sales yet"} />
        <KpiCard label="Top Revenue Item"  value={topRevenue ? topRevenue.name : "—"} sub={topRevenue ? fmt(topRevenue.amount)      : "No sales yet"} />
        <KpiCard label="Total Qty Sold"    value={items.reduce((s, i) => s + i.qty, 0).toLocaleString("en-IN")} sub="across all items" />
      </div>

      <div className="panel rpt-panel">
        <div className="rpt-panel-toprow">
          <SectionHead title="Item-wise Sales" eyebrow="Sorted by revenue" />
          <div className="rpt-cat-tabs">
            {cats.map(c => (
              <button key={c} className={`rpt-cat-tab${cat === c ? " active" : ""}`}
                onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
        </div>
        <RptTable
          cols={["Rank", "Item Name", "Category", "Qty Sold", "Orders", "Rate (₹)", "Amount (₹)", "% of Sales"]}
          rows={[...filtered].sort((a, b) => b.amount - a.amount).map((item, i) => [
            <span className="rpt-rank-badge">{i + 1}</span>,
            item.name, item.category || "—", item.qty, item.orders,
            fmt(item.rate), fmt(item.amount), pct(item.amount, totalAmt)
          ])}
          foot={["", "Total", "", filtered.reduce((s, i) => s + i.qty, 0), "",
            "", fmt(filtered.reduce((s, i) => s + i.amount, 0)), ""]}
        />
      </div>
    </div>
  );
}

// ── 3. GST Report ────────────────────────────────────────────────────────────
function GSTReport({ outlet, data }) {
  const d = (data?.gst?.summary?.totalBills > 0 ? data.gst : null) || gstSeed;

  const exportFilename = `GST_${d.month.replace(" ", "_")}`;
  const exportHeaders  = ["Date", "Bills", "Taxable Amount", "CGST", "SGST", "Total GST"];
  const exportRows     = d.daily.map(r => [r.date, r.bills, r.taxable, r.cgst, r.sgst, r.total]);

  return (
    <div className="rpt-body">
      <ExportBar
        onCSV={()   => downloadCSV(exportFilename, exportHeaders, exportRows)}
        onPDF={()   => downloadPDF(exportFilename, "GST Report", exportHeaders, exportRows)}
        onExcel={() => downloadExcel(exportFilename, exportHeaders, exportRows)}
      />
      <div className="rpt-kpi-row">
        <KpiCard dark label="Total GST Collected" value={fmt(d.summary.totalGst)}       sub={d.month} />
        <KpiCard      label="Taxable Amount"       value={fmt(d.summary.taxableAmount)}  sub="before tax" />
        <KpiCard      label="CGST"                 value={fmt(d.summary.cgst)}           sub="Central" />
        <KpiCard      label="SGST"                 value={fmt(d.summary.sgst)}           sub="State" />
        <KpiCard      label="Total Bills"          value={d.summary.totalBills.toLocaleString("en-IN")} sub="this month" />
      </div>

      <div className="panel rpt-panel">
        <SectionHead title="Daily GST Breakdown" eyebrow={d.month} />
        <RptTable
          cols={["Date", "Bills", "Taxable Amount (₹)", "CGST (₹)", "SGST (₹)", "Total GST (₹)"]}
          rows={d.daily.map(r => [r.date, r.bills, fmt(r.taxable), fmt(r.cgst), fmt(r.sgst), fmt(r.total)])}
          foot={["Total", d.daily.reduce((s, r) => s + r.bills, 0),
            fmt(d.daily.reduce((s, r) => s + r.taxable, 0)),
            fmt(d.daily.reduce((s, r) => s + r.cgst, 0)),
            fmt(d.daily.reduce((s, r) => s + r.sgst, 0)),
            fmt(d.daily.reduce((s, r) => s + r.total, 0))]}
        />
      </div>

      <div className="panel rpt-panel">
        <SectionHead title="Outlet-wise GST" eyebrow="Branch breakdown" />
        <RptTable
          cols={["Outlet", "Bills", "Taxable Amount (₹)", "CGST (₹)", "SGST (₹)", "Total GST (₹)"]}
          rows={d.outletBreakdown.map(r => [r.outlet, r.bills, fmt(r.taxable), fmt(r.cgst), fmt(r.sgst), fmt(r.total)])}
          foot={["Total",
            d.outletBreakdown.reduce((s, r) => s + r.bills, 0),
            fmt(d.outletBreakdown.reduce((s, r) => s + r.taxable, 0)),
            fmt(d.outletBreakdown.reduce((s, r) => s + r.cgst, 0)),
            fmt(d.outletBreakdown.reduce((s, r) => s + r.sgst, 0)),
            fmt(d.outletBreakdown.reduce((s, r) => s + r.total, 0))]}
        />
      </div>
    </div>
  );
}

// ── 4. Payment Report ────────────────────────────────────────────────────────
function PaymentReport({ outlet, date, data }) {
  if (data && !data.payment?.summary?.totalCollected) return <NoDataState date={date} />;
  const d = (data?.payment?.summary?.totalCollected > 0 ? data.payment : null) || paymentSeed;
  const maxHourly = Math.max(...d.hourly.map(h => h.total));

  const exportHeaders = ["Outlet", "Cash", "UPI", "Card", "Swiggy", "Zomato", "Total", "Variance"];
  const exportRows    = d.outletReconciliation.map(r => [r.outlet, r.cash, r.upi, r.card, r.swiggy, r.zomato, r.total, r.cashierVariance]);

  return (
    <div className="rpt-body">
      <ExportBar
        onCSV={()   => downloadCSV(`PaymentReport_${date}`, exportHeaders, exportRows)}
        onPDF={()   => downloadPDF(`PaymentReport_${date}`, "Payment Report", exportHeaders, exportRows)}
        onExcel={() => downloadExcel(`PaymentReport_${date}`, exportHeaders, exportRows)}
      />
      <div className="rpt-kpi-row">
        <KpiCard dark label="Total Collected"  value={fmt(d.summary.totalCollected)} sub="all modes" />
        <KpiCard      label="Cash"             value={fmt(d.summary.cashAmount)}     sub={pct(d.summary.cashAmount, d.summary.totalCollected) + " of total"} />
        <KpiCard      label="Digital (UPI+Card)" value={fmt(d.summary.digitalAmount)} sub={pct(d.summary.digitalAmount, d.summary.totalCollected) + " of total"} />
        <KpiCard      label="Cash Variance"    value={d.summary.variance === 0 ? "₹0 — Clean" : fmt(d.summary.variance)} sub="across all shifts" />
      </div>

      <div className="rpt-two-col">
        <div className="panel rpt-panel">
          <SectionHead title="Payment Mode Split" eyebrow="Orders &amp; Revenue" />
          <div className="rpt-pay-mode-list">
            {d.modes.map(m => (
              <div key={m.mode} className="rpt-pay-mode-row">
                <span className="rpt-pay-icon">{m.icon}</span>
                <div className="rpt-pay-info">
                  <strong>{m.mode}</strong>
                  <div className="rpt-pay-bar-track">
                    <div className="rpt-pay-bar-fill" style={{ width: m.pct + "%", background: PAYMENT_COLORS[m.mode] }} />
                  </div>
                </div>
                <div className="rpt-pay-nums">
                  <strong>{fmt(m.amount)}</strong>
                  <span>{m.orders} orders · {m.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rpt-panel">
          <SectionHead title="Hourly Collection" eyebrow="Peak hours" />
          <div className="rpt-hourly-bars">
            {d.hourly.map(h => (
              <div key={h.hour} className="rpt-hourly-row">
                <span className="rpt-hourly-label">{h.hour}</span>
                <div className="rpt-hourly-stack">
                  <div style={{ width: pct(h.cash,  maxHourly), background: "#4CAF50", height: 8, borderRadius: 3 }} />
                  <div style={{ width: pct(h.upi,   maxHourly), background: "#2196F3", height: 8, borderRadius: 3 }} />
                  <div style={{ width: pct(h.card,  maxHourly), background: "#9C27B0", height: 8, borderRadius: 3 }} />
                </div>
                <span className="rpt-hourly-amt">{fmt(h.total)}</span>
              </div>
            ))}
          </div>
          <div className="rpt-hourly-legend">
            <span><span className="leg-dot" style={{ background: "#4CAF50" }} />Cash</span>
            <span><span className="leg-dot" style={{ background: "#2196F3" }} />UPI</span>
            <span><span className="leg-dot" style={{ background: "#9C27B0" }} />Card</span>
          </div>
        </div>
      </div>

      <div className="panel rpt-panel">
        <SectionHead title="Outlet Cash Reconciliation" eyebrow="Expected vs Collected" />
        <RptTable
          cols={["Outlet", "Cash (₹)", "UPI (₹)", "Card (₹)", "Swiggy (₹)", "Zomato (₹)", "Total (₹)", "Variance (₹)"]}
          rows={d.outletReconciliation.map(r => [
            r.outlet, fmt(r.cash), fmt(r.upi), fmt(r.card), fmt(r.swiggy), fmt(r.zomato), fmt(r.total),
            <span className={r.cashierVariance !== 0 ? "rpt-disc-amt" : "rpt-var-ok"}>
              {r.cashierVariance === 0 ? "✓ Exact" : fmt(r.cashierVariance)}
            </span>
          ])}
          foot={["Total",
            fmt(d.outletReconciliation.reduce((s, r) => s + r.cash, 0)),
            fmt(d.outletReconciliation.reduce((s, r) => s + r.upi, 0)),
            fmt(d.outletReconciliation.reduce((s, r) => s + r.card, 0)),
            fmt(d.outletReconciliation.reduce((s, r) => s + r.swiggy, 0)),
            fmt(d.outletReconciliation.reduce((s, r) => s + r.zomato, 0)),
            fmt(d.outletReconciliation.reduce((s, r) => s + r.total, 0)), ""]}
        />
      </div>
    </div>
  );
}

// ── 5. Discount & Void Report ────────────────────────────────────────────────
function DiscountVoidReport({ date, data }) {
  const d = data?.discountVoid || discountVoidSeed;

  const exportHeaders = ["Bill", "Outlet", "Cashier", "Type", "Amount", "Approved By", "Time"];
  const exportRows    = d.discountLog.map(r => [r.bill, r.outlet, r.cashier, r.type, r.amount, r.approved, r.time]);

  return (
    <div className="rpt-body">
      <ExportBar
        onCSV={()   => downloadCSV(`DiscountVoid_${date}`, exportHeaders, exportRows)}
        onPDF={()   => downloadPDF(`DiscountVoid_${date}`, "Discount & Void Report", exportHeaders, exportRows)}
        onExcel={() => downloadExcel(`DiscountVoid_${date}`, exportHeaders, exportRows)}
      />
      <div className="rpt-kpi-row">
        <KpiCard dark label="Total Discounts"   value={fmt(d.summary.totalDiscountAmt)}   sub={`${d.summary.totalDiscountBills} bills`} />
        <KpiCard      label="Manual Overrides"  value={d.summary.manualOverrides}          sub="need review" />
        <KpiCard      label="Voids / Cancelled" value={d.summary.totalVoids}               sub={fmt(d.summary.totalVoidAmt)} />
      </div>

      <div className="panel rpt-panel">
        <SectionHead title="Discount Log" eyebrow="All discounts today" />
        <RptTable
          cols={["Bill No", "Outlet", "Cashier", "Discount Type", "Amount (₹)", "Approved By", "Time"]}
          rows={d.discountLog.map(r => [
            r.bill, r.outlet, r.cashier, r.type,
            <span className="rpt-disc-amt">− {fmt(r.amount)}</span>,
            <span className={r.approved === "Mgr OTP" ? "rpt-badge-warn" : "rpt-badge-ok"}>{r.approved}</span>,
            r.time
          ])}
          foot={["", "", "", "Total", fmt(d.discountLog.reduce((s, r) => s + r.amount, 0)), "", ""]}
        />
      </div>

      <div className="panel rpt-panel">
        <SectionHead title="Cancelled / Void Bills" eyebrow="Bills deleted today" />
        <RptTable
          cols={["Bill No", "Outlet", "Cashier", "Amount (₹)", "Reason", "Approved By", "Time"]}
          rows={d.voidLog.map(r => [
            r.bill, r.outlet, r.cashier,
            <span className="rpt-disc-amt">{fmt(r.amount)}</span>,
            r.reason,
            <span className="rpt-badge-warn">{r.approvedBy}</span>,
            r.time
          ])}
          foot={["", "", "Total", fmt(d.voidLog.reduce((s, r) => s + r.amount, 0)), "", "", ""]}
        />
      </div>
    </div>
  );
}

// ── 6. Staff Sales Report ────────────────────────────────────────────────────
function StaffSalesReport({ date, data }) {
  if (data && !data.staffSales?.length) return <NoDataState date={date} />;
  const d = (data?.staffSales?.length ? data.staffSales : null) || staffSalesSeed;

  const exportHeaders = ["Cashier", "Outlet", "Session", "Orders", "Sales", "Discounts", "Voids", "Opening Cash", "Closing Cash", "Variance"];
  const exportRows    = d.map(r => [r.cashier, r.outlet, r.session, r.orders, r.sales, r.discounts, r.voids, r.openingCash, r.closingCash, r.variance]);

  return (
    <div className="rpt-body">
      <ExportBar
        onCSV={()   => downloadCSV(`StaffSales_${date}`, exportHeaders, exportRows)}
        onPDF={()   => downloadPDF(`StaffSales_${date}`, "Staff Sales Report", exportHeaders, exportRows)}
        onExcel={() => downloadExcel(`StaffSales_${date}`, exportHeaders, exportRows)}
      />
      <div className="rpt-kpi-row">
        <KpiCard dark label="Total Staff Sales"  value={fmt(d.reduce((s, r) => s + r.sales, 0))} sub={`${d.length} cashiers`} />
        <KpiCard      label="Total Orders"       value={d.reduce((s, r) => s + r.orders, 0)}     sub="across all shifts" />
        <KpiCard      label="Total Discounts"    value={fmt(d.reduce((s, r) => s + r.discounts, 0))} sub="given by staff" />
        <KpiCard      label="Cash Variance"      value={d.some(r => r.variance !== 0) ? "⚠ Check" : "✓ All Clear"} sub="shift closing" />
      </div>

      <div className="panel rpt-panel">
        <SectionHead title="Cashier-wise Performance" eyebrow="Today's shift summary" />
        <RptTable
          cols={["Cashier", "Outlet", "Session", "Orders", "Sales (₹)", "Discounts (₹)", "Voids", "Opening (₹)", "Closing (₹)", "Variance (₹)"]}
          rows={d.map(r => [
            <strong>{r.cashier}</strong>, r.outlet, r.session, r.orders,
            fmt(r.sales), <span className="rpt-disc-amt">− {fmt(r.discounts)}</span>, r.voids,
            fmt(r.openingCash), fmt(r.closingCash),
            <span className={r.variance !== 0 ? "rpt-disc-amt" : "rpt-var-ok"}>
              {r.variance === 0 ? "✓ Exact" : fmt(r.variance)}
            </span>
          ])}
          foot={["Total", "", "",
            d.reduce((s, r) => s + r.orders, 0),
            fmt(d.reduce((s, r) => s + r.sales, 0)),
            fmt(d.reduce((s, r) => s + r.discounts, 0)),
            d.reduce((s, r) => s + r.voids, 0), "", "", ""]}
        />
      </div>
    </div>
  );
}

// ── 7b. Captain Incentives Report ────────────────────────────────────────────
function CaptainIncentivesReport({ date, data }) {
  const rows = data?.captainIncentives || [];
  const hasData = rows.length > 0;

  const totalSales   = rows.reduce((s, r) => s + r.sales, 0);
  const totalOrders  = rows.reduce((s, r) => s + r.orders, 0);
  const totalPayable = rows.reduce((s, r) => s + r.incentiveAmt, 0);

  const exportHeaders = ["Captain", "Outlet", "Orders", "Sales (₹)", "Incentive %", "Payable (₹)"];
  const exportRows    = rows.map(r => [r.captain, r.outlet, r.orders, r.sales, r.incentivePct, r.incentiveAmt]);

  if (!hasData) {
    return (
      <div className="rpt-body">
        <div className="rpt-empty-state">
          <div className="rpt-empty-icon">👨‍🍳</div>
          <strong>No captain sales data</strong>
          <p>
            Incentive data appears here once waiters/captains take orders via the
            Captain app. Make sure staff have an <strong>Incentive %</strong> set
            in Staff &amp; Roles.
          </p>
          <p className="rpt-empty-hint">
            Go to <strong>Staff &amp; Roles → Edit staff member → Incentive %</strong>
            to assign a commission rate (e.g. 2%) per waiter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rpt-body">
      <ExportBar
        onCSV={()   => downloadCSV(`CaptainIncentives_${date}`, exportHeaders, exportRows)}
        onPDF={()   => downloadPDF(`CaptainIncentives_${date}`, "Captain Incentives Report", exportHeaders, exportRows)}
        onExcel={() => downloadExcel(`CaptainIncentives_${date}`, exportHeaders, exportRows)}
      />

      {/* KPI strip */}
      <div className="rpt-kpi-row">
        <KpiCard dark label="Total Incentive Payable" value={fmt(totalPayable)}   sub={`across ${rows.length} staff`} />
        <KpiCard      label="Total Captain Sales"     value={fmt(totalSales)}     sub={`${totalOrders} orders`} />
        <KpiCard      label="Active Captains"         value={rows.length}         sub="took orders today" />
        <KpiCard      label="Top Earner"
          value={rows.length ? [...rows].sort((a,b) => b.incentiveAmt - a.incentiveAmt)[0].captain : "—"}
          sub={rows.length ? fmt([...rows].sort((a,b) => b.incentiveAmt - a.incentiveAmt)[0].incentiveAmt) : ""} />
      </div>

      {/* Visual cards per captain */}
      <div className="inc-captain-grid">
        {[...rows].sort((a, b) => b.incentiveAmt - a.incentiveAmt).map(r => {
          const pctOfTotal = totalSales > 0 ? Math.round((r.sales / totalSales) * 100) : 0;
          return (
            <div key={r.captain + r.outlet} className="inc-captain-card">
              <div className="inc-captain-avatar">{r.captain.charAt(0).toUpperCase()}</div>
              <div className="inc-captain-info">
                <strong className="inc-captain-name">{r.captain}</strong>
                <span className="inc-captain-outlet">{r.outlet}</span>
              </div>
              <div className="inc-captain-stats">
                <div className="inc-stat-row">
                  <span>Orders</span><strong>{r.orders}</strong>
                </div>
                <div className="inc-stat-row">
                  <span>Sales</span><strong>{fmt(r.sales)}</strong>
                </div>
                <div className="inc-stat-row">
                  <span>Rate</span>
                  <strong style={{ color: r.incentivePct > 0 ? "#1a7a3a" : "#999" }}>
                    {r.incentivePct > 0 ? `${r.incentivePct}%` : "Not set"}
                  </strong>
                </div>
              </div>
              <div className="inc-captain-payable">
                <span className="inc-payable-label">Payable</span>
                <strong className="inc-payable-amt">{fmt(r.incentiveAmt)}</strong>
                <div className="inc-share-bar-wrap">
                  <div className="inc-share-bar" style={{ width: `${pctOfTotal}%` }} />
                </div>
                <span className="inc-share-pct">{pctOfTotal}% of sales</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary table */}
      <div className="panel rpt-panel">
        <SectionHead title="Incentive Summary" eyebrow="All staff payable amounts" />
        <RptTable
          cols={["Captain", "Outlet", "Orders", "Sales (₹)", "Incentive %", "Payable (₹)"]}
          rows={[...rows].sort((a, b) => b.incentiveAmt - a.incentiveAmt).map(r => [
            <strong>{r.captain}</strong>,
            r.outlet,
            r.orders,
            fmt(r.sales),
            r.incentivePct > 0
              ? <span className="rpt-badge-ok">{r.incentivePct}%</span>
              : <span className="rpt-badge-warn">Not set</span>,
            <strong className="inc-payable-cell">{fmt(r.incentiveAmt)}</strong>
          ])}
          foot={["Total", "", totalOrders, fmt(totalSales), "", <strong>{fmt(totalPayable)}</strong>]}
        />
        <div className="inc-disclaimer">
          ℹ Incentive % is set per staff member in <strong>Staff &amp; Roles</strong>.
          These figures are calculated on net sales (after discount) for orders taken via the Captain app.
        </div>
      </div>
    </div>
  );
}

// ── Email Trigger ────────────────────────────────────────────────────────────
const EMAIL_KEY = "pos_report_email_settings";
function loadEmail() {
  try { return JSON.parse(localStorage.getItem(EMAIL_KEY) || "null") || { email: "", time: "23:00", frequency: "daily", reports: ["day-end"] }; }
  catch { return { email: "", time: "23:00", frequency: "daily", reports: ["day-end"] }; }
}

function EmailTrigger() {
  const [cfg, setCfg] = useState(loadEmail);
  const [saved, setSaved] = useState(false);

  function save() {
    localStorage.setItem(EMAIL_KEY, JSON.stringify(cfg));
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  const REPORT_OPTIONS = [
    { key: "day-end",   label: "Day End Summary"  },
    { key: "item-sales", label: "Item Sales"       },
    { key: "gst",        label: "GST Report"       },
    { key: "payments",   label: "Payment Report"   },
    { key: "discounts",  label: "Discount & Void"  },
    { key: "staff",      label: "Staff Sales"      }
  ];

  function toggleReport(key) {
    const next = cfg.reports.includes(key)
      ? cfg.reports.filter(r => r !== key)
      : [...cfg.reports, key];
    setCfg(c => ({ ...c, reports: next }));
  }

  return (
    <div className="rpt-email-panel panel">
      <SectionHead title="Email Report Trigger" eyebrow="Auto-send to owner" />
      <p className="rpt-email-note">
        Selected reports are emailed automatically to the owner at the scheduled time.
        Use this for end-of-day summaries and weekly GST exports.
      </p>
      <div className="rpt-email-form">
        <label>Owner Email
          <input type="email" placeholder="owner@restaurant.com" value={cfg.email}
            onChange={e => setCfg(c => ({ ...c, email: e.target.value }))} />
        </label>
        <label>Send Time
          <input type="time" value={cfg.time}
            onChange={e => setCfg(c => ({ ...c, time: e.target.value }))} />
        </label>
        <label>Frequency
          <select value={cfg.frequency} onChange={e => setCfg(c => ({ ...c, frequency: e.target.value }))}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly (Monday)</option>
            <option value="monthly">Monthly (1st)</option>
          </select>
        </label>
        <div className="rpt-email-reports">
          <span className="rpt-email-reports-label">Reports to include</span>
          <div className="rpt-email-checkboxes">
            {REPORT_OPTIONS.map(r => (
              <label key={r.key} className="rpt-email-check">
                <input type="checkbox" checked={cfg.reports.includes(r.key)}
                  onChange={() => toggleReport(r.key)} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
        <button className="primary-btn" onClick={save}>
          {saved ? "✓ Saved" : "Save Email Settings"}
        </button>
      </div>
    </div>
  );
}

// ── 7. Category-wise Report ──────────────────────────────────────────────────
function CategoryReport({ date, data }) {
  if (data && !data.categorySales?.categories?.length) return <NoDataState date={date} />;
  // Use live backend data when available; fall back to seed (all-zero) otherwise.
  // Categories are grouped by item.station on the backend — "General" when unset.
  const d = (data?.categorySales?.categories?.length ? data.categorySales : null)
            || categorySalesSeed;
  const [expanded, setExpanded] = useState(null);
  const [view, setView]         = useState("revenue"); // revenue | qty | orders
  const totalAmt   = d.categories.reduce((s, c) => s + c.amount, 0);
  const totalQty   = d.categories.reduce((s, c) => s + c.qty, 0);
  const totalOrders= d.categories.reduce((s, c) => s + c.orders, 0);
  // Collect real outlet names dynamically — avoids hardcoded branch names from seed
  const outletNames = [...new Set(d.categories.flatMap(c => Object.keys(c.outlets || {})))].sort();

  const sorted = [...d.categories].sort((a, b) =>
    view === "revenue" ? b.amount - a.amount :
    view === "qty"     ? b.qty    - a.qty    : b.orders - a.orders
  );

  const maxVal = sorted[0]
    ? (view === "revenue" ? sorted[0].amount : view === "qty" ? sorted[0].qty : sorted[0].orders)
    : 1;

  const exportHeaders = ["Category", "Items", "Qty Sold", "Orders", "Avg Rate (₹)", "Amount (₹)", "% of Sales"];
  const exportRows    = d.categories.map(c => [c.name, c.itemCount, c.qty, c.orders, c.avgRate, c.amount, pct(c.amount, totalAmt)]);

  return (
    <div className="rpt-body">
      <ExportBar
        onCSV={()   => downloadCSV(`CategorySales_${date}`, exportHeaders, exportRows)}
        onPDF={()   => downloadPDF(`CategorySales_${date}`, "Category Sales Report", exportHeaders, exportRows)}
        onExcel={() => downloadExcel(`CategorySales_${date}`, exportHeaders, exportRows)}
      />

      {/* KPIs */}
      <div className="rpt-kpi-row">
        <KpiCard dark label="Total Revenue"   value={fmt(totalAmt)}    sub={`${d.categories.length} categories`} />
        <KpiCard      label="Total Qty Sold"  value={totalQty.toLocaleString("en-IN")} sub="all categories" />
        <KpiCard      label="Total Orders"    value={totalOrders.toLocaleString("en-IN")} sub="with category items" />
        <KpiCard      label="Best Category"   value={sorted[0]?.name}  sub={fmt(sorted[0]?.amount)} />
        <KpiCard      label="Least Sold"      value={sorted[sorted.length-1]?.name} sub={fmt(sorted[sorted.length-1]?.amount)} />
      </div>

      {/* Visual bar chart */}
      <div className="panel rpt-panel">
        <div className="rpt-panel-toprow">
          <SectionHead title="Category Performance" eyebrow="Visual breakdown" />
          <div className="rpt-cat-tabs">
            {[["revenue","By Revenue"],["qty","By Qty"],["orders","By Orders"]].map(([v,l]) => (
              <button key={v} className={`rpt-cat-tab${view===v?" active":""}`} onClick={() => setView(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="rpt-cat-bars">
          {sorted.map(c => {
            const val = view === "revenue" ? c.amount : view === "qty" ? c.qty : c.orders;
            const w   = Math.round((val / maxVal) * 100);
            return (
              <div key={c.name} className="rpt-cat-bar-row">
                <div className="rpt-cat-bar-label">
                  <span className="rpt-cat-dot" style={{ background: c.color }} />
                  <strong>{c.name}</strong>
                  <span className="rpt-cat-items-count">{c.itemCount} item{c.itemCount > 1 ? "s" : ""}</span>
                </div>
                <div className="rpt-cat-bar-track">
                  <div className="rpt-cat-bar-fill" style={{ width: `${w}%`, background: c.color }} />
                </div>
                <span className="rpt-cat-bar-val">
                  {view === "revenue" ? fmt(val) : val.toLocaleString("en-IN")}
                </span>
                <span className="rpt-cat-bar-pct">
                  {pct(val, view === "revenue" ? totalAmt : view === "qty" ? totalQty : totalOrders)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary table */}
      <div className="panel rpt-panel">
        <SectionHead title="Category Summary" eyebrow="All categories" />
        <RptTable
          cols={["Category", "Items", "Qty Sold", "Orders", "Avg Rate (₹)", "Revenue (₹)", "% of Sales", "Top Item"]}
          rows={d.categories.map(c => [
            <span className="rpt-cat-name-cell">
              <span className="rpt-cat-dot" style={{ background: c.color }} />{c.name}
            </span>,
            c.itemCount,
            c.qty.toLocaleString("en-IN"),
            c.orders.toLocaleString("en-IN"),
            fmt(c.avgRate),
            <strong>{fmt(c.amount)}</strong>,
            pct(c.amount, totalAmt),
            <span className="rpt-top-item">{c.topItem.name}</span>
          ])}
          foot={["Total", d.categories.reduce((s,c)=>s+c.itemCount,0),
            totalQty.toLocaleString("en-IN"),
            totalOrders.toLocaleString("en-IN"), "",
            fmt(totalAmt), "100%", ""]}
        />
      </div>

      {/* Session-wise per category */}
      <div className="panel rpt-panel">
        <SectionHead title="Session-wise Breakdown" eyebrow="Breakfast · Lunch · Dinner per category" />
        <RptTable
          cols={["Category", "Breakfast (₹)", "Lunch (₹)", "Dinner (₹)", "Total (₹)"]}
          rows={d.categories.map(c => [
            <span className="rpt-cat-name-cell">
              <span className="rpt-cat-dot" style={{ background: c.color }} />{c.name}
            </span>,
            fmt(c.sessions.Breakfast),
            fmt(c.sessions.Lunch),
            fmt(c.sessions.Dinner),
            <strong>{fmt(c.amount)}</strong>
          ])}
          foot={["Total",
            fmt(d.categories.reduce((s,c)=>s+c.sessions.Breakfast,0)),
            fmt(d.categories.reduce((s,c)=>s+c.sessions.Lunch,0)),
            fmt(d.categories.reduce((s,c)=>s+c.sessions.Dinner,0)),
            fmt(totalAmt)]}
        />
      </div>

      {/* Outlet-wise per category — columns built from real outlet names in data */}
      {outletNames.length > 0 && (
        <div className="panel rpt-panel">
          <SectionHead title="Outlet-wise Breakdown" eyebrow="Revenue per branch per category" />
          <RptTable
            cols={["Category", ...outletNames.map(n => `${n} (₹)`), "Total (₹)"]}
            rows={d.categories.map(c => [
              <span className="rpt-cat-name-cell">
                <span className="rpt-cat-dot" style={{ background: c.color }} />{c.name}
              </span>,
              ...outletNames.map(n => fmt(c.outlets[n] || 0)),
              <strong>{fmt(c.amount)}</strong>
            ])}
            foot={["Total",
              ...outletNames.map(n => fmt(d.categories.reduce((s, c) => s + (c.outlets[n] || 0), 0))),
              fmt(totalAmt)]}
          />
        </div>
      )}

      {/* Drilldown — click category to expand items */}
      <div className="panel rpt-panel">
        <SectionHead title="Item Drilldown" eyebrow="Click a category to see its items" />
        {d.categories.map(c => (
          <div key={c.name} className="rpt-drilldown-section">
            <button className="rpt-drilldown-toggle" onClick={() => setExpanded(expanded === c.name ? null : c.name)}>
              <span className="rpt-cat-dot" style={{ background: c.color }} />
              <strong>{c.name}</strong>
              <span className="rpt-drilldown-meta">{c.itemCount} items · {fmt(c.amount)} · {pct(c.amount, totalAmt)}</span>
              <span className="rpt-drilldown-arrow">{expanded === c.name ? "▲" : "▼"}</span>
            </button>
            {expanded === c.name && (
              <RptTable
                cols={["Item Name", "Qty Sold", "Orders", "Rate (₹)", "Amount (₹)", "% of Category"]}
                rows={[...d.items[c.name]].sort((a,b) => b.amount - a.amount).map(item => [
                  item.name,
                  item.qty.toLocaleString("en-IN"),
                  item.orders.toLocaleString("en-IN"),
                  fmt(item.rate),
                  <strong>{fmt(item.amount)}</strong>,
                  pct(item.amount, c.amount)
                ])}
                foot={["Total",
                  d.items[c.name].reduce((s,i)=>s+i.qty,0).toLocaleString("en-IN"),
                  d.items[c.name].reduce((s,i)=>s+i.orders,0).toLocaleString("en-IN"), "",
                  fmt(d.items[c.name].reduce((s,i)=>s+i.amount,0)), "100%"]}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Wastage Report Tab ────────────────────────────────────────────────────────
function WastageReport({ dateFrom, dateTo, outletId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ dateFrom, dateTo });
    if (outletId) p.set("outletId", outletId);
    api.get(`/operations/wastage?${p}`)
      .then(res => setEntries(Array.isArray(res) ? res : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, outletId]);

  useEffect(() => { load(); }, [load]);

  // Aggregated totals by item name
  const itemTotals = entries.reduce((acc, e) => {
    const key = e.itemName;
    if (!acc[key]) acc[key] = { itemName: key, unit: e.unit || "", total: 0, count: 0 };
    acc[key].total += Number(e.quantity) || 0;
    acc[key].count += 1;
    return acc;
  }, {});
  const topItems = Object.values(itemTotals).sort((a, b) => b.total - a.total);

  // Totals by reason
  const reasonTotals = entries.reduce((acc, e) => {
    acc[e.reason] = (acc[e.reason] || 0) + 1;
    return acc;
  }, {});

  const wastageHeaders = ["Timestamp", "Item", "Qty", "Unit", "Reason", "Note", "Cashier"];
  const wastageRows    = entries.map(e => [
    new Date(e.timestamp).toLocaleString("en-IN"),
    e.itemName, e.quantity, e.unit || "", e.reason, e.note || "", e.cashierName || ""
  ]);
  const wastageFilename = `wastage_${dateFrom}_${dateTo}`;

  return (
    <div className="rpt-body">
      <SectionHead eyebrow="Production Wastage" title="Wastage Log" />

      {loading && <p style={{ color: "#6b7280", padding: "1rem 0" }}>Loading…</p>}

      {!loading && entries.length === 0 && (
        <div className="rpt-empty">
          <span>🗑</span>
          <p>No wastage logged for this period.</p>
          <p style={{ fontSize: 13, color: "#9ca3af" }}>Use the Wastage button on the POS action bar to log production wastage.</p>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <>
          {/* Summary row */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            <div className="metric-card" style={{ minWidth: 120 }}>
              <span className="metric-label">Total entries</span>
              <strong>{entries.length}</strong>
            </div>
            <div className="metric-card" style={{ minWidth: 120 }}>
              <span className="metric-label">Unique items</span>
              <strong>{topItems.length}</strong>
            </div>
            {Object.entries(reasonTotals).map(([r, c]) => (
              <div key={r} className="metric-card" style={{ minWidth: 120 }}>
                <span className="metric-label">{r}</span>
                <strong>{c}</strong>
              </div>
            ))}
          </div>

          {/* Top wasted items */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>By Item</p>
            <RptTable
              cols={["Item", "Unit", "Total Qty", "Entries"]}
              rows={topItems.map(i => [i.itemName, i.unit || "—", i.total, i.count])}
            />
          </div>

          {/* Full log */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Full Log</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="rpt-export-btn" onClick={() => entries.length && downloadCSV(wastageFilename, wastageHeaders, wastageRows)}>⬇ CSV</button>
              <button className="rpt-export-btn" onClick={() => entries.length && downloadPDF(wastageFilename, "Wastage Report", wastageHeaders, wastageRows)}>⬇ PDF</button>
              <button className="rpt-export-btn" onClick={() => entries.length && downloadExcel(wastageFilename, wastageHeaders, wastageRows)}>⬇ Excel</button>
            </div>
          </div>
          <RptTable
            cols={["Date & Time", "Item", "Qty", "Reason", "Note", "Cashier"]}
            rows={entries.map(e => [
              new Date(e.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }),
              e.itemName,
              `${e.quantity}${e.unit ? " " + e.unit : ""}`,
              e.reason,
              e.note || "—",
              e.cashierName || "—"
            ])}
          />
        </>
      )}
    </div>
  );
}

const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Wallet", "Credit", "Zomato Pay", "Swiggy Pay"];

// ── Edit Payment Modal — corrects the method/split on an already-closed bill ──
function EditPaymentModal({ order, onClose, onSaved }) {
  const total = (order._order?.payments || []).reduce((s, p) => s + (p.amount || 0), 0) || order.totalPaid || 0;
  const existing = order._order?.payments || [];
  const [payments, setPayments] = useState(
    existing.length
      ? existing.map(p => ({ method: p.method, amount: p.amount }))
      : [{ method: "Cash", amount: total }]
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  function updateMethod(idx, method) { setPayments(prev => prev.map((p, i) => i === idx ? { ...p, method } : p)); }
  function updateAmount(idx, val)     { setPayments(prev => prev.map((p, i) => i === idx ? { ...p, amount: Number(val) || 0 } : p)); }
  function addSplit()  { setPayments(prev => [...prev, { method: "Card", amount: 0 }]); }
  function removeRow(idx) { if (payments.length > 1) setPayments(prev => prev.filter((_, i) => i !== idx)); }

  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const isValid   = paidTotal >= total;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.post("/operations/closed-order/payments", {
        outletId: order.outletId,
        closedAt: order.closedAt,
        payments,
      });
      onSaved(payments);
    } catch (err) {
      setError(err?.message || "Failed to save — check connection and try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <h3>✏️ Edit Payment — Bill #{order.billNo}</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>✕</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
            ⚠️ Correcting a payment method updates the billing record. Use for genuine errors only.
          </p>

          {payments.map((p, idx) => (
            <div key={idx} style={{ display: "flex", gap: 8 }}>
              <select style={{ flex: 1 }} value={p.method} onChange={e => updateMethod(idx, e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
              <input
                type="number"
                style={{ width: 110, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line-strong)" }}
                value={p.amount}
                onChange={e => updateAmount(idx, e.target.value)}
              />
              {payments.length > 1 && (
                <button type="button" onClick={() => removeRow(idx)} style={{ border: "none", background: "none", cursor: "pointer" }}>🗑</button>
              )}
            </div>
          ))}

          <button type="button" onClick={addSplit} style={{ alignSelf: "flex-start", border: "none", background: "none", color: "var(--primary, #1849a9)", cursor: "pointer", fontWeight: 600 }}>
            + Add Split Payment
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: isValid ? "#16a34a" : "#dc2626" }}>
            <span>Paid: {fmt(paidTotal)}</span>
            <span>{isValid ? `✓ Covers ${fmt(total)}` : `${fmt(total - paidTotal)} still short`}</span>
          </div>

          {error && <p style={{ color: "#dc2626", fontSize: "0.85rem", margin: 0 }}>{error}</p>}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="rpt-export-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="rpt-export-btn" onClick={handleSave} disabled={!isValid || saving}>
            {saving ? "Saving…" : "Save Correction"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Order History Tab ─────────────────────────────────────────────────────────
// Paginated bill list backed by GET /reports/orders (Postgres for history,
// in-memory for today).  One row per closed bill.
function OrderHistoryTab({ dateFrom, dateTo, outletId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [page,    setPage]    = useState(1);
  const [detail,  setDetail]  = useState(null);  // expanded order detail
  const [editOrder, setEditOrder] = useState(null); // order being payment-corrected
  const [overrides, setOverrides] = useState({});    // billNo → corrected payments
  const PAGE_SIZE = 50;

  const load = useCallback((pg = 1) => {
    setLoading(true);
    const p = new URLSearchParams({ dateFrom, dateTo, page: pg, pageSize: PAGE_SIZE });
    if (outletId) p.set("outletId", outletId);
    api.get(`/reports/orders?${p}`)
      .then(res => { setData(res); setPage(pg); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, outletId]);

  useEffect(() => { load(1); }, [load]);

  const ohHeaders  = ["Bill No", "Date", "Time", "Table", "Outlet", "Items", "Net (₹)", "Paid (₹)", "Method", "Cashier"];
  const ohRows     = (data?.orders || []).map(o => [o.billNo, o.date, o.time, o.tableNumber, o.outletName,
    o.items, o.net, o.totalPaid, o.paymentMethods, o.cashierName]);
  const ohFilename = `bills_${dateFrom}_${dateTo}`;

  const orders = data?.orders || [];
  const total  = data?.total  || 0;
  const pages  = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="rpt-body">
      <SectionHead eyebrow="Order History" title="Closed Bills" />
      <div className="rpt-oh-toolbar">
        <span className="rpt-oh-count">{total} bills found</span>
        <span className="rpt-oh-src">{data?.source === "postgres" ? "🗄 Postgres" : "⚡ Live"}</span>
        <button className="rpt-export-btn" onClick={() => downloadCSV(ohFilename, ohHeaders, ohRows)} disabled={!orders.length}>⬇ CSV</button>
        <button className="rpt-export-btn" onClick={() => downloadPDF(ohFilename, "Order History", ohHeaders, ohRows)} disabled={!orders.length}>⬇ PDF</button>
        <button className="rpt-export-btn" onClick={() => downloadExcel(ohFilename, ohHeaders, ohRows)} disabled={!orders.length}>⬇ Excel</button>
      </div>

      {loading && <p className="rpt-empty">Loading…</p>}

      {!loading && orders.length === 0 && (
        <p className="rpt-empty">No closed bills found for this period.</p>
      )}

      {!loading && orders.length > 0 && (
        <div className="rpt-table-wrap">
          <table className="rpt-tbl">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date</th>
                <th>Time</th>
                <th>Table</th>
                <th>Outlet</th>
                <th>Items</th>
                <th>Net (₹)</th>
                <th>Paid (₹)</th>
                <th>Method</th>
                <th>Cashier</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => {
                const override = overrides[o.billNo];
                const methodsLabel = override
                  ? [...new Set(override.map(p => p.method))].join(", ")
                  : o.paymentMethods;
                return (
                <tr key={i}>
                  <td><strong>{o.billNo}</strong></td>
                  <td>{o.date}</td>
                  <td>{o.time}</td>
                  <td>{o.tableNumber}</td>
                  <td>{o.outletName}</td>
                  <td>{o.items}</td>
                  <td>{fmt(o.net)}</td>
                  <td>{fmt(o.totalPaid)}</td>
                  <td><span className="rpt-method-pill">{methodsLabel}</span></td>
                  <td>{o.cashierName}</td>
                  <td>
                    <button className="rpt-oh-detail-btn"
                      onClick={() => setDetail(detail?.closedAt === o.closedAt ? null : o)}>
                      {detail?.closedAt === o.closedAt ? "▲" : "▼"}
                    </button>
                  </td>
                  <td>
                    <button className="rpt-oh-detail-btn" title="Edit payment method"
                      disabled={!o.outletId || !o.closedAt}
                      onClick={() => setEditOrder(o)}>
                      ✏️
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Expanded bill detail */}
      {detail && (
        <div className="rpt-oh-detail">
          <div className="rpt-oh-detail-head">
            <strong>Bill #{detail.billNo}</strong>
            <span>{detail.date} · {detail.time}</span>
            <span>{detail.tableNumber} · {detail.outletName}</span>
            <button className="rpt-oh-close-btn" onClick={() => setDetail(null)}>✕ Close</button>
          </div>
          {detail._order?.items?.length > 0 && (
            <RptTable
              cols={["Item", "Qty", "Rate (₹)", "Amount (₹)"]}
              rows={(detail._order.items || []).map(item => [
                item.name,
                item.quantity || 1,
                fmt(item.price || 0),
                fmt((item.price || 0) * (item.quantity || 1))
              ])}
              foot={["Total", "", "",
                fmt((detail._order.items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0))
              ]}
            />
          )}
          <div className="rpt-oh-detail-footer">
            {(overrides[detail.billNo] || detail._order?.payments || []).map((p, i) => (
              <span key={i} className="rpt-method-pill">
                {p.method?.toUpperCase() || "CASH"}: {fmt(p.amount)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="rpt-oh-pagination">
          <button className="rpt-page-btn" onClick={() => load(page - 1)} disabled={page <= 1}>← Prev</button>
          <span className="rpt-page-info">Page {page} of {pages}</span>
          <button className="rpt-page-btn" onClick={() => load(page + 1)} disabled={page >= pages}>Next →</button>
        </div>
      )}

      {editOrder && (
        <EditPaymentModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={(payments) => {
            setOverrides(prev => ({ ...prev, [editOrder.billNo]: payments }));
            setEditOrder(null);
          }}
        />
      )}
    </div>
  );
}

// ── Voids & Reprints Report ──────────────────────────────────────────────────
function VoidsReprintsReport({ dateFrom, dateTo, outletId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all"); // all | void_item | cancel_order | bill_reprint

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ dateFrom, dateTo });
    if (outletId) p.set("outletId", outletId);
    api.get(`/operations/action-logs?${p}`)
      .then(res => setEntries(Array.isArray(res) ? res : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, outletId]);

  useEffect(() => { load(); }, [load]);

  const filtered = typeFilter === "all" ? entries : entries.filter(e => e.type === typeFilter);

  // Summary counts
  const voidCount    = entries.filter(e => e.type === "void_item").length;
  const cancelCount  = entries.filter(e => e.type === "cancel_order").length;
  const reprintCount = entries.filter(e => e.type === "bill_reprint").length;
  const posReprints  = entries.filter(e => e.type === "bill_reprint" && e.source !== "captain").length;
  const captReprints = entries.filter(e => e.type === "bill_reprint" && e.source === "captain").length;

  const vrHeaders  = ["Date & Time", "Type", "Cashier", "Table", "Order #", "Bill #", "Details", "Source"];
  const vrRows     = entries.map(e => {
    const details = e.type === "bill_reprint"
      ? `Bill ${e.billNo || "—"}`
      : (e.items || []).map(i => `${i.name} x${i.qty}`).join("; ");
    return [
      new Date(e.timestamp).toLocaleString("en-IN"),
      e.type === "void_item" ? "Void Item" : e.type === "cancel_order" ? "Cancel Order" : "Bill Reprint",
      e.cashier || "—",
      e.tableLabel || e.tableId || "—",
      e.orderNumber || "—",
      e.billNo || "—",
      details,
      e.source || "pos",
    ];
  });
  const vrFilename = `voids_reprints_${dateFrom}_${dateTo}`;

  const typeLabel = t => t === "void_item" ? "Void Item" : t === "cancel_order" ? "Cancel Order" : "Bill Reprint";
  const typeIcon  = t => t === "void_item" ? "🚫" : t === "cancel_order" ? "❌" : "🖨️";

  return (
    <div className="rpt-body">
      <SectionHead eyebrow="POS Audit Trail" title="Voids & Reprints" />

      {/* Summary KPI row */}
      <div className="rpt-kpi-row" style={{ marginBottom: 20 }}>
        <div className="metric-card" style={{ minWidth: 120 }}>
          <span className="metric-label">Void Items</span>
          <strong style={{ color: "#dc2626" }}>{voidCount}</strong>
        </div>
        <div className="metric-card" style={{ minWidth: 120 }}>
          <span className="metric-label">Order Cancels</span>
          <strong style={{ color: "#b45309" }}>{cancelCount}</strong>
        </div>
        <div className="metric-card" style={{ minWidth: 140 }}>
          <span className="metric-label">Bill Reprints (POS)</span>
          <strong style={{ color: "#1d4ed8" }}>{posReprints}</strong>
        </div>
        <div className="metric-card" style={{ minWidth: 160 }}>
          <span className="metric-label">Bill Reprints (Captain)</span>
          <strong style={{ color: "#1d4ed8" }}>{captReprints}</strong>
        </div>
        <div className="metric-card" style={{ minWidth: 120 }}>
          <span className="metric-label">Total Reprints</span>
          <strong>{reprintCount}</strong>
        </div>
      </div>

      {/* Type filter pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { key: "all",           label: "All"           },
          { key: "void_item",     label: "🚫 Void Items"     },
          { key: "cancel_order",  label: "❌ Cancel Orders"  },
          { key: "bill_reprint",  label: "🖨️ Bill Reprints"  },
        ].map(f => (
          <button key={f.key}
            onClick={() => setTypeFilter(f.key)}
            style={{
              padding: "4px 14px", borderRadius: 20, border: "1.5px solid",
              borderColor: typeFilter === f.key ? "#059669" : "#d1d5db",
              background:  typeFilter === f.key ? "#ecfdf5" : "#fff",
              color:        typeFilter === f.key ? "#047857" : "#374151",
              fontWeight:   typeFilter === f.key ? 700 : 400,
              cursor: "pointer", fontSize: 13,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "#6b7280", padding: "1rem 0" }}>Loading…</p>}

      {!loading && entries.length === 0 && (
        <div className="rpt-empty">
          <span>🔍</span>
          <p>No void or reprint actions for this period.</p>
          <p style={{ fontSize: 13, color: "#9ca3af" }}>
            Void items, cancel orders, and bill reprints are logged automatically when cashiers perform these actions on the POS or Captain App.
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
              {filtered.length} {typeFilter === "all" ? "entries" : typeLabel(typeFilter) + " entries"}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="rpt-export-btn" onClick={() => entries.length && downloadCSV(vrFilename, vrHeaders, vrRows)}>⬇ CSV</button>
              <button className="rpt-export-btn" onClick={() => entries.length && downloadPDF(vrFilename, "Voids & Reprints", vrHeaders, vrRows)}>⬇ PDF</button>
              <button className="rpt-export-btn" onClick={() => entries.length && downloadExcel(vrFilename, vrHeaders, vrRows)}>⬇ Excel</button>
            </div>
          </div>
          <RptTable
            cols={["Date & Time", "Type", "Cashier", "Table", "Order #", "Details", "Source"]}
            rows={filtered.map(e => {
              const details = e.type === "bill_reprint"
                ? `Bill No: ${e.billNo || "—"}`
                : (e.items || []).map(i => `${i.name}${i.qty > 1 ? " ×" + i.qty : ""}`).join(", ") || "—";
              return [
                new Date(e.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }),
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: e.type === "void_item" ? "#dc2626" : e.type === "cancel_order" ? "#b45309" : "#1d4ed8" }}>
                  {typeIcon(e.type)} {typeLabel(e.type)}
                </span>,
                e.cashier || "—",
                e.tableLabel || e.tableId || "—",
                e.orderNumber || "—",
                details,
                (e.source === "captain" ? "Captain App" : "POS"),
              ];
            })}
          />
        </>
      )}

      {!loading && filtered.length === 0 && entries.length > 0 && (
        <p style={{ color: "#6b7280", fontSize: 13, padding: "1rem 0" }}>No {typeLabel(typeFilter)} entries for this period.</p>
      )}
    </div>
  );
}

// ── Customer Order History (inline expand) ───────────────────────────────────
function CustomerOrderHistory({ data }) {
  if (!data || data.loading)
    return <p style={{ padding: "10px 16px", color: "#6b7280", fontSize: 13 }}>Loading order history…</p>;
  if (data.error)
    return <p style={{ padding: "10px 16px", color: "#dc2626", fontSize: 13 }}>Could not load orders.</p>;
  if (!data.orders.length)
    return <p style={{ padding: "10px 16px", color: "#6b7280", fontSize: 13 }}>No past orders found for this phone number.</p>;

  return (
    <div className="rpt-order-hist">
      <p className="rpt-order-hist-eyebrow">Last {data.orders.length} orders</p>
      <table className="rpt-order-hist-table">
        <thead>
          <tr>
            <th>Bill #</th><th>Date</th><th>Items</th>
            <th style={{ textAlign: "right" }}>Total</th><th>Payment</th>
          </tr>
        </thead>
        <tbody>
          {data.orders.map(o => (
            <tr key={o.id}>
              <td style={{ fontFamily: "monospace" }}>{o.billNo}</td>
              <td>{new Date(o.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
              <td style={{ maxWidth: 280 }}>{o.items.map(i => `${i.name} ×${i.qty}`).join(", ")}</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>₹{Number(o.total || 0).toFixed(0)}</td>
              <td>{o.paymentMode}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Customers Tab ────────────────────────────────────────────────────────────
function CustomersTab() {
  const [customers,     setCustomers]     = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [q,             setQ]             = useState("");
  const [expandedPhone, setExpandedPhone] = useState(null);
  const [orderCache,    setOrderCache]    = useState({});

  function toggleHistory(phone) {
    if (!phone) return;
    if (expandedPhone === phone) { setExpandedPhone(null); return; }
    setExpandedPhone(phone);
    if (orderCache[phone]) return;
    setOrderCache(prev => ({ ...prev, [phone]: { loading: true, orders: [] } }));
    api.get(`/customers/order-history?phone=${encodeURIComponent(phone)}`)
      .then(res => setOrderCache(prev => ({ ...prev, [phone]: { loading: false, orders: res.orders || [] } })))
      .catch(() => setOrderCache(prev => ({ ...prev, [phone]: { loading: false, orders: [], error: true } })));
  }

  useEffect(() => {
    setLoading(true);
    api.get("/customers")
      .then(res => setCustomers(Array.isArray(res) ? res : []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, []);

  const lq = q.trim().toLowerCase();
  const filtered = lq
    ? customers.filter(c =>
        (c.name  || "").toLowerCase().includes(lq) ||
        (c.phone || "").includes(lq) ||
        (c.email || "").toLowerCase().includes(lq) ||
        (c.gstin || "").toLowerCase().includes(lq)
      )
    : customers;

  const custHeaders = ["Name", "Phone", "Email", "GSTIN", "Address", "Company", "Notes", "Saved On"];
  const custRows    = filtered.map(c => [
    c.name, c.phone || "", c.email || "", c.gstin || "",
    c.address || "", c.company || "", c.notes || "",
    c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : ""
  ]);

  const withPhone = customers.filter(c => c.phone).length;
  const withEmail = customers.filter(c => c.email).length;
  const withGstin = customers.filter(c => c.gstin).length;

  return (
    <div className="rpt-body">
      <SectionHead eyebrow="Saved from POS" title="Customer List" />

      {/* KPIs */}
      <div className="rpt-kpi-row" style={{ marginBottom: 20 }}>
        <KpiCard dark label="Total Customers" value={customers.length} sub="in master list" />
        <KpiCard label="With Phone"  value={withPhone} sub="can send SMS / WhatsApp" />
        <KpiCard label="With Email"  value={withEmail} sub="can send emails" />
        <KpiCard label="With GSTIN"  value={withGstin} sub="B2B / GST billing" />
      </div>

      {/* Search + Export */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search by name, phone, email or GSTIN…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{
            flex: 1, minWidth: 220, padding: "7px 12px", borderRadius: 8,
            border: "1.5px solid #d1d5db", fontSize: 13, outline: "none",
            fontFamily: "Manrope, sans-serif",
          }}
        />
        <button className="rpt-export-btn" onClick={() => downloadCSV("customers_list", custHeaders, custRows)} disabled={!filtered.length}>⬇ CSV</button>
        <button className="rpt-export-btn" onClick={() => downloadPDF("customers_list", "Customer List", custHeaders, custRows)} disabled={!filtered.length}>⬇ PDF</button>
        <button className="rpt-export-btn" onClick={() => downloadExcel("customers_list", custHeaders, custRows)} disabled={!filtered.length}>⬇ Excel</button>
      </div>

      {loading && <p style={{ color: "#6b7280", padding: "1rem 0" }}>Loading…</p>}

      {!loading && customers.length === 0 && (
        <div className="rpt-empty-state">
          <div className="rpt-empty-icon">👥</div>
          <strong>No customers saved yet</strong>
          <p>
            Customer details are saved when the cashier fills in the Customer form on the POS
            (credit bill, takeaway, or delivery orders). They'll appear here automatically.
          </p>
          <p className="rpt-empty-hint">
            Use customer data for birthday wishes, WhatsApp promotions, and GST invoicing.
          </p>
        </div>
      )}

      {!loading && customers.length > 0 && filtered.length === 0 && (
        <p style={{ color: "#6b7280", fontSize: 13 }}>No customers match "<strong>{q}</strong>".</p>
      )}

      {!loading && filtered.length > 0 && (
        <table className="rpt-table">
          <thead>
            <tr>
              <th>Name</th><th>Phone</th><th>Email</th><th>GSTIN</th>
              <th>Address / Company</th><th>Notes</th><th>Saved On</th>
              <th style={{ width: 72, textAlign: "center" }}>Orders</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <Fragment key={c.id}>
                <tr className={expandedPhone === c.phone && c.phone ? "rpt-cust-row-open" : ""}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.phone
                    ? <a href={`tel:${c.phone}`} style={{ color: "#059669", textDecoration: "none", fontWeight: 600 }}>{c.phone}</a>
                    : <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td>{c.email || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td>{c.gstin
                    ? <span style={{ fontFamily: "monospace", fontSize: 12, background: "#f0fdf4", color: "#166534", padding: "2px 6px", borderRadius: 4 }}>{c.gstin}</span>
                    : <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td>{[c.company, c.address].filter(Boolean).join(" · ") || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td>{c.notes || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td>{c.createdAt
                    ? new Date(c.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                    : "—"}</td>
                  <td style={{ textAlign: "center" }}>
                    {c.phone
                      ? <button
                          className={`rpt-hist-btn${expandedPhone === c.phone ? " open" : ""}`}
                          onClick={() => toggleHistory(c.phone)}>
                          {expandedPhone === c.phone ? "▲" : "📋"}
                        </button>
                      : <span style={{ color: "#9ca3af" }}>—</span>}
                  </td>
                </tr>
                {expandedPhone === c.phone && c.phone && (
                  <tr>
                    <td colSpan={8} style={{ padding: 0, background: "#f8fafc", borderTop: "none" }}>
                      <CustomerOrderHistory data={orderCache[c.phone]} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Waitlist Report ───────────────────────────────────────────────────────────
function WaitlistReport({ dateFrom, dateTo, outletId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ dateFrom, dateTo });
    if (outletId) p.set("outletId", outletId);
    api.get(`/operations/waitlist/history?${p}`)
      .then(res => setEntries(Array.isArray(res) ? res : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, outletId]);

  useEffect(() => { load(); }, [load]);

  const seated   = entries.filter(e => e.status === "seated");
  const noShows  = entries.filter(e => e.status === "no_show");
  const avgWait  = seated.length
    ? Math.round(seated.reduce((s, e) => {
        const mins = e.seatedAt && e.joinedAt
          ? (new Date(e.seatedAt) - new Date(e.joinedAt)) / 60000
          : 0;
        return s + mins;
      }, 0) / seated.length)
    : 0;

  const waitlistHeaders = ["Date & Time", "Name", "Phone", "Party Size", "Status", "Wait (mins)", "Table"];
  const waitlistRows    = entries.map(e => {
    const wait = e.seatedAt && e.joinedAt
      ? Math.round((new Date(e.seatedAt) - new Date(e.joinedAt)) / 60000)
      : "—";
    return [
      new Date(e.joinedAt).toLocaleString("en-IN"),
      e.name, e.phone || "—", e.partySize,
      e.status, wait, e.assignedTableLabel || "—",
    ];
  });
  const waitlistFilename = `waitlist_${dateFrom}_${dateTo}`;

  return (
    <div className="rpt-body">
      <SectionHead eyebrow="Walk-in Queue" title="Waitlist Report" />

      <div className="rpt-kpi-row" style={{ marginBottom: 20 }}>
        <div className="metric-card"><span className="metric-label">Total Parties</span><strong>{entries.length}</strong></div>
        <div className="metric-card"><span className="metric-label">Seated</span><strong style={{ color: "#059669" }}>{seated.length}</strong></div>
        <div className="metric-card"><span className="metric-label">No-shows</span><strong style={{ color: "#dc2626" }}>{noShows.length}</strong></div>
        <div className="metric-card"><span className="metric-label">Avg Wait Time</span><strong>{avgWait ? `${avgWait} mins` : "—"}</strong></div>
      </div>

      {loading && <p style={{ color: "#6b7280" }}>Loading…</p>}
      {!loading && entries.length === 0 && (
        <div className="rpt-empty"><span>🪑</span><p>No waitlist data for this period.</p></div>
      )}
      {!loading && entries.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{entries.length} entries</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="rpt-export-btn" onClick={() => downloadCSV(waitlistFilename, waitlistHeaders, waitlistRows)}>⬇ CSV</button>
              <button className="rpt-export-btn" onClick={() => downloadPDF(waitlistFilename, "Waitlist Report", waitlistHeaders, waitlistRows)}>⬇ PDF</button>
              <button className="rpt-export-btn" onClick={() => downloadExcel(waitlistFilename, waitlistHeaders, waitlistRows)}>⬇ Excel</button>
            </div>
          </div>
          <RptTable
            cols={["Time", "Name", "Party", "Status", "Wait", "Table"]}
            rows={entries.map(e => {
              const wait = e.seatedAt && e.joinedAt
                ? `${Math.round((new Date(e.seatedAt) - new Date(e.joinedAt)) / 60000)} min`
                : "—";
              const statusColor = e.status === "seated" ? "#059669" : e.status === "no_show" ? "#dc2626" : "#6b7280";
              return [
                new Date(e.joinedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }),
                e.name,
                `${e.partySize} pax`,
                <span style={{ color: statusColor, fontWeight: 600 }}>{e.status.replace("_", "-")}</span>,
                wait,
                e.assignedTableLabel || "—",
              ];
            })}
          />
        </>
      )}
    </div>
  );
}

// ── Reports Shell ────────────────────────────────────────────────────────────
const REPORTS = [
  { key: "day-end",    label: "Day End Summary"  },
  { key: "item-sales", label: "Item Sales"        },
  { key: "category",   label: "Category-wise"     },
  { key: "gst",        label: "GST Report"        },
  { key: "payments",   label: "Payment Report"    },
  { key: "discounts",  label: "Discount & Void"   },
  { key: "staff",      label: "Staff Sales"       },
  { key: "incentives", label: "🏆 Incentives"     },
  { key: "orders",     label: "🗄 Order History"  },
  { key: "wastage",    label: "🗑 Wastage"        },
  { key: "voids",      label: "🚫 Voids & Reprints" },
  { key: "waitlist",   label: "🪑 Waitlist"         },
  { key: "customers",  label: "👥 Customers"       },
  { key: "email",      label: "📧 Email Settings" }
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function thisMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getPresets() {
  const fmt = d => d.toISOString().slice(0, 10);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - dayOfWeek);
  const lastWeekEnd = new Date(weekStart); lastWeekEnd.setDate(weekStart.getDate() - 1);
  const lastWeekStart = new Date(lastWeekEnd); lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return [
    { label: "Today",      from: fmt(today),          to: fmt(today) },
    { label: "Yesterday",  from: fmt(yesterday),      to: fmt(yesterday) },
    { label: "This Week",  from: fmt(weekStart),      to: fmt(today) },
    { label: "Last Week",  from: fmt(lastWeekStart),  to: fmt(lastWeekEnd) },
    { label: "This Month", from: fmt(monthStart),     to: fmt(today) },
    { label: "Last Month", from: fmt(lastMonthStart), to: fmt(lastMonthEnd) },
  ];
}

export function ReportsPage() {
  const [active, setActive]   = useState("day-end");
  const reportCache = useRef({});

  // Date range — used by all tabs except GST
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo,   setDateTo]   = useState(todayStr);

  // Month — used only by GST tab
  const [month, setMonth] = useState(thisMonthStr);

  // Outlets — loaded from backend, first entry is "All Outlets"
  const [outlets,    setOutlets]    = useState([{ id: "", name: "All Outlets" }]);
  const [outletId,   setOutletId]   = useState("");   // "" = all outlets

  const [salesData,  setSalesData]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [apiError,   setApiError]   = useState(false);

  // Load real outlets once on mount
  useEffect(() => {
    api.get("/outlets")
      .then(res => {
        const list = Array.isArray(res) ? res : (res?.outlets || []);
        if (list.length) {
          setOutlets([{ id: "", name: "All Outlets" }, ...list.map(o => ({ id: o.id, name: o.name }))]);
        }
      })
      .catch(() => {}); // keep default "All Outlets" on error
  }, []);

  // Fetch reports data whenever date range, outlet or active tab changes.
  // Results are cached per (from, to, outletId) so tab switches don't re-fetch.
  const fetchData = useCallback(() => {
    // Derive API date range: for GST use the full month
    let from = dateFrom;
    let to   = dateTo;
    if (active === "gst" && month) {
      const [y, m] = month.split("-").map(Number);
      from = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      to   = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }

    const cacheKey = `${from}|${to}|${outletId}`;
    if (reportCache.current[cacheKey]) {
      setSalesData(reportCache.current[cacheKey]);
      setApiError(false);
      return;
    }

    const params = new URLSearchParams({ dateFrom: from, dateTo: to });
    if (outletId) params.set("outletId", outletId);

    setLoading(true);
    setApiError(false);
    api.get(`/reports/owner-summary?${params}`)
      .then(res => {
        const data = res?.salesData || null;
        reportCache.current[cacheKey] = data;
        setSalesData(data);
      })
      .catch(() => { setSalesData(null); setApiError(true); })
      .finally(() => setLoading(false));
  }, [active, dateFrom, dateTo, month, outletId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Clear cache when filters change so stale data is never served after a refresh
  useEffect(() => { reportCache.current = {}; }, [dateFrom, dateTo, month, outletId]);

  // Validate: dateFrom must not exceed dateTo
  function handleDateFrom(val) {
    setDateFrom(val);
    if (val > dateTo) setDateTo(val);
  }
  function handleDateTo(val) {
    setDateTo(val);
    if (val < dateFrom) setDateFrom(val);
  }

  const selectedOutletName = outlets.find(o => o.id === outletId)?.name || "All Outlets";

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Reports</h2>
        </div>
        <div className="topbar-actions">
          <button className="oc-export-btn" onClick={printReport}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export PDF
          </button>
        </div>
      </header>

      {/* ── Designer toolbar: REPORT · DATE RANGE · OUTLET ── */}
      <div className="rpt-toolbar-v2">

        {/* REPORT dropdown */}
        <div className="rpt-ctrl-group">
          <span className="rpt-ctrl-label">REPORT</span>
          <div className="rpt-ctrl-wrap">
            <svg className="rpt-ctrl-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <select
              className="rpt-ctrl-select"
              value={active}
              onChange={e => setActive(e.target.value)}
            >
              {REPORTS.map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <svg className="rpt-ctrl-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        {/* DATE RANGE */}
        {active !== "customers" && (
          <div className="rpt-ctrl-group">
            <span className="rpt-ctrl-label">DATE RANGE</span>
            <div className="rpt-ctrl-wrap rpt-date-ctrl-wrap">
              <svg className="rpt-ctrl-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {active === "gst" ? (
                <input type="month" className="rpt-ctrl-date-input" value={month}
                  onChange={e => setMonth(e.target.value)} />
              ) : (
                <>
                  <input type="date" className="rpt-ctrl-date-input" value={dateFrom}
                    max={dateTo} onChange={e => handleDateFrom(e.target.value)} />
                  <span className="rpt-ctrl-date-sep">→</span>
                  <input type="date" className="rpt-ctrl-date-input" value={dateTo}
                    min={dateFrom} max={todayStr()} onChange={e => handleDateTo(e.target.value)} />
                </>
              )}
              <svg className="rpt-ctrl-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            {/* Quick preset chips */}
            {active !== "gst" && (
              <div className="rpt-quick-chips">
                {getPresets().map(p => (
                  <button key={p.label}
                    className={`rpt-quick-chip${dateFrom === p.from && dateTo === p.to ? " active" : ""}`}
                    onClick={() => { setDateFrom(p.from); setDateTo(p.to); }}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* OUTLET dropdown */}
        <div className="rpt-ctrl-group">
          <span className="rpt-ctrl-label">OUTLET</span>
          <div className="rpt-ctrl-wrap">
            <svg className="rpt-ctrl-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <select className="rpt-ctrl-select" value={outletId}
              onChange={e => setOutletId(e.target.value)}>
              {outlets.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <svg className="rpt-ctrl-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        {loading && <span className="rpt-loading-dot" title="Loading…" style={{ alignSelf: "flex-end", marginBottom: 6 }}>⟳</span>}
      </div>

      {apiError && !loading && (
        <div style={{ margin: "12px 16px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 13 }}>
          ⚠ Report data could not be loaded. Check your connection and try again. Figures shown below may be sample data.
        </div>
      )}

      {active === "day-end"    && <DayEndSummary  outlet={selectedOutletName} date={`${dateFrom} – ${dateTo}`} data={salesData?.dayEnd} />}
      {active === "item-sales" && <ItemSalesReport outlet={selectedOutletName} date={`${dateFrom}_${dateTo}`}  data={salesData} />}
      {active === "category"   && <CategoryReport  date={`${dateFrom}_${dateTo}`}                              data={salesData} />}
      {active === "gst"        && <GSTReport        outlet={selectedOutletName} month={month}                  data={salesData} />}
      {active === "payments"   && <PaymentReport    outlet={selectedOutletName} date={`${dateFrom}_${dateTo}`} data={salesData} />}
      {active === "discounts"  && <DiscountVoidReport date={`${dateFrom}_${dateTo}`}                           data={salesData} />}
      {active === "staff"      && <StaffSalesReport        date={`${dateFrom}_${dateTo}`}                            data={salesData} />}
      {active === "incentives" && <CaptainIncentivesReport date={`${dateFrom}_${dateTo}`}                            data={salesData} />}
      {active === "orders"     && <OrderHistoryTab         dateFrom={dateFrom} dateTo={dateTo} outletId={outletId} />}
      {active === "wastage"    && <WastageReport           dateFrom={dateFrom} dateTo={dateTo} outletId={outletId} />}
      {active === "voids"      && <VoidsReprintsReport    dateFrom={dateFrom} dateTo={dateTo} outletId={outletId} />}
      {active === "waitlist"   && <WaitlistReport         dateFrom={dateFrom} dateTo={dateTo} outletId={outletId} />}
      {active === "customers"  && <CustomersTab />}
      {active === "email"      && (
        <div className="rpt-body">
          <EmailTrigger />
        </div>
      )}
    </>
  );
}
