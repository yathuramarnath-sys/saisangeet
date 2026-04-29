import { useState, useEffect } from "react";
import { api } from "../../lib/api";

function fmt(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function timeAgo(iso) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}
function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }) {
  const map = {
    open:     { label: "Open",     cls: "shift-badge-open" },
    mismatch: { label: "Mismatch", cls: "shift-badge-mismatch" },
    closed:   { label: "Closed",   cls: "shift-badge-closed" }
  };
  const { label, cls } = map[status] || map.closed;
  return <span className={`shift-badge ${cls}`}>{label}</span>;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function toDateStr(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function ShiftsCashPage() {
  const [data,        setData]        = useState({ active: [], history: [], movements: [] });
  const [loading,     setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filter,      setFilter]      = useState("all"); // all | open | mismatch | closed

  // Date range filter — default to today
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo,   setDateTo]   = useState(todayStr);

  async function loadData() {
    try {
      const res = await api.get("/shifts/summary");
      setData((res?.active ? res : res?.data) || { active: [], history: [], movements: [] });
      setLastUpdated(new Date());
    } catch {
      // silently keep existing data on network errors
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, []);

  function handleDateFrom(val) {
    setDateFrom(val);
    if (val > dateTo) setDateTo(val);
  }
  function handleDateTo(val) {
    setDateTo(val);
    if (val < dateFrom) setDateFrom(val);
  }

  const shifts    = data.active    || [];
  const history   = data.history   || [];
  const movements = data.movements || [];

  // Apply date range filter: use startedAt for shifts, time for movements
  const allShiftsRaw = [...shifts, ...history];
  const allShiftsInRange = allShiftsRaw.filter(s => {
    const d = toDateStr(s.startedAt || s.closedAt);
    return !d || (d >= dateFrom && d <= dateTo);
  });
  const movementsInRange = movements.filter(m => {
    const d = toDateStr(m.time);
    return !d || (d >= dateFrom && d <= dateTo);
  });

  const openCount    = allShiftsInRange.filter(s => s.status === "open").length;
  const mismatches   = allShiftsInRange.filter(s => s.status === "mismatch");
  const totalShort   = mismatches.reduce((sum, s) => sum + Math.abs(Math.min(s.variance || 0, 0)), 0);
  const totalOpening = allShiftsInRange.filter(s => s.status === "open").reduce((s, x) => s + (x.openingCash || 0), 0);
  const totalCashOut = movementsInRange.filter(m => m.type === "out").reduce((s, m) => s + m.amount, 0);

  const filtered = filter === "all" ? allShiftsInRange
    : allShiftsInRange.filter(s => s.status === filter);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Shifts &amp; Cash Control</h2>
        </div>
        <div className="topbar-actions">
          {/* Date range filter */}
          <div className="rpt-date-range">
            <label className="rpt-date-label">From</label>
            <input type="date" className="rpt-date-input" value={dateFrom}
              max={dateTo} onChange={e => handleDateFrom(e.target.value)} />
            <span className="rpt-date-sep">→</span>
            <label className="rpt-date-label">To</label>
            <input type="date" className="rpt-date-input" value={dateTo}
              min={dateFrom} max={todayStr()} onChange={e => handleDateTo(e.target.value)} />
          </div>
          <span className="shift-live-pill">● Live from POS</span>
          <button className="topbar-btn" onClick={loadData} title="Refresh">
            ↺ Refresh
          </button>
          {lastUpdated && (
            <span className="shift-updated-at">
              Updated {fmtTime(lastUpdated)}
            </span>
          )}
        </div>
      </header>

      {loading && !allShiftsRaw.length ? (
        <div className="shift-empty" style={{ padding: "48px 24px" }}>
          Loading shift data…
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="shift-stats-row">
            <div className="shift-stat">
              <strong>{openCount}</strong>
              <span>Open Shifts</span>
            </div>
            <div className="shift-stat">
              <strong>{fmt(totalOpening)}</strong>
              <span>Opening Cash Today</span>
            </div>
            <div className="shift-stat">
              <strong>{fmt(totalCashOut)}</strong>
              <span>Cash Out Today</span>
            </div>
            <div className={`shift-stat${mismatches.length > 0 ? " bad" : ""}`}>
              <strong>{mismatches.length}</strong>
              <span>Mismatches</span>
            </div>
            <div className={`shift-stat${totalShort > 0 ? " bad" : ""}`}>
              <strong>{fmt(totalShort)}</strong>
              <span>Total Shortage</span>
            </div>
          </div>

          {/* Mismatch alert */}
          {mismatches.length > 0 && (
            <div className="shift-alert-banner">
              ⚠️ {mismatches.length} shift{mismatches.length > 1 ? "s" : ""} with cash mismatch —&nbsp;
              {mismatches.map(s => `${s.cashier} (${s.outlet}): ${fmt(Math.abs(s.variance || 0))} short`).join(" · ")}
            </div>
          )}

          {allShiftsRaw.length === 0 && (
            <div className="shift-empty" style={{ padding: "32px 24px", textAlign: "center" }}>
              No shifts recorded yet. When a cashier opens a shift on the POS, it will appear here.
            </div>
          )}

          <div className="shift-monitor-page">

            {/* Shift Register */}
            <div className="panel shift-monitor-panel">
              <div className="panel-head" style={{ marginBottom: 12 }}>
                <h3>Shift Register</h3>
                <div className="shift-filter-tabs">
                  {["all","open","mismatch","closed"].map(f => (
                    <button key={f}
                      className={`shift-filter-tab${filter === f ? " active" : ""}`}
                      onClick={() => setFilter(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="shift-table-wrap">
                <div className="shift-table-head">
                  <span>Cashier</span>
                  <span>Outlet</span>
                  <span>Session</span>
                  <span>Opening</span>
                  <span>Cash In</span>
                  <span>Cash Out</span>
                  <span>Sales</span>
                  <span>Expected</span>
                  <span>Actual</span>
                  <span>Variance</span>
                  <span>Started</span>
                  <span>Status</span>
                </div>

                {filtered.length === 0 && (
                  <div className="shift-empty">No shifts found</div>
                )}

                {filtered.map(s => {
                  const expected = (s.openingCash || 0) + (s.cashIn || 0) - (s.cashOut || 0) + (s.sales || 0);
                  const variance = s.status !== "open" ? (s.variance ?? null) : null;
                  return (
                    <div key={s.id} className={`shift-table-row${s.status === "mismatch" ? " row-warn" : ""}`}>
                      <span><strong>{s.cashier}</strong></span>
                      <span>{s.outlet}</span>
                      <span>{s.session}</span>
                      <span>{fmt(s.openingCash)}</span>
                      <span className="col-green">+{fmt(s.cashIn || 0)}</span>
                      <span className="col-red">−{fmt(s.cashOut || 0)}</span>
                      <span>{fmt(s.sales || 0)}</span>
                      <span>{fmt(expected)}</span>
                      <span>{s.closingCash != null ? fmt(s.closingCash) : <span className="muted">—</span>}</span>
                      <span>
                        {variance === null
                          ? <span className="muted">—</span>
                          : variance === 0
                            ? <span className="col-green">Exact</span>
                            : <span className="col-red">{variance > 0 ? "+" : ""}{fmt(variance)}</span>
                        }
                      </span>
                      <span className="muted">{timeAgo(s.startedAt)}</span>
                      <span><StatusBadge status={s.status} /></span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom row: Cash Log + Mismatch detail */}
            <div className="shift-bottom-grid">

              {/* Cash Movement Log */}
              <div className="panel shift-monitor-panel">
                <div className="panel-head" style={{ marginBottom: 10 }}><h3>Cash Movement Log</h3></div>
                {movementsInRange.length === 0 && (
                  <div className="shift-empty">No cash movements in this date range</div>
                )}
                {movementsInRange.map(m => (
                  <div key={m.id} className="shift-move-row">
                    <div className={`shift-move-type ${m.type === "in" ? "type-in" : "type-out"}`}>
                      {m.type === "in" ? "↑ IN" : "↓ OUT"}
                    </div>
                    <div className="shift-move-details">
                      <strong>{m.cashier}</strong>
                      <span>{m.outlet} · {m.reason}</span>
                      <span className="muted">Auth: {m.authorizedBy} · {fmtTime(m.time)}</span>
                    </div>
                    <div className={`shift-move-amount ${m.type === "in" ? "col-green" : "col-red"}`}>
                      {m.type === "in" ? "+" : "−"}{fmt(m.amount)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Shortage Summary */}
              <div className="panel shift-monitor-panel">
                <div className="panel-head" style={{ marginBottom: 10 }}><h3>Shortage &amp; Variance</h3></div>
                {mismatches.length === 0 ? (
                  <div className="shift-no-short">
                    <span>✓</span>
                    <p>No shortages today — all shifts accounted for</p>
                  </div>
                ) : (
                  mismatches.map(s => (
                    <div key={s.id} className="shift-short-card">
                      <div className="shift-short-top">
                        <strong>{s.cashier}</strong>
                        <span>{s.outlet} · {s.session}</span>
                      </div>
                      <div className="shift-short-rows">
                        <div><span>Expected</span><strong>{fmt(s.expectedCash)}</strong></div>
                        <div><span>Counted</span><strong>{fmt(s.closingCash)}</strong></div>
                        <div className="shortage-line">
                          <span>Short by</span>
                          <strong className="col-red">{fmt(Math.abs(s.variance || 0))}</strong>
                        </div>
                      </div>
                      {s.note && <p className="shift-short-note">Note: {s.note}</p>}
                      <span className="shift-badge shift-badge-mismatch">Manager Review Required</span>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>
        </>
      )}
    </>
  );
}
