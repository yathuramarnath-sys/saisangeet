import { useState } from "react";
import {
  ACTIVE_SHIFTS_KEY, CASH_MOVEMENTS_KEY, SHIFT_HISTORY_KEY,
  OUTLETS, SESSIONS, CASHIERS, CASH_IN_REASONS, CASH_OUT_REASONS,
  seedActiveShifts, seedMovements, seedHistory
} from "./shifts.seed";

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
  catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function fmt(n) { return "₹" + Number(n).toLocaleString("en-IN"); }
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
  const [shifts,    setShifts]   = useState(() => load(ACTIVE_SHIFTS_KEY,  seedActiveShifts));
  const [movements, setMovements] = useState(() => load(CASH_MOVEMENTS_KEY, seedMovements));
  const [history,   setHistory]  = useState(() => load(SHIFT_HISTORY_KEY,  seedHistory));
  const [msg, setMsg] = useState("");

  // Panel tabs
  const [activePanel, setActivePanel] = useState("start"); // start | cashin | close

  // Start Shift form
  const [startForm, setStartForm] = useState({
    cashier: CASHIERS[0], outlet: OUTLETS[0],
    session: SESSIONS[1], openingCash: ""
  });

  // Cash In/Out form
  const [moveForm, setMoveForm] = useState({
    type: "in", shiftId: "", amount: "", reason: CASH_IN_REASONS[0], authorizedBy: "Manager"
  });

  // Close Shift form
  const [closeForm, setCloseForm] = useState({ shiftId: "", closingCash: "", note: "" });

  function flash(t) { setMsg(t); setTimeout(() => setMsg(""), 3500); }

  const openShifts = shifts.filter(s => s.status === "open");

  // ── Start Shift ──────────────────────────────────────
  function handleStartShift(e) {
    e.preventDefault();
    if (!startForm.openingCash || isNaN(startForm.openingCash)) {
      flash("Enter a valid opening cash amount."); return;
    }
    const shift = {
      id: `shift-${Date.now()}`,
      cashier: startForm.cashier,
      outlet: startForm.outlet,
      session: startForm.session,
      openingCash: Number(startForm.openingCash),
      cashIn: 0, cashOut: 0, sales: 0,
      startedAt: new Date().toISOString(),
      status: "open"
    };
    const next = [shift, ...shifts];
    setShifts(next); save(ACTIVE_SHIFTS_KEY, next);
    setStartForm(f => ({ ...f, openingCash: "" }));
    flash(`Shift started for ${shift.cashier} at ${shift.outlet}.`);
  }

  // ── Cash In / Out ─────────────────────────────────────
  function handleCashMove(e) {
    e.preventDefault();
    if (!moveForm.shiftId) { flash("Select an active shift."); return; }
    if (!moveForm.amount || isNaN(moveForm.amount)) { flash("Enter a valid amount."); return; }
    const mv = {
      id: `mv-${Date.now()}`,
      shiftId: moveForm.shiftId,
      cashier: shifts.find(s => s.id === moveForm.shiftId)?.cashier || "",
      outlet:  shifts.find(s => s.id === moveForm.shiftId)?.outlet  || "",
      type:    moveForm.type,
      amount:  Number(moveForm.amount),
      reason:  moveForm.reason,
      authorizedBy: moveForm.authorizedBy,
      time: new Date().toISOString()
    };
    const nextMov = [mv, ...movements];
    setMovements(nextMov); save(CASH_MOVEMENTS_KEY, nextMov);

    // Update shift cash in/out totals
    const nextShifts = shifts.map(s => {
      if (s.id !== mv.shiftId) return s;
      return {
        ...s,
        cashIn:  mv.type === "in"  ? s.cashIn  + mv.amount : s.cashIn,
        cashOut: mv.type === "out" ? s.cashOut + mv.amount : s.cashOut
      };
    });
    setShifts(nextShifts); save(ACTIVE_SHIFTS_KEY, nextShifts);
    setMoveForm(f => ({ ...f, amount: "", shiftId: "" }));
    flash(`Cash ${moveForm.type === "in" ? "In" : "Out"} of ${fmt(moveForm.amount)} recorded.`);
  }

  // ── Close Shift ───────────────────────────────────────
  const selectedShift = shifts.find(s => s.id === closeForm.shiftId);
  const expectedCash  = selectedShift
    ? selectedShift.openingCash + selectedShift.cashIn - selectedShift.cashOut + selectedShift.sales
    : null;
  const variance = closeForm.closingCash && expectedCash !== null
    ? Number(closeForm.closingCash) - expectedCash : null;

  function handleCloseShift(e) {
    e.preventDefault();
    if (!closeForm.shiftId) { flash("Select a shift to close."); return; }
    if (!closeForm.closingCash || isNaN(closeForm.closingCash)) { flash("Enter actual cash counted."); return; }

    const closed = {
      ...selectedShift,
      closingCash:  Number(closeForm.closingCash),
      expectedCash: expectedCash,
      variance:     variance,
      note:         closeForm.note,
      closedAt:     new Date().toISOString(),
      status:       variance === 0 ? "closed" : "mismatch"
    };

    // Move from active to history
    const nextShifts = shifts.map(s => s.id === closed.id ? closed : s);
    const nextHistory = [closed, ...history];
    setShifts(nextShifts);   save(ACTIVE_SHIFTS_KEY, nextShifts);
    setHistory(nextHistory); save(SHIFT_HISTORY_KEY, nextHistory);
    setCloseForm({ shiftId: "", closingCash: "", note: "" });

    if (variance === 0) flash(`Shift closed cleanly. ${fmt(expectedCash)} accounted.`);
    else flash(`Shift closed with ${fmt(Math.abs(variance))} ${variance < 0 ? "short" : "excess"} — flagged for review.`);
  }

  // ── Stats ─────────────────────────────────────────────
  const totalOpening   = shifts.reduce((s, x) => s + (x.status === "open" ? x.openingCash : 0), 0);
  const totalCashOut   = movements.filter(m => m.type === "out").reduce((s, m) => s + m.amount, 0);
  const mismatches     = shifts.filter(s => s.status === "mismatch").length;
  const openCount      = shifts.filter(s => s.status === "open").length;

  const panelTabs = [
    { key: "start",  label: "Start Shift" },
    { key: "cashin", label: "Cash In / Out" },
    { key: "close",  label: "Close Shift" }
  ];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Shifts &amp; Cash Control</h2>
        </div>
      </header>

      {msg && <div className="mobile-banner">{msg}</div>}

      {/* Stats */}
      <div className="shift-stats-row">
        <div className="shift-stat"><strong>{openCount}</strong><span>Open Shifts</span></div>
        <div className="shift-stat"><strong>{fmt(totalOpening)}</strong><span>Opening Cash Today</span></div>
        <div className="shift-stat"><strong>{fmt(totalCashOut)}</strong><span>Cash Out Today</span></div>
        <div className={`shift-stat${mismatches > 0 ? " bad" : ""}`}>
          <strong>{mismatches}</strong><span>Mismatches</span>
        </div>
      </div>

      {mismatches > 0 && (
        <div className="shift-alert-banner">
          ⚠️ {mismatches} shift{mismatches > 1 ? "s" : ""} with cash mismatch — review before end-of-day
        </div>
      )}

      <div className="shift-page-grid">

        {/* LEFT — Forms */}
        <div className="shift-forms-col">
          {/* Tab switcher */}
          <div className="shift-tabs">
            {panelTabs.map(t => (
              <button key={t.key}
                className={`shift-tab${activePanel === t.key ? " active" : ""}`}
                onClick={() => setActivePanel(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Start Shift ── */}
          {activePanel === "start" && (
            <form className="panel shift-form" onSubmit={handleStartShift}>
              <div className="panel-head"><h3>Start Shift</h3></div>
              <p className="shift-form-note">Opens a new cashier shift on the POS. Cashier must count and confirm opening cash before starting.</p>
              <label>Outlet
                <select value={startForm.outlet} onChange={e => setStartForm(f => ({ ...f, outlet: e.target.value }))}>
                  {OUTLETS.map(o => <option key={o}>{o}</option>)}
                </select>
              </label>
              <label>Cashier
                <select value={startForm.cashier} onChange={e => setStartForm(f => ({ ...f, cashier: e.target.value }))}>
                  {CASHIERS.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>Session
                <select value={startForm.session} onChange={e => setStartForm(f => ({ ...f, session: e.target.value }))}>
                  {SESSIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Opening Cash (₹)
                <input type="number" min="0" placeholder="e.g. 5000"
                  value={startForm.openingCash}
                  onChange={e => setStartForm(f => ({ ...f, openingCash: e.target.value }))} />
              </label>
              <button type="submit" className="primary-btn">Open Shift</button>
            </form>
          )}

          {/* ── Cash In / Out ── */}
          {activePanel === "cashin" && (
            <form className="panel shift-form" onSubmit={handleCashMove}>
              <div className="panel-head"><h3>Cash In / Out</h3></div>
              <p className="shift-form-note">Record any cash added to or removed from the drawer during an active shift. All entries are logged and visible to the owner.</p>

              <div className="shift-type-toggle">
                <button type="button"
                  className={`shift-type-btn${moveForm.type === "in" ? " selected-in" : ""}`}
                  onClick={() => setMoveForm(f => ({ ...f, type: "in", reason: CASH_IN_REASONS[0] }))}>
                  + Cash In
                </button>
                <button type="button"
                  className={`shift-type-btn${moveForm.type === "out" ? " selected-out" : ""}`}
                  onClick={() => setMoveForm(f => ({ ...f, type: "out", reason: CASH_OUT_REASONS[0] }))}>
                  − Cash Out
                </button>
              </div>

              <label>Active Shift
                <select value={moveForm.shiftId}
                  onChange={e => setMoveForm(f => ({ ...f, shiftId: e.target.value }))}>
                  <option value="">— Select shift —</option>
                  {openShifts.map(s => (
                    <option key={s.id} value={s.id}>{s.cashier} · {s.outlet}</option>
                  ))}
                </select>
              </label>
              <label>Amount (₹)
                <input type="number" min="1" placeholder="e.g. 500"
                  value={moveForm.amount}
                  onChange={e => setMoveForm(f => ({ ...f, amount: e.target.value }))} />
              </label>
              <label>Reason
                <select value={moveForm.reason}
                  onChange={e => setMoveForm(f => ({ ...f, reason: e.target.value }))}>
                  {(moveForm.type === "in" ? CASH_IN_REASONS : CASH_OUT_REASONS).map(r => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>Authorized by
                <input value={moveForm.authorizedBy}
                  onChange={e => setMoveForm(f => ({ ...f, authorizedBy: e.target.value }))} />
              </label>
              <button type="submit" className={`primary-btn${moveForm.type === "out" ? " danger-btn" : ""}`}>
                Save {moveForm.type === "in" ? "Cash In" : "Cash Out"}
              </button>
            </form>
          )}

          {/* ── Close Shift ── */}
          {activePanel === "close" && (
            <form className="panel shift-form" onSubmit={handleCloseShift}>
              <div className="panel-head"><h3>Close Shift</h3></div>
              <p className="shift-form-note">Cashier physically counts cash in drawer. Enter the actual amount — system calculates variance automatically.</p>

              <label>Select Shift to Close
                <select value={closeForm.shiftId}
                  onChange={e => setCloseForm(f => ({ ...f, shiftId: e.target.value, closingCash: "" }))}>
                  <option value="">— Select shift —</option>
                  {openShifts.map(s => (
                    <option key={s.id} value={s.id}>{s.cashier} · {s.outlet} · {s.session}</option>
                  ))}
                </select>
              </label>

              {selectedShift && (
                <div className="shift-close-summary">
                  <div className="shift-close-row"><span>Opening Cash</span><strong>{fmt(selectedShift.openingCash)}</strong></div>
                  <div className="shift-close-row"><span>+ Cash In</span><strong className="green">{fmt(selectedShift.cashIn)}</strong></div>
                  <div className="shift-close-row"><span>− Cash Out</span><strong className="red">{fmt(selectedShift.cashOut)}</strong></div>
                  <div className="shift-close-row"><span>Sales (cash)</span><strong>{fmt(selectedShift.sales)}</strong></div>
                  <div className="shift-close-row total"><span>Expected in Drawer</span><strong>{fmt(expectedCash)}</strong></div>
                </div>
              )}

              <label>Actual Cash Counted (₹)
                <input type="number" min="0" placeholder="Count the drawer and enter total"
                  value={closeForm.closingCash}
                  onChange={e => setCloseForm(f => ({ ...f, closingCash: e.target.value }))} />
              </label>

              {variance !== null && (
                <div className={`shift-variance${variance === 0 ? " exact" : variance > 0 ? " excess" : " short"}`}>
                  {variance === 0 && "✓ Exact match — no variance"}
                  {variance > 0  && `▲ Excess: ${fmt(variance)} over expected`}
                  {variance < 0  && `▼ Short: ${fmt(Math.abs(variance))} missing`}
                </div>
              )}

              <label>Closing Note (optional)
                <input placeholder="Any remarks for manager review"
                  value={closeForm.note}
                  onChange={e => setCloseForm(f => ({ ...f, note: e.target.value }))} />
              </label>
              <button type="submit" className="primary-btn">Close Shift</button>
            </form>
          )}
        </div>

        {/* RIGHT — Monitor */}
        <div className="shift-monitor-col">

          {/* Active Shifts */}
          <div className="panel shift-monitor-panel">
            <div className="panel-head"><h3>Active &amp; Recent Shifts</h3></div>
            <div className="shift-table">
              <div className="shift-table-head">
                <span>Cashier</span><span>Outlet</span><span>Session</span>
                <span>Opening</span><span>Cash In</span><span>Cash Out</span>
                <span>Expected</span><span>Started</span><span>Status</span>
              </div>
              {shifts.map(s => {
                const exp = s.openingCash + s.cashIn - s.cashOut + s.sales;
                return (
                  <div key={s.id} className={`shift-table-row${s.status === "mismatch" ? " row-warn" : ""}`}>
                    <span><strong>{s.cashier}</strong></span>
                    <span>{s.outlet}</span>
                    <span>{s.session}</span>
                    <span>{fmt(s.openingCash)}</span>
                    <span className="green">+{fmt(s.cashIn)}</span>
                    <span className="red">−{fmt(s.cashOut)}</span>
                    <span>{fmt(exp)}</span>
                    <span className="muted">{timeAgo(s.startedAt)}</span>
                    <span><StatusBadge status={s.status} /></span>
                  </div>
                );
              })}
              {shifts.length === 0 && <div className="shift-empty">No shifts today</div>}
            </div>
          </div>

          {/* Cash Movements Log */}
          <div className="panel shift-monitor-panel">
            <div className="panel-head"><h3>Cash Movement Log</h3></div>
            <div className="shift-move-list">
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
                  <div className={`shift-move-amount ${m.type === "in" ? "green" : "red"}`}>
                    {m.type === "in" ? "+" : "−"}{fmt(m.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Closed Shifts */}
          {history.length > 0 && (
            <div className="panel shift-monitor-panel">
              <div className="panel-head"><h3>Shift History</h3></div>
              <div className="shift-table">
                <div className="shift-table-head">
                  <span>Cashier</span><span>Outlet</span><span>Expected</span>
                  <span>Actual</span><span>Variance</span><span>Status</span>
                </div>
                {history.map(s => (
                  <div key={s.id} className={`shift-table-row${s.status === "mismatch" ? " row-warn" : ""}`}>
                    <span><strong>{s.cashier}</strong></span>
                    <span>{s.outlet}</span>
                    <span>{fmt(s.expectedCash)}</span>
                    <span>{fmt(s.closingCash)}</span>
                    <span className={s.variance === 0 ? "green" : "red"}>
                      {s.variance === 0 ? "Exact" : (s.variance > 0 ? "+" : "") + fmt(s.variance)}
                    </span>
                    <span><StatusBadge status={s.status} /></span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
