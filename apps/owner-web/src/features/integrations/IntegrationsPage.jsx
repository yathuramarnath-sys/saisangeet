import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api";

import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_ORDER,
  INTEGRATIONS_CATALOG,
} from "./integrations.seed";

// ── localStorage helpers (for non-API integrations) ──────────────────────────
const LOCAL_KEY = "pos_local_integrations";

function loadConnected() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); }
  catch { return {}; }
}
function saveConnected(map) { localStorage.setItem(LOCAL_KEY, JSON.stringify(map)); }

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 42, height: 24, borderRadius: 12, border: "none",
        cursor: "pointer", background: on ? "#1a7a3a" : "#ccc",
        position: "relative", flexShrink: 0, transition: "background 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 21 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s",
      }} />
    </button>
  );
}

// ── WhatsApp (Twilio) card — API-managed ──────────────────────────────────────
function WhatsAppCard({ integration }) {
  const [config, setConfig]     = useState(null);   // loaded from API
  const [open, setOpen]         = useState(false);
  const [draft, setDraft]       = useState({ accountSid: "", authToken: "", fromNumber: "" });
  const [testPhone, setTestPhone] = useState("");
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [msg, setMsg]           = useState("");

  const connected = !!(config?.connected);

  // Load config on mount
  useEffect(() => {
    api.get("/whatsapp/config")
      .then((data) => {
        setConfig(data);
        if (data?.connected) {
          setDraft({
            accountSid: data.accountSid || "",
            authToken:  "",   // never prefill masked token
            fromNumber: data.fromNumber || "",
          });
        }
      })
      .catch(() => setConfig({ connected: false }));
  }, []);

  function flash(text) {
    setMsg(text);
    setTimeout(() => setMsg(""), 4000);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!draft.accountSid || !draft.authToken || !draft.fromNumber) {
      flash("All three fields are required.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.post("/whatsapp/config", {
        accountSid:  draft.accountSid.trim(),
        authToken:   draft.authToken.trim(),
        fromNumber:  draft.fromNumber.trim(),
        enabled:     true,
      });
      setConfig(updated);
      setOpen(false);
      flash("WhatsApp Bills connected!");
    } catch (err) {
      flash(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    try {
      await api.post("/whatsapp/config", { accountSid: "", authToken: "", fromNumber: "", enabled: false });
      setConfig({ connected: false });
      setDraft({ accountSid: "", authToken: "", fromNumber: "" });
      setOpen(false);
      flash("WhatsApp Bills disconnected.");
    } catch (err) {
      flash(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(e) {
    e.preventDefault();
    if (!testPhone.trim()) { flash("Enter a phone number to test."); return; }
    setTesting(true);
    try {
      await api.post("/whatsapp/test", { phone: testPhone.trim() });
      flash(`Test message sent to ${testPhone}! Check WhatsApp.`);
      setTestPhone("");
    } catch (err) {
      flash(`Test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className={`integration-card ${connected ? "integration-connected" : ""}`}>
      <div className="integration-card-header">
        <span className="integration-emoji">{integration.emoji}</span>
        <div className="integration-info">
          <strong>{integration.name}</strong>
          <p>{integration.tagline}</p>
        </div>
        <div className="integration-right">
          {connected ? (
            <span className="status online">Connected</span>
          ) : (
            <span className="integration-setup-time">⏱ {integration.setupTime}</span>
          )}
          <Toggle
            on={connected}
            onChange={(val) => {
              if (val) setOpen(true);
              else handleDisconnect();
            }}
          />
        </div>
      </div>

      {msg && <div className="integration-flash">{msg}</div>}

      {/* Credentials form */}
      {open && (
        <form className="integration-form" onSubmit={handleSave}>
          <p className="integration-help">{integration.helpText}</p>
          {integration.fields.map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={draft[field.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                autoComplete="off"
              />
              {field.hint && <span className="integration-field-hint">{field.hint}</span>}
            </label>
          ))}
          <div className="integration-form-actions">
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? "Saving…" : (connected ? "Update credentials" : "Connect WhatsApp Bills")}
            </button>
            <button type="button" className="ghost-chip" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Connected state bar + test message */}
      {connected && !open && (
        <>
          <div className="integration-connected-bar">
            <span>✓ Active — bills will be sent to customer WhatsApp after payment</span>
            <button type="button" className="ghost-chip" onClick={() => setOpen(true)}>
              Edit credentials
            </button>
          </div>
          <form className="integration-test-row" onSubmit={handleTest}>
            <input
              type="tel"
              placeholder="Test: enter your mobile number"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="integration-test-input"
            />
            <button type="submit" className="ghost-chip" disabled={testing}>
              {testing ? "Sending…" : "Send test"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

// ── Generic card (localStorage-only for non-live integrations) ────────────────
function IntegrationCard({ integration, connected, creds, onConnect, onDisconnect, onSaveCreds }) {
  const [open, setOpen]   = useState(false);
  const [draft, setDraft] = useState(() => {
    const saved = creds || {};
    return Object.fromEntries(integration.fields.map((f) => [f.key, saved[f.key] || ""]));
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    onSaveCreds(integration.id, draft);
    onConnect(integration.id);
    setOpen(false);
    setSaving(false);
  }

  return (
    <div className={`integration-card ${connected ? "integration-connected" : ""}`}>
      <div className="integration-card-header">
        <span className="integration-emoji">{integration.emoji}</span>
        <div className="integration-info">
          <strong>{integration.name}</strong>
          <p>{integration.tagline}</p>
        </div>
        <div className="integration-right">
          {connected ? (
            <span className="status online">Connected</span>
          ) : (
            <span className="integration-setup-time">⏱ {integration.setupTime}</span>
          )}
          <Toggle
            on={connected}
            onChange={(val) => {
              if (val) setOpen(true);
              else { onDisconnect(integration.id); setOpen(false); }
            }}
          />
        </div>
      </div>

      {open && !connected && (
        <form className="integration-form" onSubmit={handleSubmit}>
          <p className="integration-help">{integration.helpText}</p>
          {integration.fields.map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={draft[field.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                required
                autoComplete="off"
              />
            </label>
          ))}
          <div className="integration-form-actions">
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? "Connecting…" : `Connect ${integration.name}`}
            </button>
            <button type="button" className="ghost-chip" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      {connected && (
        <div className="integration-connected-bar">
          <span>✓ Active — syncing automatically</span>
          <button type="button" className="ghost-chip" onClick={() => { setOpen(true); setDraft(creds || {}); }}>
            Edit credentials
          </button>
        </div>
      )}

      {open && connected && (
        <form className="integration-form" onSubmit={handleSubmit}>
          <p className="integration-help">{integration.helpText}</p>
          {integration.fields.map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={draft[field.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                autoComplete="off"
              />
            </label>
          ))}
          <div className="integration-form-actions">
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="ghost-chip" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function IntegrationsPage() {
  const [connected, setConnected] = useState(() => loadConnected());
  const [msg, setMsg]             = useState("");

  function flash(text) { setMsg(text); setTimeout(() => setMsg(""), 3000); }

  function handleConnect(id) {
    const next = { ...connected, [id]: { ...connected[id], active: true } };
    setConnected(next); saveConnected(next);
    const item = INTEGRATIONS_CATALOG.find((x) => x.id === id);
    flash(`${item?.name} connected successfully!`);
  }

  function handleDisconnect(id) {
    const next = { ...connected, [id]: { ...connected[id], active: false } };
    setConnected(next); saveConnected(next);
    const item = INTEGRATIONS_CATALOG.find((x) => x.id === id);
    flash(`${item?.name} disconnected.`);
  }

  function handleSaveCreds(id, creds) {
    const next = { ...connected, [id]: { ...connected[id], creds } };
    setConnected(next); saveConnected(next);
  }

  // Count local-only connected (excluding API-managed ones)
  const localCount = Object.values(connected).filter((v) => v?.active).length;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Integrations</h2>
        </div>
        {localCount > 0 && (
          <div className="topbar-actions">
            <span className="status online">{localCount} connected</span>
          </div>
        )}
      </header>

      <section className="hero-panel" style={{ marginBottom: 24 }}>
        <div>
          <p className="hero-label">Connect your tools</p>
          <h3>Your restaurant, connected to everything you already use</h3>
          <p className="hero-copy">
            Orders, payments, deliveries, and accounts — all in one place.
            Each integration takes under 5 minutes to set up.
          </p>
        </div>
        <div className="hero-stats">
          <div><span>Available</span><strong>{INTEGRATIONS_CATALOG.length}</strong></div>
          <div><span>Connected</span><strong>{localCount}</strong></div>
        </div>
      </section>

      {msg && <div className="mobile-banner">{msg}</div>}

      {CATEGORY_ORDER.map((category) => {
        const items = INTEGRATIONS_CATALOG.filter((x) => x.category === category);
        return (
          <section key={category} className="integrations-section">
            <div className="integrations-section-head">
              <div>
                <h3 className="integrations-category-title">{category}</h3>
                <p className="integrations-category-desc">{CATEGORY_DESCRIPTIONS[category]}</p>
              </div>
            </div>
            <div className="integrations-list">
              {items.map((item) =>
                item.apiManaged ? (
                  <WhatsAppCard key={item.id} integration={item} />
                ) : (
                  <IntegrationCard
                    key={item.id}
                    integration={item}
                    connected={!!connected[item.id]?.active}
                    creds={connected[item.id]?.creds}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onSaveCreds={handleSaveCreds}
                  />
                )
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}
