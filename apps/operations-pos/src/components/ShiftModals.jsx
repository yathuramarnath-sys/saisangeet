import { useState } from "react";

const CASH_OUT_REASONS = ["Petty expense","Vendor payment","Courier payout","Staff advance","Utility bill","Other"];
const CASH_IN_REASONS  = ["Change refill","Float top-up","Manager deposit","Other"];
const MANAGER_PIN      = "1234";

/* ── Shared numpad ────────────────────────────────────────────────────────── */
function NumPad({ value, onChange, maxLen = 6 }) {
  function press(key) {
    if (key === "⌫") { onChange(value.length > 1 ? value.slice(0, -1) : "0"); }
    else if (key === "C") { onChange("0"); }
    else {
      const next = value === "0" ? key : value + key;
      if (next.length <= maxLen) onChange(next);
    }
  }
  const keys = ["1","2","3","4","5","6","7","8","9","C","0","⌫"];
  return (
    <div className="sg-numpad compact">
      {keys.map(k => (
        <button key={k} type="button"
          className={`sg-numpad-key${k === "C" ? " clr" : k === "⌫" ? " del" : ""}`}
          onClick={() => press(k)}>
          {k}
        </button>
      ))}
    </div>
  );
}

/* ── Cash In / Cash Out modal ─────────────────────────────────────────────── */
export function CashMovementModal({ shift, type, onClose, onSaved }) {
  const isIn   = type === "in";
  const reasons = isIn ? CASH_IN_REASONS : CASH_OUT_REASONS;

  const [amount,   setAmount]   = useState("0");
  const [reason,   setReason]   = useState(reasons[0]);
  const [pin,      setPin]      = useState("");
  const [pinError, setPinError] = useState(false);

  function handleSave() {
    if (pin !== MANAGER_PIN) { setPinError(true); return; }
    const amt = Number(amount);
    if (!amt) return;

    const movement = {
      id:           `mv-${Date.now()}`,
      shiftId:      shift.id,
      cashier:      shift.cashier,
      outlet:       shift.outlet,
      type,
      amount:       amt,
      reason,
      authorizedBy: "Manager",
      time:         new Date().toISOString()
    };

    // Persist movement log
    let movements = [];
    try { movements = JSON.parse(localStorage.getItem("pos_cash_movements") || "[]") || []; }
    catch {}
    localStorage.setItem("pos_cash_movements", JSON.stringify([...movements, movement]));

    // Update running totals on shift
    let active = [];
    try { active = JSON.parse(localStorage.getItem("pos_active_shifts") || "[]") || []; }
    catch {}
    const updated = active.map(s => {
      if (s.id !== shift.id) return s;
      return {
        ...s,
        cashIn:  isIn  ? (s.cashIn  || 0) + amt : s.cashIn,
        cashOut: !isIn ? (s.cashOut || 0) + amt : s.cashOut
      };
    });
    localStorage.setItem("pos_active_shifts", JSON.stringify(updated));

    onSaved(movement, updated.find(s => s.id === shift.id));
    onClose();
  }

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sm-modal">
        <div className="sm-head">
          <div>
            <h3>{isIn ? "↑ Cash In" : "↓ Cash Out"}</h3>
            <p className="sm-sub">{shift.cashier} · {shift.outlet} · {shift.session}</p>
          </div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="sm-body">
          <div className="sm-field">
            <label>Amount</label>
            <div className="sm-cash-display">₹ {Number(amount).toLocaleString("en-IN")}</div>
            <NumPad value={amount} onChange={setAmount} />
          </div>

          <div className="sm-field">
            <label>Reason</label>
            <div className="sm-reason-pills">
              {reasons.map(r => (
                <button key={r} type="button"
                  className={`sm-reason-pill${reason === r ? " active" : ""}`}
                  onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="sm-field">
            <label>Manager PIN</label>
            <input
              type="password"
              className={`sm-pin-input${pinError ? " error" : ""}`}
              placeholder="Enter 4-digit PIN"
              value={pin}
              maxLength={6}
              onChange={e => { setPin(e.target.value); setPinError(false); }}
            />
            {pinError && <span className="sm-pin-error">Incorrect PIN. Try again.</span>}
          </div>
        </div>

        <div className="sm-footer">
          <button type="button" className="sm-btn-cancel" onClick={onClose}>Cancel</button>
          <button type="button"
            className={`sm-btn-action ${isIn ? "in" : "out"}`}
            disabled={!Number(amount)}
            onClick={handleSave}>
            {isIn ? "Record Cash In" : "Record Cash Out"} · ₹{Number(amount).toLocaleString("en-IN")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Close Shift modal ────────────────────────────────────────────────────── */
export function CloseShiftModal({ shift, orders, onClose, onShiftClosed }) {
  const [closingCash, setClosingCash] = useState("0");
  const [note,        setNote]        = useState("");

  // Cash sales from closed orders this shift
  const cashSales = Object.values(orders || {})
    .filter(o => o.isClosed)
    .reduce((sum, o) => {
      const sub  = (o.items || []).reduce((s, i) => s + i.price * i.quantity, 0);
      const disc = Math.min(o.discountAmount || 0, sub);
      // Only count cash payments
      const cashPaid = (o.payments || [])
        .filter(p => p.method === "cash")
        .reduce((s, p) => s + p.amount, 0);
      return sum + cashPaid;
    }, 0);

  const expectedCash = (shift.openingCash || 0)
    + (shift.cashIn  || 0)
    - (shift.cashOut || 0)
    + cashSales;

  const closingNum = Number(closingCash) || 0;
  const variance   = closingNum - expectedCash;
  const counted    = closingCash !== "0";
  const isShort    = counted && variance < 0;
  const isOver     = counted && variance > 0;
  const isExact    = counted && variance === 0;

  function fmt(n) { return "₹" + Math.abs(n).toLocaleString("en-IN"); }

  function handleClose() {
    const closed = {
      ...shift,
      closingCash:  closingNum,
      expectedCash,
      variance,
      closedAt:     new Date().toISOString(),
      status:       variance !== 0 ? "mismatch" : "closed",
      note:         note.trim()
    };

    let active  = [];
    let history = [];
    try { active  = JSON.parse(localStorage.getItem("pos_active_shifts")  || "[]") || []; } catch {}
    try { history = JSON.parse(localStorage.getItem("pos_shift_history")   || "[]") || []; } catch {}

    localStorage.setItem("pos_active_shifts", JSON.stringify(active.filter(s => s.id !== shift.id)));
    localStorage.setItem("pos_shift_history",  JSON.stringify([...history, closed]));

    onShiftClosed();
  }

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sm-modal wide">
        <div className="sm-head">
          <div>
            <h3>Close Shift</h3>
            <p className="sm-sub">{shift.cashier} · {shift.session} · {shift.outlet}</p>
          </div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="sm-body">
          {/* Shift summary */}
          <div className="sm-summary-grid">
            <div className="sm-sum-row">
              <span>Opening Cash</span>
              <strong>{fmt(shift.openingCash || 0)}</strong>
            </div>
            <div className="sm-sum-row green">
              <span>Cash In</span>
              <strong>+{fmt(shift.cashIn || 0)}</strong>
            </div>
            <div className="sm-sum-row red">
              <span>Cash Out</span>
              <strong>−{fmt(shift.cashOut || 0)}</strong>
            </div>
            <div className="sm-sum-row">
              <span>Cash Sales</span>
              <strong>{fmt(cashSales)}</strong>
            </div>
            <div className="sm-sum-row expected">
              <span>Expected in Drawer</span>
              <strong>{fmt(expectedCash)}</strong>
            </div>
          </div>

          {/* Count cash */}
          <div className="sm-field">
            <label>Count Cash in Drawer</label>
            <div className="sm-cash-display">₹ {closingNum.toLocaleString("en-IN")}</div>
            <NumPad value={closingCash} onChange={setClosingCash} />
          </div>

          {/* Variance result */}
          {counted && (
            <div className={`sm-variance-bar ${isExact ? "ok" : isShort ? "short" : "over"}`}>
              {isExact && <><span className="sm-var-icon">✓</span> Perfect match — all cash accounted for</>}
              {isShort && <><span className="sm-var-icon">⚠</span> {fmt(variance)} short — needs manager review</>}
              {isOver  && <><span className="sm-var-icon">↑</span> {fmt(variance)} over</>}
            </div>
          )}

          {counted && !isExact && (
            <div className="sm-field">
              <label>Note (optional)</label>
              <input
                type="text"
                className="sm-note-input"
                placeholder="Explain the variance..."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="sm-footer">
          <button type="button" className="sm-btn-cancel" onClick={onClose}>Cancel</button>
          <button type="button"
            className={`sm-btn-action ${isExact ? "close-ok" : "close-warn"}`}
            disabled={!counted}
            onClick={handleClose}>
            {isExact ? "✓ Close Shift" : "Close Shift (Mismatch)"}
          </button>
        </div>
      </div>
    </div>
  );
}
