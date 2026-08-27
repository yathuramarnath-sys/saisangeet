import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api";

const WEBHOOK_URL = "https://api.dinexpos.in/webhooks/wa-order";

function genVerifyToken() {
  const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return `plato_wa_${rand}`;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button type="button" onClick={handleCopy} className="ghost-btn" style={{ padding: "4px 10px", fontSize: 12 }}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function StatusBadge({ active, configured }) {
  if (!configured) return <span className="status offline">Not configured</span>;
  if (!active) return <span className="status" style={{ background: "#f5a623", color: "#fff", borderRadius: 99, padding: "2px 10px", fontSize: 12 }}>Inactive</span>;
  return <span className="status online">Active</span>;
}

export function WhatsAppOrderingPage() {
  const [config,     setConfig]     = useState(null);
  const [outlets,    setOutlets]    = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState({ text: "", ok: true });
  const [showSetup,  setShowSetup]  = useState(false);

  const [form, setForm] = useState({
    outletId:           "",
    phoneNumberId:      "",
    wabaId:             "",
    accessToken:        "",
    webhookVerifyToken: "",
    displayPhone:       "",
    isActive:           false,
    restaurantName:     "",
    minOrderAmount:     200,
    prepTimeMinutes:    25,
    advanceCategoryIds: [],
    scheduledPickup:    true,
    openingTime:        "10:00",
    closingTime:        "21:30",
  });

  function flash(text, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg({ text: "", ok: true }), 5000);
  }

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/whatsapp-ordering/config").catch(() => ({ configured: false })),
      api.get("/outlets").catch(() => []),
      api.get("/menu").catch(() => ({})),
    ]).then(([cfg, outletData, menuData]) => {
      setConfig(cfg);

      const outletList = Array.isArray(outletData)
        ? outletData
        : (outletData?.outlets || outletData?.data || []);
      const catList = Array.isArray(menuData?.categories)
        ? menuData.categories
        : [];

      setOutlets(outletList.filter(o => o.isActive !== false));
      setCategories(catList.filter(c => c.id && c.name));

      if (cfg?.configured) {
        setForm(f => ({
          ...f,
          outletId:           cfg.outletId           || "",
          phoneNumberId:      cfg.phoneNumberId       || "",
          wabaId:             cfg.wabaId              || "",
          accessToken:        "",   // never prefill secret
          webhookVerifyToken: cfg.webhookVerifyToken  || "",
          displayPhone:       cfg.displayPhone        || "",
          isActive:           cfg.isActive            || false,
          restaurantName:     cfg.restaurantName      || "",
          minOrderAmount:     cfg.minOrderAmount      ?? 200,
          prepTimeMinutes:    cfg.prepTimeMinutes      ?? 25,
          advanceCategoryIds: cfg.advanceCategoryIds  || [],
          scheduledPickup:    cfg.scheduledPickup     !== false,
          openingTime:        cfg.openingTime         || "10:00",
          closingTime:        cfg.closingTime         || "21:30",
        }));
      } else {
        // Auto-generate verify token for new setup
        setForm(f => ({
          ...f,
          webhookVerifyToken: f.webhookVerifyToken || genVerifyToken(),
        }));
        setShowSetup(true); // open setup guide for new users
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function toggleAdvCat(catId) {
    setForm(f => ({
      ...f,
      advanceCategoryIds: f.advanceCategoryIds.includes(catId)
        ? f.advanceCategoryIds.filter(id => id !== catId)
        : [...f.advanceCategoryIds, catId],
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.phoneNumberId.trim()) return flash("Phone Number ID is required.", false);
    if (!form.webhookVerifyToken.trim()) return flash("Webhook Verify Token is required.", false);
    setSaving(true);
    try {
      await api.put("/whatsapp-ordering/config", {
        ...form,
        minOrderAmount:  Number(form.minOrderAmount)  || 0,
        prepTimeMinutes: Number(form.prepTimeMinutes) || 25,
      });
      flash("Settings saved successfully!", true);
      // Reload to get fresh config (accessTokenSet flag etc.)
      load();
    } catch (err) {
      flash(`Save failed: ${err.message}`, false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--text-secondary, #666)" }}>
        Loading WhatsApp Ordering settings…
      </div>
    );
  }

  const configured = !!config?.configured;
  const active     = !!config?.isActive;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 60px" }}>

      {/* ── Header ── */}
      <header className="topbar" style={{ marginBottom: 24 }}>
        <div>
          <p className="eyebrow">Online Channels</p>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            WhatsApp Ordering
            <StatusBadge active={active} configured={configured} />
          </h2>
        </div>
      </header>

      {/* ── Flash message ── */}
      {msg.text && (
        <div style={{
          padding: "10px 16px", borderRadius: 8, marginBottom: 20,
          background: msg.ok ? "#e6f4ea" : "#fdecea",
          color:      msg.ok ? "#1a7a3a" : "#c62828",
          fontSize: 14,
        }}>
          {msg.text}
        </div>
      )}

      {/* ── Setup guide (collapsible) ── */}
      <div className="integration-card" style={{ marginBottom: 20 }}>
        <div
          className="integration-card-header"
          style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          onClick={() => setShowSetup(v => !v)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 20, color: "#25D366" }}>help_outline</span>
            <strong>How to set this up</strong>
          </div>
          <span className="material-symbols-rounded" style={{ fontSize: 18, color: "var(--text-secondary, #666)" }}>
            {showSetup ? "expand_less" : "expand_more"}
          </span>
        </div>

        {showSetup && (
          <div style={{ padding: "16px 0 4px", fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary, #555)" }}>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li>Go to <strong>developers.facebook.com</strong> → Create App → <em>Business</em> type</li>
              <li>Add the <strong>WhatsApp</strong> product to the app</li>
              <li>Under <em>WhatsApp → API Setup</em>, add and verify your ordering phone number via OTP</li>
              <li>Copy your <strong>Phone Number ID</strong>, <strong>WhatsApp Business Account ID</strong>, and generate a <strong>Permanent Access Token</strong></li>
              <li>Under <em>WhatsApp → Configuration → Webhook</em>, set:<br />
                <div style={{ background: "var(--bg-elevated, #f5f5f5)", borderRadius: 6, padding: "8px 12px", margin: "6px 0", fontFamily: "monospace", fontSize: 13 }}>
                  Callback URL: {WEBHOOK_URL}<br />
                  Verify Token: <em>(copy from the field below)</em>
                </div>
              </li>
              <li>Subscribe to the <strong>messages</strong> webhook field</li>
              <li>Paste all credentials in the form below and save</li>
            </ol>
          </div>
        )}
      </div>

      {/* ── Main configuration form ── */}
      <form onSubmit={handleSave}>

        {/* Section 1 — Meta Credentials */}
        <div className="integration-card" style={{ marginBottom: 20 }}>
          <div className="integration-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="material-symbols-rounded" style={{ fontSize: 20, color: "#25D366" }}>link</span>
              <strong>Meta / WhatsApp Connection</strong>
            </div>
            {configured && (
              <span style={{ fontSize: 12, color: config?.accessTokenSet ? "#1a7a3a" : "#c62828" }}>
                {config?.accessTokenSet ? "✓ Access token saved" : "⚠ Token not saved"}
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 16 }}>

            <div className="form-row">
              <label className="form-label">Phone Number ID *</label>
              <input
                className="form-input"
                placeholder="From Meta → WhatsApp → API Setup"
                value={form.phoneNumberId}
                onChange={e => set("phoneNumberId", e.target.value.trim())}
              />
            </div>

            <div className="form-row">
              <label className="form-label">WhatsApp Business Account ID (WABA ID)</label>
              <input
                className="form-input"
                placeholder="From Meta Business Manager"
                value={form.wabaId}
                onChange={e => set("wabaId", e.target.value.trim())}
              />
            </div>

            <div className="form-row">
              <label className="form-label">
                Access Token {configured && config?.accessTokenSet ? "(leave blank to keep existing)" : "*"}
              </label>
              <input
                className="form-input"
                type="password"
                placeholder={configured && config?.accessTokenSet ? "••••••• (saved)" : "Paste your permanent access token"}
                value={form.accessToken}
                onChange={e => set("accessToken", e.target.value.trim())}
                autoComplete="off"
              />
            </div>

            <div className="form-row">
              <label className="form-label">Display Phone Number</label>
              <input
                className="form-input"
                placeholder="+91 78457 69099"
                value={form.displayPhone}
                onChange={e => set("displayPhone", e.target.value.trim())}
              />
            </div>

            <div className="form-row">
              <label className="form-label">Webhook URL (set this in Meta)</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input className="form-input" readOnly value={WEBHOOK_URL} style={{ flex: 1, background: "var(--bg-elevated,#f5f5f5)", cursor: "text" }} />
                <CopyButton text={WEBHOOK_URL} />
              </div>
            </div>

            <div className="form-row">
              <label className="form-label">Webhook Verify Token (set this in Meta) *</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="form-input"
                  value={form.webhookVerifyToken}
                  onChange={e => set("webhookVerifyToken", e.target.value.trim())}
                  style={{ flex: 1 }}
                />
                <CopyButton text={form.webhookVerifyToken} />
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary,#888)" }}>
                Copy this exact value into the Verify Token field in Meta's webhook settings.
              </p>
            </div>

          </div>
        </div>

        {/* Section 2 — Outlet & Hours */}
        <div className="integration-card" style={{ marginBottom: 20 }}>
          <div className="integration-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>storefront</span>
              <strong>Outlet & Hours</strong>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 16 }}>

            <div className="form-row">
              <label className="form-label">Restaurant Name (shown in WhatsApp messages)</label>
              <input
                className="form-input"
                placeholder="Cafe Saisangeet"
                value={form.restaurantName}
                onChange={e => set("restaurantName", e.target.value)}
              />
            </div>

            {outlets.length > 0 && (
              <div className="form-row">
                <label className="form-label">Outlet *</label>
                <select className="form-input" value={form.outletId} onChange={e => set("outletId", e.target.value)}>
                  <option value="">— Select outlet —</option>
                  {outlets.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-row">
                <label className="form-label">Opening Time</label>
                <input type="time" className="form-input" value={form.openingTime} onChange={e => set("openingTime", e.target.value)} />
              </div>
              <div className="form-row">
                <label className="form-label">Closing Time</label>
                <input type="time" className="form-input" value={form.closingTime} onChange={e => set("closingTime", e.target.value)} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-row">
                <label className="form-label">Min Order (₹)</label>
                <input
                  type="number" className="form-input" min="0" step="10"
                  value={form.minOrderAmount}
                  onChange={e => set("minOrderAmount", e.target.value)}
                />
              </div>
              <div className="form-row">
                <label className="form-label">Prep Time (minutes)</label>
                <input
                  type="number" className="form-input" min="5" max="180"
                  value={form.prepTimeMinutes}
                  onChange={e => set("prepTimeMinutes", e.target.value)}
                />
              </div>
            </div>

          </div>
        </div>

        {/* Section 3 — Ordering Options */}
        <div className="integration-card" style={{ marginBottom: 20 }}>
          <div className="integration-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>tune</span>
              <strong>Ordering Options</strong>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 16 }}>

            {/* Active toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>WhatsApp Ordering Active</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary,#888)", marginTop: 2 }}>
                  Customers can place orders via WhatsApp when this is on
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                onClick={() => set("isActive", !form.isActive)}
                style={{
                  width: 44, height: 26, borderRadius: 13, border: "none",
                  cursor: "pointer", flexShrink: 0,
                  background: form.isActive ? "#1a7a3a" : "#ccc",
                  position: "relative", transition: "background 0.2s",
                }}
              >
                <span style={{
                  position: "absolute", top: 4, width: 18, height: 18,
                  borderRadius: "50%", background: "#fff",
                  left: form.isActive ? 22 : 4, transition: "left 0.2s",
                }} />
              </button>
            </div>

            {/* Scheduled pickup toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Allow Scheduled Pickup</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary,#888)", marginTop: 2 }}>
                  Customers can choose a specific pickup time slot
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.scheduledPickup}
                onClick={() => set("scheduledPickup", !form.scheduledPickup)}
                style={{
                  width: 44, height: 26, borderRadius: 13, border: "none",
                  cursor: "pointer", flexShrink: 0,
                  background: form.scheduledPickup ? "#1a7a3a" : "#ccc",
                  position: "relative", transition: "background 0.2s",
                }}
              >
                <span style={{
                  position: "absolute", top: 4, width: 18, height: 18,
                  borderRadius: "50%", background: "#fff",
                  left: form.scheduledPickup ? 22 : 4, transition: "left 0.2s",
                }} />
              </button>
            </div>

            {/* Advance booking categories */}
            {categories.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  Advance Booking Categories
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary,#888)", marginBottom: 10 }}>
                  Items in these categories require a date &amp; time selection (e.g. Custom Cakes need 2+ hours notice).
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {categories.map(cat => {
                    const selected = form.advanceCategoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleAdvCat(cat.id)}
                        style={{
                          padding: "5px 14px", borderRadius: 99, fontSize: 13,
                          border: `1.5px solid ${selected ? "#FF5F15" : "var(--border-color,#ddd)"}`,
                          background: selected ? "#fff3ee" : "transparent",
                          color: selected ? "#FF5F15" : "var(--text-secondary,#666)",
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                      >
                        {selected && "✓ "}{cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Save button */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </button>
          {configured && (
            <span style={{ fontSize: 13, color: "var(--text-secondary,#888)" }}>
              Last saved: {config?.outletId ? "✓ Outlet linked" : "No outlet selected"}
            </span>
          )}
        </div>

      </form>

      {/* ── Phase 2 notice ── */}
      <div style={{
        marginTop: 32, padding: "14px 18px", borderRadius: 10,
        background: "var(--bg-elevated,#f8f8f8)", fontSize: 13,
        color: "var(--text-secondary,#777)", lineHeight: 1.6,
        borderLeft: "3px solid #FF5F15",
      }}>
        <strong>Coming in Phase 2:</strong> UPI payment via WhatsApp, delivery with zone-based charges,
        order-ready notifications, repeat order shortcut, and customer analytics.
      </div>

    </div>
  );
}
