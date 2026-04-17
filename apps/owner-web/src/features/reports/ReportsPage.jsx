import { useState } from "react";
import { OUTLETS, dayEndSeed } from "./reports.seed";

function fmt(n)  { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function pct(a, b) { return b ? ((a / b) * 100).toFixed(1) + "%" : "0%"; }

const PAYMENT_COLORS = {
  Cash: "#4CAF50", UPI: "#2196F3", Card: "#9C27B0",
  Swiggy: "#FF5722", Zomato: "#F44336"
};

// ── Sub-components ──────────────────────────────────────

function KpiCard({ label, value, sub, highlight }) {
  return (
    <div className={`rpt-kpi${highlight ? " rpt-kpi-hi" : ""}`}>
      <span className="rpt-kpi-label">{label}</span>
      <strong className="rpt-kpi-value">{value}</strong>
      {sub && <span className="rpt-kpi-sub">{sub}</span>}
    </div>
  );
}

function SectionHead({ title, eyebrow }) {
  return (
    <div className="rpt-section-head">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h3>{title}</h3>
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

// ── Day End Summary ─────────────────────────────────────

function DayEndSummary({ outlet, date }) {
  const d = dayEndSeed; // In production: filter by outlet + date from localStorage/API

  const totalOrders = d.orderTypes.reduce((s, t) => s + t.orders, 0);
  const totalPayAmt  = d.paymentModes.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="rpt-body">

      {/* KPIs */}
      <div className="rpt-kpi-row">
        <KpiCard label="Total Sales"       value={fmt(d.summary.totalSales)}        sub={`${d.summary.totalOrders} orders`} highlight />
        <KpiCard label="Avg Order Value"   value={fmt(d.summary.avgOrderValue)}      sub="per bill" />
        <KpiCard label="Net After Discount" value={fmt(d.summary.netAfterDiscount)}  sub={`Saved ${fmt(d.summary.totalDiscount)}`} />
        <KpiCard label="Total Tax (GST)"   value={fmt(d.summary.totalTax)}           sub="CGST + SGST" />
        <KpiCard label="Cancellations"     value={d.summary.totalCancelled}          sub={fmt(d.summary.cancelledValue)} />
      </div>

      {/* Payment modes + Order types */}
      <div className="rpt-two-col">

        <div className="panel rpt-panel">
          <SectionHead title="Payment Mode Breakdown" eyebrow="How customers paid" />
          <div className="rpt-bars">
            {d.paymentModes.map(p => (
              <BarRow key={p.mode} label={p.mode} value={p.orders}
                total={d.summary.totalOrders} amount={p.amount}
                color={PAYMENT_COLORS[p.mode]} />
            ))}
          </div>
          <div className="rpt-panel-total">
            <span>Total</span><strong>{fmt(totalPayAmt)}</strong>
          </div>
        </div>

        <div className="panel rpt-panel">
          <SectionHead title="Order Type Breakdown" eyebrow="Dine In · Takeaway · Delivery" />
          <div className="rpt-order-types">
            {d.orderTypes.map(t => (
              <div key={t.type} className="rpt-type-card">
                <div className="rpt-type-icon">
                  {t.type === "Dine In" ? "🍽️" : t.type === "Takeaway" ? "🛍️" : "🛵"}
                </div>
                <div className="rpt-type-info">
                  <strong>{t.type}</strong>
                  <span>{t.orders} orders</span>
                </div>
                <div className="rpt-type-right">
                  <strong>{fmt(t.amount)}</strong>
                  <span>{pct(t.amount, d.summary.totalSales)}</span>
                </div>
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

      {/* Category-wise */}
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

      {/* Item-wise table */}
      <div className="panel rpt-panel">
        <SectionHead title="Item-wise Sales" eyebrow="All items sold today" />
        <div className="rpt-table-wrap">
          <div className="rpt-table-head rpt-items-cols">
            <span>#</span>
            <span>Item Name</span>
            <span>Category</span>
            <span>Qty Sold</span>
            <span>Rate (₹)</span>
            <span>Amount (₹)</span>
            <span>% of Sales</span>
          </div>
          {[...d.items].sort((a, b) => b.amount - a.amount).map((item, i) => (
            <div key={item.name} className={`rpt-table-row rpt-items-cols${i % 2 === 1 ? " rpt-row-alt" : ""}`}>
              <span className="rpt-row-num">{i + 1}</span>
              <span><strong>{item.name}</strong></span>
              <span className="rpt-tag">{item.category}</span>
              <span>{item.qty}</span>
              <span>{fmt(item.rate)}</span>
              <span><strong>{fmt(item.amount)}</strong></span>
              <span>
                <div className="rpt-inline-bar">
                  <div style={{ width: pct(item.amount, d.summary.totalSales), background: "#1a7a3a", height: "100%", borderRadius: 3 }} />
                </div>
                <span className="rpt-pct-label">{pct(item.amount, d.summary.totalSales)}</span>
              </span>
            </div>
          ))}
          <div className="rpt-table-foot rpt-items-cols">
            <span />
            <span><strong>Total</strong></span>
            <span />
            <span><strong>{d.items.reduce((s, i) => s + i.qty, 0)}</strong></span>
            <span />
            <span><strong>{fmt(d.items.reduce((s, i) => s + i.amount, 0))}</strong></span>
            <span />
          </div>
        </div>
      </div>

      {/* Tax + Discount */}
      <div className="rpt-two-col">

        <div className="panel rpt-panel">
          <SectionHead title="Tax Summary" eyebrow="GST Breakdown" />
          <div className="rpt-summary-list">
            <div className="rpt-summary-row"><span>Taxable Amount</span><strong>{fmt(d.tax.taxableAmount)}</strong></div>
            <div className="rpt-summary-row"><span>CGST</span><strong>{fmt(d.tax.cgst)}</strong></div>
            <div className="rpt-summary-row"><span>SGST</span><strong>{fmt(d.tax.sgst)}</strong></div>
            {d.tax.igst > 0 && <div className="rpt-summary-row"><span>IGST</span><strong>{fmt(d.tax.igst)}</strong></div>}
            {d.tax.cess > 0 && <div className="rpt-summary-row"><span>Cess</span><strong>{fmt(d.tax.cess)}</strong></div>}
            <div className="rpt-summary-row rpt-summary-total"><span>Total GST</span><strong>{fmt(d.tax.totalTax)}</strong></div>
          </div>
        </div>

        <div className="panel rpt-panel">
          <SectionHead title="Discount Summary" eyebrow="All discounts applied today" />
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

      {/* Cancellations */}
      <div className="panel rpt-panel">
        <SectionHead title="Cancellations &amp; Voids" eyebrow={`${d.cancellations.length} bills cancelled today`} />
        <div className="rpt-table-wrap">
          <div className="rpt-table-head rpt-cancel-cols">
            <span>Bill No</span><span>Outlet</span><span>Amount</span>
            <span>Reason</span><span>Time</span>
          </div>
          {d.cancellations.map(c => (
            <div key={c.bill} className="rpt-table-row rpt-cancel-cols">
              <span><strong>{c.bill}</strong></span>
              <span>{c.outlet}</span>
              <span className="rpt-disc-amt">{fmt(c.amount)}</span>
              <span>{c.reason}</span>
              <span className="rpt-muted">{c.time}</span>
            </div>
          ))}
          <div className="rpt-table-foot rpt-cancel-cols">
            <span /><span><strong>Total</strong></span>
            <span><strong>{fmt(d.cancellations.reduce((s, c) => s + c.amount, 0))}</strong></span>
            <span /><span />
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Reports Shell ───────────────────────────────────────

const REPORTS = [
  { key: "day-end", label: "Day End Summary" },
  // Future reports added here
];

export function ReportsPage() {
  const [activeReport, setActiveReport] = useState("day-end");
  const [outlet, setOutlet] = useState("All Outlets");
  const [date, setDate]     = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Reports</h2>
        </div>
        <div className="topbar-actions">
          <button className="ghost-btn" onClick={() => window.print()}>Export PDF</button>
        </div>
      </header>

      {/* Report nav + filters */}
      <div className="rpt-toolbar">
        <div className="rpt-nav">
          {REPORTS.map(r => (
            <button key={r.key}
              className={`rpt-nav-btn${activeReport === r.key ? " active" : ""}`}
              onClick={() => setActiveReport(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="rpt-filters">
          <input type="date" className="rpt-date-input" value={date}
            onChange={e => setDate(e.target.value)} />
          <select className="rpt-outlet-select" value={outlet}
            onChange={e => setOutlet(e.target.value)}>
            {OUTLETS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {activeReport === "day-end" && <DayEndSummary outlet={outlet} date={date} />}
    </>
  );
}
