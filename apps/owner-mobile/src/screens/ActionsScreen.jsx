import { useState } from "react";
import { api } from "../lib/api";
import { logout, getTokenPayload } from "../lib/auth";

export function ActionsScreen() {
  const [announcement, setAnnouncement] = useState("");
  const [sending, setSending]           = useState(false);
  const [sentMsg, setSentMsg]           = useState("");

  const payload = getTokenPayload();
  const today   = new Date().toISOString().slice(0, 10);

  async function handleDownloadReport() {
    try {
      const token    = localStorage.getItem("owner_token");
      const res      = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "https://api.dinexpos.in/api/v1"}/backup/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed");
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement("a");
      a.href         = url;
      a.download     = `plato-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not download backup. Check connection.");
    }
  }

  async function handleSendAnnouncement() {
    if (!announcement.trim()) return;
    setSending(true);
    setSentMsg("");
    try {
      await api.post("/operations/announcement", { message: announcement.trim() });
      setSentMsg("Announcement sent to all devices ✓");
      setAnnouncement("");
    } catch {
      setSentMsg("Failed to send. Try again.");
    } finally {
      setSending(false);
    }
  }

  const actionList = [
    {
      icon:  "⬇️",
      label: "Download Backup",
      desc:  "Full restaurant data as JSON",
      color: "#1e293b",
      onClick: handleDownloadReport,
    },
  ];

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Actions</h2>
      </div>

      {/* Owner info */}
      <div className="owner-card">
        <div className="owner-avatar">
          {(payload?.name || payload?.email || "O")[0].toUpperCase()}
        </div>
        <div>
          <p className="owner-name">{payload?.name || "Owner"}</p>
          <p className="owner-email">{payload?.email || ""}</p>
        </div>
      </div>

      {/* Announcement */}
      <div className="section-card">
        <h3 className="section-title">Send Announcement</h3>
        <p className="section-desc">Push a message to all connected POS and Captain App devices</p>
        <textarea
          className="announce-input"
          placeholder='e.g. "Closing early at 9 PM today"'
          rows={3}
          value={announcement}
          onChange={e => setAnnouncement(e.target.value)}
          maxLength={200}
        />
        {sentMsg && (
          <p className={`sent-msg ${sentMsg.includes("✓") ? "success" : "error"}`}>
            {sentMsg}
          </p>
        )}
        <button
          className="action-btn green"
          onClick={handleSendAnnouncement}
          disabled={sending || !announcement.trim()}
        >
          {sending ? "Sending…" : "Send to All Devices"}
        </button>
      </div>

      {/* Quick actions */}
      <div className="section-card">
        <h3 className="section-title">Quick Actions</h3>
        {actionList.map(a => (
          <button className="quick-action-row" key={a.label} onClick={a.onClick}>
            <span className="qa-icon">{a.icon}</span>
            <div className="qa-info">
              <p className="qa-label">{a.label}</p>
              <p className="qa-desc">{a.desc}</p>
            </div>
            <span className="qa-arrow">›</span>
          </button>
        ))}
      </div>

      {/* Sign out */}
      <button className="signout-btn" onClick={logout}>
        Sign Out
      </button>
    </div>
  );
}
