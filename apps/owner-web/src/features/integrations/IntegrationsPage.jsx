import { useState, useEffect } from "react";
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
function WhatsAppCard({ integration, onConnectionChange }) {
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
        onConnectionChange?.(!!data?.connected);
        if (data?.connected) {
          setDraft({
            accountSid: data.accountSid || "",
            authToken:  "",   // never prefill masked token
            fromNumber: data.fromNumber || "",
          });
        }
      })
      .catch(() => { setConfig({ connected: false }); onConnectionChange?.(false); });
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
      onConnectionChange?.(true);
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
      onConnectionChange?.(false);
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
// ── UrbanPiper / Online Orders webhook card ───────────────────────────────────
function OnlineOrdersWebhookCard() {
  const [config,      setConfig]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [generating,  setGenerating]  = useState(false);
  const [copied,      setCopied]      = useState("");
  const [showSecret,  setShowSecret]  = useState(false);
  const [expandGuide, setExpandGuide] = useState(false);

  // UrbanPiper credentials form
  const [upDraft,   setUpDraft]   = useState({ bizId: "", apiKey: "", enabled: false });
  const [upSaving,  setUpSaving]  = useState(false);
  const [upMsg,     setUpMsg]     = useState("");
  const [showCreds, setShowCreds] = useState(false);

  useEffect(() => {
    api.get("/online-orders/config")
      .then(d => {
        setConfig(d);
        setUpDraft(prev => ({
          ...prev,
          bizId:   d.urbanPiper?.bizId || "",
          enabled: d.urbanPiper?.enabled || false,
        }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function regenerateSecret() {
    if (!window.confirm("Regenerate webhook secret? Your current UrbanPiper webhook will stop working until you update it there too.")) return;
    setGenerating(true);
    try {
      await api.post("/online-orders/webhook-secret/regenerate");
      const updated = await api.get("/online-orders/config");
      setConfig(updated);
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function saveUpCreds(e) {
    e.preventDefault();
    if (!upDraft.bizId.trim()) { setUpMsg("Business ID is required."); return; }
    setUpSaving(true); setUpMsg("");
    try {
      await api.post("/online-orders/urbanpiper-config", {
        bizId:   upDraft.bizId.trim(),
        apiKey:  upDraft.apiKey.trim() || undefined,
        enabled: upDraft.enabled,
      });
      const updated = await api.get("/online-orders/config");
      setConfig(updated);
      setUpDraft(d => ({ ...d, apiKey: "" })); // clear apiKey field after save
      setUpMsg("✓ UrbanPiper credentials saved — callbacks are now live.");
      setTimeout(() => setUpMsg(""), 4000);
    } catch (err) {
      setUpMsg("Save failed: " + err.message);
    } finally {
      setUpSaving(false);
    }
  }

  function copyText(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    });
  }

  if (loading) return <div className="int-webhook-card"><p style={{padding:16,color:"#888"}}>Loading…</p></div>;

  const callbacksLive = config?.urbanPiper?.callbacksLive;

  return (
    <div className="int-webhook-card">
      {/* Header */}
      <div className="int-webhook-head">
        <div className="int-webhook-logos">
          <span className="int-webhook-platform-badge swiggy">🟠 Swiggy</span>
          <span className="int-webhook-platform-badge zomato">🔴 Zomato</span>
          <span className="int-webhook-platform-badge urbanpiper">🔗 UrbanPiper</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span className={`status ${config?.secretConfigured ? "online" : "offline"}`}>
            {config?.secretConfigured ? "Webhook ready" : "Webhook not set up"}
          </span>
          <span className={`status ${callbacksLive ? "online" : "offline"}`}>
            {callbacksLive ? "Callbacks live" : "Callbacks off"}
          </span>
        </div>
      </div>

      <h3 className="int-webhook-title">Online Orders — Swiggy &amp; Zomato</h3>
      <p className="int-webhook-desc">
        Orders from Swiggy and Zomato appear instantly on your POS screen via UrbanPiper.
        Paste the webhook URL into UrbanPiper, then add your UrbanPiper API credentials
        so the POS can send accept/reject callbacks back to Swiggy/Zomato automatically.
      </p>

      {/* Webhook URL */}
      {config?.webhookUrl && (
        <div className="int-webhook-field-group">
          <label className="int-webhook-field-label">Your Webhook URL</label>
          <div className="int-webhook-field-row">
            <code className="int-webhook-url">{config.webhookUrl}</code>
            <button
              className="int-copy-btn"
              onClick={() => copyText(config.webhookUrl, "url")}
            >
              {copied === "url" ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <p className="int-webhook-hint">Paste this in UrbanPiper → Settings → POS Integration → Webhook URL</p>
        </div>
      )}

      {/* Secret key */}
      <div className="int-webhook-field-group">
        <label className="int-webhook-field-label">Webhook Secret Key</label>
        {config?.secretConfigured ? (
          <div className="int-webhook-field-row">
            <code className="int-webhook-url">
              {showSecret ? config.secretMasked : "wh_live_••••••••••••••••••••••••••••••"}
            </code>
            <button className="int-copy-btn ghost" onClick={() => setShowSecret(s => !s)}>
              {showSecret ? "Hide" : "Show"}
            </button>
            <button className="int-copy-btn danger" onClick={regenerateSecret} disabled={generating}>
              {generating ? "…" : "Regenerate"}
            </button>
          </div>
        ) : (
          <div>
            <p className="int-webhook-hint" style={{marginBottom:8}}>No secret configured yet. Generate one to secure your webhook.</p>
            <button className="primary-btn" style={{fontSize:13,padding:"8px 16px"}} onClick={regenerateSecret} disabled={generating}>
              {generating ? "Generating…" : "Generate Secret Key"}
            </button>
          </div>
        )}
        <p className="int-webhook-hint">Paste this in UrbanPiper → Settings → POS Integration → Secret Key</p>
      </div>

      {/* Per-outlet URLs */}
      {config?.outletUrls?.length > 1 && (
        <div className="int-webhook-field-group">
          <label className="int-webhook-field-label">Per-Outlet Webhook URLs</label>
          {config.outletUrls.map(o => (
            <div key={o.outletId} className="int-webhook-field-row" style={{marginBottom:6}}>
              <span className="int-outlet-label">{o.outletName}</span>
              <code className="int-webhook-url" style={{flex:1,fontSize:11}}>{o.url}</code>
              <button className="int-copy-btn" onClick={() => copyText(o.url, o.outletId)}>
                {copied === o.outletId ? "✓" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── UrbanPiper API Credentials ─────────────────────────────────────── */}
      <div className="int-webhook-divider" />
      <div className="int-creds-head">
        <div>
          <h4 className="int-creds-title">
            UrbanPiper API Credentials
            {callbacksLive && <span className="int-creds-live-badge">● Callbacks live</span>}
          </h4>
          <p className="int-webhook-hint" style={{margin:"2px 0 0"}}>
            Required so POS can send accept/reject signals back to Swiggy &amp; Zomato.
            Find these in UrbanPiper → Settings → API Access.
          </p>
        </div>
        <button className="int-guide-toggle" onClick={() => setShowCreds(s => !s)}>
          {showCreds ? "▲ Hide" : "▼ Configure"}
        </button>
      </div>

      {showCreds && (
        <form className="int-creds-form" onSubmit={saveUpCreds}>
          <div className="int-creds-row">
            <div className="int-creds-field">
              <label>Business ID (biz_id)</label>
              <input
                type="text"
                placeholder="e.g. my-restaurant-chain"
                value={upDraft.bizId}
                onChange={e => setUpDraft(d => ({ ...d, bizId: e.target.value }))}
              />
            </div>
            <div className="int-creds-field">
              <label>API Key {config?.urbanPiper?.apiKeySet && <span className="int-key-set">● set</span>}</label>
              <input
                type="password"
                placeholder={config?.urbanPiper?.apiKeySet ? "Leave blank to keep existing" : "Paste API key"}
                value={upDraft.apiKey}
                onChange={e => setUpDraft(d => ({ ...d, apiKey: e.target.value }))}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="int-creds-enable-row">
            <label className="int-creds-enable-label">
              <input
                type="checkbox"
                checked={upDraft.enabled}
                onChange={e => setUpDraft(d => ({ ...d, enabled: e.target.checked }))}
              />
              Enable UrbanPiper callbacks (accept/reject sent to Swiggy &amp; Zomato)
            </label>
          </div>
          {upMsg && (
            <p style={{fontSize:12, color: upMsg.startsWith("✓") ? "#16a34a" : "#dc2626", margin:"6px 0 0"}}>
              {upMsg}
            </p>
          )}
          <div style={{marginTop:10}}>
            <button type="submit" className="primary-btn" style={{fontSize:13,padding:"8px 18px"}} disabled={upSaving}>
              {upSaving ? "Saving…" : "Save Credentials"}
            </button>
          </div>
        </form>
      )}

      {/* Setup guide toggle */}
      <div className="int-webhook-divider" />
      <button className="int-guide-toggle" onClick={() => setExpandGuide(g => !g)}>
        {expandGuide ? "▲ Hide" : "▼ Show"} step-by-step setup guide
      </button>

      {expandGuide && (
        <ol className="int-setup-guide">
          <li>
            <strong>Create UrbanPiper account</strong> — go to{" "}
            <a href="https://urbanpiper.com" target="_blank" rel="noreferrer">urbanpiper.com</a>{" "}
            and sign up as a restaurant.
          </li>
          <li>
            <strong>Link Swiggy &amp; Zomato</strong> — inside UrbanPiper dashboard, connect
            your Swiggy and Zomato business accounts (~24h approval for first time).
          </li>
          <li>
            <strong>Add Plato POS webhook</strong> — in UrbanPiper go to{" "}
            <em>Settings → POS Integration → Custom Webhook</em>.
            Paste the Webhook URL and Secret Key from above.
          </li>
          <li>
            <strong>Add API credentials</strong> — in UrbanPiper go to{" "}
            <em>Settings → API Access</em>, copy your Business ID and API Key,
            paste them in the credentials section above and enable callbacks.
          </li>
          <li>
            <strong>Test it</strong> — use UrbanPiper's "Send Test Order" button.
            Order appears on POS within 2 seconds. Cashier accepts → UrbanPiper confirms back to Swiggy/Zomato.
          </li>
          <li>
            <strong>Go live</strong> — all real orders flow automatically from this point.
          </li>
        </ol>
      )}
    </div>
  );
}

export function IntegrationsPage() {
  const [connected, setConnected]         = useState(() => loadConnected());
  const [whatsappActive, setWhatsappActive] = useState(false);
  const [msg, setMsg]                     = useState("");

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

  // Total connected count including API-managed WhatsApp
  const localCount = Object.values(connected).filter((v) => v?.active).length;
  const totalCount = localCount + (whatsappActive ? 1 : 0);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Integrations</h2>
        </div>
        {totalCount > 0 && (
          <div className="topbar-actions">
            <span className="status online">{totalCount} connected</span>
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
          <div><span>Connected</span><strong>{totalCount}</strong></div>
        </div>
      </section>

      {msg && <div className="mobile-banner">{msg}</div>}

      {/* ── Online Orders (Swiggy / Zomato via UrbanPiper) ─────────────────── */}
      <section className="integrations-section">
        <div className="integrations-section-head">
          <div>
            <h3 className="integrations-category-title">Online Ordering Platforms</h3>
            <p className="integrations-category-desc">
              Receive Swiggy and Zomato orders directly on your POS in real-time via UrbanPiper.
            </p>
          </div>
        </div>
        <OnlineOrdersWebhookCard />
      </section>

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
                  <WhatsAppCard key={item.id} integration={item} onConnectionChange={setWhatsappActive} />
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
