/**
 * DashboardPage — Live Sales Hub
 *
 * Shows today's trading snapshot: total sales, orders, avg order value,
 * payment breakdown, top 5 items, and session (Breakfast / Lunch / Dinner).
 *
 * Data source: GET /reports/owner-summary?dateFrom=TODAY&dateTo=TODAY&outletId=ALL
 * Auto-refreshes every 60 seconds while the page is open.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../lib/api";

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function fmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

function pct(a, b) {
  return b ? Math.round((a / b) * 100) + "%" : "0%";
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

// ─── sub-components ───────────────────────────────────────────────────────────

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

function TopItemRow({ rank, name, category, qty, amount }) {
  return (
    <div className="dash-item-row">
      <span className="dash-item-rank">#{rank}</span>
      <div className="dash-item-info">
        <strong className="dash-item-name">{name}</strong>
        <span className="dash-item-cat">{category}</span>
      </div>
      <span className="dash-item-qty">{qty}×</span>
      <span className="dash-item-amt">{fmt(amount)}</span>
    </div>
  );
}

function SessionPill({ session, orders, amount }) {
  const ICONS = { Breakfast: "🌅", Lunch: "☀️", Dinner: "🌙" };
  return (
    <div className="dash-session-pill">
      <span className="dash-session-icon">{ICONS[session] || "🍽️"}</span>
      <div className="dash-session-body">
        <strong className="dash-session-name">{session}</strong>
        <span className="dash-session-stats">{orders} orders · {fmt(amount)}</span>
      </div>
    </div>
  );
}

// ─── empty-state ─────────────────────────────────────────────────────────────

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

// ─── main page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [outlets,    setOutlets]    = useState([]);
  const [outletId,   setOutletId]   = useState("__all__");
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [lastSynced, setLastSynced] = useState(null);
  const [error,      setError]      = useState("");
  const timerRef = useRef(null);

  // ── load outlet list once ─────────────────────────────────────────────────
  useEffect(() => {
    api.get("/outlets")
      .then(list => {
        const active = Array.isArray(list)
          ? list.filter(o => o.isActive !== false)
          : [];
        setOutlets([{ id: "__all__", name: "All Outlets" }, ...active]);
      })
      .catch(() => setOutlets([{ id: "__all__", name: "All Outlets" }]));
  }, []);

  // ── fetch sales data ──────────────────────────────────────────────────────
  const fetchData = useCallback(() => {
    const today = todayISO();
    const params = new URLSearchParams({
      dateFrom: today,
      dateTo:   today,
    });
    if (outletId !== "__all__") params.set("outletId", outletId);

    setError("");
    api.get(`/reports/owner-summary?${params}`)
      .then(res => {
        setData(res);
        setLastSynced(new Date());
        setLoading(false);
      })
      .catch(err => {
        setError("Could not load sales data. Will retry in 60 s.");
        console.error("[Dashboard] fetch error:", err.message);
        setLoading(false);
      });
  }, [outletId]);

  // initial + outlet change
  useEffect(() => {
    setLoading(true);
    setData(null);
    fetchData();
  }, [fetchData]);

  // auto-refresh every 60 s
  useEffect(() => {
    timerRef.current = setInterval(fetchData, 60_000);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  // ── derived values ────────────────────────────────────────────────────────
  const summary      = data?.dayEnd?.summary       || {};
  const paymentModes = data?.dayEnd?.paymentModes  || [];
  const sessions     = data?.dayEnd?.sessions      || [];
  const itemSales    = data?.itemSales             || [];
  const topItems     = [...itemSales].sort((a, b) => b.amount - a.amount).slice(0, 5);

  const totalSales   = summary.totalSales       || 0;
  const totalOrders  = summary.totalOrders      || 0;
  const avgOrder     = summary.avgOrderValue    || 0;
  const totalTax     = summary.totalTax         || 0;
  const totalDisc    = summary.totalDiscount    || 0;
  const totalCollected = paymentModes.reduce((s, p) => s + p.amount, 0);

  const hasData = totalOrders > 0;

  const selectedOutletName = outlets.find(o => o.id === outletId)?.name || "";

  const nowStr = lastSynced
    ? lastSynced.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "—";

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

      {/* ── Outlet selector ─────────────────────────────────────────────── */}
      <div className="dash-toolbar">
        <div className="dash-toolbar-left">
          <span className="dash-date-chip">
            📅 Today — {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </span>
          <span className="dash-live-dot" title="Auto-refreshes every 60 s" />
          <span className="dash-live-label">Live</span>
        </div>
        <select
          className="dash-outlet-select"
          value={outletId}
          onChange={e => setOutletId(e.target.value)}
        >
          {outlets.map(o => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {loading && !data ? (
        <div className="dash-spinner-wrap">
          <span className="dash-spinner" />
          <p>Loading today's sales…</p>
        </div>
      ) : !hasData ? (
        <EmptyDay outletName={selectedOutletName === "All Outlets" ? "" : selectedOutletName} />
      ) : (
        <>
          {/* ── KPI row ───────────────────────────────────────────────── */}
          <div className="dash-kpi-row">
            <KpiCard
              icon="💰"
              label="Total Sales"
              value={fmt(totalSales)}
              sub={`${totalOrders} orders`}
              color="#16a34a"
            />
            <KpiCard
              icon="🧾"
              label="Orders Billed"
              value={totalOrders}
              sub={`Avg ${fmt(avgOrder)} / bill`}
              color="#2563eb"
            />
            <KpiCard
              icon="📱"
              label="Collected"
              value={fmt(totalCollected)}
              sub={paymentModes.length > 0 ? paymentModes.map(p => p.mode).join(" · ") : "—"}
              color="#7c3aed"
            />
            <KpiCard
              icon="🏷️"
              label="GST Collected"
              value={fmt(totalTax)}
              sub="CGST + SGST"
              color="#dc2626"
            />
            {totalDisc > 0 && (
              <KpiCard
                icon="🎁"
                label="Discounts Given"
                value={fmt(totalDisc)}
                sub="Total savings"
                color="#ea580c"
              />
            )}
          </div>

          {/* ── Main grid ─────────────────────────────────────────────── */}
          <div className="dash-main-grid">

            {/* Payment breakdown */}
            <section className="dash-card">
              <h4 className="dash-card-title">💳 Payment Breakdown</h4>
              {paymentModes.length === 0 ? (
                <p className="dash-card-empty">No payment data</p>
              ) : (
                <div className="dash-pay-list">
                  {paymentModes
                    .sort((a, b) => b.amount - a.amount)
                    .map(p => (
                      <PaymentBar
                        key={p.mode}
                        mode={p.mode}
                        amount={p.amount}
                        orders={p.orders}
                        total={totalCollected}
                      />
                    ))
                  }
                </div>
              )}
            </section>

            {/* Top 5 items */}
            <section className="dash-card">
              <h4 className="dash-card-title">🔥 Top Items Today</h4>
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
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Session breakdown */}
            {sessions.length > 0 && (
              <section className="dash-card">
                <h4 className="dash-card-title">🕐 By Session</h4>
                <div className="dash-session-list">
                  {sessions.map(s => (
                    <SessionPill
                      key={s.session}
                      session={s.session}
                      orders={s.orders}
                      amount={Math.round(s.amount)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Quick stats */}
            <section className="dash-card dash-card-stats">
              <h4 className="dash-card-title">📈 Quick Stats</h4>
              <div className="dash-stat-list">
                <div className="dash-stat-row">
                  <span>Gross Revenue</span>
                  <strong>{fmt(totalSales)}</strong>
                </div>
                <div className="dash-stat-row">
                  <span>Total Tax</span>
                  <strong>{fmt(totalTax)}</strong>
                </div>
                <div className="dash-stat-row">
                  <span>Discounts</span>
                  <strong>{fmt(totalDisc)}</strong>
                </div>
                <div className="dash-stat-row">
                  <span>Avg Bill Value</span>
                  <strong>{fmt(avgOrder)}</strong>
                </div>
                <div className="dash-stat-row">
                  <span>Highest Mode</span>
                  <strong>
                    {paymentModes.length > 0
                      ? [...paymentModes].sort((a, b) => b.amount - a.amount)[0].mode
                      : "—"}
                  </strong>
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
