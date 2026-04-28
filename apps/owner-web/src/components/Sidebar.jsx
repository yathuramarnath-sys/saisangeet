import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import { navigation } from "../data/navigation";

// ── Change Password Modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const [form, setForm]   = useState({ current: "", next: "", confirm: "" });
  const [show, setShow]   = useState(false);
  const [msg,  setMsg]    = useState("");
  const [err,  setErr]    = useState("");
  const [busy, setBusy]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    if (form.next.length < 6)          return setErr("New password must be at least 6 characters.");
    if (form.next !== form.confirm)    return setErr("Passwords do not match.");
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: form.current,
        newPassword:     form.next
      });
      setMsg("Password changed successfully! Use your new password next time you log in.");
      setForm({ current: "", next: "", confirm: "" });
    } catch (e) {
      setErr(e.message || "Failed to change password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cpw-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="cpw-box">
        <div className="cpw-head">
          <h3>Change Password</h3>
          <button className="cpw-close" onClick={onClose}>✕</button>
        </div>

        {msg ? (
          <div className="cpw-body">
            <div className="cpw-success">✅ {msg}</div>
            <button className="primary-btn" style={{ marginTop: 16 }} onClick={onClose}>Close</button>
          </div>
        ) : (
          <form className="cpw-body" onSubmit={handleSubmit}>
            {err && <div className="cpw-error">⚠️ {err}</div>}

            <label className="cpw-field">
              Current password
              <div className="cpw-pw-wrap">
                <input
                  type={show ? "text" : "password"}
                  placeholder="Your current password"
                  value={form.current}
                  onChange={e => setForm(f => ({ ...f, current: e.target.value }))}
                  required autoFocus
                />
              </div>
            </label>

            <label className="cpw-field">
              New password
              <div className="cpw-pw-wrap">
                <input
                  type={show ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={form.next}
                  onChange={e => setForm(f => ({ ...f, next: e.target.value }))}
                  required
                />
              </div>
            </label>

            <label className="cpw-field">
              Confirm new password
              <div className="cpw-pw-wrap">
                <input
                  type={show ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={form.confirm}
                  onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                  required
                />
              </div>
            </label>

            <label className="cpw-show-toggle">
              <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />
              Show passwords
            </label>

            <div className="cpw-actions">
              <button type="submit" className="primary-btn" disabled={busy || !form.current || !form.next || !form.confirm}>
                {busy ? "Saving…" : "Change Password"}
              </button>
              <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export function Sidebar() {
  const { user, logout } = useAuth();
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [changePwd, setChangePwd] = useState(false);

  const initials = user?.fullName
    ? user.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "O";

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="9"/>
            <path d="M8 12h8" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h1 className="brand-title">Plato</h1>
          <p className="brand-sub">Owner Console</p>
        </div>
      </div>

      <nav className="nav-list" aria-label="Owner navigation">
        {navigation.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User area with dropdown */}
      <div className="sidebar-user" style={{ position: "relative" }}>
        <button
          type="button"
          className="sidebar-user-btn"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Account menu"
        >
          <div className="sidebar-user-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <strong>{user?.fullName || "Owner"}</strong>
            <span>{user?.roles?.[0] || "Admin"}</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.5 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {menuOpen && (
          <>
            {/* Click-away backdrop */}
            <div className="sidebar-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="sidebar-user-menu">
              <button
                className="sidebar-menu-item"
                onClick={() => { setMenuOpen(false); setChangePwd(true); }}
              >
                🔑 Change Password
              </button>
              <div className="sidebar-menu-divider" />
              <button
                className="sidebar-menu-item danger"
                onClick={() => { setMenuOpen(false); logout(); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>

      {changePwd && <ChangePasswordModal onClose={() => setChangePwd(false)} />}
    </aside>
  );
}
