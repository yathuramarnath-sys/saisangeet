import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";

function fmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function pct(part, total) {
  if (!total) return "0%";
  return Math.round((part / total) * 100) + "%";
}

export function LiveScreen() {
  const [summary, setSummary]         = useState(null);
  const [outlets, setOutlets]         = useState([]);
  const [selectedOutlet, setOutlet]   = useState(null);
  const [showPicker, setShowPicker]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError]             = useState("");

  const load = useCallback(async () => {
    try {
      const params = selectedOutlet ? `?outletId=${selectedOutlet.id}` : "";
      const [sum, outletData] = await Promise.all([
        api.get(`/reports/owner-summary${params}`),
        api.get("/outlets"),
      ]);
      setSummary(sum);
      setOutlets(Array.isArray(outletData) ? outletData : outletData?.outlets || []);
      setLastRefresh(new Date());
      setError("");
    } catch {
      setError("Could not load data.");
    } finally {
      setLoading(false);
    }
  }, [selectedOutlet]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const sd         = summary?.salesData || {};
  const daySummary = sd?.dayEnd?.summary || {};
  const payModes   = sd?.payment?.modes  || [];
  const orderTypes = sd?.dayEnd?.orderTypes || [];
  const topItems   = (sd?.itemSales || []).slice(0, 5);
  const findMode   = (name) => payModes.find(m => m.mode === name)?.amount || 0;

  const totalSales = daySummary.totalSales  ?? 0;
  const totalOrders= daySummary.totalOrders ?? 0;
  const netSales   = daySummary.netAfterDiscount ?? totalSales;
  const totalTax   = daySummary.totalTax    ?? 0;
  const totalDisc  = daySummary.totalDiscount ?? 0;
  const cashAmt    = sd?.payment?.summary?.cashAmount ?? findMode("Cash");
  const upiAmt     = findMode("Upi");
  const cardAmt    = findMode("Card");

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short"
  });

  return (
    <div className="screen">

      {/* ── Header ── */}
      <div className="live-header">
        <div>
          <p className="live-date">{today}</p>
          <h2 className="live-heading">Dashboard</h2>
        </div>
        <button className="refresh-btn" onClick={load} disabled={loading}>
          <span className={loading ? "spin" : ""}>↻</span>
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* ── Outlet filter ── */}
      <div style={{ padding: "0 16px 12px" }}>
        <button className="outlet-filter-btn" onClick={() => setShowPicker(true)}>
          <span className="of-dot" />
          <span className="of-label">{selectedOutlet ? selectedOutlet.name : "All Outlets"}</span>
          <span className="of-arrow">▾</span>
        </button>
      </div>

      {/* ── Outlet picker modal ── */}
      {showPicker && (
        <div className="modal-overlay" onClick={() => setShowPicker(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Outlet</h3>
              <button onClick={() => setShowPicker(false)}>✕</button>
            </div>
            <button className="outlet-option active" onClick={() => { setOutlet(null); setShowPicker(false); }}>
              All Outlets
            </button>
            {outlets.map(o => (
              <button
                key={o.id}
                className={`outlet-option ${selectedOutlet?.id === o.id ? "active" : ""}`}
                onClick={() => { setOutlet(o); setShowPicker(false); }}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Hero total sales ── */}
      <div className="hero-card">
        <p className="hero-label">Total Sales</p>
        <p className="hero-value">{loading ? "…" : fmt(totalSales)}</p>
        <p className="hero-sub">
          {loading ? "" : `${totalOrders} orders · ${selectedOutlet ? selectedOutlet.name : `${outlets.length} outlet${outlets.length !== 1 ? "s" : ""}`}`}
        </p>
      </div>

      {/* ── KPI grid ── */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-icon" style={{ background: "#f0fdf4", color: "#16a34a" }}>💵</span>
          <p className="kpi-val">{fmt(cashAmt)}</p>
          <p className="kpi-label">Cash</p>
          <p className="kpi-sub">{pct(cashAmt, totalSales)} of sales</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>📲</span>
          <p className="kpi-val">{fmt(upiAmt)}</p>
          <p className="kpi-label">UPI</p>
          <p className="kpi-sub">{pct(upiAmt, totalSales)} of sales</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-icon" style={{ background: "#fdf4ff", color: "#7c3aed" }}>💳</span>
          <p className="kpi-val">{fmt(cardAmt)}</p>
          <p className="kpi-label">Card</p>
          <p className="kpi-sub">{pct(cardAmt, totalSales)} of sales</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-icon" style={{ background: "#fefce8", color: "#ca8a04" }}>🧾</span>
          <p className="kpi-val">{fmt(totalTax)}</p>
          <p className="kpi-label">Tax</p>
          <p className="kpi-sub">GST collected</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-icon" style={{ background: "#f0fdf4", color: "#059669" }}>📈</span>
          <p className="kpi-val">{fmt(netSales)}</p>
          <p className="kpi-label">Net Sales</p>
          <p className="kpi-sub">After discount</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-icon" style={{ background: "#fff1f2", color: "#e11d48" }}>🏷️</span>
          <p className="kpi-val">{fmt(totalDisc)}</p>
          <p className="kpi-label">Discounts</p>
          <p className="kpi-sub">{pct(totalDisc, totalSales)} of sales</p>
        </div>
      </div>

      {/* ── Order type breakdown ── */}
      {orderTypes.length > 0 && (
        <div className="section-card" style={{ margin: "0 16px 16px" }}>
          <h3 className="section-title">Order Types</h3>
          {orderTypes.map(t => {
            const p = totalSales > 0 ? Math.round((t.amount / totalSales) * 100) : 0;
            const colors = {
              "Dine In":  "#16a34a",
              "Takeaway": "#2563eb",
              "Online":   "#ea580c",
            };
            const c = colors[t.type] || "#6b7280";
            return (
              <div className="otype-row" key={t.type}>
                <span className="otype-label">{t.type}</span>
                <div className="pay-bar-wrap">
                  <div className="pay-bar" style={{ width: `${p}%`, background: c }} />
                </div>
                <span className="otype-val">{fmt(t.amount)}</span>
                <span className="otype-orders">{t.orders}x</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Top items ── */}
      {topItems.length > 0 && (
        <div className="section-card" style={{ margin: "0 16px 16px" }}>
          <h3 className="section-title">Top Items Today</h3>
          {topItems.map((item, i) => (
            <div className="item-row" key={item.name}>
              <span className="item-rank">{i + 1}</span>
              <div className="item-info">
                <p className="item-name">{item.name}</p>
                <p className="item-qty">{item.qty} sold</p>
              </div>
              <p className="item-rev">{fmt(item.amount)}</p>
            </div>
          ))}
        </div>
      )}

      {lastRefresh && (
        <p className="refresh-hint">
          Updated {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          &nbsp;· auto-refreshes every 30s
        </p>
      )}
    </div>
  );
}
