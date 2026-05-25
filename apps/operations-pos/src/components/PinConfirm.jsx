import { useState } from "react";

const NUMPAD_KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

/**
 * PinConfirm — re-auth modal for sensitive POS actions (void / cancel order).
 *
 * Props:
 *   cashierName  — name shown on the modal ("Confirm as Devaki")
 *   cashierPin   — the PIN to validate against (4 digits, stored at login)
 *   title        — modal heading
 *   onConfirm()  — called when PIN matches (or no PIN is set)
 *   onCancel()   — called when cashier dismisses
 *
 * If cashierPin is empty/0000 → onConfirm() fires immediately without showing the modal.
 * (Handled by the caller — see OrderPanel.)
 */
export function PinConfirm({ cashierName, cashierPin, title = "Confirm Action", onConfirm, onCancel }) {
  const [pin,   setPin]   = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  function handleKey(k) {
    if (k === "⌫") {
      setPin(p => p.slice(0, -1));
      setError("");
      return;
    }
    if (!k || pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    setError("");

    if (next.length === 4) {
      setTimeout(() => {
        if (next === cashierPin) {
          onConfirm();
        } else {
          triggerShake();
          setError("Wrong PIN — try again");
          setTimeout(() => setPin(""), 400);
        }
      }, 120);
    }
  }

  return (
    <div className="pin-confirm-overlay" onClick={onCancel}>
      <div
        className={`pin-confirm-card${shake ? " pin-shake" : ""}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <p className="pin-confirm-title">{title}</p>
        <p className="pin-confirm-sub">Re-enter PIN as <strong>{cashierName}</strong></p>

        {/* Dots */}
        <div className="pin-confirm-dots">
          {[0,1,2,3].map(i => (
            <span key={i} className={`pin-dot${pin.length > i ? " filled" : ""}`} />
          ))}
        </div>

        {error && <p className="pin-confirm-error">{error}</p>}

        {/* Numpad */}
        <div className="pin-confirm-numpad">
          {NUMPAD_KEYS.map((k, i) => (
            <button
              key={i}
              type="button"
              className={`pin-key${k === "" ? " pin-key-blank" : ""}${k === "⌫" ? " pin-key-del" : ""}`}
              onClick={() => handleKey(k)}
              disabled={!k}
            >
              {k}
            </button>
          ))}
        </div>

        <button type="button" className="pin-confirm-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
