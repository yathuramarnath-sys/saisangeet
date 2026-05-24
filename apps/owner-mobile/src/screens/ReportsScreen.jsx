import { useEffect, useState } from "react";
import { api } from "../lib/api";

function fmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const RANGES = [
  { label: "Today",     days: 0 },
  { label: "Yesterday", days: 1 },
  { label: "7 Days",    days: 7 },
  { label: "30 Days",   days: 30 },
];

const REPORT_TABS = ["Sales", "Items", "Payments", "Staff"];

function getDateRange(days) {
  const to   = new Date();
  const from = new Date();
  if (days === 0) {
    return { dateFrom: to.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) };
  }
  if (days === 1) {
    from.setDate(from.getDate() - 1);
    return { dateFrom: from.toISOString().slice(0, 10), dateTo: from.toISOString().slice(0, 10) };
  }
  from.setDate(from.getDate() - (days - 1));
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) };
}

export function ReportsScreen() {
  const [rangeIdx, setRangeIdx]   = useState(0);
  const [reportTab, setReportTab] = useState("Sales");
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    const { dateFrom, dateTo } = getDateRange(RANGES[rangeIdx].days);
    api.get(`/reports/owner-summary?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [rangeIdx]);

  const sd         = data?.salesData || {};
  const daySummary = sd?.dayEnd?.summary || {};
  const payModes   = sd?.payment?.modes  || [];
  const itemSales  = sd?.itemSales || [];
  const staffSales = sd?.staffSales || data?.salesData?.staffSales || [];
  const findMode   = (name) => payModes.find(m => m.mode === name)?.amount || 0;

  const totalSales  = daySummary.totalSales  ?? 0;
  const totalOrders = daySummary.totalOrders ?? 0;
  const avgBill     = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;
  const totalTax    = daySummary.totalTax    ?? 0;
  const totalDisc   = daySummary.totalDiscount ?? 0;

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Reports</h2>
      </div>

      {/* Date range selector */}
      <div className="range-tabs">
        {RANGES.map((r, i) => (
          <button key={r.label} className={`range-tab ${rangeIdx === i ? "active" : ""}`}
            onClick={() => setRangeIdx(i)}>{r.label}</button>
        ))}
      </div>

      {/* Report type tabs */}
      <div className="report-tabs">
        {REPORT_TABS.map(t => (
          <button key={t} className={`report-tab ${reportTab === t ? "active" : ""}`}
            onClick={() => setReportTab(t)}>{t}</button>
        ))}
      </div>

      {loading ? <div className="loading-state">Loading…</div> : (

        <>
          {/* ── SALES TAB ── */}
          {reportTab === "Sales" && (
            <div style={{ padding: "0 16px" }}>
              <div className="report-summary-grid">
                <div className="rscard green">
                  <p className="rsc-val">{fmt(totalSales)}</p>
                  <p className="rsc-label">Total Sales</p>
                </div>
                <div className="rscard blue">
                  <p className="rsc-val">{totalOrders}</p>
                  <p className="rsc-label">Orders</p>
                </div>
                <div className="rscard purple">
                  <p className="rsc-val">{fmt(avgBill)}</p>
                  <p className="rsc-label">Avg Bill</p>
                </div>
                <div className="rscard orange">
                  <p className="rsc-val">{fmt(totalTax)}</p>
                  <p className="rsc-label">GST</p>
                </div>
                <div className="rscard red">
                  <p className="rsc-val">{fmt(totalDisc)}</p>
                  <p className="rsc-label">Discounts</p>
                </div>
                <div className="rscard teal">
                  <p className="rsc-val">{fmt(totalSales - totalDisc)}</p>
                  <p className="rsc-label">Net Sales</p>
                </div>
              </div>

              {/* Order type breakdown */}
              {(sd?.dayEnd?.orderTypes || []).length > 0 && (
                <div className="section-card" style={{ marginTop: 16 }}>
                  <h3 className="section-title">Order Types</h3>
                  {(sd.dayEnd.orderTypes || []).map(t => (
                    <div className="report-row" key={t.type}>
                      <span className="rrow-label">{t.type}</span>
                      <span className="rrow-orders">{t.orders} orders</span>
                      <span className="rrow-val">{fmt(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ITEMS TAB ── */}
          {reportTab === "Items" && (
            <div style={{ padding: "0 16px" }}>
              {itemSales.length === 0 ? (
                <div className="empty-state"><p>No item sales for this period.</p></div>
              ) : (
                <div className="section-card">
                  <h3 className="section-title">Item Sales ({itemSales.length} items)</h3>
                  {itemSales
                    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
                    .map((item, i) => (
                      <div className="item-row" key={item.name}>
                        <span className="item-rank">{i + 1}</span>
                        <div className="item-info">
                          <p className="item-name">{item.name}</p>
                          <p className="item-qty">{item.qty || 0} sold · {item.category || ""}</p>
                        </div>
                        <p className="item-rev">{fmt(item.amount)}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ── PAYMENTS TAB ── */}
          {reportTab === "Payments" && (
            <div style={{ padding: "0 16px" }}>
              <div className="section-card">
                <h3 className="section-title">Payment Modes</h3>
                {payModes.length === 0 ? (
                  <p style={{ color: "var(--text3)", fontSize: 13 }}>No payment data.</p>
                ) : payModes.map(m => {
                  const p = totalSales > 0 ? Math.round((m.amount / totalSales) * 100) : 0;
                  const colors = { Cash: "#16a34a", Upi: "#2563eb", Card: "#7c3aed" };
                  const c = colors[m.mode] || "#6b7280";
                  return (
                    <div className="pay-row" key={m.mode}>
                      <span className="pay-label">{m.mode}</span>
                      <div className="pay-bar-wrap">
                        <div className="pay-bar" style={{ width: `${p}%`, background: c }} />
                      </div>
                      <span className="pay-val">{fmt(m.amount)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="section-card" style={{ marginTop: 0 }}>
                <div className="report-row">
                  <span className="rrow-label">Total Collected</span>
                  <span className="rrow-val" style={{ fontWeight: 800 }}>{fmt(sd?.payment?.summary?.totalCollected ?? totalSales)}</span>
                </div>
                <div className="report-row">
                  <span className="rrow-label">Cash</span>
                  <span className="rrow-val">{fmt(sd?.payment?.summary?.cashAmount ?? findMode("Cash"))}</span>
                </div>
                <div className="report-row">
                  <span className="rrow-label">Digital (UPI + Card)</span>
                  <span className="rrow-val">{fmt(findMode("Upi") + findMode("Card"))}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── STAFF TAB ── */}
          {reportTab === "Staff" && (
            <div style={{ padding: "0 16px" }}>
              {staffSales.length === 0 ? (
                <div className="empty-state"><p>No staff sales data for this period.</p></div>
              ) : (
                <div className="section-card">
                  <h3 className="section-title">Cashier Performance</h3>
                  {staffSales.map((s, i) => (
                    <div className="staff-report-row" key={i}>
                      <div className="staff-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                        {(s.cashier || "?")[0].toUpperCase()}
                      </div>
                      <div className="item-info">
                        <p className="item-name">{s.cashier}</p>
                        <p className="item-qty">{s.outlet} · {s.orders} orders</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p className="item-rev">{fmt(s.sales)}</p>
                        {s.discounts > 0 && <p style={{ fontSize: 11, color: "#e11d48" }}>-{fmt(s.discounts)} disc</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
