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

// ─── Date chip ────────────────────────────────────────────────────────────────

function fmtChipDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function DateChip({ value, min, max, onChange }) {
  return (
    <label className="dash-date-chip">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span>{fmtChipDate(value)}</span>
      <input
        type="date" value={value} min={min} max={max}
        onChange={onChange}
        className="dash-date-chip-input"
      />
    </label>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data, 1);
  const H = 28, W = 52, gap = 2;
  const barW = Math.floor((W - gap * (data.length - 1)) / data.length);
  return (
    <svg width={W} height={H} className="dash-sparkline" aria-hidden="true">
      {data.map((v, i) => {
        const bh = Math.max(2, Math.round((v / max) * H));
        return (
          <rect
            key={i}
            x={i * (barW + gap)} y={H - bh} width={barW} height={bh}
            rx="1"
            fill={i === data.length - 1 ? "#F8CB46" : "#ECEAE3"}
          />
        );
      })}
    </svg>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, delta, sparkData }) {
  const deltaClass = delta === null ? "" : delta >= 0 ? "pos" : "neg";
  const deltaLabel = delta === null ? null
    : `${delta >= 0 ? "+" : ""}${delta}% vs yesterday`;

  return (
    <div className="dash-kpi">
      <div className="dash-kpi-body">
        <span className="dash-kpi-label">{label}</span>
        <strong className="dash-kpi-value">{value}</strong>
        {sub && <span className="dash-kpi-sub">{sub}</span>}
        {deltaLabel && (
          <span className={`dash-kpi-delta ${deltaClass}`}>{deltaLabel}</span>
        )}
      </div>
      {sparkData && sparkData.length > 0 && <Sparkline data={sparkData} />}
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

// ─── Orders by channel with vs-yesterday ──────────────────────────────────────

function ChannelSection({ orderTypes, yOrderTypes, isToday }) {
  return (
    <div className="dash-chan-list">
      {orderTypes.map(t => {
        const label  = t.type === "Online" ? "Delivery" : t.type;
        const yEntry = yOrderTypes.find(y => y.type === t.type);
        const yOrds  = yEntry?.orders || 0;
        const diff   = isToday && yOrds > 0 ? t.orders - yOrds : null;
        const color  = serviceModeColor(t.type);
        return (
          <div key={t.type} className="dash-chan-row">
            <span className="dash-chan-dot" style={{ background: color }} />
            <div className="dash-chan-info">
              <span className="dash-chan-name">{label}</span>
              {diff !== null && (
                <span className={`dash-chan-yday${diff < 0 ? " dn" : ""}`}>
                  {diff < 0 ? "▼" : "▲"} from {yOrds} yesterday
                </span>
              )}
            </div>
            <div className="dash-chan-right">
              <span className="dash-chan-orders">{t.orders}</span>
              <span className="dash-chan-amt">{fmt(t.amount)}</span>
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

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA");
}

export function DashboardPage() {
  const [outlets,        setOutlets]        = useState([]);
  const [outletId,       setOutletId]       = useState("__all__");
  const [dateFrom,       setDateFrom]       = useState(todayISO);
  const [dateTo,         setDateTo]         = useState(todayISO);
  const [data,           setData]           = useState(null);
  const [yesterdayData,  setYesterdayData]  = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [lastSynced,     setLastSynced]     = useState(null);
  const [error,          setError]          = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const timerRef = useRef(null);

  const isToday = dateFrom === todayISO() && dateTo === todayISO();
  const isYesterday = dateFrom === yesterdayISO() && dateTo === yesterdayISO();

  function setPreset(preset) {
    const today = todayISO();
    const yday  = yesterdayISO();
    if (preset === "today")     { setDateFrom(today); setDateTo(today); return; }
    if (preset === "yesterday") { setDateFrom(yday);  setDateTo(yday);  return; }
    const from = new Date();
    if (preset === "7d")  from.setDate(from.getDate() - 6);
    if (preset === "30d") from.setDate(from.getDate() - 29);
    setDateFrom(from.toLocaleDateString("en-CA"));
    setDateTo(today);
  }

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

    const ydayISO = yesterdayISO();
    const yParams = new URLSearchParams({ dateFrom: ydayISO, dateTo: ydayISO });
    if (outletId !== "__all__") yParams.set("outletId", outletId);

    Promise.all([
      api.get(`/reports/owner-summary?${params}`),
      isToday ? api.get(`/reports/owner-summary?${yParams}`).catch(() => null) : Promise.resolve(null),
    ]).then(([res, yRes]) => {
      setData(res);
      setYesterdayData(yRes);
      setLastSynced(new Date());
      setLoading(false);
    }).catch(err => {
      setError("Could not load sales data. Will retry shortly.");
      console.error("[Dashboard] fetch error:", err.message);
      setLoading(false);
    });
  }, [outletId, dateFrom, dateTo, isToday]);

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

  // vs-yesterday deltas (only shown on "today" view)
  const ySum = yesterdayData?.salesData?.dayEnd?.summary || {};
  function calcDelta(today, yesterday) {
    if (!isToday || !yesterdayData || !yesterday) return null;
    if (yesterday === 0) return today > 0 ? 100 : null;
    return Math.round(((today - yesterday) / yesterday) * 100);
  }
  const deltaSales  = calcDelta(totalSales, ySum.totalSales || 0);
  const deltaOrders = calcDelta(totalOrders, ySum.totalOrders || 0);
  const deltaAvg    = calcDelta(avgOrder, ySum.avgOrderValue || 0);
  const deltaTax    = calcDelta(totalTax, ySum.totalTax || 0);
  const yOrderTypes = yesterdayData?.salesData?.dayEnd?.orderTypes || [];

  // Sparkline: last 8 hours of sales amounts (or fewer if not available)
  const sparkData = hourlySales.slice(-8).map(h => h.amount);

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
          <div className="dash-preset-chips">
            <button className={`dash-preset-chip${isToday ? " active" : ""}`}       onClick={() => setPreset("today")}>Today</button>
            <button className={`dash-preset-chip${isYesterday ? " active" : ""}`}   onClick={() => setPreset("yesterday")}>Yesterday</button>
            <button className="dash-preset-chip" onClick={() => setPreset("7d")}>7 Days</button>
            <button className="dash-preset-chip" onClick={() => setPreset("30d")}>30 Days</button>
          </div>
          <DateChip
            value={dateFrom} max={dateTo}
            onChange={e => { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value); }}
          />
          <span className="dash-date-sep">→</span>
          <DateChip
            value={dateTo} min={dateFrom} max={todayISO()}
            onChange={e => { setDateTo(e.target.value); if (e.target.value < dateFrom) setDateFrom(e.target.value); }}
          />
          {isToday && (
            <>
              <span className="dash-live-dot" />
              <span className="dash-live-label">Live</span>
            </>
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
            <KpiCard label="Net sales"       value={fmt(totalSales)}  sub={`${totalOrders} orders`}       delta={deltaSales}  sparkData={sparkData} />
            <KpiCard label="Orders"          value={totalOrders}       sub={`Avg ${fmt(avgOrder)} / bill`} delta={deltaOrders} sparkData={sparkData} />
            <KpiCard label="Avg order value" value={fmt(avgOrder)}     sub="per bill"                      delta={deltaAvg}    sparkData={sparkData} />
            <KpiCard label="GST collected"   value={fmt(totalTax)}     sub="CGST + SGST"                   delta={deltaTax}    />
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

          {/* ── Bottom three-column row ───────────────────────────────────── */}
          <div className="dash-bottom-3col">

            {/* Sales by service mode */}
            <section className="dash-card">
              <h4 className="dash-card-title">Service mode</h4>
              {displayOrderTypes.length > 0
                ? <ServiceModeSection orderTypes={displayOrderTypes} />
                : <p className="dash-card-empty">No service mode data</p>
              }
            </section>

            {/* Orders by channel */}
            <section className="dash-card">
              <h4 className="dash-card-title">Orders by channel <span className="dash-card-title-sub">vs yesterday</span></h4>
              {displayOrderTypes.length > 0
                ? <ChannelSection orderTypes={displayOrderTypes} yOrderTypes={yOrderTypes} isToday={isToday} />
                : <p className="dash-card-empty">No channel data</p>
              }
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
