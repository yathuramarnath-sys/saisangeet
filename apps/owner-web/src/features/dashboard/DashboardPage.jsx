/**
 * DashboardPage — Live Sales Hub
 *
 * Shows today's trading snapshot: total sales, order-type breakdown,
 * session bar chart, payment breakdown, top items, category sales.
 *
 * Data source: GET /reports/owner-summary?dateFrom=TODAY&dateTo=TODAY&outletId=ALL
 * Auto-refreshes every 60 seconds while the page is open.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../lib/api";

// ─── Demo Data Banner ─────────────────────────────────────────────────────────

function DemoBanner() {
  const [visible,  setVisible]  = useState(false);
  const [removing, setRemoving] = useState(false);
  const [done,     setDone]     = useState(false);

  useEffect(() => {
    api.get("/outlets")
      .then(list => {
        if (Array.isArray(list) && list.some(o => o._demo)) setVisible(true);
      })
      .catch(() => {});
  }, []);

  async function removeDemo() {
    setRemoving(true);
    try {
      await api.delete("/demo-data");
      setDone(true);
      setTimeout(() => setVisible(false), 2000);
    } catch (e) {
      setRemoving(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="dash-demo-banner">
      <span className="dash-demo-icon">🧪</span>
      <div className="dash-demo-body">
        <strong>Demo data active</strong>
        <p>
          Your account has a sample outlet, menu and staff pre-loaded so you can
          explore the system. Remove it when you're ready to use your real data.
        </p>
      </div>
      {done ? (
        <span className="dash-demo-done">✓ Removed</span>
      ) : (
        <button className="dash-demo-remove-btn" onClick={removeDemo} disabled={removing}>
          {removing ? "Removing…" : "Remove Demo Data"}
        </button>
      )}
      <button className="dash-demo-dismiss" onClick={() => setVisible(false)} title="Dismiss">✕</button>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

function fmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

const PAYMENT_COLORS = {
  Cash:   "#16a34a",
  Upi:    "#2563eb",
  Card:   "#7c3aed",
  Swiggy: "#ea580c",
  Zomato: "#dc2626",
};

function payColor(mode) {
  return PAYMENT_COLORS[mode] || "#6b7280";
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div className="dash-kpi" style={{ "--kpi-color": color || "#2563eb" }}>
      <span className="dash-kpi-icon">{icon}</span>
      <div className="dash-kpi-body">
        <span className="dash-kpi-label">{label}</span>
        <strong className="dash-kpi-value">{value}</strong>
        {sub && <span className="dash-kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Order type cards (Dine-In / Takeaway / Online) ───────────────────────────

const ORDER_TYPE_META = {
  "Dine In":  { icon: "🍽️", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  "Takeaway": { icon: "🛍️", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  "Online":   { icon: "📦", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
};

function OrderTypeCards({ orderTypes }) {
  const total = orderTypes.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="dash-otype-row">
      {orderTypes.map(t => {
        const meta = ORDER_TYPE_META[t.type] || { icon: "🍽️", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" };
        const pct  = total > 0 ? Math.round((t.amount / total) * 100) : 0;
        return (
          <div
            key={t.type}
            className="dash-otype-card"
            style={{ background: meta.bg, borderColor: meta.border }}
          >
            <div className="dash-otype-head">
              <span className="dash-otype-icon">{meta.icon}</span>
              <span className="dash-otype-label">{t.type}</span>
              <span className="dash-otype-pct" style={{ color: meta.color }}>{pct}%</span>
            </div>
            <strong className="dash-otype-amt" style={{ color: meta.color }}>{fmt(t.amount)}</strong>
            <span className="dash-otype-orders">{t.orders} order{t.orders !== 1 ? "s" : ""}</span>
            <div className="dash-otype-bar-track">
              <div className="dash-otype-bar-fill" style={{ width: `${pct}%`, background: meta.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Session bar chart (Breakfast / Lunch / Dinner) ───────────────────────────

const SESSION_META = {
  Breakfast: { icon: "🌅", color: "#f59e0b" },
  Lunch:     { icon: "☀️",  color: "#16a34a" },
  Dinner:    { icon: "🌙", color: "#7c3aed" },
};

function SessionBarChart({ sessions }) {
  const maxAmt = Math.max(...sessions.map(s => s.amount), 1);

  return (
    <div className="dash-session-chart">
      {sessions.map(s => {
        const meta = SESSION_META[s.session] || { icon: "🍽️", color: "#6b7280" };
        const w    = Math.max(4, Math.round((s.amount / maxAmt) * 100));
        return (
          <div key={s.session} className="dash-schart-row">
            <span className="dash-schart-label">
              {meta.icon} {s.session}
            </span>
            <div className="dash-schart-track">
              <div
                className="dash-schart-fill"
                style={{ width: `${w}%`, background: meta.color }}
              />
            </div>
            <div className="dash-schart-info">
              <strong>{fmt(Math.round(s.amount))}</strong>
              <span>{s.orders} orders</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Payment breakdown bar ─────────────────────────────────────────────────────

function PaymentBar({ mode, amount, orders, total }) {
  const w = total > 0 ? Math.max(2, Math.round((amount / total) * 100)) : 0;
  return (
    <div className="dash-pay-row">
      <span className="dash-pay-mode">{mode}</span>
      <div className="dash-pay-track">
        <div
          className="dash-pay-fill"
          style={{ width: `${w}%`, background: payColor(mode) }}
        />
      </div>
      <span className="dash-pay-orders">{orders} bills</span>
      <span className="dash-pay-amt">{fmt(amount)}</span>
    </div>
  );
}

// ─── Top item row ─────────────────────────────────────────────────────────────

function TopItemRow({ rank, name, category, qty, amount, maxAmount }) {
  const w = maxAmount > 0 ? Math.round((amount / maxAmount) * 100) : 0;
  return (
    <div className="dash-item-row">
      <span className="dash-item-rank">#{rank}</span>
      <div className="dash-item-info" style={{ flex: 1 }}>
        <strong className="dash-item-name">{name}</strong>
        <div className="dash-item-bar-track">
          <div className="dash-item-bar-fill" style={{ width: `${w}%` }} />
        </div>
        <span className="dash-item-cat">{category}</span>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="dash-item-amt">{fmt(amount)}</div>
        <div className="dash-item-qty">{qty} sold</div>
      </div>
    </div>
  );
}

// ─── Category bar ─────────────────────────────────────────────────────────────

const CAT_COLORS_FE = ["#2563eb","#16a34a","#ea580c","#7c3aed","#dc2626","#0891b2","#92400e","#374151"];

function CategorySalesSection({ categorySales }) {
  const cats = (categorySales?.categories || []).slice(0, 6);
  if (!cats.length) return null;

  const maxAmt = Math.max(...cats.map(c => c.amount), 1);

  return (
    <section className="dash-card">
      <h4 className="dash-card-title">📂 Sales by Category</h4>
      <div className="dash-cat-list">
        {cats.map((cat, i) => {
          const color = CAT_COLORS_FE[i % CAT_COLORS_FE.length];
          const w     = Math.max(4, Math.round((cat.amount / maxAmt) * 100));
          return (
            <div key={cat.name} className="dash-cat-row">
              <span className="dash-cat-dot" style={{ background: color }} />
              <span className="dash-cat-name">{cat.name}</span>
              <div className="dash-cat-track">
                <div className="dash-cat-fill" style={{ width: `${w}%`, background: color }} />
              </div>
              <span className="dash-cat-qty">{cat.qty} qty</span>
              <span className="dash-cat-amt">{fmt(cat.amount)}</span>
            </div>
          );
        })}
      </div>
    </section>
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
  const [outlets,    setOutlets]    = useState([]);
  const [outletId,   setOutletId]   = useState("__all__");
  const [dateFrom,   setDateFrom]   = useState(todayISO);
  const [dateTo,     setDateTo]     = useState(todayISO);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [lastSynced, setLastSynced] = useState(null);
  const [error,      setError]      = useState("");
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
    timerRef.current = setInterval(fetchData, 60_000);
    return () => clearInterval(timerRef.current);
  }, [fetchData, isToday]);

  // ── derived values ────────────────────────────────────────────────────────
  const summary      = data?.dayEnd?.summary       || {};
  const paymentModes = data?.dayEnd?.paymentModes  || [];
  const sessions     = data?.dayEnd?.sessions      || [];
  const orderTypes   = data?.dayEnd?.orderTypes    || [];
  const itemSales    = data?.itemSales             || [];
  const categorySales = data?.categorySales        || {};
  const topItems     = [...itemSales].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const topItemMax   = topItems[0]?.amount || 1;

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

  // Compute "active" order types (filter out zero-order types for cleanliness)
  const activeOrderTypes = orderTypes.filter(t => t.orders > 0);
  // If nothing from backend yet, show skeleton types
  const displayOrderTypes = activeOrderTypes.length > 0
    ? activeOrderTypes
    : [
        { type: "Dine In",  orders: totalOrders, amount: totalSales },
        { type: "Takeaway", orders: 0, amount: 0 },
        { type: "Online",   orders: 0, amount: 0 },
      ].filter(t => t.orders > 0);

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

      <DemoBanner />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="dash-toolbar">
        <div className="dash-toolbar-left">
          <span className="dash-date-chip">📅</span>
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
              <span className="dash-live-dot" title="Auto-refreshes every 60 s" />
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

      {error && <div className="dash-error">{error}</div>}

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
            <KpiCard icon="💰" label="Total Sales"    value={fmt(totalSales)}    sub={`${totalOrders} orders`}              color="#16a34a" />
            <KpiCard icon="🧾" label="Orders Billed"  value={totalOrders}        sub={`Avg ${fmt(avgOrder)} / bill`}         color="#2563eb" />
            <KpiCard icon="📱" label="Collected"       value={fmt(totalCollected)} sub={paymentModes.map(p => p.mode).join(" · ") || "—"} color="#7c3aed" />
            <KpiCard icon="🏷️" label="GST Collected"  value={fmt(totalTax)}      sub="CGST + SGST"                          color="#dc2626" />
            {totalDisc > 0 && (
              <KpiCard icon="🎁" label="Discounts Given" value={fmt(totalDisc)} sub="Total savings" color="#ea580c" />
            )}
          </div>

          {/* ── Order type breakdown row ───────────────────────────────── */}
          {displayOrderTypes.length > 0 && (
            <OrderTypeCards orderTypes={displayOrderTypes} />
          )}

          {/* ── Main grid ─────────────────────────────────────────────── */}
          <div className="dash-main-grid">

            {/* Session / time-of-day bar chart */}
            {sessions.length > 0 && (
              <section className="dash-card dash-card-wide">
                <h4 className="dash-card-title">📊 Sales by Time of Day</h4>
                <SessionBarChart sessions={sessions} />
              </section>
            )}

            {/* Top 5 selling items */}
            <section className="dash-card">
              <h4 className="dash-card-title">🔥 Top Selling Items</h4>
              {topItems.length === 0 ? (
                <p className="dash-card-empty">No item data</p>
              ) : (
                <div className="dash-item-list">
                  {topItems.map((item, i) => (
                    <TopItemRow
                      key={item.name}
                      rank={i + 1}
                      name={item.name}
                      category={item.category}
                      qty={item.qty}
                      amount={item.amount}
                      maxAmount={topItemMax}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Category breakdown */}
            <CategorySalesSection categorySales={categorySales} />

            {/* Payment breakdown */}
            <section className="dash-card">
              <h4 className="dash-card-title">💳 Payment Breakdown</h4>
              {paymentModes.length === 0 ? (
                <p className="dash-card-empty">No payment data</p>
              ) : (
                <div className="dash-pay-list">
                  {[...paymentModes].sort((a, b) => b.amount - a.amount).map(p => (
                    <PaymentBar key={p.mode} mode={p.mode} amount={p.amount} orders={p.orders} total={totalCollected} />
                  ))}
                </div>
              )}
            </section>

            {/* Quick stats */}
            <section className="dash-card dash-card-stats">
              <h4 className="dash-card-title">📈 Quick Stats</h4>
              <div className="dash-stat-list">
                <div className="dash-stat-row"><span>Gross Revenue</span><strong>{fmt(totalSales)}</strong></div>
                <div className="dash-stat-row"><span>Total Tax</span><strong>{fmt(totalTax)}</strong></div>
                <div className="dash-stat-row"><span>Discounts</span><strong>{fmt(totalDisc)}</strong></div>
                <div className="dash-stat-row"><span>Avg Bill Value</span><strong>{fmt(avgOrder)}</strong></div>
                <div className="dash-stat-row">
                  <span>Highest Mode</span>
                  <strong>{paymentModes.length > 0 ? [...paymentModes].sort((a, b) => b.amount - a.amount)[0].mode : "—"}</strong>
                </div>
                <div className="dash-stat-row">
                  <span>Top Item</span>
                  <strong style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {topItems[0]?.name || "—"}
                  </strong>
                </div>
              </div>
            </section>

          </div>
        </>
      )}
    </>
  );
}
