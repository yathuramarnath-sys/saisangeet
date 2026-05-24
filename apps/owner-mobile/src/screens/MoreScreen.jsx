import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { logout, getTokenPayload } from "../lib/auth";

export function MoreScreen() {
  const [users, setUsers]             = useState([]);
  const [announcement, setAnnouncement] = useState("");
  const [sending, setSending]         = useState(false);
  const [sentMsg, setSentMsg]         = useState("");
  const [staffOpen, setStaffOpen]     = useState(false);

  const payload = getTokenPayload();
  const today   = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    api.get("/users").catch(() => []).then(d => {
      setUsers((Array.isArray(d) ? d : d?.users || []).filter(u => !u.passwordHash && u.isActive !== false));
    });
  }, []);

  async function handleSendAnnouncement() {
    if (!announcement.trim()) return;
    setSending(true); setSentMsg("");
    try {
      await api.post("/operations/announcement", { message: announcement.trim() });
      setSentMsg("Sent to all devices ✓");
      setAnnouncement("");
    } catch {
      setSentMsg("Failed to send. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleDownloadBackup() {
    try {
      const token = localStorage.getItem("owner_token");
      const res   = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "https://api.dinexpos.in/api/v1"}/backup/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `plato-backup-${today}.json`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch {
      alert("Could not download backup.");
    }
  }

  function getRole(u) {
    return (Array.isArray(u.roles) ? u.roles[0] : u.role) || "Staff";
  }

  return (
    <div className="screen">
      <div className="screen-header"><h2>More</h2></div>

      {/* Owner info */}
      <div className="owner-card">
        <div className="owner-avatar">{(payload?.fullName || payload?.email || "O")[0].toUpperCase()}</div>
        <div>
          <p className="owner-name">{payload?.fullName || "Owner"}</p>
          <p className="owner-email">{payload?.email || ""}</p>
        </div>
      </div>

      {/* Staff section */}
      <div className="section-card">
        <button className="section-toggle" onClick={() => setStaffOpen(o => !o)}>
          <h3 className="section-title" style={{ margin: 0 }}>Staff ({users.length})</h3>
          <span style={{ fontSize: 18, color: "var(--text3)" }}>{staffOpen ? "▲" : "▼"}</span>
        </button>
        {staffOpen && (
          <div style={{ marginTop: 12 }}>
            {users.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text3)" }}>No floor staff added yet.</p>
            ) : users.map(u => (
              <div className="staff-card" key={u.id} style={{ boxShadow: "none", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="staff-avatar">{(u.fullName || u.name || "?")[0].toUpperCase()}</div>
                <div className="staff-info">
                  <p className="staff-name">{u.fullName || u.name}</p>
                  <p className="staff-role">{getRole(u)} · {u.outletName || "All"}</p>
                </div>
                <div className="staff-meta">
                  {u.canApplyDiscount && <span className="staff-badge disc">Discount</span>}
                  {u.pin && u.pin !== "0000" && <span className="staff-badge pin">PIN ✓</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Announcement */}
      <div className="section-card">
        <h3 className="section-title">Send Announcement</h3>
        <p className="section-desc">Push a message to all connected POS and Captain App devices</p>
        <textarea className="announce-input" placeholder='e.g. "Closing early at 9 PM today"'
          rows={3} value={announcement} onChange={e => setAnnouncement(e.target.value)} maxLength={200} />
        {sentMsg && <p className={`sent-msg ${sentMsg.includes("✓") ? "success" : "error"}`}>{sentMsg}</p>}
        <button className="action-btn green" onClick={handleSendAnnouncement}
          disabled={sending || !announcement.trim()}>
          {sending ? "Sending…" : "Send to All Devices"}
        </button>
      </div>

      {/* Quick actions */}
      <div className="section-card">
        <h3 className="section-title">Quick Actions</h3>
        <button className="quick-action-row" onClick={handleDownloadBackup}>
          <span className="qa-icon">⬇️</span>
          <div className="qa-info">
            <p className="qa-label">Download Backup</p>
            <p className="qa-desc">Full restaurant data as JSON</p>
          </div>
          <span className="qa-arrow">›</span>
        </button>
      </div>

      {/* Sign out */}
      <button className="signout-btn" onClick={logout}>Sign Out</button>
    </div>
  );
}
