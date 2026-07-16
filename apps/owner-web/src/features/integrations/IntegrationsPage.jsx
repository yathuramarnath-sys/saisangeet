import { useState, useEffect } from "react";
import { api } from "../../lib/api";

import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_ORDER,
  INTEGRATIONS_CATALOG,
} from "./integrations.seed";


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

// ── Coming-soon card (placeholder for catalog items without backend support) ───
function ComingSoonCard({ integration }) {
  return (
    <div className="integration-card" style={{ opacity: 0.7 }}>
      <div className="integration-card-header">
        <span className="integration-emoji">{integration.emoji}</span>
        <div className="integration-info">
          <strong>{integration.name}</strong>
          <p>{integration.tagline}</p>
        </div>
        <div className="integration-right">
          <span className="integration-setup-time">Coming soon</span>
        </div>
      </div>
    </div>
  );
}

// ── Zoho Books config card ────────────────────────────────────────────────────
function ZohoConfigCard() {
  const [cfg,      setCfg]      = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillingExpenses, setBackfillingExpenses] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [msg,      setMsg]      = useState({ text: "", ok: true });
  const [form,     setForm]     = useState({
    clientId: "", clientSecret: "", stateCode: "TN", enabled: false, syncStartDate: "",
  });
  const [accounts,   setAccounts]   = useState([]);
  const [overrides,  setOverrides]  = useState({ cash: "", card: "", upi: "", other: "", cashOutExpense: "" });
  const [savingRoute, setSavingRoute] = useState(false);

  // Check URL params for OAuth result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("zoho_connected") === "1") {
      setMsg({ text: "✓ Zoho Books connected successfully!", ok: true });
      setExpanded(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("zoho_error")) {
      setMsg({ text: "✗ " + params.get("zoho_error"), ok: false });
      setExpanded(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const loadConfig = () => {
    api.get("/integrations/zoho/config")
      .then(d => {
        setCfg(d);
        setForm(f => ({
          ...f,
          stateCode:     d.stateCode || "TN",
          enabled:       d.enabled   || false,
          syncStartDate: d.syncStartDate || "",
        }));
        const ov = d.accountOverrides || {};
        setOverrides({
          cash:           ov.cash?.accountId           || "",
          card:           ov.card?.accountId           || "",
          upi:            ov.upi?.accountId             || "",
          other:          ov.other?.accountId           || "",
          cashOutExpense: ov.cashOutExpense?.accountId || "",
        });
        if (d.connected) {
          api.get("/integrations/zoho/accounts")
            .then(r => setAccounts(r.accounts || []))
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadConfig(); }, []);

  async function handleSaveRouting() {
    setSavingRoute(true); setMsg({ text: "", ok: true });
    try {
      const body = {};
      for (const bucket of ["cash", "card", "upi", "other", "cashOutExpense"]) {
        const accountId = overrides[bucket];
        if (!accountId) { body[bucket] = null; continue; }
        const acct = accounts.find(a => a.accountId === accountId);
        body[bucket] = { accountId, accountName: acct?.accountName || "" };
      }
      await api.post("/integrations/zoho/account-overrides", body);
      setMsg({ text: "✓ Account routing saved.", ok: true });
      loadConfig();
    } catch (err) {
      setMsg({ text: "✗ " + (err.message || "Save failed"), ok: false });
    } finally { setSavingRoute(false); }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setMsg({ text: "", ok: true });
    try {
      await api.post("/integrations/zoho/config", form);
      setMsg({ text: "✓ Saved. Now click Connect to Zoho Books.", ok: true });
      loadConfig();
    } catch (err) {
      setMsg({ text: "✗ " + (err.message || "Save failed"), ok: false });
    } finally { setSaving(false); }
  }

  async function handleConnect() {
    try {
      const { url } = await api.get("/integrations/zoho/auth-url");
      window.location.href = url;
    } catch (err) {
      setMsg({ text: "✗ " + (err.message || "Could not get auth URL. Save Client ID first."), ok: false });
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Zoho Books? Auto-push will stop. You can reconnect anytime.")) return;
    try {
      await api.delete("/integrations/zoho/disconnect");
      setMsg({ text: "Disconnected.", ok: true });
      loadConfig();
    } catch (err) {
      setMsg({ text: "✗ " + err.message, ok: false });
    }
  }

  async function handleTest() {
    setTesting(true); setMsg({ text: "", ok: true });
    try {
      const res = await api.post("/integrations/zoho/test");
      setMsg({ text: `✓ Test receipt ${res.receiptNumber} created in Zoho Books!`, ok: true });
    } catch (err) {
      setMsg({ text: "✗ " + (err.message || "Test failed"), ok: false });
    } finally { setTesting(false); }
  }

  async function handleSyncAccounts() {
    setSyncing(true); setMsg({ text: "", ok: true });
    try {
      const res = await api.post("/integrations/zoho/sync-accounts");
      setMsg({
        text: `✓ Account mapping refreshed — Cash: ${res.cashAccountName || "not found"} · Bank: ${res.bankAccountName || "not found"} · Cash-out expense: ${res.miscExpenseAccountName || "not found"}`,
        ok: !!(res.cashAccountName && res.bankAccountName && res.miscExpenseAccountName),
      });
      loadConfig();
    } catch (err) {
      setMsg({ text: "✗ " + (err.message || "Sync failed"), ok: false });
    } finally { setSyncing(false); }
  }

  async function handleBackfillSales() {
    setBackfilling(true); setMsg({ text: "", ok: true });
    try {
      const res = await api.post("/integrations/zoho/backfill-sales");
      setMsg({
        text: `✓ Backfill ${res.dateFrom} → ${res.dateTo}: ${res.pushed} pushed, ${res.skipped} already in Zoho` +
          (res.failed ? `, ${res.failed} failed` : ""),
        ok: res.failed === 0,
      });
      loadConfig();
    } catch (err) {
      setMsg({ text: "✗ " + (err.message || "Backfill failed"), ok: false });
    } finally { setBackfilling(false); }
  }

  async function handleBackfillExpenses() {
    setBackfillingExpenses(true); setMsg({ text: "", ok: true });
    try {
      const res = await api.post("/integrations/zoho/backfill-expenses");
      if (res.failures?.length) console.warn("[zoho] expense backfill failures:", res.failures);
      setMsg({
        text: `✓ Expense backfill ${res.dateFrom} → ${res.dateTo}: ${res.pushed} pushed, ${res.skipped} already in Zoho` +
          (res.failed ? `, ${res.failed} failed — first error: ${res.failures?.[0]?.error || "unknown"}` : ""),
        ok: res.failed === 0,
      });
      loadConfig();
    } catch (err) {
      setMsg({ text: "✗ " + (err.message || "Expense backfill failed"), ok: false });
    } finally { setBackfillingExpenses(false); }
  }

  const STATE_CODES = [
    ["AP","Andhra Pradesh"],["AR","Arunachal Pradesh"],["AS","Assam"],["BR","Bihar"],
    ["CG","Chhattisgarh"],["DL","Delhi"],["GA","Goa"],["GJ","Gujarat"],
    ["HR","Haryana"],["HP","Himachal Pradesh"],["JK","Jammu & Kashmir"],["JH","Jharkhand"],
    ["KA","Karnataka"],["KL","Kerala"],["MP","Madhya Pradesh"],["MH","Maharashtra"],
    ["MN","Manipur"],["ML","Meghalaya"],["MZ","Mizoram"],["NL","Nagaland"],
    ["OD","Odisha"],["PB","Punjab"],["RJ","Rajasthan"],["SK","Sikkim"],
    ["TN","Tamil Nadu"],["TS","Telangana"],["TR","Tripura"],["UP","Uttar Pradesh"],
    ["UK","Uttarakhand"],["WB","West Bengal"],
  ];

  return (
    <div className="integration-card" style={{ marginBottom: 16 }}>
      {/* Card header */}
      <div className="integration-card-head" style={{ display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize: 28 }}>📒</span>
        <div style={{ flex: 1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <strong style={{ fontSize: 15 }}>Zoho Books</strong>
            {cfg?.connected && cfg?.enabled && (
              <span className="status online" style={{ fontSize: 11 }}>Connected</span>
            )}
            {cfg?.connected && !cfg?.enabled && (
              <span className="status offline" style={{ fontSize: 11 }}>Paused</span>
            )}
            {cfg && !cfg.connected && (
              <span className="status offline" style={{ fontSize: 11 }}>Not connected</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>
            {cfg?.connected && cfg?.orgName
              ? `${cfg.orgName} · ${cfg.totalPushed || 0} receipts pushed`
              : "Every settled bill auto-syncs to Zoho Books as a Sales Receipt."}
          </p>
        </div>
        <button type="button" className="btn-outline" style={{ fontSize:12, padding:"4px 10px" }}
          onClick={() => setExpanded(v => !v)}>
          {expanded ? "Hide" : cfg?.connected ? "Manage" : "Setup"}
        </button>
      </div>

      {/* Stats row when connected */}
      {!expanded && cfg?.connected && (cfg.lastSyncAt || cfg.totalPushed > 0 || cfg.syncStartDate) && (
        <div style={{ display:"flex", gap:24, marginTop:10, padding:"8px 0 0", borderTop:"1px solid #f3f4f6", fontSize:12, color:"#6b7280" }}>
          <span>📅 Last sync: {cfg.lastSyncAt ? new Date(cfg.lastSyncAt).toLocaleString("en-IN") : "—"}</span>
          <span>📋 Total receipts: {cfg.totalPushed || 0}</span>
          {cfg.syncStartDate && <span>⏳ Pushing from: {cfg.syncStartDate}</span>}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 16, display:"flex", flexDirection:"column", gap:14 }}>

          {msg.text && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, fontSize: 13,
              background: msg.ok ? "#f0fdf4" : "#fef2f2",
              color: msg.ok ? "#16a34a" : "#dc2626",
              border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`,
            }}>
              {msg.text}
            </div>
          )}

          {/* Step 1: Credentials */}
          <div style={{ background:"#f9fafb", borderRadius:10, padding:"12px 14px" }}>
            <p style={{ fontSize:12, fontWeight:700, color:"#374151", margin:"0 0 10px" }}>
              Step 1 — Enter your Zoho API credentials
            </p>
            <form onSubmit={handleSave} style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div className="form-row">
                <label className="form-label">
                  Client ID{" "}
                  <a href="https://api-console.zoho.in" target="_blank" rel="noreferrer"
                    style={{ fontSize:10, color:"#1d4ed8", fontWeight:400 }}>
                    (get from api-console.zoho.in ↗)
                  </a>
                  {cfg?.clientIdSet && <span style={{ color:"#16a34a", fontSize:11, marginLeft:4 }}>● saved</span>}
                </label>
                <input className="form-input" placeholder="Paste Client ID from Zoho Developer Console"
                  value={form.clientId}
                  onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} />
              </div>
              <div className="form-row">
                <label className="form-label">
                  Client Secret {cfg?.secretSet && <span style={{ color:"#16a34a", fontSize:11 }}>● saved</span>}
                </label>
                <input className="form-input" type="password"
                  placeholder={cfg?.secretSet ? "Leave blank to keep existing" : "From api-console.zoho.in"}
                  value={form.clientSecret}
                  onChange={e => setForm(f => ({ ...f, clientSecret: e.target.value }))} />
              </div>
              <div style={{ display:"flex", gap:12 }}>
                <div className="form-row" style={{ flex:1 }}>
                  <label className="form-label">Restaurant State (for GST)</label>
                  <select className="form-input" value={form.stateCode}
                    onChange={e => setForm(f => ({ ...f, stateCode: e.target.value }))}>
                    {STATE_CODES.map(([code, name]) => (
                      <option key={code} value={code}>{name} ({code})</option>
                    ))}
                  </select>
                </div>
                <div className="form-row" style={{ flex:1, justifyContent:"flex-end" }}>
                  <label className="form-label">Auto-push</label>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6 }}>
                    <Toggle on={form.enabled} onChange={v => setForm(f => ({ ...f, enabled: v }))} />
                    <span style={{ fontSize:12, color: form.enabled ? "#16a34a" : "#9ca3af" }}>
                      {form.enabled ? "Push every settled bill" : "Off"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">
                  Push sales starting from{" "}
                  <span style={{ fontWeight:400, color:"#6b7280" }}>(optional — leave blank to push every bill)</span>
                </label>
                <input className="form-input" type="date" style={{ maxWidth: 200 }}
                  value={form.syncStartDate}
                  onChange={e => setForm(f => ({ ...f, syncStartDate: e.target.value }))} />
                <span className="integration-field-hint">
                  Bills closed before this date won't be pushed to Zoho Books. Bills closed on/after it will.
                </span>
              </div>
              <button type="submit" className="btn-primary" style={{ alignSelf:"flex-start" }} disabled={saving}>
                {saving ? "Saving…" : "Save Credentials"}
              </button>
            </form>
          </div>

          {/* Redirect URI info */}
          {cfg?.redirectUri && (
            <div style={{ background:"#eff6ff", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#1d4ed8" }}>
              <strong>Register this Redirect URI in Zoho Developer Console:</strong><br />
              <code style={{ fontSize:11, wordBreak:"break-all" }}>{cfg.redirectUri}</code>
            </div>
          )}

          {/* Step 2: Connect */}
          <div style={{ background:"#f9fafb", borderRadius:10, padding:"12px 14px" }}>
            <p style={{ fontSize:12, fontWeight:700, color:"#374151", margin:"0 0 10px" }}>
              Step 2 — Connect your Zoho Books account
            </p>
            {cfg?.connected ? (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>✅</span>
                  <div>
                    <p style={{ margin:0, fontWeight:600, fontSize:14 }}>{cfg.orgName}</p>
                    <p style={{ margin:0, fontSize:11, color:"#6b7280" }}>
                      Org ID: {cfg.organizationId} · Connected {cfg.connectedAt ? new Date(cfg.connectedAt).toLocaleDateString("en-IN") : ""}
                    </p>
                  </div>
                </div>
                <div style={{ fontSize:12, color:"#6b7280", background:"#f9fafb", borderRadius:8, padding:"8px 12px" }}>
                  <strong style={{ color:"#374151" }}>Deposit accounts detected:</strong>{" "}
                  Cash → {cfg.cashAccountName || <span style={{ color:"#dc2626" }}>not found</span>}
                  {" · "}
                  Bank/UPI/Card → {cfg.bankAccountName || <span style={{ color:"#dc2626" }}>not found</span>}
                  {" · "}
                  Cash-out expense → {cfg.miscExpenseAccountName || <span style={{ color:"#dc2626" }}>not found</span>}
                  <br />
                  <span>
                    If any of these look wrong, or you added/renamed an account in Zoho after connecting, click Re-sync below
                    — then check Step 3 to pin the exact account each one should use.
                  </span>
                </div>
                <div style={{ fontSize:12, color:"#6b7280", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"8px 12px" }}>
                  <strong style={{ color:"#92400e" }}>Pushing from {cfg.syncStartDate || "month start"} only covers bills closed from now on.</strong>{" "}
                  Bills already closed since that date won't sync on their own — use Backfill below to push them once.
                </div>
                <div style={{ display:"flex", gap:10, marginTop:4, flexWrap:"wrap" }}>
                  <button type="button" className="btn-outline" onClick={handleTest} disabled={testing}>
                    {testing ? "Testing…" : "🧪 Test Connection"}
                  </button>
                  <button type="button" className="btn-outline" onClick={handleSyncAccounts} disabled={syncing}>
                    {syncing ? "Syncing…" : "🏦 Re-sync Accounts"}
                  </button>
                  <button type="button" className="btn-outline" onClick={handleBackfillSales} disabled={backfilling}>
                    {backfilling ? "Pushing past bills…" : "📤 Backfill Past Bills"}
                  </button>
                  <button type="button" className="btn-outline" onClick={handleBackfillExpenses} disabled={backfillingExpenses}>
                    {backfillingExpenses ? "Pushing past cash-outs…" : "📤 Backfill Cash-Out Expenses"}
                  </button>
                  <button type="button" className="btn-outline" onClick={handleConnect}
                    style={{ color:"#f59e0b", borderColor:"#f59e0b" }}>
                    🔄 Reconnect
                  </button>
                  <button type="button" className="btn-outline" onClick={handleDisconnect}
                    style={{ color:"#dc2626", borderColor:"#dc2626" }}>
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <p style={{ margin:0, fontSize:12, color:"#6b7280" }}>
                  Click below to sign in to Zoho and grant Plato POS access to your Books account.
                </p>
                <button type="button" className="btn-primary" onClick={handleConnect}
                  style={{ alignSelf:"flex-start", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:16 }}>📒</span> Connect to Zoho Books
                </button>
              </div>
            )}
          </div>

          {/* Step 3: Account routing overrides */}
          {cfg?.connected && (
            <div style={{ background:"#f9fafb", borderRadius:10, padding:"12px 14px" }}>
              <p style={{ fontSize:12, fontWeight:700, color:"#374151", margin:"0 0 6px" }}>
                Step 3 — Account routing (optional)
              </p>
              <p style={{ fontSize:12, color:"#6b7280", margin:"0 0 10px" }}>
                Pin exactly which Zoho account each payment method or cash-out expense should post to.
                Leave a row on "Auto-detected" to keep using the Cash/Bank accounts detected above.
              </p>
              {accounts.length === 0 ? (
                <p style={{ fontSize:12, color:"#9ca3af" }}>Loading chart of accounts…</p>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {[
                    ["cash", "Cash sales →"],
                    ["card", "Card sales →"],
                    ["upi", "UPI sales →"],
                    ["other", "Other (PhonePe/Swiggy/Zomato) →"],
                    ["cashOutExpense", "Cash-out expenses →"],
                  ].map(([bucket, label]) => (
                    <div key={bucket} style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:12, color:"#374151", minWidth:220 }}>{label}</span>
                      <select className="form-input" style={{ maxWidth:280 }}
                        value={overrides[bucket]}
                        onChange={e => setOverrides(o => ({ ...o, [bucket]: e.target.value }))}>
                        <option value="">Auto-detected</option>
                        {accounts.map(a => (
                          <option key={a.accountId} value={a.accountId}>
                            {a.accountName} ({a.accountType}{a.isPrimary ? ", default" : ""})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <button type="button" className="btn-primary" style={{ alignSelf:"flex-start", marginTop:4 }}
                    onClick={handleSaveRouting} disabled={savingRoute}>
                    {savingRoute ? "Saving…" : "Save Account Routing"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Setup guide */}
          <details style={{ fontSize:12, color:"#6b7280", cursor:"pointer" }}>
            <summary style={{ fontWeight:600, color:"#374151", listStyle:"none", cursor:"pointer" }}>
              📖 How to get your Client ID &amp; Secret
            </summary>
            <ol style={{ marginTop:8, paddingLeft:18, lineHeight:1.8 }}>
              <li>Go to{" "}
                <a href="https://api-console.zoho.in" target="_blank" rel="noreferrer" style={{ color:"#1d4ed8" }}>
                  api-console.zoho.in
                </a>{" "}→ sign in with your Zoho account</li>
              <li>Click <strong>Add Client</strong> → choose <strong>Server-based Applications</strong></li>
              <li>Set <strong>Authorized Redirect URI</strong> to the URL shown above</li>
              <li>Copy <strong>Client ID</strong> and <strong>Client Secret</strong> → paste above → Save</li>
              <li>Click <strong>Connect to Zoho Books</strong> → approve access</li>
              <li>Every bill settled on POS will now auto-sync as a Sales Receipt in Zoho Books</li>
            </ol>
          </details>

        </div>
      )}
    </div>
  );
}

// ── Borzo Delivery config card ────────────────────────────────────────────────
function BorzoConfigCard() {
  const [cfg,      setCfg]      = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({ token: "", mode: "sandbox", enabled: false });
  const [msg,      setMsg]      = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api.get("/delivery/borzo/config")
      .then(d => { setCfg(d); setForm(f => ({ ...f, mode: d.mode || "sandbox", enabled: d.enabled || false })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setMsg("");
    try {
      await api.post("/delivery/borzo/config", form);
      const fresh = await api.get("/delivery/borzo/config");
      setCfg(fresh);
      setMsg("✓ Saved");
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setMsg("✗ " + (err.message || "Save failed"));
    } finally { setSaving(false); }
  }

  return (
    <div className="integration-card" style={{ marginBottom: 16 }}>
      <div className="integration-card-head" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 28 }}>🛵</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 15 }}>Borzo Delivery</strong>
            {cfg?.configured && <span className="status online" style={{ fontSize: 11 }}>Active</span>}
            {cfg && !cfg.configured && <span className="status offline" style={{ fontSize: 11 }}>Not configured</span>}
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>
            Dispatch riders instantly from accepted delivery orders. 23+ Indian cities.
          </p>
        </div>
        <button type="button" className="btn-outline" style={{ fontSize: 12, padding: "4px 10px" }}
          onClick={() => setExpanded(v => !v)}>
          {expanded ? "Hide" : "Configure"}
        </button>
      </div>

      {expanded && (
        <form onSubmit={handleSave} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Toggle on={form.enabled} onChange={v => setForm(f => ({ ...f, enabled: v }))} />
            <span style={{ fontSize: 13, color: form.enabled ? "#16a34a" : "#6b7280" }}>
              {form.enabled ? "Borzo dispatch enabled" : "Disabled"}
            </span>
          </div>

          <div className="form-row">
            <label className="form-label">
              API Token {cfg?.tokenSet && <span style={{ color: "#16a34a", fontSize: 11 }}>● set</span>}
            </label>
            <input className="form-input" type="password"
              placeholder={cfg?.tokenSet ? "Leave blank to keep existing token" : "Paste token from Borzo dashboard"}
              value={form.token}
              onChange={e => setForm(f => ({ ...f, token: e.target.value }))} />
          </div>

          <div className="form-row">
            <label className="form-label">Mode</label>
            <select className="form-input" value={form.mode}
              onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
              <option value="sandbox">Sandbox (testing)</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{msg}</span>}
          </div>

          <div style={{ background: "#f0f9ff", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
            <strong>How to set up Borzo:</strong><br />
            1. Register at{" "}
            <a href="https://apitest.borzodelivery.com" target="_blank" rel="noreferrer" style={{ color:"#1d4ed8" }}>apitest.borzodelivery.com</a>
            {" "}(sandbox) or{" "}
            <a href="https://business.borzodelivery.com" target="_blank" rel="noreferrer" style={{ color:"#1d4ed8" }}>business.borzodelivery.com</a>
            {" "}(production)<br />
            2. Go to <strong>Profile → API Token</strong> → copy token<br />
            3. Paste here and save<br />
            4. In POS → Online Orders → accepted order → click <strong>🛵 Dispatch Rider</strong>
          </div>
        </form>
      )}
    </div>
  );
}

// ── PhonePe Payments config card ─────────────────────────────────────────────
function PhonePeConfigCard() {
  const [cfg,       setCfg]      = useState(null);
  const [loading,   setLoading]  = useState(true);
  const [saving,    setSaving]   = useState(false);
  const [form,      setForm]     = useState({ merchantId: "", saltKey: "", saltIndex: "1", mode: "UAT", enabled: false });
  const [msg,       setMsg]      = useState("");
  const [expanded,  setExpanded] = useState(false);

  useEffect(() => {
    api.get("/payments/phonepe/config")
      .then(d => {
        setCfg(d);
        setForm(f => ({
          ...f,
          merchantId: d.merchantId || "",
          saltIndex:  d.saltIndex  || "1",
          mode:       d.mode       || "UAT",
          enabled:    d.enabled    || false,
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setMsg("");
    try {
      await api.post("/payments/phonepe/config", form);
      const fresh = await api.get("/payments/phonepe/config");
      setCfg(fresh);
      setMsg("✓ Saved");
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setMsg("✗ " + (err.message || "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  const isConfigured = cfg?.configured;

  return (
    <div className="integration-card" style={{ marginBottom: 16 }}>
      <div className="integration-card-head" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 28 }}>📱</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 15 }}>PhonePe Payment Gateway</strong>
            {isConfigured && <span className="status online" style={{ fontSize: 11 }}>Configured</span>}
            {cfg && !isConfigured && <span className="status offline" style={{ fontSize: 11 }}>Not configured</span>}
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>
            Show a PhonePe QR code on POS / Captain App. Table auto-clears on payment.
          </p>
        </div>
        <button
          type="button"
          className="btn-outline"
          style={{ fontSize: 12, padding: "4px 10px" }}
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? "Hide" : "Configure"}
        </button>
      </div>

      {expanded && (
        <form onSubmit={handleSave} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Toggle on={form.enabled} onChange={v => setForm(f => ({ ...f, enabled: v }))} />
            <span style={{ fontSize: 13, color: form.enabled ? "#16a34a" : "#6b7280" }}>
              {form.enabled ? "PhonePe QR payments enabled" : "Disabled"}
            </span>
          </div>

          <div className="form-row">
            <label className="form-label">Merchant ID</label>
            <input
              className="form-input"
              placeholder="e.g. MERCHANT123"
              value={form.merchantId}
              onChange={e => setForm(f => ({ ...f, merchantId: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <label className="form-label">Salt Key {cfg?.saltKeySet && <span style={{ color: "#16a34a", fontSize: 11 }}>● set</span>}</label>
            <input
              className="form-input"
              type="password"
              placeholder={cfg?.saltKeySet ? "Leave blank to keep existing key" : "Paste salt key from PhonePe dashboard"}
              value={form.saltKey}
              onChange={e => setForm(f => ({ ...f, saltKey: e.target.value }))}
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label className="form-label">Salt Index</label>
              <input
                className="form-input"
                placeholder="1"
                value={form.saltIndex}
                onChange={e => setForm(f => ({ ...f, saltIndex: e.target.value }))}
              />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label className="form-label">Mode</label>
              <select
                className="form-input"
                value={form.mode}
                onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}
              >
                <option value="UAT">UAT (Sandbox)</option>
                <option value="PRODUCTION">Production</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save Credentials"}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{msg}</span>}
          </div>

          <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
            <strong style={{ color: "#374151" }}>How to set up PhonePe PG:</strong><br />
            1. Log in to{" "}
            <a href="https://business.phonepe.com" target="_blank" rel="noreferrer" style={{ color:"#5f259f" }}>business.phonepe.com</a>
            {" "}→ Developers → API Keys<br />
            2. Copy your <strong>Merchant ID</strong> and <strong>Salt Key</strong><br />
            3. Use <strong>UAT</strong> for testing — sandbox at{" "}
            <a href="https://developer.phonepe.com/v1/reference/pay-api-1" target="_blank" rel="noreferrer" style={{ color:"#5f259f" }}>developer.phonepe.com</a><br />
            4. Enable and save — QR option will appear in POS payment sheet
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
// ── Online Orders (Swiggy & Zomato) webhook card ──────────────────────────────
function OnlineOrdersWebhookCard() {
  const [config,      setConfig]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [copied,      setCopied]      = useState("");
  const [expandGuide, setExpandGuide] = useState(false);

  useEffect(() => {
    api.get("/online-orders/config")
      .then(d => { setConfig(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function copyText(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    });
  }

  if (loading) return <div className="int-webhook-card"><p style={{padding:16,color:"#888"}}>Loading…</p></div>;

  const outlets    = config?.aggregator?.outlets || [];
  const readyCount  = outlets.filter(o => o.swiggySet && o.zomatoSet).length;
  const allReady    = outlets.length > 0 && readyCount === outlets.length;

  return (
    <div className="int-webhook-card">
      {/* Header */}
      <div className="int-webhook-head">
        <div className="int-webhook-logos">
          <span className="int-webhook-platform-badge swiggy">🟠 Swiggy</span>
          <span className="int-webhook-platform-badge zomato">🔴 Zomato</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span className={`status ${allReady ? "online" : "offline"}`}>
            {outlets.length === 0
              ? "No outlets"
              : allReady
                ? "All outlets ready"
                : `${readyCount}/${outlets.length} outlets ready`}
          </span>
        </div>
      </div>

      <h3 className="int-webhook-title">Online Orders — Swiggy &amp; Zomato</h3>
      <p className="int-webhook-desc">
        Orders placed on Swiggy and Zomato appear instantly on your POS screen.
        Set the Swiggy ID and Zomato ID for each outlet (Outlets page), then share
        the webhook URL below with your Swiggy/Zomato integration partner to go live.
      </p>

      {/* Webhook URL */}
      {config?.aggregator?.webhookUrl && (
        <div className="int-webhook-field-group">
          <label className="int-webhook-field-label">Your Webhook URL</label>
          <div className="int-webhook-field-row">
            <code className="int-webhook-url">{config.aggregator.webhookUrl}</code>
            <button
              className="int-copy-btn"
              onClick={() => copyText(config.aggregator.webhookUrl, "agg-url")}
            >
              {copied === "agg-url" ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <p className="int-webhook-hint">
            One URL covers all your outlets — orders are routed automatically using
            each outlet's Swiggy/Zomato ID.
          </p>
        </div>
      )}

      {/* Per-outlet readiness */}
      {outlets.length > 0 && (
        <div className="int-webhook-field-group">
          <label className="int-webhook-field-label">Outlet Readiness</label>
          {outlets.map(o => (
            <div key={o.outletId} className="int-webhook-field-row" style={{marginBottom:6}}>
              <span className="int-outlet-label">{o.outletName}</span>
              <span className={`status ${o.swiggySet ? "online" : "offline"}`} style={{marginLeft:"auto"}}>
                {o.swiggySet ? "✓ Swiggy ID set" : "Swiggy ID not set"}
              </span>
              <span className={`status ${o.zomatoSet ? "online" : "offline"}`}>
                {o.zomatoSet ? "✓ Zomato ID set" : "Zomato ID not set"}
              </span>
            </div>
          ))}
          <p className="int-webhook-hint">
            Set or update an outlet's Swiggy/Zomato IDs from the Outlets page.
          </p>
        </div>
      )}

      {/* Setup guide toggle */}
      <div className="int-webhook-divider" />
      <button className="int-guide-toggle" onClick={() => setExpandGuide(g => !g)}>
        {expandGuide ? "▲ Hide" : "▼ Show"} step-by-step setup guide
      </button>

      {expandGuide && (
        <ol className="int-setup-guide">
          <li>
            <strong>Get your Swiggy &amp; Zomato IDs</strong> — these are the restaurant
            IDs each platform uses to identify your outlet (shown in your Swiggy Partner
            and Zomato Partner dashboards).
          </li>
          <li>
            <strong>Set them on each outlet</strong> — go to Outlets → edit the outlet →
            paste the IDs into "Swiggy ID" and "Zomato ID".
          </li>
          <li>
            <strong>Share the webhook URL</strong> — give the Webhook URL above to your
            Swiggy/Zomato integration partner so they can route orders to it.
          </li>
          <li>
            <strong>Test it</strong> — ask your integration partner to send a test order.
            It should appear on the POS within a few seconds.
          </li>
          <li>
            <strong>Go live</strong> — once a test order is accepted on the POS,
            all real orders will flow automatically from that point.
          </li>
        </ol>
      )}
    </div>
  );
}

export function IntegrationsPage() {
  const [whatsappActive, setWhatsappActive] = useState(false);

  const totalCount = whatsappActive ? 1 : 0;

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
          <div><span>Available</span><strong>5</strong></div>
          <div><span>Connected</span><strong>{totalCount}</strong></div>
        </div>
      </section>


      {/* ── Accounts & Finance ───────────────────────────────────────────────── */}
      <section className="integrations-section">
        <div className="integrations-section-head">
          <div>
            <h3 className="integrations-category-title">Accounts &amp; Finance</h3>
            <p className="integrations-category-desc">
              Every settled bill automatically appears as a Sales Receipt in Zoho Books — zero manual entry.
            </p>
          </div>
        </div>
        <ZohoConfigCard />
      </section>

      {/* ── Delivery Partners ────────────────────────────────────────────────── */}
      <section className="integrations-section">
        <div className="integrations-section-head">
          <div>
            <h3 className="integrations-category-title">Delivery Partners</h3>
            <p className="integrations-category-desc">
              Dispatch riders directly from accepted orders. Customer gets their food, you never leave the POS.
            </p>
          </div>
        </div>
        <BorzoConfigCard />
      </section>

      {/* ── Payments ─────────────────────────────────────────────────────────── */}
      <section className="integrations-section">
        <div className="integrations-section-head">
          <div>
            <h3 className="integrations-category-title">Payment Gateway</h3>
            <p className="integrations-category-desc">
              Accept UPI QR payments via PhonePe. Customer scans, pays, and the table auto-clears instantly.
            </p>
          </div>
        </div>
        <PhonePeConfigCard />
      </section>

      {/* ── Online Orders (Swiggy / Zomato) ────────────────────────────────── */}
      <section className="integrations-section">
        <div className="integrations-section-head">
          <div>
            <h3 className="integrations-category-title">Online Ordering Platforms</h3>
            <p className="integrations-category-desc">
              Receive Swiggy and Zomato orders directly on your POS in real-time.
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
                  <ComingSoonCard key={item.id} integration={item} />
                )
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}
