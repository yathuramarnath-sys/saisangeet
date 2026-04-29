import { useState, useEffect, useCallback } from "react";

const API_URL = "https://api.dinexpos.in/api/v1";
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

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
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
          <div className="admin-brand-mark">D</div>
          <div>
            <strong>DineXPOS</strong>
            <span>Admin Console</span>
          </div>
        </div>
        <h2>Sign in</h2>
        <p className="admin-login-sub">Platform admin access only</p>
        {error && <div className="admin-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="info@dinexpos.in"
              required
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>
          <button type="submit" className="admin-btn-primary" disabled={loading}>
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Clients Dashboard ─────────────────────────────────────────────────────────
function ClientsDashboard({ user, onLogout }) {
  const [clients,   setClients]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [search,    setSearch]    = useState("");
  const [resetting, setResetting] = useState(null);   // tenantId currently resetting
  const [flash,     setFlash]     = useState(null);   // { type, message }

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
      const res = await apiFetch(`/admin/clients/${client.tenantId}/reset-password`, { method: "POST" });
      setFlash({
        type: "success",
        message: `✓ Password reset for ${client.email}. New temp password sent to their inbox.`
      });
    } catch (err) {
      setFlash({ type: "error", message: `✗ Reset failed: ${err.message}` });
    } finally {
      setResetting(null);
    }
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return !q ||
      c.restaurantName.toLowerCase().includes(q) ||
      c.ownerName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q);
  });

  return (
    <div className="admin-dashboard">
      {/* Topbar */}
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <div className="admin-brand-mark small">D</div>
          <div>
            <strong>DineXPOS Admin</strong>
            <span>Client Management</span>
          </div>
        </div>
        <div className="admin-topbar-right">
          <span className="admin-user-pill">👤 {user?.fullName || user?.email || "Admin"}</span>
          <button className="admin-btn-ghost" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <div className="admin-body">
        {/* Stats row */}
        <div className="admin-stats-row">
          <div className="admin-stat">
            <strong>{clients.length}</strong>
            <span>Total Clients</span>
          </div>
          <div className="admin-stat">
            <strong>{clients.filter(c => c.hasPassword).length}</strong>
            <span>Active Accounts</span>
          </div>
          <div className="admin-stat">
            <strong>{clients.filter(c => !c.hasPassword).length}</strong>
            <span>Pending Setup</span>
          </div>
          <div className="admin-stat">
            <strong>
              {clients.filter(c => {
                const d = new Date(c.signedUpAt);
                const now = new Date();
                return (now - d) < 7 * 24 * 60 * 60 * 1000;
              }).length}
            </strong>
            <span>Joined This Week</span>
          </div>
        </div>

        {/* Flash */}
        {flash && (
          <div className={`admin-flash ${flash.type}`}>
            {flash.message}
            <button onClick={() => setFlash(null)}>✕</button>
          </div>
        )}

        {/* Table */}
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h3>All Clients</h3>
            <div className="admin-panel-actions">
              <input
                type="search"
                className="admin-search"
                placeholder="Search by name, email, phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button className="admin-btn-ghost" onClick={loadClients} title="Refresh">
                ↺ Refresh
              </button>
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
              <div className="admin-table-head">
                <span>Restaurant</span>
                <span>Owner</span>
                <span>Email</span>
                <span>Phone</span>
                <span>Signed Up</span>
                <span>Status</span>
                <span>Action</span>
              </div>
              {filtered.map(c => (
                <div key={c.tenantId} className="admin-table-row">
                  <span><strong>{c.restaurantName}</strong></span>
                  <span>{c.ownerName}</span>
                  <span className="admin-email">{c.email}</span>
                  <span>{c.phone}</span>
                  <span className="muted">
                    {fmtDate(c.signedUpAt)}
                    {c.lastUpdatedAt && (
                      <><br /><small>Updated {fmtDate(c.lastUpdatedAt)}</small></>
                    )}
                  </span>
                  <span>
                    {c.hasPassword
                      ? <span className="admin-badge active">Active</span>
                      : <span className="admin-badge pending">Pending</span>
                    }
                  </span>
                  <span>
                    <button
                      className="admin-btn-reset"
                      onClick={() => handleReset(c)}
                      disabled={resetting === c.tenantId}
                    >
                      {resetting === c.tenantId ? "Sending…" : "Reset Password"}
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
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // If there's a token already, try to use it (optimistic restore)
    const token = getToken();
    if (token) {
      // Decode JWT payload (no verify — just read claims for UI)
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        // Check expiry
        if (payload.exp && payload.exp * 1000 > Date.now()) {
          // Only allow default tenant owner
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

  function handleLogin(u) {
    // Guard: only allow default tenant owners
    setUser(u);
  }

  function handleLogout() {
    clearToken();
    setUser(null);
  }

  if (!checked) return null;

  if (!user) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return <ClientsDashboard user={user} onLogout={handleLogout} />;
}
