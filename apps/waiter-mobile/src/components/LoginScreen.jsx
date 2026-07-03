import { useState, useMemo } from "react";
import { tapImpact, errorVibrate } from "../lib/haptics";

const NUMPAD_KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

const AVATAR_COLORS = ["#1C1C1E","#2563EB","#16A34A","#D97706","#7C3AED","#DC2626","#0891B2","#BE185D"];
export function avatarBg(name = "") {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getLastUsedId() {
  try { return localStorage.getItem("captain_last_used_id") || null; }
  catch { return null; }
}

function saveLastUsedId(id) {
  try { localStorage.setItem("captain_last_used_id", id); } catch {}
}

export function LoginScreen({ outletName, outletCode, staff = [], onLogin, onForgetDevice }) {
  const [selected,   setSelected]   = useState(null);
  const [pin,        setPin]        = useState("");
  const [error,      setError]      = useState("");
  const [shake,      setShake]      = useState(false);
  const [search,     setSearch]     = useState("");
  const [lastUsedId] = useState(getLastUsedId);

  const lastUsed  = staff.find(s => s.id === lastUsedId) || null;
  const filtered  = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? staff.filter(s => s.name.toLowerCase().includes(q)) : staff;
  }, [staff, search]);
  const listStaff = search ? filtered : filtered.filter(s => s.id !== lastUsedId);

  function doLogin(s) {
    saveLastUsedId(s.id);
    onLogin(s);
  }

  function selectStaff(s) {
    tapImpact();
    if (!s.pin || s.pin === "0000") {
      doLogin(s);
    } else {
      setSelected(s);
      setPin("");
      setError("");
    }
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
        if (selected.pin === "0000" || next === selected.pin) {
          doLogin(selected);
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

  // ── Staff selection ────────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="login-page login-page-v2">
        {/* Connection status pill */}
        {(outletCode || outletName) && (
          <div className="lv2-conn-row">
            <div className="lv2-conn-pill">
              <span className="lv2-conn-dot" />
              <span className="lv2-conn-label">{outletCode || outletName} · Connected</span>
            </div>
          </div>
        )}

        {/* Greeting */}
        <div className="lv2-greeting">
          <p className="lv2-greeting-sub">{getGreeting()}</p>
          <h1 className="lv2-greeting-head">Who's on shift?</h1>
        </div>

        {/* Last used hero card */}
        {lastUsed && (
          <div className="lv2-last-card">
            <div className="lv2-last-profile">
              <span className="lv2-last-avatar" style={{ background: avatarBg(lastUsed.name) }}>
                {lastUsed.name?.[0]?.toUpperCase()}
              </span>
              <div className="lv2-last-info">
                <div className="lv2-last-name-row">
                  <span className="lv2-last-name">{lastUsed.name}</span>
                  <span className="lv2-last-badge">LAST USED</span>
                </div>
                <span className="lv2-last-role">{lastUsed.role}</span>
              </div>
            </div>
            <button className="lv2-continue-btn" onClick={() => selectStaff(lastUsed)}>
              Continue as {lastUsed.name.split(" ")[0]}
              <span className="lv2-continue-arrow">→</span>
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="lv2-divider">
          <span className="lv2-divider-label">
            {lastUsed ? "OR SWITCH CAPTAIN" : "SELECT CAPTAIN"}
          </span>
          <span className="lv2-divider-line" />
        </div>

        {/* Search */}
        <div className="lv2-search">
          <svg className="lv2-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/>
          </svg>
          <input
            className="lv2-search-input"
            placeholder="Search captains"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="lv2-search-clear" onClick={() => setSearch("")}>✕</button>
          )}
        </div>

        {/* Staff list */}
        {listStaff.length > 0 && (
          <div className="lv2-staff-list">
            {listStaff.map((s, i) => (
              <button
                key={s.id}
                className={`lv2-staff-row${i < listStaff.length - 1 ? " lv2-staff-row-border" : ""}`}
                onClick={() => selectStaff(s)}
              >
                <span className="lv2-staff-avatar" style={{ background: avatarBg(s.name) }}>
                  {s.name?.[0]?.toUpperCase()}
                </span>
                <span className="lv2-staff-info">
                  <span className="lv2-staff-name">{s.name}</span>
                  <span className="lv2-staff-role">{s.role}</span>
                </span>
                <svg className="lv2-staff-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            ))}
          </div>
        )}

        {search && filtered.length === 0 && (
          <p className="lv2-no-results">No captains found for "{search}"</p>
        )}

        {onForgetDevice && (
          <button className="forget-device-btn" onClick={onForgetDevice}>
            Reset this device
          </button>
        )}
      </div>
    );
  }

  // ── PIN entry ──────────────────────────────────────────────────────────────
  const hasError = !!error;
  return (
    <div className="login-page pin-page-v2">
      {/* Connection pill */}
      <div className="lv2-conn-row">
        <div className="lv2-conn-pill">
          <span className="lv2-conn-dot" />
          <span className="lv2-conn-label">{outletCode || outletName || "Connected"}</span>
        </div>
      </div>

      {/* App branding */}
      <div className="pin-brand">
        <div className="pin-brand-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#212121" strokeWidth="2" strokeLinecap="round">
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
            <path d="M7 2v20"/>
            <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
          </svg>
        </div>
        <div className="pin-brand-text">
          <span className="pin-brand-plato">PLATO</span>
          <span className="pin-brand-captain">Captain</span>
        </div>
      </div>
      <p className="pin-brand-sub">Sign in to start taking orders on the floor.</p>

      {/* User card with Switch */}
      <div className="pin-user-card">
        <span className="pin-user-avatar" style={{ background: avatarBg(selected.name) }}>
          {selected.name?.[0]?.toUpperCase()}
        </span>
        <div className="pin-user-info">
          <span className="pin-user-name">{selected.name}</span>
          <span className="pin-user-role">{selected.role}</span>
        </div>
        <button
          className="pin-switch-btn"
          onClick={() => { setSelected(null); setPin(""); setError(""); }}
        >
          Switch
        </button>
      </div>

      {/* PIN label + dots */}
      <p className={`pin-v2-label${hasError ? " pin-v2-label-error" : ""}`}>
        {hasError ? error : "ENTER YOUR 4-DIGIT PIN"}
      </p>
      <div className={`pin-v2-dots${shake ? " shake" : ""}`}>
        {[0,1,2,3].map((i) => (
          <span
            key={i}
            className={`pin-v2-dot${
              hasError ? " pin-v2-dot-error" :
              pin.length > i ? (i === pin.length - 1 ? " pin-v2-dot-current" : " pin-v2-dot-filled") :
              ""
            }`}
          />
        ))}
      </div>

      {/* Numpad */}
      <div className="numpad-v2">
        {["1","2","3","4","5","6","7","8","9","help","0","del"].map((k, i) => {
          if (k === "help") return (
            <button key={i} className="numpad-v2-help">Help</button>
          );
          if (k === "del") return (
            <button key={i} className="numpad-v2-key numpad-v2-del" onClick={handleDel}>
              <svg width="22" height="18" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                <line x1="18" y1="9" x2="12" y2="15"/>
                <line x1="12" y1="9" x2="18" y2="15"/>
              </svg>
            </button>
          );
          return (
            <button key={i} className="numpad-v2-key" onClick={() => handleDigit(k)}>
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
