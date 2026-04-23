import { useState, useEffect } from "react";
import { api } from "../lib/api";

// Avatar background colours — assigned by index
const AVATAR_COLORS = [
  "#FF5733","#27AE60","#2980B9","#8E44AD",
  "#E67E22","#C0392B","#16A085","#D35400",
];

function loadStaff() {
  try {
    const saved = JSON.parse(localStorage.getItem("pos_staff") || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return [];
}

export function PosLogin({ outletName, onLogin }) {
  const [staff, setStaff] = useState(loadStaff);

  // Refresh staff from backend on every mount — picks up Owner Web changes instantly
  useEffect(() => {
    api.get("/devices/staff")
      .then((res) => {
        if (Array.isArray(res.staff)) {
          setStaff(res.staff);
          localStorage.setItem("pos_staff", JSON.stringify(res.staff));
        }
      })
      .catch(() => {}); // silently fall back to cached list
  }, []);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long"
  });
  const time = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true
  });

  return (
    <div className="poslogin-screen">

      {/* Header */}
      <div className="poslogin-header">
        <div className="poslogin-logo">🍽</div>
        <h1 className="poslogin-title">{outletName || "Restaurant OS"}</h1>
        <p className="poslogin-meta">{today} &nbsp;·&nbsp; {time}</p>
      </div>

      {/* Prompt */}
      <h2 className="poslogin-heading">Who's serving today?</h2>
      <p className="poslogin-sub">Select your name to start</p>

      {/* Staff grid */}
      <div className="poslogin-grid">
        {staff.length === 0 ? (
          <p style={{ color: "#999", gridColumn: "1/-1", textAlign: "center", padding: "2rem" }}>
            No staff configured for this outlet.<br />Please set up users in Owner Web.
          </p>
        ) : (
          staff.map((member, idx) => (
            <button
              key={member.id || member.name}
              type="button"
              className="poslogin-staff-btn"
              onClick={() => onLogin(member.name)}
            >
              <div
                className="poslogin-avatar"
                style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
              >
                {member.avatar || (member.name || "?")[0].toUpperCase()}
              </div>
              <span className="poslogin-name">{member.name}</span>
              <span className="poslogin-role">{member.role}</span>
            </button>
          ))
        )}
      </div>

      <p className="poslogin-footer">Restaurant OS · POS Terminal</p>
    </div>
  );
}
