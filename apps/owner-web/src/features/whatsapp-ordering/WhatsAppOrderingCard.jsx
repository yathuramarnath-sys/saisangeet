import { useState, useEffect } from "react";
import { api } from "../../lib/api";

export function WhatsAppOrderingCard({ onConnectionChange }) {
  const [config, setConfig] = useState(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    accountSid: "",
    apiKey: "",
    apiSecret: "",
    fromNumber: "",
    notifyNumber: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get("/whatsapp-ordering/config")
      .then((data) => {
        setConfig(data);
        onConnectionChange?.(data.connected && data.enabled);
        if (!data.connected) setOpen(true);
      })
      .catch(() => {});
  }, []);

  function flash(text) { setMsg(text); setTimeout(() => setMsg(""), 4000); }

  async function save() {
    if (!draft.accountSid || !draft.apiKey || !draft.apiSecret || !draft.fromNumber) {
      flash("Account SID, API Key, API Secret, and From number are required.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.post("/whatsapp-ordering/config", {
        accountSid:   draft.accountSid.trim(),
        apiKey:       draft.apiKey.trim(),
        apiSecret:    draft.apiSecret.trim(),
        fromNumber:   draft.fromNumber.trim(),
        notifyNumber: draft.notifyNumber.trim(),
        enabled:      true,
      });
      setConfig(updated);
      onConnectionChange?.(updated.connected && updated.enabled);
      setDraft({ accountSid: "", apiKey: "", apiSecret: "", fromNumber: "", notifyNumber: "" });
      flash("WhatsApp Ordering connected!");
    } catch (err) {
      flash(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      const updated = await api.post("/whatsapp-ordering/config", { enabled: false });
      setConfig(updated);
      onConnectionChange?.(false);
      flash("WhatsApp Ordering disabled.");
    } catch (err) {
      flash(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const connected = config?.connected && config?.enabled;

  return (
    <div className="integration-card">
      <div className="integration-card-header" onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer" }}>
        <div className="integration-card-logo" style={{ background: "#25D366", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40 }}>
          <span className="material-symbols-outlined" style={{ color: "#fff", fontSize: 22 }}>chat</span>
        </div>
        <div style={{ flex: 1 }}>
          <div className="integration-card-title">WhatsApp Ordering Bot</div>
          <div className="integration-card-subtitle">Let customers browse your menu and place pickup orders over WhatsApp</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {connected
            ? <span className="badge badge-active">Active</span>
            : <span className="badge badge-inactive">Not connected</span>}
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--text-secondary)" }}>
            {open ? "expand_less" : "expand_more"}
          </span>
        </div>
      </div>

      {open && (
        <div className="integration-card-body">
          {msg && <div className="integration-flash">{msg}</div>}

          {connected ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="integration-status-row">
                <span className="material-symbols-outlined" style={{ color: "#25D366" }}>check_circle</span>
                <span>Active — customers can order via WhatsApp on <strong>{config.fromNumber}</strong></span>
              </div>
              <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Twilio Webhook URL</div>
                <code style={{ fontSize: 13 }}>https://api.dinexpos.in/webhooks/wa-order</code>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
                <button className="btn btn-danger btn-sm" onClick={disconnect} disabled={saving}>
                  {saving ? "Saving…" : "Disconnect"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
                Enter your Twilio credentials. The bot will handle inbound WhatsApp messages and walk customers through your menu.
              </p>

              <div className="form-row">
                <label className="form-label">Twilio Account SID</label>
                <input
                  className="form-input"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={draft.accountSid}
                  onChange={(e) => setDraft((d) => ({ ...d, accountSid: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">API Key SID</label>
                <input
                  className="form-input"
                  placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={draft.apiKey}
                  onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">API Key Secret</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="API Secret"
                  value={draft.apiSecret}
                  onChange={(e) => setDraft((d) => ({ ...d, apiSecret: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">WhatsApp From Number</label>
                <input
                  className="form-input"
                  placeholder="+17372508034 or whatsapp:+17372508034"
                  value={draft.fromNumber}
                  onChange={(e) => setDraft((d) => ({ ...d, fromNumber: e.target.value }))}
                />
                <span className="form-hint">Twilio sandbox or approved WhatsApp Business number</span>
              </div>

              <div className="form-row">
                <label className="form-label">Notify Number (optional)</label>
                <input
                  className="form-input"
                  placeholder="+919XXXXXXXXX — receives new order alerts"
                  value={draft.notifyNumber}
                  onChange={(e) => setDraft((d) => ({ ...d, notifyNumber: e.target.value }))}
                />
                <span className="form-hint">Your WhatsApp number to receive order notifications</span>
              </div>

              <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Twilio Webhook URL — paste this in Twilio sandbox settings</div>
                <code style={{ fontSize: 13, wordBreak: "break-all" }}>https://api.dinexpos.in/webhooks/wa-order</code>
              </div>

              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Connect WhatsApp Ordering"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
