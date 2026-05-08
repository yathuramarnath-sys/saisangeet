import { useState } from "react";
import { getBillPrinter } from "../lib/kotPrint";

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

/* ── Shift Closing Receipt (printable) ────────────────────────────────────── */
function ShiftReceipt({ shift, cashSales, expectedCash, closingNum, variance, shiftOrders }) {
  // shiftOrders is an array of closed orders for this shift
  const totalOrders = (shiftOrders || []).length;
  const totalSales  = (shiftOrders || []).reduce((s, o) => {
    const sub  = (o.items || []).filter(i => !i.isVoided && !i.isComp)
                                 .reduce((ss, i) => ss + i.price * i.quantity, 0);
    const disc = Math.min(o.discountAmount || 0, sub);
    return s + (sub - disc);
  }, 0);
  const payments = (shiftOrders || []).reduce((acc, o) => {
    (o.payments || []).forEach(p => {
      acc[p.method] = (acc[p.method] || 0) + p.amount;
    });
    return acc;
  }, {});
  const fmt = n => "₹" + Math.abs(n).toLocaleString("en-IN");
  const now = new Date();

  return (
    <div className="shift-receipt" id="shift-receipt-print">
      <div className="sr-header">
        <div className="sr-logo">🍽</div>
        <div className="sr-outlet">{shift.outlet}</div>
        <div className="sr-title">SHIFT CLOSING REPORT</div>
        <div className="sr-meta">
          {now.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
          {" · "}
          {now.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true })}
        </div>
      </div>

      <div className="sr-divider">{'─'.repeat(32)}</div>

      <div className="sr-row"><span>Cashier</span><span>{shift.cashier}</span></div>
      <div className="sr-row"><span>Session</span><span>{shift.session}</span></div>
      <div className="sr-row"><span>Started</span><span>
        {new Date(shift.startedAt).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true })}
      </span></div>
      <div className="sr-row"><span>Closed</span><span>
        {now.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true })}
      </span></div>

      <div className="sr-divider">{'─'.repeat(32)}</div>
      <div className="sr-section-title">CASH REGISTER</div>
      <div className="sr-row"><span>Opening Cash</span><span>{fmt(shift.openingCash||0)}</span></div>
      <div className="sr-row green"><span>+ Cash In</span><span>{fmt(shift.cashIn||0)}</span></div>
      <div className="sr-row red"><span>− Cash Out</span><span>{fmt(shift.cashOut||0)}</span></div>
      <div className="sr-row"><span>Cash Sales</span><span>{fmt(cashSales)}</span></div>
      <div className="sr-row bold"><span>Expected in Drawer</span><span>{fmt(expectedCash)}</span></div>
      <div className="sr-row bold"><span>Counted</span><span>{fmt(closingNum)}</span></div>
      <div className={`sr-row bold ${variance === 0 ? "ok" : variance < 0 ? "short" : "over"}`}>
        <span>Variance</span>
        <span>{variance === 0 ? "✓ MATCH" : variance > 0 ? `+${fmt(variance)} OVER` : `${fmt(variance)} SHORT`}</span>
      </div>

      <div className="sr-divider">{'─'.repeat(32)}</div>
      <div className="sr-section-title">SALES SUMMARY</div>
      <div className="sr-row"><span>Total Orders</span><span>{totalOrders}</span></div>
      <div className="sr-row bold"><span>Total Sales</span><span>{fmt(totalSales)}</span></div>

      {Object.keys(payments).length > 0 && (
        <>
          <div className="sr-divider">{'─'.repeat(32)}</div>
          <div className="sr-section-title">PAYMENT BREAKDOWN</div>
          {Object.entries(payments).map(([method, amt]) => (
            <div key={method} className="sr-row">
              <span>{method.charAt(0).toUpperCase() + method.slice(1)}</span>
              <span>{fmt(amt)}</span>
            </div>
          ))}
        </>
      )}

      <div className="sr-divider">{'─'.repeat(32)}</div>
      <div className="sr-footer">Thank you · Have a great day!</div>
      <div className="sr-footer sm">Powered by Plato</div>
    </div>
  );
}

/* ── Close Shift modal ────────────────────────────────────────────────────── */
export function CloseShiftModal({ shift, orders, onClose, onShiftClosed }) {
  const [closingCash,  setClosingCash]  = useState("0");
  const [note,         setNote]         = useState("");
  const [showReceipt,  setShowReceipt]  = useState(false);
  const [closedRecord, setClosedRecord] = useState(null); // holds the closed shift object

  // Read all closed orders for this shift from pos_closed_orders.
  // (The `orders` state prop has already been reset to blank tables by the time
  //  the cashier opens Close Shift, so we must read from the persistent log.)
  const shiftOrders = (() => {
    try {
      const all = JSON.parse(localStorage.getItem("pos_closed_orders") || "[]") || [];
      const shiftStart = new Date(shift.startedAt).getTime();
      return all.filter(o => o.isClosed && new Date(o.closedAt || 0).getTime() >= shiftStart);
    } catch { return []; }
  })();

  // Cash sales from closed orders this shift
  const cashSales = shiftOrders.reduce((sum, o) => {
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

    setClosedRecord(closed);
    setShowReceipt(true); // show receipt before final close
  }

  function handlePrintAndExit() {
    const el = document.getElementById("shift-receipt-print");

    const RECEIPT_CSS = `
      body { font-family: 'Courier New', monospace; font-size: 12px; padding: 16px; max-width: 300px; margin: 0 auto; }
      .sr-header { text-align: center; margin-bottom: 8px; }
      .sr-logo { font-size: 24px; }
      .sr-outlet { font-weight: bold; font-size: 14px; }
      .sr-title { font-size: 11px; letter-spacing: 1px; margin-top: 4px; }
      .sr-meta { font-size: 10px; color: #555; }
      .sr-divider { color: #aaa; margin: 6px 0; }
      .sr-section-title { font-size: 10px; letter-spacing: 1.5px; color: #888; margin: 8px 0 4px; }
      .sr-row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px; }
      .sr-row.bold { font-weight: bold; }
      .sr-row.ok { color: #27AE60; }
      .sr-row.short { color: #C0392B; }
      .sr-row.over { color: #E67E22; }
      .sr-row.green { color: #27AE60; }
      .sr-row.red { color: #C0392B; }
      .sr-footer { text-align: center; margin-top: 8px; font-size: 11px; }
      .sr-footer.sm { font-size: 10px; color: #aaa; }
      @page { size: 80mm auto; margin: 0; }
    `;

    if (el) {
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Shift Report</title>
        <style>${RECEIPT_CSS}</style></head><body>${el.innerHTML}</body></html>`;

      // ── Electron: silent print to thermal printer ────────────────────────
      if (window.electronAPI?.printHTML) {
        const printer = getBillPrinter();
        const printerName  = printer?.winName || printer?.name || null;
        const printerIp    = printer?.ip?.trim() || null;
        const paperWidthMm = printer?.paper === "58mm" ? 58 : 80;
        window.electronAPI.printHTML({ html: fullHtml, printerName, printerIp, paperWidthMm })
          .then(result => {
            if (!result?.ok) console.warn("[ShiftPrint] Print failed:", result?.error);
          })
          .catch(err => console.warn("[ShiftPrint] IPC error:", err.message));
      } else {
        // ── Browser fallback: popup print dialog ──────────────────────────
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(fullHtml);
          w.document.close();
          w.focus();
          w.print();
          w.close();
        }
      }
    }

    onShiftClosed(closedRecord);
  }

  // After shift closed — show receipt screen
  if (showReceipt) {
    return (
      <div className="sm-overlay">
        <div className="sm-modal">
          <div className="sm-head">
            <div><h3>✓ Shift Closed</h3><p className="sm-sub">Print shift summary below</p></div>
          </div>
          <div className="sm-body" style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
            <ShiftReceipt
              shift={shift}
              cashSales={cashSales}
              expectedCash={expectedCash}
              closingNum={closingNum}
              variance={variance}
              shiftOrders={shiftOrders}
            />
          </div>
          <div className="sm-footer">
            <button type="button" className="sm-btn-cancel" onClick={() => onShiftClosed(closedRecord)}>
              Skip Print
            </button>
            <button type="button" className="sm-btn-action close-ok" onClick={handlePrintAndExit}>
              🖨 Print &amp; Exit
            </button>
          </div>
        </div>
      </div>
    );
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
