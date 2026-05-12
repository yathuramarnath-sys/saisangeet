import { useState } from "react";

const SESSIONS = ["Breakfast", "Lunch", "Dinner", "Full Day"];

function loadStaffNames() {
  try {
    const saved = JSON.parse(localStorage.getItem("pos_staff") || "null");
    if (Array.isArray(saved) && saved.length) return saved.map(s => s.name);
  } catch {}
  return [];
}

/* ── Touch numpad ─────────────────────────────────────────────────────────── */
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
    <div className="sg-numpad">
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

/* ── ShiftGate ────────────────────────────────────────────────────────────── */
export function ShiftGate({ outletName, cashierName, onShiftStarted }) {
  const staffNames = loadStaffNames();
  const defaultCashier = cashierName || staffNames[0] || "";

  const [session,     setSession]     = useState("Lunch");
  const [cashier,     setCashier]     = useState(defaultCashier);
  const [openingCash, setOpeningCash] = useState("5000");

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long"
  });

  function handleStart() {
    const shift = {
      id:          `shift-${Date.now()}`,
      cashier,
      outlet:      outletName || "Outlet",
      session,
      openingCash: Number(openingCash) || 0,
      cashIn:      0,
      cashOut:     0,
      sales:       0,
      startedAt:   new Date().toISOString(),
      status:      "open"
    };

    let existing = [];
    try { existing = JSON.parse(localStorage.getItem("pos_active_shifts") || "[]") || []; }
    catch {}
    localStorage.setItem("pos_active_shifts", JSON.stringify([...existing, shift]));
    onShiftStarted(shift);
  }

  return (
    <div className="sg-overlay">
      <div className="sg-card">

        {/* Brand */}
        <div className="sg-brand">
          <div className="sg-brand-icon">
            <img src="/plato-pos-logo.svg" alt="Plato POS" style={{width: 48, height: 48, objectFit: "contain"}} />
          </div>
          <div className="sg-brand-text">
            <h2>{outletName || "Plato POS"}</h2>
            <p>{today}</p>
          </div>
        </div>

        {/* Session */}
        <div className="sg-group">
          <span className="sg-label">Session</span>
          <div className="sg-pills">
            {SESSIONS.map(s => (
              <button key={s} type="button"
                className={`sg-pill${session === s ? " active" : ""}`}
                onClick={() => setSession(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Cashier */}
        <div className="sg-group">
          <span className="sg-label">Cashier</span>
          <select className="sg-select" value={cashier}
            onChange={e => setCashier(e.target.value)}>
            {staffNames.length > 0
              ? staffNames.map(c => <option key={c}>{c}</option>)
              : <option>{cashier}</option>
            }
          </select>
        </div>

        {/* Opening Cash */}
        <div className="sg-group">
          <span className="sg-label">Opening Cash</span>
          <div className="sg-cash-display">
            ₹ {Number(openingCash).toLocaleString("en-IN")}
          </div>
          <NumPad value={openingCash} onChange={setOpeningCash} />
        </div>

        <button type="button" className="sg-start-btn" onClick={handleStart}>
          Start Shift
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>

      </div>
    </div>
  );
}
