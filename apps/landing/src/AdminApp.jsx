import { useState, useEffect, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "https://api.dinexpos.in/api/v1";
const TOKEN_KEY = "dinex_admin_token";

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    }
  });
  if (res.status === 401 || res.status === 403) {
    clearToken();
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || body?.message || `Error ${res.status}`);
  }
  return res.json();
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

function fmtRelative(iso) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return fmtDate(iso);
}

function deviceTypeLabel(type) {
  switch ((type || "").toLowerCase()) {
    case "pos":     return "POS";
    case "captain": return "Captain";
    case "kds":     return "KDS";
    case "tablet":  return "Tablet POS";
    default:        return type || "Device";
  }
}

function deviceTypeIcon(type) {
  switch ((type || "").toLowerCase()) {
    case "pos":     return "🖥";
    case "captain": return "📱";
    case "kds":     return "📺";
    case "tablet":  return "📱";
    default:        return "🔌";
  }
}

function PlanBadge({ planId, billingStatus, trialDaysLeft }) {
  if (billingStatus === "active" && planId && planId !== "trial") {
    return <span className="admin-badge-btn active" style={{ fontSize: 11, padding: "2px 8px" }}>Paid</span>;
  }
  if (billingStatus === "cancelled") {
    return <span className="admin-badge-btn inactive" style={{ fontSize: 11, padding: "2px 8px" }}>Cancelled</span>;
  }
  const days = trialDaysLeft != null && trialDaysLeft >= 0 ? trialDaysLeft : null;
  if (days !== null && days <= 3) {
    return <span className="admin-badge-btn" style={{ fontSize: 11, padding: "2px 8px", background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>Trial · {days}d left</span>;
  }
  if (days !== null) {
    return <span className="admin-badge-btn pending" style={{ fontSize: 11, padding: "2px 8px" }}>Trial · {days}d</span>;
  }
  return <span className="admin-badge-btn pending" style={{ fontSize: 11, padding: "2px 8px" }}>Trial</span>;
}

function SendEmailModal({ client, onClose, onSent }) {
  const [subject,  setSubject]  = useState(`Hello from PLATO — ${client.restaurantName}`);
  const [body,     setBody]     = useState("");
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleSend(e) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setError("");
    try {
      await apiFetch(`/admin/clients/${client.tenantId}/send-email`, {
        method: "POST",
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() })
      });
      onSent(`✓ Email sent to ${client.email}`);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-head">
          <h3>Send Email to {client.restaurantName}</h3>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="admin-modal-to">To: <strong>{client.email}</strong></p>
        {error && <div className="admin-flash error" style={{ margin: "0 0 12px" }}>{error}</div>}
        <form onSubmit={handleSend}>
          <label className="admin-modal-label">
            Subject
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} required />
          </label>
          <label className="admin-modal-label">
            Message
            <textarea rows={7} value={body} onChange={e => setBody(e.target.value)}
              placeholder="Type your message here…" required />
          </label>
          <div className="admin-modal-footer">
            <button type="button" className="admin-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="admin-btn-primary" disabled={sending || !subject.trim() || !body.trim()}>
              {sending ? "Sending…" : "Send Email →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Login Screen ─────────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [identifier, setIdentifier] = useState("");
  const [password,   setPassword]   = useState("");
  const [error,      setError]       = useState("");
  const [loading,    setLoading]     = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password })
      });
      if (!data.token) throw new Error("Login failed");
      setToken(data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-box">
        <div className="admin-login-brand">
          <div className="admin-brand-mark">P</div>
          <div>
            <strong>PLATO</strong>
            <span>Admin Console</span>
          </div>
        </div>
        <h2>Sign in</h2>
        <p className="admin-login-sub">Platform admin access only</p>
        {error && <div className="admin-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" value={identifier} onChange={e => setIdentifier(e.target.value)}
              placeholder="info@dinexpos.in" required autoFocus />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required />
          </label>
          <button type="submit" className="admin-btn-primary" disabled={loading}>
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Client Detail View ────────────────────────────────────────────────────────
function ClientDetailView({ client, onBack, onToggleActive, onResetPassword }) {
  const [detail,      setDetail]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [flash,       setFlash]       = useState(null);
  const [unlinking,   setUnlinking]   = useState(null);
  const [showEmail,   setShowEmail]   = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/admin/clients/${client.tenantId}`);
      setDetail(data);
    } catch (err) {
      if (err.message.includes("Session")) { clearToken(); window.location.reload(); }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client.tenantId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  async function handleUnlink(device) {
    if (!window.confirm(
      `Unlink ${deviceTypeLabel(device.deviceType)} "${device.deviceName || device.id}"?\n\nThe device will need to re-pair by scanning its branch QR code. This does NOT delete any orders.`
    )) return;
    setUnlinking(device.id);
    try {
      await apiFetch(`/admin/clients/${client.tenantId}/devices/${device.id}`, { method: "DELETE" });
      setDetail(prev => ({ ...prev, devices: prev.devices.filter(d => d.id !== device.id) }));
      setFlash({ type: "success", message: `✓ Device unlinked. It will need to re-pair.` });
    } catch (err) {
      setFlash({ type: "error", message: `✗ ${err.message}` });
    } finally {
      setUnlinking(null);
    }
  }

  function copyId() {
    navigator.clipboard.writeText(client.tenantId).then(() => {
      setFlash({ type: "success", message: "✓ Tenant ID copied to clipboard" });
      setTimeout(() => setFlash(null), 2000);
    });
  }

  const isActive   = client.isActive;
  const hasPwd     = client.hasPassword;
  const statusText = !isActive ? "Inactive" : hasPwd ? "Active" : "Pending Setup";
  const statusCls  = !isActive ? "inactive" : hasPwd ? "active" : "pending";

  return (
    <div className="admin-dashboard">
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <button className="admin-back-btn" onClick={onBack}>← All Clients</button>
        </div>
        <div className="admin-topbar-right">
          <button className="admin-btn-ghost" onClick={() => setShowEmail(true)}>✉ Send Email</button>
          <button className="admin-btn-ghost" onClick={() => onResetPassword(client)}>Reset Password</button>
          <button
            className={`admin-badge-btn ${statusCls}`}
            style={{ padding: "6px 14px" }}
            onClick={() => onToggleActive(client)}
          >
            {statusText}
          </button>
        </div>
      </header>

      {showEmail && (
        <SendEmailModal
          client={client}
          onClose={() => setShowEmail(false)}
          onSent={(msg) => { setFlash({ type: "success", message: msg }); setTimeout(() => setFlash(null), 4000); }}
        />
      )}

      <div className="admin-body">
        {/* Quick Recovery Header */}
        <div className="admin-detail-header">
          <div className="admin-detail-title">
            <h2>{client.restaurantName}</h2>
            <button className="admin-tenant-id" onClick={copyId} title="Click to copy">
              {client.tenantId} <span className="admin-copy-hint">copy</span>
            </button>
          </div>
          <div className="admin-detail-meta">
            <span>👤 {client.ownerName}</span>
            <span>✉ {client.email}</span>
            <span>📞 {client.phone}</span>
            <span>📅 Joined {fmtDate(client.signedUpAt)}</span>
          </div>
        </div>

        {flash && (
          <div className={`admin-flash ${flash.type}`}>
            {flash.message}
            <button onClick={() => setFlash(null)}>✕</button>
          </div>
        )}

        {loading ? (
          <div className="admin-empty">Loading details…</div>
        ) : error ? (
          <div className="admin-empty error">{error}</div>
        ) : (
          <div className="admin-detail-grid">

            {/* Business Info */}
            <div className="admin-panel admin-detail-card">
              <div className="admin-panel-head" style={{ paddingBottom: 12, borderBottom: "1px solid #f0f0f0" }}>
                <h3>Business Info</h3>
              </div>
              <div style={{ padding: "0 20px 16px" }}>
                <table className="admin-info-table">
                  <tbody>
                    <tr><td>Restaurant</td><td>{detail.restaurantName}</td></tr>
                    <tr><td>Owner</td><td>{detail.ownerName}</td></tr>
                    <tr><td>Email</td><td><a href={`mailto:${detail.email}`} style={{ color: "#FF5F15" }}>{detail.email}</a></td></tr>
                    <tr><td>Phone</td><td>{detail.phone}</td></tr>
                    {detail.gstin && <tr><td>GSTIN</td><td className="admin-mono">{detail.gstin}</td></tr>}
                    {detail.city  && <tr><td>City</td><td>{detail.city}</td></tr>}
                    <tr><td>Staff</td><td>{detail.staffCount}</td></tr>
                    <tr><td>Outlets</td><td>{detail.outlets.length}</td></tr>
                    <tr><td>Devices</td><td>{detail.devices.length}</td></tr>
                    <tr><td>Plan</td><td><PlanBadge planId={detail.planId} billingStatus={detail.billingStatus} trialDaysLeft={detail.trialDaysLeft} /></td></tr>
                    {detail.trialEndsAt && <tr><td>Trial ends</td><td>{fmtDate(detail.trialEndsAt)}</td></tr>}
                    <tr><td>Activity (30d)</td><td>{detail.activityLast30d ?? "—"} events</td></tr>
                    <tr><td>Last active</td><td>{detail.lastActivityAt ? fmtRelative(detail.lastActivityAt) : "—"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Outlets */}
            <div className="admin-panel admin-detail-card">
              <div className="admin-panel-head" style={{ paddingBottom: 12, borderBottom: "1px solid #f0f0f0" }}>
                <h3>Outlets ({detail.outlets.length})</h3>
              </div>
              {detail.outlets.length === 0 ? (
                <div className="admin-empty" style={{ padding: "16px 0" }}>No outlets set up</div>
              ) : (
                <table className="admin-info-table">
                  <thead><tr><th>Name</th><th>Code</th><th>Tables</th><th>City</th></tr></thead>
                  <tbody>
                    {detail.outlets.map(o => (
                      <tr key={o.id}>
                        <td><strong>{o.name}</strong></td>
                        <td><span className="admin-mono admin-code-badge">{o.code}</span></td>
                        <td>{o.tableCount}</td>
                        <td>{o.city || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Devices */}
            <div className="admin-panel admin-detail-card admin-detail-full">
              <div className="admin-panel-head" style={{ paddingBottom: 12, borderBottom: "1px solid #f0f0f0" }}>
                <h3>Registered Devices ({detail.devices.length})</h3>
                <button className="admin-btn-ghost" onClick={loadDetail} title="Refresh">↺ Refresh</button>
              </div>
              {detail.devices.length === 0 ? (
                <div className="admin-empty" style={{ padding: "16px 0" }}>No devices registered</div>
              ) : (
                <div className="admin-device-list">
                  {detail.devices.map(d => (
                    <div key={d.id} className="admin-device-row">
                      <span className="admin-device-icon">{deviceTypeIcon(d.deviceType)}</span>
                      <div className="admin-device-info">
                        <strong>{d.deviceName || `${deviceTypeLabel(d.deviceType)} Device`}</strong>
                        <span className="admin-device-sub">
                          {deviceTypeLabel(d.deviceType)}
                          {d.platform ? ` · ${d.platform}` : ""}
                          {d.loggedInUser ? ` · ${d.loggedInUser}` : ""}
                        </span>
                        <span className="admin-device-id admin-mono">{d.id}</span>
                      </div>
                      <div className="admin-device-right">
                        <span className={`admin-online-dot ${d.onlineStatus}`} title={d.onlineStatus === "online" ? "Online" : `Last seen ${fmtRelative(d.lastSeenAt)}`}>
                          {d.onlineStatus === "online" ? "Online" : fmtRelative(d.lastSeenAt)}
                        </span>
                        <button
                          className="admin-btn-unlink"
                          onClick={() => handleUnlink(d)}
                          disabled={unlinking === d.id}
                        >
                          {unlinking === d.id ? "Unlinking…" : "Unlink"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="admin-device-note">
                Unlinking removes the device registration. The device must re-pair by scanning its branch QR code from the setup screen. Orders and data are not affected.
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ── Clients Dashboard ─────────────────────────────────────────────────────────
function ClientsDashboard({ user, onLogout }) {
  const [clients,      setClients]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [search,       setSearch]       = useState("");
  const [resetting,    setResetting]    = useState(null);
  const [toggling,     setToggling]     = useState(null);
  const [flash,        setFlash]        = useState(null);
  const [selectedId,   setSelectedId]   = useState(null); // tenantId of the open detail view

  const loadClients = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch("/admin/clients");
      setClients(data.clients || []);
    } catch (err) {
      if (err.message.includes("Session")) {
        onLogout();
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { loadClients(); }, [loadClients]);

  async function handleReset(client) {
    if (!window.confirm(
      `Reset password for ${client.ownerName} (${client.email})?\n\nA new temporary password will be emailed to them.`
    )) return;
    setResetting(client.tenantId);
    setFlash(null);
    try {
      await apiFetch(`/admin/clients/${client.tenantId}/reset-password`, { method: "POST" });
      setFlash({ type: "success", message: `✓ Password reset for ${client.email}. New temp password sent.` });
    } catch (err) {
      setFlash({ type: "error", message: `✗ Reset failed: ${err.message}` });
    } finally {
      setResetting(null);
    }
  }

  async function handleToggleActive(client) {
    const nextActive = !client.isActive;
    if (!window.confirm(
      `${nextActive ? "Reactivate" : "Deactivate"} ${client.restaurantName}?`
    )) return;
    setToggling(client.tenantId);
    setFlash(null);
    try {
      await apiFetch(`/admin/clients/${client.tenantId}/set-active`, {
        method: "PUT",
        body: JSON.stringify({ isActive: nextActive })
      });
      setClients(prev => prev.map(c =>
        c.tenantId === client.tenantId ? { ...c, isActive: nextActive } : c
      ));
      setFlash({ type: "success", message: `✓ ${client.restaurantName} marked as ${nextActive ? "Active" : "Inactive"}.` });
    } catch (err) {
      setFlash({ type: "error", message: `✗ ${err.message}` });
    } finally {
      setToggling(null);
    }
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return !q ||
      (c.restaurantName || "").toLowerCase().includes(q) ||
      (c.ownerName || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.tenantId || "").toLowerCase().includes(q);
  });

  // If a client is selected, show detail view
  const selectedClient = selectedId ? clients.find(c => c.tenantId === selectedId) : null;
  if (selectedClient) {
    return (
      <ClientDetailView
        client={selectedClient}
        onBack={() => setSelectedId(null)}
        onToggleActive={async (c) => { await handleToggleActive(c); setSelectedId(null); }}
        onResetPassword={handleReset}
      />
    );
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <div className="admin-brand-mark small">P</div>
          <div>
            <strong>PLATO Admin</strong>
            <span>Client Management</span>
          </div>
        </div>
        <div className="admin-topbar-right">
          <button className="admin-btn-ghost" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <div className="admin-body">
        <div className="admin-stats-row">
          <div className="admin-stat">
            <strong>{clients.length}</strong>
            <span>Total Clients</span>
          </div>
          <div className="admin-stat">
            <strong>{clients.filter(c => c.hasPassword && c.isActive).length}</strong>
            <span>Active</span>
          </div>
          <div className="admin-stat">
            <strong>{clients.filter(c => c.hasPassword && c.isActive && (Date.now() - new Date(c.lastUpdatedAt).getTime()) < 7 * 24 * 60 * 60 * 1000).length}</strong>
            <span>Active This Week</span>
          </div>
          <div className="admin-stat">
            <strong>{clients.filter(c => !c.isActive).length}</strong>
            <span>Inactive</span>
          </div>
          <div className="admin-stat">
            <strong>
              {clients.filter(c => (Date.now() - new Date(c.signedUpAt).getTime()) < 7 * 24 * 60 * 60 * 1000).length}
            </strong>
            <span>Joined This Week</span>
          </div>
        </div>

        {flash && (
          <div className={`admin-flash ${flash.type}`}>
            {flash.message}
            <button onClick={() => setFlash(null)}>✕</button>
          </div>
        )}

        <div className="admin-panel">
          <div className="admin-panel-head">
            <h3>All Clients</h3>
            <div className="admin-panel-actions">
              <input
                type="search"
                className="admin-search"
                placeholder="Search by name, email, phone, tenant ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button className="admin-btn-ghost" onClick={loadClients} title="Refresh">↺ Refresh</button>
            </div>
          </div>

          {loading ? (
            <div className="admin-empty">Loading clients…</div>
          ) : error ? (
            <div className="admin-empty error">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">
              {search ? "No clients match your search." : "No clients registered yet."}
            </div>
          ) : (
            <div className="admin-table-wrap">
              <div className="admin-table-head admin-table-head-7">
                <span>Restaurant</span>
                <span>Owner</span>
                <span>Contact</span>
                <span>Plan</span>
                <span>Joined · Last Active</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {filtered.map(c => (
                <div
                  key={c.tenantId}
                  className="admin-table-row admin-table-row-7 admin-row-clickable"
                  onClick={() => setSelectedId(c.tenantId)}
                >
                  <span><strong>{c.restaurantName}</strong><br /><small className="admin-muted" style={{ fontSize: 10 }}>{c.tenantId}</small></span>
                  <span>{c.ownerName}</span>
                  <span>
                    <span className="admin-email">{c.email}</span>
                    <br /><small>{c.phone}</small>
                  </span>
                  <span onClick={e => e.stopPropagation()}>
                    <PlanBadge planId={c.planId} billingStatus={c.billingStatus} trialDaysLeft={c.trialDaysLeft} />
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {fmtDate(c.signedUpAt)}
                    <br /><small style={{ color: c.lastActivityAt ? "#6B7280" : "#9CA3AF" }}>
                      {c.lastActivityAt ? fmtRelative(c.lastActivityAt) : "No activity"}
                    </small>
                  </span>
                  <span onClick={e => e.stopPropagation()}>
                    <button
                      className={`admin-badge-btn ${!c.isActive ? "inactive" : c.hasPassword ? "active" : "pending"}`}
                      onClick={() => handleToggleActive(c)}
                      disabled={toggling === c.tenantId}
                      title={c.isActive ? "Click to deactivate" : "Click to reactivate"}
                    >
                      {toggling === c.tenantId ? "…" : !c.isActive ? "Inactive" : c.hasPassword ? "Active" : "Pending"}
                    </button>
                  </span>
                  <span onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      className="admin-btn-reset"
                      onClick={() => handleReset(c)}
                      disabled={resetting === c.tenantId}
                    >
                      {resetting === c.tenantId ? "…" : "Reset Pwd"}
                    </button>
                    <button
                      className="admin-btn-ghost"
                      style={{ fontSize: 12, padding: "4px 8px" }}
                      onClick={() => setSelectedId(c.tenantId)}
                    >
                      Details →
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root Admin App ────────────────────────────────────────────────────────────
export function AdminApp() {
  const [user,    setUser]    = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (payload.exp && payload.exp * 1000 > Date.now()) {
          if (payload.tenantId === "default" && (payload.roles || []).includes("Owner")) {
            setUser({ fullName: payload.fullName, email: payload.email });
          } else {
            clearToken();
          }
        } else {
          clearToken();
        }
      } catch (_) {
        clearToken();
      }
    }
    setChecked(true);
  }, []);

  function handleLogin(u) { setUser(u); }
  function handleLogout() { clearToken(); setUser(null); }

  if (!checked) return null;
  if (!user) return <AdminLogin onLogin={handleLogin} />;
  return <ClientsDashboard user={user} onLogout={handleLogout} />;
}
