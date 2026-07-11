/**
 * DashboardPage — Live Sales Hub
 *
 * Shows today's trading snapshot: KPI summary, hourly sales trend,
 * top items, service-mode breakdown, payment summary.
 *
 * Data source: GET /reports/owner-summary?dateFrom=TODAY&dateTo=TODAY&outletId=ALL
 * Auto-refreshes every 60 seconds while the page is open.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { io as socketIO } from "socket.io-client";
import { api } from "../../lib/api";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/v1$/, "")
  : "http://localhost:4000";

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

function fmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

const PAYMENT_COLORS = {
  Cash:   "#0F766E",
  Upi:    "#2563eb",
  Card:   "#7c3aed",
  Swiggy: "#ea580c",
  Zomato: "#dc2626",
};

function payColor(mode) {
  return PAYMENT_COLORS[mode] || "#6b7280";
}

// Converts "13:00" → "1p", "08:00" → "8a", "12:00" → "12p"
function fmtHourShort(hourStr) {
  const h = parseInt(hourStr, 10);
  if (isNaN(h)) return hourStr;
  if (h === 0)  return "12a";
  if (h < 12)  return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

// Converts "20:00" → "8 PM", "11:00" → "11 AM"
function fmtHourFull(hourStr) {
  const h = parseInt(hourStr, 10);
  if (isNaN(h)) return hourStr;
  if (h === 0)  return "12 AM";
  if (h < 12)  return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

const SERVICE_MODE_COLORS = {
  "Dine In":  "#0F766E",
  "Takeaway": "#F59E0B",
  "Online":   "#2563eb",
};

function serviceModeColor(type) {
  return SERVICE_MODE_COLORS[type] || "#6b7280";
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-body">
        <span className="dash-kpi-label">{label}</span>
        <strong className="dash-kpi-value">{value}</strong>
        {sub && <span className="dash-kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Hourly sales trend bar chart ─────────────────────────────────────────────

function SalesTrendChart({ hourlySales }) {
  if (!hourlySales.length) return <p className="dash-card-empty">No hourly data yet</p>;

  const maxAmt = Math.max(...hourlySales.map(h => h.amount), 1);
  const peakEntry = hourlySales.reduce(
    (best, h) => (h.amount > (best?.amount || 0) ? h : best),
    null
  );

  return (
    <>
      <div className="dash-trend-meta">
        <div>
          <span className="dash-trend-subtitle">Hourly · today</span>
        </div>
        {peakEntry && (
          <span className="dash-trend-peak">
            Peak {fmt(peakEntry.amount)} at {fmtHourFull(peakEntry.hour)}
          </span>
        )}
      </div>

      <div className="dash-trend-chart">
        {hourlySales.map(h => {
          const isPeak   = peakEntry && h.hour === peakEntry.hour;
          const isActive = h.amount > 0;
          const heightPct = Math.max(4, Math.round((h.amount / maxAmt) * 100));
          return (
            <div key={h.hour} className="dash-trend-col">
              <div className="dash-trend-bar-wrap">
                <div
                  className={`dash-trend-bar${isPeak ? " peak" : isActive ? " active" : ""}`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="dash-trend-hour">{fmtHourShort(h.hour)}</span>
            </div>
          );
        })}
      </div>

      <div className="dash-trend-legend">
        <span><span className="dash-tleg-dot" />Off-peak</span>
        <span><span className="dash-tleg-dot active" />Active hours</span>
        <span><span className="dash-tleg-dot peak" />Peak hour</span>
      </div>
    </>
  );
}

// ─── Top selling items list ────────────────────────────────────────────────────

function TopItemsList({ items }) {
  if (!items.length) return <p className="dash-card-empty">No item data</p>;
  return (
    <div className="dash-top-list">
      {items.map((item, i) => (
        <div key={item.name} className="dash-top-row">
          <span className="dash-top-rank">{i + 1}</span>
          <div className="dash-top-info">
            <strong className="dash-top-name">{item.name}</strong>
            <span className="dash-top-qty">{item.qty} sold</span>
          </div>
          <span className="dash-top-amt">{fmt(item.amount)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Service mode breakdown ────────────────────────────────────────────────────

function ServiceModeSection({ orderTypes }) {
  const total = orderTypes.reduce((s, t) => s + t.amount, 0);
  return (
    <div className="dash-mode-list">
      {orderTypes.map(t => {
        const pct  = total > 0 ? Math.round((t.amount / total) * 100) : 0;
        const color = serviceModeColor(t.type);
        const label = t.type === "Online" ? "Delivery" : t.type;
        return (
          <div key={t.type} className="dash-mode-row">
            <div className="dash-mode-head">
              <span className="dash-mode-name">{label}</span>
              <span className="dash-mode-right">
                {pct}% · {fmt(t.amount)}
              </span>
            </div>
            <div className="dash-mode-track">
              <div
                className="dash-mode-fill"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Payment breakdown list ────────────────────────────────────────────────────

function PaymentList({ paymentModes }) {
  if (!paymentModes.length) return <p className="dash-card-empty">No payment data</p>;
  const total = paymentModes.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="dash-pay-list">
      {[...paymentModes].sort((a, b) => b.amount - a.amount).map(p => {
        const pct = total > 0 ? Math.round((p.amount / total) * 100) : 0;
        return (
          <div key={p.mode} className="dash-pay-row">
            <div className="dash-pay-head">
              <span className="dash-pay-mode">{p.mode}</span>
              <span className="dash-pay-bills">{p.orders} bills</span>
              <span className="dash-pay-amt">{fmt(p.amount)}</span>
            </div>
            <div className="dash-pay-track">
              <div
                className="dash-pay-fill"
                style={{ width: `${pct}%`, background: payColor(p.mode) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDay({ outletName }) {
  return (
    <div className="dash-empty">
      <div className="dash-empty-icon">📊</div>
      <strong>No sales yet today</strong>
      <p>
        {outletName
          ? `${outletName} hasn't recorded any closed orders today.`
          : "No closed orders recorded today across your outlets."}
        {" "}Once the POS starts billing, live data will appear here automatically.
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [outlets,        setOutlets]        = useState([]);
  const [outletId,       setOutletId]       = useState("__all__");
  const [dateFrom,       setDateFrom]       = useState(todayISO);
  const [dateTo,         setDateTo]         = useState(todayISO);
  const [data,           setData]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [lastSynced,     setLastSynced]     = useState(null);
  const [error,          setError]          = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const timerRef = useRef(null);

  const isToday = dateFrom === todayISO() && dateTo === todayISO();

  useEffect(() => {
    api.get("/outlets")
      .then(list => {
        const active = Array.isArray(list) ? list.filter(o => o.isActive !== false) : [];
        setOutlets([{ id: "__all__", name: "All Outlets" }, ...active]);
      })
      .catch(() => setOutlets([{ id: "__all__", name: "All Outlets" }]));
  }, []);

  const fetchData = useCallback(() => {
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (outletId !== "__all__") params.set("outletId", outletId);
    setError("");
    api.get(`/reports/owner-summary?${params}`)
      .then(res => { setData(res); setLastSynced(new Date()); setLoading(false); })
      .catch(err => {
        setError("Could not load sales data. Will retry shortly.");
        console.error("[Dashboard] fetch error:", err.message);
        setLoading(false);
      });
  }, [outletId, dateFrom, dateTo]);

  useEffect(() => { setLoading(true); setData(null); fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!isToday) return;
    timerRef.current = setInterval(fetchData, 15_000);
    return () => clearInterval(timerRef.current);
  }, [fetchData, isToday]);

  // Refresh immediately when the owner switches back to this tab
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === "visible" && isToday) fetchData();
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [fetchData, isToday]);

  // Real-time push: connect to the socket server with the owner JWT so the
  // backend can place this socket in the correct tenant room. When any POS
  // settles a bill the backend emits "sales:updated" — we re-fetch immediately.
  useEffect(() => {
    if (!isToday) return;
    const token = localStorage.getItem("pos_token");
    if (!token) return;

    const sock = socketIO(SOCKET_URL, {
      query: { token },
      transports: ["websocket"],
      reconnectionDelay: 3000,
      reconnectionDelayMax: 10000,
    });

    sock.on("sales:updated", () => fetchData());

    // Backend emits this when the JWT is expired or invalid — stop reconnecting
    // and show a re-login prompt so the owner knows real-time updates have stopped.
    sock.on("auth:expired", () => {
      setSessionExpired(true);
      sock.disconnect();
    });

    // Socket-level connection failure (network down, server unreachable)
    sock.on("connect_error", () => {
      if (!sessionExpired) setError("Live updates paused — retrying connection...");
    });
    sock.on("connect", () => {
      setError(prev => prev === "Live updates paused — retrying connection..." ? "" : prev);
    });

    return () => { sock.disconnect(); };
  }, [isToday, fetchData]);

  // ── derived values ────────────────────────────────────────────────────────
  const summary      = data?.salesData?.dayEnd?.summary       || {};
  const paymentModes = data?.salesData?.dayEnd?.paymentModes  || [];
  const orderTypes   = data?.salesData?.dayEnd?.orderTypes    || [];
  const hourlySales  = data?.salesData?.dayEnd?.hourlySales   || [];
  const itemSales    = data?.salesData?.itemSales             || [];
  const topItems     = [...itemSales].sort((a, b) => b.amount - a.amount).slice(0, 5);

  const totalSales     = summary.totalSales       || 0;
  const totalOrders    = summary.totalOrders      || 0;
  const avgOrder       = summary.avgOrderValue    || 0;
  const totalTax       = summary.totalTax         || 0;
  const totalDisc      = summary.totalDiscount    || 0;
  const totalCollected = paymentModes.reduce((s, p) => s + p.amount, 0);

  const hasData = totalOrders > 0;
  const selectedOutletName = outlets.find(o => o.id === outletId)?.name || "";
  const nowStr = lastSynced
    ? lastSynced.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const activeOrderTypes = orderTypes.filter(t => t.orders > 0);
  const displayOrderTypes = activeOrderTypes.length > 0
    ? activeOrderTypes
    : totalOrders > 0
      ? [{ type: "Dine In", orders: totalOrders, amount: totalSales }]
      : [];

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div>
          <p className="eyebrow">Live Overview</p>
          <h2>Dashboard</h2>
        </div>
        <div className="topbar-actions">
          <span className="dash-sync-label">Last updated {nowStr}</span>
          <button
            className="ghost-btn"
            onClick={() => { setLoading(true); fetchData(); }}
            disabled={loading}
            title="Refresh now"
          >
            {loading ? "⟳ Refreshing…" : "⟳ Refresh"}
          </button>
        </div>
      </header>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="dash-toolbar">
        <div className="dash-toolbar-left">
          <input
            type="date" className="dash-date-input" value={dateFrom} max={dateTo}
            onChange={e => { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value); }}
          />
          <span className="dash-date-sep">→</span>
          <input
            type="date" className="dash-date-input" value={dateTo} min={dateFrom} max={todayISO()}
            onChange={e => { setDateTo(e.target.value); if (e.target.value < dateFrom) setDateFrom(e.target.value); }}
          />
          {isToday && (
            <>
              <span className="dash-live-dot" />
              <span className="dash-live-label">Live</span>
            </>
          )}
          {!isToday && (
            <button className="ghost-chip" style={{ marginLeft: 8 }}
              onClick={() => { setDateFrom(todayISO()); setDateTo(todayISO()); }}>
              Back to Today
            </button>
          )}
        </div>
        <select className="dash-outlet-select" value={outletId} onChange={e => setOutletId(e.target.value)}>
          {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {sessionExpired && (
        <div className="dash-error" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>⚠️ Your session has expired — live updates are paused.</span>
          <button
            style={{ background: "#fff", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 6, padding: "4px 14px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
            onClick={() => {
              localStorage.removeItem("pos_token");
              window.location.href = "/login";
            }}
          >
            Log in again
          </button>
        </div>
      )}
      {!sessionExpired && error && <div className="dash-error">{error}</div>}

      {loading && !data ? (
        <div className="dash-spinner-wrap">
          <span className="dash-spinner" />
          <p>Loading sales data…</p>
        </div>
      ) : !hasData ? (
        <EmptyDay outletName={selectedOutletName === "All Outlets" ? "" : selectedOutletName} />
      ) : (
        <>
          {/* ── KPI row ───────────────────────────────────────────────── */}
          <div className="dash-kpi-row">
            <KpiCard label="Net sales"       value={fmt(totalSales)}  sub={`${totalOrders} orders`} />
            <KpiCard label="Orders"          value={totalOrders}       sub={`Avg ${fmt(avgOrder)} / bill`} />
            <KpiCard label="Avg order value" value={fmt(avgOrder)}     sub="per bill" />
            <KpiCard label="GST collected"   value={fmt(totalTax)}     sub="CGST + SGST" />
            {totalDisc > 0 && (
              <KpiCard label="Discounts" value={fmt(totalDisc)} sub="total savings" />
            )}
          </div>

          {/* ── Main two-column grid ───────────────────────────────────── */}
          <div className="dash-main-2col">

            {/* Sales trend — hourly vertical bar chart */}
            <section className="dash-card dash-trend-card">
              <h4 className="dash-card-title">Sales trend</h4>
              <SalesTrendChart hourlySales={hourlySales} />
            </section>

            {/* Top selling items */}
            <section className="dash-card">
              <h4 className="dash-card-title">Top selling items</h4>
              <TopItemsList items={topItems} />
            </section>

          </div>

          {/* ── Bottom two-column row ──────────────────────────────────── */}
          <div className="dash-bottom-2col">

            {/* Sales by service mode */}
            <section className="dash-card">
              <h4 className="dash-card-title">Sales by service mode</h4>
              {displayOrderTypes.length > 0
                ? <ServiceModeSection orderTypes={displayOrderTypes} />
                : <p className="dash-card-empty">No service mode data</p>
              }
              {displayOrderTypes.length > 0 && (
                <div className="dash-channel-block">
                  <p className="dash-section-eyebrow">Orders by channel</p>
                  <div className="dash-channel-row">
                    {displayOrderTypes.map(t => (
                      <div key={t.type} className="dash-channel-item">
                        <strong>{t.orders}</strong>
                        <span>{t.type === "Online" ? "Delivery" : t.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Payment breakdown */}
            <section className="dash-card">
              <h4 className="dash-card-title">Payment breakdown</h4>
              <PaymentList paymentModes={paymentModes} />
            </section>

          </div>
        </>
      )}
    </>
  );
}
