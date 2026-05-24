import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { getTokenPayload } from "../lib/auth";
import { StatCard } from "../components/StatCard";
import { OutletPill } from "../components/OutletPill";

function fmt(n) {
  if (n === undefined || n === null) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function LiveScreen() {
  const [summary, setSummary]   = useState(null);
  const [outlets, setOutlets]   = useState([]);
  const [shifts, setShifts]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    try {
      const [sum, outletData, shiftData] = await Promise.all([
        api.get("/reports/owner-summary"),
        api.get("/outlets"),
        api.get("/shifts/summary").catch(() => ({})),
      ]);
      setSummary(sum);
      setOutlets(Array.isArray(outletData) ? outletData : outletData?.outlets || []);
      setShifts(Array.isArray(shiftData) ? shiftData : shiftData?.shifts || shiftData?.openShifts || []);
      setLastRefresh(new Date());
      setError("");
    } catch (err) {
      setError("Could not load data. Check connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [load]);

  const payload = getTokenPayload();
  const today   = new Date().toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short"
  });

  const daySummary   = summary?.dayEnd?.summary || {};
  const payModes     = summary?.payment?.modes || [];
  const findMode     = (name) => (payModes.find(m => m.mode === name)?.amount || 0);

  const totalSales   = daySummary.totalSales   ?? 0;
  const orderCount   = daySummary.totalOrders  ?? 0;
  const avgBill      = orderCount > 0 ? totalSales / orderCount : 0;
  const gstCollected = daySummary.totalTax     ?? summary?.gst?.summary?.totalGst ?? 0;
  const cashTotal    = summary?.payment?.summary?.cashAmount ?? findMode("Cash");
  const upiTotal     = findMode("Upi");
  const cardTotal    = findMode("Card");

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="live-header">
        <div>
          <p className="live-date">{today}</p>
          <h2 className="live-heading">Live Overview</h2>
        </div>
        <button className="refresh-btn" onClick={load} disabled={loading}>
          <span className={loading ? "spin" : ""}>↻</span>
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* ── Outlet status pills ── */}
      {outlets.length > 0 && (
        <div className="outlet-row">
          {outlets.map(o => {
            const shift = shifts.find(s => s.outletId === o.id && !s.closedAt);
            return (
              <OutletPill
                key={o.id}
                name={o.name}
                isOpen={!!shift}
                cashier={shift?.openedBy || shift?.cashierName}
              />
            );
          })}
        </div>
      )}

      {/* ── Hero revenue card ── */}
      <div className="hero-card">
        <p className="hero-label">Today's Revenue</p>
        <p className="hero-value">{loading ? "…" : fmt(totalSales)}</p>
        <p className="hero-sub">{loading ? "" : `${orderCount} orders · avg ${fmt(avgBill)}`}</p>
      </div>

      {/* ── Stat grid ── */}
      <div className="stat-grid">
        <StatCard label="GST Collected"  value={fmt(gstCollected)} icon="🧾" color="#6366f1" />
        <StatCard label="Cash"           value={fmt(cashTotal)}    icon="💵" color="#059669" />
        <StatCard label="UPI"            value={fmt(upiTotal)}     icon="📲" color="#0891b2" />
        <StatCard label="Card"           value={fmt(cardTotal)}    icon="💳" color="#d97706" />
      </div>

      {lastRefresh && (
        <p className="refresh-hint">
          Updated {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          &nbsp;· auto-refreshes every 30s
        </p>
      )}
    </div>
  );
}
