import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api";
import {
  dayEndSeed, itemSalesSeed, gstSeed, paymentSeed, discountVoidSeed, staffSalesSeed,
  categorySalesSeed
} from "./reports.seed";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n)     { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function pct(a, b)  { return b ? ((a / b) * 100).toFixed(1) + "%" : "0%"; }

function downloadCSV(filename, headers, rows) {
  const lines = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))];
  const blob  = new Blob([lines.join("\n")], { type: "text/csv" });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href = url; a.download = filename + ".csv"; a.click();
  URL.revokeObjectURL(url);
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

function ExportBar({ onPDF, onCSV }) {
  return (
    <div className="rpt-export-bar">
      <button className="rpt-export-btn" onClick={onPDF}>⬇ PDF</button>
      <button className="rpt-export-btn" onClick={onCSV}>⬇ Excel / CSV</button>
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

// ── 1. Day End Summary ───────────────────────────────────────────────────────
function DayEndSummary({ outlet, date, data }) {
  const d = data || dayEndSeed;
  const totalPayAmt = d.paymentModes.reduce((s, p) => s + p.amount, 0);

  function exportCSV() {
    downloadCSV(`DayEndSummary_${date}`, ["Item", "Category", "Qty", "Rate", "Amount"],
      d.items.map(i => [i.name, i.category, i.qty, i.rate, i.amount]));
  }

  return (
    <div className="rpt-body">
      <ExportBar onPDF={printReport} onCSV={exportCSV} />

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
  const [cat, setCat] = useState("All");
  const items = data?.itemSales?.length ? data.itemSales : itemSalesSeed;
  const cats = ["All", ...new Set(items.map(i => i.category))];
  const filtered = cat === "All" ? items : items.filter(i => i.category === cat);
  const totalAmt = items.reduce((s, i) => s + i.amount, 0);
  const mostSold   = data?.mostSoldItem;
  const topRevenue = data?.topRevenueItem;

  function exportCSV() {
    downloadCSV(`ItemSales_${date}`,
      ["Rank", "Item", "Category", "Qty Sold", "Orders", "Rate", "Amount", "% of Sales"],
      filtered.map(i => [i.rank, i.name, i.category, i.qty, i.orders, i.rate, i.amount,
        pct(i.amount, totalAmt)])
    );
  }

  return (
    <div className="rpt-body">
      <ExportBar onPDF={printReport} onCSV={exportCSV} />
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

  function exportCSV() {
    downloadCSV(`GST_${d.month.replace(" ", "_")}`,
      ["Date", "Bills", "Taxable Amount", "CGST", "SGST", "Total GST"],
      d.daily.map(r => [r.date, r.bills, r.taxable, r.cgst, r.sgst, r.total])
    );
  }

  return (
    <div className="rpt-body">
      <ExportBar onPDF={printReport} onCSV={exportCSV} />
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
  const d = (data?.payment?.summary?.totalCollected > 0 ? data.payment : null) || paymentSeed;
  const maxHourly = Math.max(...d.hourly.map(h => h.total));

  function exportCSV() {
    downloadCSV(`PaymentReport_${date}`,
      ["Outlet", "Cash", "UPI", "Card", "Swiggy", "Zomato", "Total", "Variance"],
      d.outletReconciliation.map(r => [r.outlet, r.cash, r.upi, r.card, r.swiggy, r.zomato, r.total, r.cashierVariance])
    );
  }

  return (
    <div className="rpt-body">
      <ExportBar onPDF={printReport} onCSV={exportCSV} />
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

  function exportCSV() {
    downloadCSV(`DiscountVoid_${date}`,
      ["Bill", "Outlet", "Cashier", "Type", "Amount", "Approved By", "Time"],
      d.discountLog.map(r => [r.bill, r.outlet, r.cashier, r.type, r.amount, r.approved, r.time])
    );
  }

  return (
    <div className="rpt-body">
      <ExportBar onPDF={printReport} onCSV={exportCSV} />
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
  const d = (data?.staffSales?.length ? data.staffSales : null) || staffSalesSeed;

  function exportCSV() {
    downloadCSV(`StaffSales_${date}`,
      ["Cashier", "Outlet", "Session", "Orders", "Sales", "Discounts", "Voids", "Opening Cash", "Closing Cash", "Variance"],
      d.map(r => [r.cashier, r.outlet, r.session, r.orders, r.sales, r.discounts, r.voids, r.openingCash, r.closingCash, r.variance])
    );
  }

  return (
    <div className="rpt-body">
      <ExportBar onPDF={printReport} onCSV={exportCSV} />
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

  function exportCSV() {
    downloadCSV(`CategorySales_${date}`,
      ["Category", "Items", "Qty Sold", "Orders", "Avg Rate (₹)", "Amount (₹)", "% of Sales"],
      d.categories.map(c => [c.name, c.itemCount, c.qty, c.orders, c.avgRate, c.amount, pct(c.amount, totalAmt)])
    );
  }

  return (
    <div className="rpt-body">
      <ExportBar onPDF={printReport} onCSV={exportCSV} />

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

// ── Order History Tab ─────────────────────────────────────────────────────────
// Paginated bill list backed by GET /reports/orders (Postgres for history,
// in-memory for today).  One row per closed bill.
function OrderHistoryTab({ dateFrom, dateTo, outletId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [page,    setPage]    = useState(1);
  const [detail,  setDetail]  = useState(null);  // expanded order detail
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

  function handleCSV() {
    if (!data?.orders?.length) return;
    downloadCSV(
      `bills_${dateFrom}_${dateTo}`,
      ["Bill No", "Date", "Time", "Table", "Outlet", "Items", "Net (₹)", "Paid (₹)", "Method", "Cashier"],
      data.orders.map(o => [o.billNo, o.date, o.time, o.tableNumber, o.outletName,
        o.items, o.net, o.totalPaid, o.paymentMethods, o.cashierName])
    );
  }

  const orders = data?.orders || [];
  const total  = data?.total  || 0;
  const pages  = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="rpt-body">
      <SectionHead eyebrow="Order History" title="Closed Bills" />
      <div className="rpt-oh-toolbar">
        <span className="rpt-oh-count">{total} bills found</span>
        <span className="rpt-oh-src">{data?.source === "postgres" ? "🗄 Postgres" : "⚡ Live"}</span>
        <button className="rpt-export-btn" onClick={handleCSV} disabled={!orders.length}>⬇ CSV</button>
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
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <tr key={i}>
                  <td><strong>{o.billNo}</strong></td>
                  <td>{o.date}</td>
                  <td>{o.time}</td>
                  <td>{o.tableNumber}</td>
                  <td>{o.outletName}</td>
                  <td>{o.items}</td>
                  <td>{fmt(o.net)}</td>
                  <td>{fmt(o.totalPaid)}</td>
                  <td><span className="rpt-method-pill">{o.paymentMethods}</span></td>
                  <td>{o.cashierName}</td>
                  <td>
                    <button className="rpt-oh-detail-btn"
                      onClick={() => setDetail(detail?.closedAt === o.closedAt ? null : o)}>
                      {detail?.closedAt === o.closedAt ? "▲" : "▼"}
                    </button>
                  </td>
                </tr>
              ))}
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
            {(detail._order?.payments || []).map((p, i) => (
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
  { key: "orders",     label: "🗄 Order History"  },
  { key: "email",      label: "📧 Email Settings" }
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function thisMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ReportsPage() {
  const [active, setActive]   = useState("day-end");

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

  // Fetch reports data whenever date range, outlet or active tab changes
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

    const params = new URLSearchParams({ dateFrom: from, dateTo: to });
    if (outletId) params.set("outletId", outletId);

    setLoading(true);
    api.get(`/reports/owner-summary?${params}`)
      .then(res => { if (res?.salesData) setSalesData(res.salesData); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [active, dateFrom, dateTo, month, outletId]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
          <p className="eyebrow">Owner Setup</p>
          <h2>Reports</h2>
        </div>
        <div className="topbar-actions">
          <button className="ghost-btn" onClick={printReport}>⬇ Export PDF</button>
        </div>
      </header>

      <div className="rpt-toolbar">
        <div className="rpt-nav">
          {REPORTS.map(r => (
            <button key={r.key}
              className={`rpt-nav-btn${active === r.key ? " active" : ""}`}
              onClick={() => setActive(r.key)}>
              {r.label}
            </button>
          ))}
        </div>

        <div className="rpt-filters">
          {active === "gst" ? (
            /* GST uses a month picker — range derived automatically */
            <input type="month" className="rpt-date-input" value={month}
              onChange={e => setMonth(e.target.value)} />
          ) : (
            /* All other tabs: from → to date range */
            <div className="rpt-date-range">
              <label className="rpt-date-label">From</label>
              <input type="date" className="rpt-date-input" value={dateFrom}
                max={dateTo} onChange={e => handleDateFrom(e.target.value)} />
              <span className="rpt-date-sep">→</span>
              <label className="rpt-date-label">To</label>
              <input type="date" className="rpt-date-input" value={dateTo}
                min={dateFrom} max={todayStr()} onChange={e => handleDateTo(e.target.value)} />
            </div>
          )}

          <select className="rpt-outlet-select" value={outletId}
            onChange={e => setOutletId(e.target.value)}>
            {outlets.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          {loading && <span className="rpt-loading-dot" title="Loading…">⟳</span>}
        </div>
      </div>

      {active === "day-end"    && <DayEndSummary  outlet={selectedOutletName} date={`${dateFrom} – ${dateTo}`} data={salesData?.dayEnd} />}
      {active === "item-sales" && <ItemSalesReport outlet={selectedOutletName} date={`${dateFrom}_${dateTo}`}  data={salesData} />}
      {active === "category"   && <CategoryReport  date={`${dateFrom}_${dateTo}`}                              data={salesData} />}
      {active === "gst"        && <GSTReport        outlet={selectedOutletName} month={month}                  data={salesData} />}
      {active === "payments"   && <PaymentReport    outlet={selectedOutletName} date={`${dateFrom}_${dateTo}`} data={salesData} />}
      {active === "discounts"  && <DiscountVoidReport date={`${dateFrom}_${dateTo}`}                           data={salesData} />}
      {active === "staff"      && <StaffSalesReport  date={`${dateFrom}_${dateTo}`}                            data={salesData} />}
      {active === "orders"     && <OrderHistoryTab   dateFrom={dateFrom} dateTo={dateTo} outletId={outletId} />}
      {active === "email"      && (
        <div className="rpt-body">
          <EmailTrigger />
        </div>
      )}
    </>
  );
}
