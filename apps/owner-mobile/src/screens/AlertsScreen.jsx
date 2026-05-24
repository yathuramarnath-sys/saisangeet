import { useEffect, useState } from "react";
import { api } from "../lib/api";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hrs   = Math.floor(mins / 60);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function buildAlerts(shifts, orders) {
  const alerts = [];

  // Shift events
  for (const s of shifts) {
    if (s.openedAt) {
      alerts.push({
        id:    `shift-open-${s.id}`,
        type:  "shift",
        icon:  "🟢",
        title: "Shift Opened",
        desc:  `${s.cashierName || s.openedBy || "Cashier"} · ${s.outletName || ""}`,
        time:  s.openedAt,
      });
    }
    if (s.closedAt) {
      alerts.push({
        id:    `shift-close-${s.id}`,
        type:  "shift",
        icon:  "🔴",
        title: "Shift Closed",
        desc:  `${s.cashierName || s.closedBy || "Cashier"} · ₹${Number(s.totalSales || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
        time:  s.closedAt,
      });
    }
  }

  // Large bills (₹2000+)
  for (const o of orders) {
    const total = o.total || o.grandTotal || 0;
    if (total >= 2000) {
      alerts.push({
        id:    `big-bill-${o.id}`,
        type:  "sale",
        icon:  "💰",
        title: "Large Bill",
        desc:  `₹${Number(total).toLocaleString("en-IN", { maximumFractionDigits: 0 })} · ${o.tableName || o.orderType || "Order"}`,
        time:  o.closedAt || o.settledAt,
      });
    }
    // Voids / comps
    if (o.hasVoid || o.hasComp || (o.voidedItems && o.voidedItems.length > 0)) {
      alerts.push({
        id:    `void-${o.id}`,
        type:  "warning",
        icon:  "⚠️",
        title: "Void / Comp Used",
        desc:  `${o.tableName || "Order"} · by ${o.cashierName || "Staff"}`,
        time:  o.closedAt || o.settledAt,
      });
    }
  }

  // Sort newest first
  return alerts.sort((a, b) => new Date(b.time) - new Date(a.time));
}

export function AlertsScreen() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      api.get("/shifts/summary").catch(() => ({})),
      api.get(`/reports/orders?dateFrom=${today}&dateTo=${today}&pageSize=200`).catch(() => ({ orders: [] })),
    ]).then(([shiftData, orderData]) => {
      const shifts = Array.isArray(shiftData) ? shiftData : shiftData?.shifts || shiftData?.history || [];
      const orders = orderData?.orders || orderData?.data || [];
      setAlerts(buildAlerts(shifts, orders));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Alerts</h2>
        <span className="badge-count">{alerts.length} today</span>
      </div>

      {loading ? (
        <div className="loading-state">Loading alerts…</div>
      ) : alerts.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🔔</span>
          <p>No alerts yet today.</p>
        </div>
      ) : (
        <div className="alerts-list">
          {alerts.map(a => (
            <div className={`alert-item alert-${a.type}`} key={a.id}>
              <span className="alert-icon">{a.icon}</span>
              <div className="alert-body">
                <p className="alert-title">{a.title}</p>
                <p className="alert-desc">{a.desc}</p>
              </div>
              <span className="alert-time">{timeAgo(a.time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
