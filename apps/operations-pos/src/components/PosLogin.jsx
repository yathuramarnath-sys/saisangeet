import { useState, useEffect } from "react";
import { api } from "../lib/api";

// ── Roles that appear on the POS cashier screen ────────────────────────────
// Captains / Waiters belong to the Captain app, not the POS counter.
const POS_ROLES = ["cashier", "manager", "supervisor", "admin", "staff"];

function isPosRole(role = "") {
  return POS_ROLES.includes(role.toLowerCase());
}

// ── Avatar ─────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#FF5733","#27AE60","#2980B9","#8E44AD",
  "#E67E22","#C0392B","#16A085","#D35400",
];

function avatarBg(name = "") {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// ── Numpad keys ────────────────────────────────────────────────────────────
const NUMPAD_KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

function loadStaff() {
  try {
    const saved = JSON.parse(localStorage.getItem("pos_staff") || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return [];
}

export function PosLogin({ outletName, onLogin }) {
  const [allStaff,  setAllStaff]  = useState(loadStaff);
  const [selected,  setSelected]  = useState(null);
  const [pin,       setPin]       = useState("");
  const [error,     setError]     = useState("");
  const [shake,     setShake]     = useState(false);

  // Refresh staff from backend on every mount
  useEffect(() => {
    api.get("/devices/staff")
      .then((res) => {
        if (Array.isArray(res.staff)) {
          setAllStaff(res.staff);
          localStorage.setItem("pos_staff", JSON.stringify(res.staff));
        }
      })
      .catch(() => {});
  }, []);

  // Only POS-appropriate roles
  const staff = allStaff.filter((s) => isPosRole(s.role));

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long"
  });
  const time = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true
  });

  // ── PIN helpers ────────────────────────────────────────────────────────────
  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  function handleDigit(d) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) {
      setTimeout(() => {
        if (!selected.pin || selected.pin === "0000" || next === selected.pin) {
          onLogin(selected.name);
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
  }

  // ── PIN screen ─────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="poslogin-screen">
        <button
          className="poslogin-back-btn"
          onClick={() => { setSelected(null); setPin(""); setError(""); }}
        >
          ← Back
        </button>

        <div className="poslogin-pin-profile">
          <div
            className="poslogin-avatar"
            style={{ background: avatarBg(selected.name), width: 72, height: 72, fontSize: 28 }}
          >
            {selected.avatar || selected.name?.[0]?.toUpperCase() || "?"}
          </div>
          <p className="poslogin-pin-name">{selected.name}</p>
          <p className="poslogin-role">{selected.role}</p>
        </div>

        <div className={`poslogin-pin-dots${shake ? " poslogin-shake" : ""}`}>
          {[0,1,2,3].map(i => (
            <span key={i} className={`poslogin-dot${pin.length > i ? " filled" : ""}`} />
          ))}
        </div>

        <p className={`poslogin-pin-label${error ? " poslogin-pin-error" : ""}`}>
          {error || "Enter your 4-digit PIN"}
        </p>

        <div className="poslogin-numpad">
          {NUMPAD_KEYS.map((k, i) => (
            <button
              key={i}
              className={`poslogin-numpad-key${k === "" ? " empty" : ""}${k === "⌫" ? " del" : ""}`}
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

  // ── Staff selection screen ─────────────────────────────────────────────────
  return (
    <div className="poslogin-screen">

      <div className="poslogin-header">
        <div className="poslogin-logo">
          <img src="/plato-pos-logo.svg" alt="Plato POS" className="poslogin-logo-img" />
        </div>
        <h1 className="poslogin-title">{outletName || "Plato POS"}</h1>
        <p className="poslogin-meta">{today} &nbsp;·&nbsp; {time}</p>
      </div>

      <h2 className="poslogin-heading">Who's at the counter?</h2>
      <p className="poslogin-sub">Select your name to continue</p>

      <div className="poslogin-grid">
        {staff.length === 0 ? (
          <p style={{ color: "#999", gridColumn: "1/-1", textAlign: "center", padding: "2rem" }}>
            No cashier accounts found.<br/>Please add Cashier staff in Owner Web → Staff &amp; Roles.
          </p>
        ) : (
          staff.map((member, idx) => (
            <button
              key={member.id || member.name}
              type="button"
              className="poslogin-staff-btn"
              onClick={() => {
                // Auto-login if no PIN set
                if (!member.pin || member.pin === "0000") {
                  onLogin(member.name);
                } else {
                  setSelected(member);
                  setPin("");
                  setError("");
                }
              }}
            >
              <div
                className="poslogin-avatar"
                style={{ background: avatarBg(member.name) }}
              >
                {member.avatar || (member.name || "?")[0].toUpperCase()}
              </div>
              <span className="poslogin-name">{member.name}</span>
              <span className="poslogin-role">{member.role}</span>
              {member.pin && member.pin !== "0000" && (
                <span className="poslogin-pin-badge">🔒</span>
              )}
            </button>
          ))
        )}
      </div>

      <p className="poslogin-footer">Plato · POS Terminal</p>
    </div>
  );
}
