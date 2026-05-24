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

function getDateRange(days) {
  const to   = new Date();
  const from = new Date();
  if (days === 0) {
    return {
      dateFrom: to.toISOString().slice(0, 10),
      dateTo:   to.toISOString().slice(0, 10),
    };
  }
  if (days === 1) {
    from.setDate(from.getDate() - 1);
    return {
      dateFrom: from.toISOString().slice(0, 10),
      dateTo:   from.toISOString().slice(0, 10),
    };
  }
  from.setDate(from.getDate() - (days - 1));
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo:   to.toISOString().slice(0, 10),
  };
}

export function SalesScreen() {
  const [rangeIdx, setRangeIdx] = useState(0);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    const { dateFrom, dateTo } = getDateRange(RANGES[rangeIdx].days);
    api.get(`/reports/owner-summary?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [rangeIdx]);

  const items    = data?.topItems    || data?.itemSales    || [];
  const payments = data?.paymentBreakdown || null;
  const revenue  = data?.totalRevenue ?? data?.total ?? 0;
  const orders   = data?.orderCount   ?? data?.orders ?? 0;

  // Normalize top items
  const topItems = items
    .slice(0, 8)
    .sort((a, b) => (b.revenue || b.total || 0) - (a.revenue || a.total || 0));
  const maxRevenue = topItems[0] ? (topItems[0].revenue || topItems[0].total || 1) : 1;

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Sales</h2>
      </div>

      {/* Range tabs */}
      <div className="range-tabs">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            className={`range-tab ${rangeIdx === i ? "active" : ""}`}
            onClick={() => setRangeIdx(i)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">Loading…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="summary-row">
            <div className="summary-card">
              <p className="sc-val">{fmt(revenue)}</p>
              <p className="sc-label">Revenue</p>
            </div>
            <div className="summary-card">
              <p className="sc-val">{orders}</p>
              <p className="sc-label">Orders</p>
            </div>
            <div className="summary-card">
              <p className="sc-val">{fmt(orders > 0 ? revenue / orders : 0)}</p>
              <p className="sc-label">Avg Bill</p>
            </div>
          </div>

          {/* Payment breakdown */}
          {payments && (
            <div className="section-card">
              <h3 className="section-title">Payment Breakdown</h3>
              {[
                { label: "Cash", val: payments.cash || 0,   color: "#059669" },
                { label: "UPI",  val: payments.upi  || 0,   color: "#0891b2" },
                { label: "Card", val: payments.card || 0,   color: "#d97706" },
                { label: "Credit", val: payments.credit || 0, color: "#7c3aed" },
              ].map(({ label, val, color }) => {
                const pct = revenue > 0 ? Math.round((val / revenue) * 100) : 0;
                return (
                  <div className="pay-row" key={label}>
                    <span className="pay-label">{label}</span>
                    <div className="pay-bar-wrap">
                      <div className="pay-bar" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="pay-val">{fmt(val)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Top items */}
          {topItems.length > 0 && (
            <div className="section-card">
              <h3 className="section-title">Top Items</h3>
              {topItems.map((item, i) => {
                const rev = item.revenue || item.total || 0;
                const qty = item.quantity || item.qty || 0;
                const pct = Math.round((rev / maxRevenue) * 100);
                return (
                  <div className="item-row" key={item.name || i}>
                    <span className="item-rank">{i + 1}</span>
                    <div className="item-info">
                      <p className="item-name">{item.name || item.itemName}</p>
                      <div className="item-bar-wrap">
                        <div className="item-bar" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="item-stats">
                      <p className="item-rev">{fmt(rev)}</p>
                      <p className="item-qty">{qty} sold</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
