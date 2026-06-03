/**
 * DayEndModal — Day End Report
 *
 * Pre-checks before showing report:
 *  1. No active table orders
 *  2. No hold orders
 *  3. No unsent KOT items
 *
 * Report shows:
 *  - Total bills / sales / discounts
 *  - Payment breakdown
 *  - Top 5 selling items
 *  - Category-wise sales
 *  - Print to bill printer
 */
import { useState, useEffect } from "react";
import { api } from "../lib/api";

function fmt(n) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const METHOD_LABELS = {
  cash:    "Cash",
  card:    "Card",
  upi:     "UPI",
  phonepe: "PhonePe",
  credit:  "Credit",
  online:  "Online",
};

export function DayEndModal({ orders, outlet, onClose, onPrint }) {
  const [stage,   setStage]   = useState("checking"); // checking | blocked | loading | ready | error
  const [blocks,  setBlocks]  = useState([]);
  const [report,  setReport]  = useState(null);
  const [printing,setPrinting]= useState(false);

  useEffect(() => {
    runPreChecks();
  }, []);

  function runPreChecks() {
    setStage("checking");
    const issues = [];

    for (const [tableId, order] of Object.entries(orders)) {
      if (order.isClosed) continue;
      const activeItems = (order.items || []).filter(i => !i.isVoided && !i.isGhostVoid);
      if (activeItems.length === 0) continue;

      const label = order.tableNumber
        ? `Table ${order.tableNumber}`
        : tableId.startsWith("counter-") ? `Counter #${order.orderNumber || tableId}`
        : tableId.startsWith("online-")  ? `Online order`
        : `Table ${order.tableNumber || tableId}`;

      if (order.isOnHold) {
        issues.push(`${label} — on hold`);
        continue;
      }

      const unsentItems = activeItems.filter(i => !i.sentToKot);
      if (unsentItems.length > 0) {
        issues.push(`${label} — ${unsentItems.length} item(s) not sent to KOT`);
        continue;
      }

      issues.push(`${label} — order not settled (${activeItems.length} item(s))`);
    }

    if (issues.length > 0) {
      setBlocks(issues);
      setStage("blocked");
    } else {
      loadReport();
    }
  }

  async function loadReport() {
    setStage("loading");
    try {
      const data = await api.get(`/operations/day-end?outletId=${outlet?.id || ""}`);
      setReport(data);
      setStage("ready");
    } catch (err) {
      setStage("error");
    }
  }

  async function handlePrint() {
    if (!report) return;
    setPrinting(true);
    try {
      await onPrint(report);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="dayend-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dayend-modal">

        {/* Header */}
        <div className="dayend-head">
          <div>
            <h2>📊 Day End Report</h2>
            {report && <p className="dayend-date">{report.date}</p>}
          </div>
          <button type="button" className="dayend-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Checking ── */}
        {stage === "checking" && (
          <div className="dayend-center">
            <span className="pos-spinner" />
            <p>Checking all orders…</p>
          </div>
        )}

        {/* ── Blocked ── */}
        {stage === "blocked" && (
          <div className="dayend-blocked">
            <div className="dayend-blocked-icon">⚠️</div>
            <h3>Cannot close day yet</h3>
            <p>Please clear the following before printing Day End:</p>
            <ul className="dayend-block-list">
              {blocks.map((b, i) => <li key={i}>• {b}</li>)}
            </ul>
            <button type="button" className="dayend-retry-btn" onClick={onClose}>
              Go back and clear
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {stage === "loading" && (
          <div className="dayend-center">
            <span className="pos-spinner" />
            <p>Loading today's report…</p>
          </div>
        )}

        {/* ── Error ── */}
        {stage === "error" && (
          <div className="dayend-center">
            <p>❌ Failed to load report. Check connection.</p>
            <button type="button" className="dayend-retry-btn" onClick={loadReport}>Retry</button>
          </div>
        )}

        {/* ── Ready ── */}
        {stage === "ready" && report && (
          <>
            <div className="dayend-body">

              {/* Summary row */}
              <div className="dayend-summary-row">
                <div className="dayend-summary-box">
                  <span className="dayend-summary-label">Total Bills</span>
                  <span className="dayend-summary-value">{report.totalBills}</span>
                </div>
                <div className="dayend-summary-box green">
                  <span className="dayend-summary-label">Total Sales</span>
                  <span className="dayend-summary-value">{fmt(report.totalSales)}</span>
                </div>
                <div className="dayend-summary-box red">
                  <span className="dayend-summary-label">Discounts</span>
                  <span className="dayend-summary-value">{fmt(report.totalDiscount)}</span>
                </div>
                <div className="dayend-summary-box orange">
                  <span className="dayend-summary-label">Void / Comp</span>
                  <span className="dayend-summary-value">{fmt(report.totalVoidComp)}</span>
                </div>
              </div>

              <div className="dayend-columns">

                {/* Payment breakdown */}
                <div className="dayend-section">
                  <div className="dayend-section-title">💳 Payment Breakdown</div>
                  {Object.entries(report.paymentTotals || {}).length === 0
                    ? <p className="dayend-empty">No payments today</p>
                    : Object.entries(report.paymentTotals).map(([method, amount]) => (
                      <div key={method} className="dayend-row">
                        <span>{METHOD_LABELS[method] || method}</span>
                        <span className="dayend-row-val">{fmt(amount)}</span>
                      </div>
                    ))
                  }
                </div>

                {/* Top 5 items */}
                <div className="dayend-section">
                  <div className="dayend-section-title">🏆 Top 5 Items</div>
                  {(report.top5 || []).length === 0
                    ? <p className="dayend-empty">No items sold today</p>
                    : report.top5.map((item, i) => (
                      <div key={i} className="dayend-row">
                        <span className="dayend-item-name">
                          <span className="dayend-rank">#{i + 1}</span> {item.name}
                          <span className="dayend-qty"> ×{item.qty}</span>
                        </span>
                        <span className="dayend-row-val">{fmt(item.revenue)}</span>
                      </div>
                    ))
                  }
                </div>

                {/* Category sales */}
                <div className="dayend-section">
                  <div className="dayend-section-title">📂 Category Sales</div>
                  {(report.categories || []).length === 0
                    ? <p className="dayend-empty">No sales today</p>
                    : report.categories.map((cat, i) => (
                      <div key={i} className="dayend-row">
                        <span>{cat.name}</span>
                        <span className="dayend-row-val">{fmt(cat.revenue)}</span>
                      </div>
                    ))
                  }
                  <div className="dayend-row total">
                    <span>TOTAL</span>
                    <span className="dayend-row-val">{fmt(report.totalSales)}</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="dayend-footer">
              <button type="button" className="dayend-print-btn"
                onClick={handlePrint} disabled={printing}>
                {printing ? <><span className="pos-spinner" /> Printing…</> : "🖨 Print Day End"}
              </button>
              <button type="button" className="dayend-close-btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
