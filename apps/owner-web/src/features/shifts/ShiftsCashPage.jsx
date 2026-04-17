import { useState } from "react";
import {
  ACTIVE_SHIFTS_KEY, CASH_MOVEMENTS_KEY, SHIFT_HISTORY_KEY,
  seedActiveShifts, seedMovements, seedHistory
} from "./shifts.seed";

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
  catch { return fallback; }
}

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

export function ShiftsCashPage() {
  const shifts    = load(ACTIVE_SHIFTS_KEY,  seedActiveShifts);
  const movements = load(CASH_MOVEMENTS_KEY, seedMovements);
  const history   = load(SHIFT_HISTORY_KEY,  seedHistory);

  const [filter, setFilter] = useState("all"); // all | open | mismatch | closed

  const openCount    = shifts.filter(s => s.status === "open").length;
  const mismatches   = shifts.filter(s => s.status === "mismatch");
  const totalShort   = mismatches.reduce((sum, s) => sum + Math.abs(Math.min(s.variance || 0, 0)), 0);
  const totalOpening = shifts.filter(s => s.status === "open").reduce((s, x) => s + x.openingCash, 0);
  const totalCashOut = movements.filter(m => m.type === "out").reduce((s, m) => s + m.amount, 0);

  const allShifts = [...shifts, ...history];
  const filtered  = filter === "all" ? allShifts
    : allShifts.filter(s => s.status === filter);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Shifts &amp; Cash Control</h2>
        </div>
        <div className="topbar-actions">
          <span className="shift-live-pill">● Live from POS</span>
        </div>
      </header>

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
              const expected = s.openingCash + (s.cashIn || 0) - (s.cashOut || 0) + (s.sales || 0);
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
            {movements.length === 0 && <div className="shift-empty">No movements recorded</div>}
            {movements.map(m => (
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
            {[...shifts, ...history].filter(s => s.status === "mismatch").length === 0 ? (
              <div className="shift-no-short">
                <span>✓</span>
                <p>No shortages today — all shifts accounted for</p>
              </div>
            ) : (
              [...shifts, ...history].filter(s => s.status === "mismatch").map(s => (
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
  );
}
