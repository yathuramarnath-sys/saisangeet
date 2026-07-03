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
    tapImpact();
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) {
      setTimeout(() => {
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
    tapImpact();
  }

  // ── Staff selection grid ──────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="ls2-page">
        <div className="ls2-header">
          <div className="ls2-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9"/>
              <path d="M8 12h8" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <h1 className="ls2-appname">Plato Captain</h1>
            <p className="ls2-outlet">{outletName || "Select your profile"}</p>
          </div>
        </div>

        <p className="ls2-prompt">Who's working today?</p>

        <div className="ls2-grid">
          {staff.map((s) => (
            <button
              key={s.id}
              className="ls2-card"
              onClick={() => {
                tapImpact();
                if (!s.pin || s.pin === "0000") {
                  onLogin(s);
                } else {
                  setSelected(s);
                  setPin("");
                  setError("");
                }
              }}
            >
              <span className="ls2-avatar" style={{ background: avatarBg(s.name) }}>
                {s.avatar || s.name?.[0]?.toUpperCase() || "?"}
              </span>
              <span className="ls2-name">{s.name}</span>
              <span className="ls2-role">{s.role}</span>
            </button>
          ))}
        </div>

        {onForgetDevice && (
          <button className="ls2-forget" onClick={onForgetDevice}>
            Reset this device
          </button>
        )}
      </div>
    );
  }

  // ── PIN entry ─────────────────────────────────────────────────────────────
  return (
    <div className="ls2-page">
      <button
        className="ls2-back"
        onClick={() => { setSelected(null); setPin(""); setError(""); }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>

      <div className="ls2-profile">
        <span className="ls2-pin-avatar" style={{ background: avatarBg(selected.name) }}>
          {selected.avatar || selected.name?.[0]?.toUpperCase()}
        </span>
        <p className="ls2-pin-name">{selected.name}</p>
        <p className="ls2-pin-role">{selected.role}</p>
      </div>

      <div className={`ls2-dots${shake ? " ls2-shake" : ""}`}>
        {[0,1,2,3].map((i) => (
          <span key={i} className={`ls2-dot${pin.length > i ? " ls2-dot-filled" : ""}`} />
        ))}
      </div>

      <p className={`ls2-hint${error ? " ls2-hint-error" : ""}`}>
        {error || "Enter your 4-digit PIN"}
      </p>

      <div className="ls2-numpad">
        {NUMPAD_KEYS.map((k, i) => (
          <button
            key={i}
            className={`ls2-key${k === "" ? " ls2-key-empty" : ""}${k === "⌫" ? " ls2-key-del" : ""}`}
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
