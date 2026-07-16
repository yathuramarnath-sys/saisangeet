import { useState } from "react";
import { tapImpact, errorVibrate } from "../lib/haptics";

const NUMPAD_KEYS = ["1","2","3","4","5","6","7","8","9","Help","0","⌫"];
const LAST_USED_KEY = "captain_last_staff_id";

const AVATAR_COLORS = ["#1C1C1E","#2563EB","#16A34A","#D97706","#7C3AED","#DC2626","#0891B2","#BE185D"];
export function avatarBg(name = "") {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

// Initials from name
function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function LoginScreen({ outletName, staff = [], onLogin, onForgetDevice }) {
  const [selected, setSelected] = useState(null);
  const [pin,      setPin]      = useState("");
  const [error,    setError]    = useState("");
  const [shake,    setShake]    = useState(false);
  const [query,    setQuery]    = useState("");

  const lastUsedId = localStorage.getItem(LAST_USED_KEY);
  const lastUsed   = lastUsedId ? staff.find(s => String(s.id) === lastUsedId) : null;
  const others     = staff.filter(s => String(s.id) !== lastUsedId);
  const filtered   = query.trim()
    ? others.filter(s => s.name?.toLowerCase().includes(query.toLowerCase()))
    : others;

  function doLogin(member) {
    localStorage.setItem(LAST_USED_KEY, String(member.id));
    onLogin(member);
  }

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
        if (next === selected.pin) {
          doLogin(selected);
        } else {
          triggerShake();
          setError("INCORRECT PIN — TRY AGAIN");
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

  function pickStaff(s) {
    tapImpact();
    if (!s.pin) {
      doLogin(s);
    } else {
      setSelected(s);
      setPin("");
      setError("");
    }
  }

  // ── Staff picker ──────────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="ls2-page ls2-picker-page">
        {/* Top greeting */}
        <div className="ls2-picker-top">
          <p className="ls2-greeting">{getGreeting()}</p>
          <h1 className="ls2-who-heading">Who's on shift?</h1>
        </div>

        {/* Last used featured card */}
        {lastUsed && (
          <div className="ls2-last-card">
            <div className="ls2-last-card-row">
              <span className="ls2-last-avatar" style={{ background: avatarBg(lastUsed.name) }}>
                {lastUsed.avatar || initials(lastUsed.name)}
              </span>
              <div className="ls2-last-info">
                <div className="ls2-last-name-row">
                  <span className="ls2-last-name">{lastUsed.name}</span>
                  <span className="ls2-last-badge">LAST USED</span>
                </div>
                <span className="ls2-last-role">
                  {[lastUsed.role, lastUsed.area || lastUsed.workArea].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
            <button className="ls2-continue-btn" onClick={() => pickStaff(lastUsed)}>
              Continue as {lastUsed.name.split(" ")[0]} →
            </button>
          </div>
        )}

        {/* Switch captain */}
        <div className="ls2-switch-section">
          {lastUsed && <p className="ls2-switch-label">OR SWITCH CAPTAIN</p>}

          {/* Search */}
          <div className="ls2-search-wrap">
            <svg className="ls2-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="ls2-search"
              type="text"
              placeholder="Search captains"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {/* Captain list */}
          <div className="ls2-list-card">
            {filtered.map((s, idx) => (
              <button
                key={s.id}
                className={`ls2-list-row${idx > 0 ? " ls2-list-row-sep" : ""}`}
                onClick={() => pickStaff(s)}
              >
                <span className="ls2-list-avatar" style={{ background: avatarBg(s.name) }}>
                  {s.avatar || initials(s.name)}
                </span>
                <div className="ls2-list-info">
                  <span className="ls2-list-name">{s.name}</span>
                  <span className="ls2-list-role">
                    {[s.role, s.area || s.workArea].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <svg className="ls2-list-chevron" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            ))}
            {filtered.length === 0 && query && (
              <p className="ls2-list-empty">No captains matching "{query}"</p>
            )}
            {filtered.length === 0 && !query && !lastUsed && (
              <p className="ls2-list-empty">No captains set up yet.</p>
            )}
          </div>
        </div>

        {onForgetDevice && (
          <button className="ls2-forget" onClick={onForgetDevice}>Reset this device</button>
        )}
      </div>
    );
  }

  // ── PIN entry ─────────────────────────────────────────────────────────────
  return (
    <div className="ls2-page ls2-pin-page">
      {/* Plato logo */}
      <div className="ls2-logo-row">
        <div className="ls2-logo-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1C1C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="2" x2="12" y2="22"/>
            <path d="M6 4h6a4 4 0 0 1 0 8H6"/>
            <path d="M6 12h8"/>
          </svg>
        </div>
        <div>
          <span className="ls2-logo-brand">PLATO</span>
          <span className="ls2-logo-app">Captain</span>
        </div>
      </div>

      {/* User card with Switch link */}
      <div className="ls2-pin-user-card">
        <span className="ls2-pin-avatar" style={{ background: avatarBg(selected.name) }}>
          {selected.avatar || initials(selected.name)}
        </span>
        <div className="ls2-pin-user-info">
          <p className="ls2-pin-name">{selected.name}</p>
          <p className="ls2-pin-role">
            {[selected.role, selected.area || selected.workArea].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button className="ls2-switch-btn" onClick={() => { setSelected(null); setPin(""); setError(""); }}>
          Switch
        </button>
      </div>

      {/* PIN indicator */}
      <p className={`ls2-pin-label${error ? " ls2-pin-label-error" : ""}`}>
        {error || "ENTER YOUR 4-DIGIT PIN"}
      </p>
      <div className={`ls2-dots${shake ? " ls2-shake" : ""}`}>
        {[0,1,2,3].map((i) => (
          <span key={i} className={`ls2-dot${error ? " ls2-dot-error" : pin.length > i ? " ls2-dot-filled" : ""}`} />
        ))}
      </div>

      {/* Numpad */}
      <div className="ls2-numpad">
        {NUMPAD_KEYS.map((k, i) => (
          <button
            key={i}
            className={`ls2-key${k === "Help" ? " ls2-key-help" : ""}${k === "⌫" ? " ls2-key-del" : ""}`}
            onClick={() => k === "⌫" ? handleDel() : k !== "Help" && k && handleDigit(k)}
            disabled={k === "Help"}
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
