import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import { navGroups } from "../data/navigation";

// ── Eye-toggle icon ───────────────────────────────────────────────────────────
function EyeIcon({ open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

// ── Change Password Modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [msg,  setMsg]  = useState("");
  const [err,  setErr]  = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    if (form.next.length < 6)       return setErr("New password must be at least 6 characters.");
    if (form.next !== form.confirm) return setErr("Passwords do not match.");
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: form.current,
        newPassword:     form.next,
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
                  type={show.current ? "text" : "password"}
                  placeholder="Your current password"
                  value={form.current}
                  onChange={e => setForm(f => ({ ...f, current: e.target.value }))}
                  required autoFocus
                />
                <button type="button" className="cpw-eye-btn" onClick={() => setShow(s => ({ ...s, current: !s.current }))}>
                  <EyeIcon open={show.current} />
                </button>
              </div>
            </label>

            <label className="cpw-field">
              New password
              <div className="cpw-pw-wrap">
                <input
                  type={show.next ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={form.next}
                  onChange={e => setForm(f => ({ ...f, next: e.target.value }))}
                  required
                />
                <button type="button" className="cpw-eye-btn" onClick={() => setShow(s => ({ ...s, next: !s.next }))}>
                  <EyeIcon open={show.next} />
                </button>
              </div>
            </label>

            <label className="cpw-field">
              Confirm new password
              <div className="cpw-pw-wrap">
                <input
                  type={show.confirm ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={form.confirm}
                  onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                  required
                />
                <button type="button" className="cpw-eye-btn" onClick={() => setShow(s => ({ ...s, confirm: !s.confirm }))}>
                  <EyeIcon open={show.confirm} />
                </button>
              </div>
            </label>

            <label className="cpw-show-toggle">
              <input type="checkbox"
                checked={show.current && show.next && show.confirm}
                onChange={e => setShow({ current: e.target.checked, next: e.target.checked, confirm: e.target.checked })}
              />
              Show passwords
            </label>

            <div className="cpw-actions">
              <button type="submit" className="cpw-submit-btn"
                disabled={busy || !form.current || !form.next || !form.confirm}>
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
export function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [changePwd, setChangePwd] = useState(false);

  const initials = user?.fullName
    ? user.fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "O";

  const email = user?.email || user?.phone || "";

  function NavItem({ item }) {
    return (
      <NavLink
        to={item.path}
        className={({ isActive }) => `oc-nav-link${isActive ? " active" : ""}`}
        onClick={onClose}
      >
        <span className="material-symbols-rounded oc-nav-icon">{item.icon}</span>
        <span className="oc-nav-label">{item.label}</span>
      </NavLink>
    );
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && <div className="oc-mob-overlay" onClick={onClose} />}

      <aside className={`oc-sidebar${open ? " oc-sidebar-open" : ""}`}>
        {/* Logo */}
        <div className="oc-sidebar-logo">
          <div className="oc-logo-chip">
            <span className="material-symbols-rounded" style={{ fontSize: 18, color: "#1C1C1C", fontVariationSettings: "'FILL' 1" }}>
              restaurant
            </span>
          </div>
          <div className="oc-logo-text">
            <span className="oc-logo-brand">Plato</span>
            <span className="oc-logo-caption">Owner Console</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="oc-nav" aria-label="Owner navigation">
          {navGroups.map((entry, i) => {
            if (entry.type === "item") {
              return <NavItem key={entry.id} item={entry} />;
            }
            return (
              <div key={i} className="oc-nav-section">
                <div className="oc-section-label">{entry.label}</div>
                {entry.items.map(item => <NavItem key={item.id} item={item} />)}
              </div>
            );
          })}
        </nav>

        {/* User area */}
        <div className="oc-user-area" style={{ position: "relative" }}>
          <button
            type="button"
            className="oc-user-btn"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Account menu"
          >
            <div className="oc-user-avatar">{initials}</div>
            <div className="oc-user-info">
              <span className="oc-user-name">{user?.fullName || "Owner"}</span>
              <span className="oc-user-email">{email}</span>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.45 }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="oc-menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="oc-user-menu">
                <button
                  className="oc-user-menu-item"
                  onClick={() => { setMenuOpen(false); setChangePwd(true); }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 16 }}>key</span>
                  Change Password
                </button>
                <div className="oc-user-menu-divider" />
                <button
                  className="oc-user-menu-item oc-menu-danger"
                  onClick={() => { setMenuOpen(false); logout(); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {changePwd && <ChangePasswordModal onClose={() => setChangePwd(false)} />}
    </>
  );
}
