import { useState } from "react";
import { tapImpact, errorVibrate } from "../lib/haptics";

const NUMPAD_KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

const AVATAR_COLORS = ["#1C1C1E","#2563EB","#16A34A","#D97706","#7C3AED","#DC2626","#0891B2","#BE185D"];
export function avatarBg(name = "") {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export function LoginScreen({ outletName, staff = [], onLogin, onForgetDevice }) {
  const [selected, setSelected] = useState(null);
  const [pin,      setPin]      = useState("");
  const [error,    setError]    = useState("");
  const [shake,    setShake]    = useState(false);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
    errorVibrate();
  }

  function handleDigit(d) {
    if (pin.length >= 4) return;
    tapImpact(); // fire-and-forget — never block PIN state on haptics
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) {
      setTimeout(() => {
        // Auto-login if pin is 0000 (not set)
        if (selected.pin === "0000" || next === selected.pin) {
          onLogin(selected);
        } else {
          triggerShake();
          setError("Wrong PIN — try again");
          setTimeout(() => setPin(""), 400);
        }
      }, 150);
    }
  }

  function handleDel() {
    setPin(p => p.slice(0, -1));
    setError("");
    tapImpact(); // fire-and-forget
  }

  // ── Staff selection grid ───────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="login-page">
        <div className="login-header">
          <div className="login-logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9"/>
              <path d="M8 12h8" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <h1 className="login-app-name">Plato Captain</h1>
            <p className="login-outlet-name">{outletName || "Select your profile"}</p>
          </div>
        </div>

        <p className="login-prompt">Who's working today?</p>

        <div className="staff-grid">
          {staff.map((s) => (
            <button
              key={s.id}
              className="staff-card"
              onClick={() => {
                tapImpact();
                // Auto-login if no pin set
                if (!s.pin || s.pin === "0000") {
                  onLogin(s);
                } else {
                  setSelected(s);
                  setPin("");
                  setError("");
                }
              }}
            >
              <span className="staff-avatar" style={{ background: avatarBg(s.name) }}>
                {s.avatar || s.name?.[0]?.toUpperCase() || "?"}
              </span>
              <span className="staff-name">{s.name}</span>
              <span className="staff-role">{s.role}</span>
            </button>
          ))}
        </div>

        {onForgetDevice && (
          <button className="forget-device-btn" onClick={onForgetDevice}>
            Reset this device
          </button>
        )}
      </div>
    );
  }

  // ── PIN entry ──────────────────────────────────────────────────────────────
  return (
    <div className="login-page">
      <button
        className="pin-back-btn"
        onClick={() => { setSelected(null); setPin(""); setError(""); }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>

      <div className="pin-profile">
        <span className="pin-avatar" style={{ background: avatarBg(selected.name) }}>
          {selected.avatar || selected.name?.[0]?.toUpperCase()}
        </span>
        <p className="pin-name">{selected.name}</p>
        <p className="pin-role">{selected.role}</p>
      </div>

      <div className={`pin-dots${shake ? " shake" : ""}`}>
        {[0,1,2,3].map((i) => (
          <span key={i} className={`pin-dot${pin.length > i ? " filled" : ""}`} />
        ))}
      </div>

      <p className={`pin-label${error ? " pin-label-error" : ""}`}>
        {error || "Enter your 4-digit PIN"}
      </p>

      <div className="numpad">
        {NUMPAD_KEYS.map((k, i) => (
          <button
            key={i}
            className={`numpad-key${k === "" ? " numpad-empty" : ""}${k === "⌫" ? " numpad-del" : ""}`}
            onClick={() => k === "⌫" ? handleDel() : k && handleDigit(k)}
            disabled={k === ""}
          >
            {k === "⌫" ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                <line x1="18" y1="9" x2="12" y2="15"/>
                <line x1="12" y1="9" x2="18" y2="15"/>
              </svg>
            ) : k}
          </button>
        ))}
      </div>
    </div>
  );
}
