import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api";

const WEBHOOK_URL = "https://api.dinexpos.in/webhooks/wa-order";

function genVerifyToken() {
  const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return `plato_wa_${rand}`;
}

function CopyBtn({ text }) {
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

export function WhatsAppOrderingCard({ onConnectionChange }) {
  const [config,      setConfig]      = useState(null);
  const [outlets,     setOutlets]     = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [expanded,    setExpanded]    = useState(false);
  const [showGuide,   setShowGuide]   = useState(false);
  const [msg,         setMsg]         = useState({ text: "", ok: true });

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
      const catList = Array.isArray(menuData?.categories) ? menuData.categories : [];

      setOutlets(outletList.filter(o => o.isActive !== false));
      setCategories(catList.filter(c => c.id && c.name));

      if (cfg?.configured) {
        setForm(f => ({
          ...f,
          outletId:           cfg.outletId           || "",
          phoneNumberId:      cfg.phoneNumberId       || "",
          wabaId:             cfg.wabaId              || "",
          accessToken:        "",
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
        onConnectionChange?.(cfg.isActive || false);
      } else {
        setForm(f => ({ ...f, webhookVerifyToken: f.webhookVerifyToken || genVerifyToken() }));
        onConnectionChange?.(false);
        setExpanded(true); // auto-open for first-time setup
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
      flash("Settings saved!", true);
      load();
    } catch (err) {
      flash(`Save failed: ${err.message}`, false);
    } finally {
      setSaving(false);
    }
  }

  const configured = !!config?.configured;
  const active     = !!config?.isActive;

  return (
    <div className={`integration-card ${active ? "integration-connected" : ""}`}>

      {/* ── Card header ── */}
      <div
        className="integration-card-header"
        style={{ cursor: "pointer" }}
        onClick={() => setExpanded(v => !v)}
      >
        <span className="integration-emoji">💬</span>
        <div className="integration-info">
          <strong>WhatsApp Ordering</strong>
          <p>Customers order via WhatsApp — pickup, schedule, advance booking. Orders appear on POS instantly.</p>
        </div>
        <div className="integration-right">
          {loading ? (
            <span style={{ fontSize: 12, color: "#888" }}>Loading…</span>
          ) : active ? (
            <span className="status online">Active</span>
          ) : configured ? (
            <span className="status" style={{ background: "#f5a623", color: "#fff", borderRadius: 99, padding: "2px 10px", fontSize: 12 }}>Inactive</span>
          ) : (
            <span className="integration-setup-time">⏱ ~10 min</span>
          )}
          <span className="material-symbols-rounded" style={{ fontSize: 18, color: "var(--text-secondary,#666)" }}>
            {expanded ? "expand_less" : "expand_more"}
          </span>
        </div>
      </div>

      {/* ── Flash message ── */}
      {msg.text && (
        <div style={{
          margin: "8px 0 0", padding: "10px 14px", borderRadius: 8,
          background: msg.ok ? "#e6f4ea" : "#fdecea",
          color:      msg.ok ? "#1a7a3a" : "#c62828",
          fontSize: 14,
        }}>
          {msg.text}
        </div>
      )}

      {/* ── Expanded content ── */}
      {expanded && (
        <div style={{ paddingTop: 20 }}>

          {/* Setup guide */}
          <div style={{ marginBottom: 16, border: "1px solid var(--border-color,#e5e5e5)", borderRadius: 10 }}>
            <div
              style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onClick={() => setShowGuide(v => !v)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="material-symbols-rounded" style={{ fontSize: 18, color: "#25D366" }}>help_outline</span>
                <strong style={{ fontSize: 14 }}>How to set this up</strong>
              </div>
              <span className="material-symbols-rounded" style={{ fontSize: 16, color: "var(--text-secondary,#666)" }}>
                {showGuide ? "expand_less" : "expand_more"}
              </span>
            </div>
            {showGuide && (
              <div style={{ padding: "0 16px 16px", fontSize: 13, lineHeight: 1.75, color: "var(--text-secondary,#555)" }}>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Go to <strong>developers.facebook.com</strong> → Create App → <em>Business</em> type</li>
                  <li>Add the <strong>WhatsApp</strong> product, then add and verify your ordering phone number via OTP</li>
                  <li>Copy your <strong>Phone Number ID</strong>, <strong>WABA ID</strong>, and generate a <strong>Permanent Access Token</strong></li>
                  <li>Under <em>WhatsApp → Configuration → Webhook</em>, set the Callback URL and Verify Token from the fields below</li>
                  <li>Subscribe to the <strong>messages</strong> webhook field, then save this form</li>
                </ol>
              </div>
            )}
          </div>

          <form onSubmit={handleSave}>

            {/* Section 1 — Meta credentials */}
            <div className="integration-form" style={{ marginBottom: 16, paddingTop: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="material-symbols-rounded" style={{ fontSize: 16, color: "#25D366" }}>link</span>
                Meta / WhatsApp Connection
                {configured && (
                  <span style={{ marginLeft: "auto", fontSize: 12, color: config?.accessTokenSet ? "#1a7a3a" : "#c62828", fontWeight: 400 }}>
                    {config?.accessTokenSet ? "✓ Token saved" : "⚠ Token not saved"}
                  </span>
                )}
              </div>

              <label>
                Phone Number ID *
                <input
                  className="form-input"
                  placeholder="From Meta → WhatsApp → API Setup"
                  value={form.phoneNumberId}
                  onChange={e => set("phoneNumberId", e.target.value.trim())}
                />
              </label>

              <label>
                WhatsApp Business Account ID (WABA ID)
                <input
                  className="form-input"
                  placeholder="From Meta Business Manager"
                  value={form.wabaId}
                  onChange={e => set("wabaId", e.target.value.trim())}
                />
              </label>

              <label>
                Access Token {configured && config?.accessTokenSet ? "(leave blank to keep existing)" : "*"}
                <input
                  className="form-input"
                  type="password"
                  placeholder={configured && config?.accessTokenSet ? "••••••• (saved)" : "Paste permanent access token"}
                  value={form.accessToken}
                  onChange={e => set("accessToken", e.target.value.trim())}
                  autoComplete="off"
                />
              </label>

              <label>
                Display Phone Number
                <input
                  className="form-input"
                  placeholder="+91 98765 43210"
                  value={form.displayPhone}
                  onChange={e => set("displayPhone", e.target.value.trim())}
                />
              </label>

              <label>
                Webhook URL <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>(set this in Meta)</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input className="form-input" readOnly value={WEBHOOK_URL} style={{ flex: 1, background: "var(--bg-elevated,#f5f5f5)" }} />
                  <CopyBtn text={WEBHOOK_URL} />
                </div>
              </label>

              <label>
                Webhook Verify Token * <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>(set this in Meta)</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="form-input"
                    value={form.webhookVerifyToken}
                    onChange={e => set("webhookVerifyToken", e.target.value.trim())}
                    style={{ flex: 1 }}
                  />
                  <CopyBtn text={form.webhookVerifyToken} />
                </div>
                <span className="integration-field-hint">Copy this exact value into Meta's Verify Token field</span>
              </label>
            </div>

            {/* Section 2 — Outlet & Hours */}
            <div className="integration-form" style={{ marginBottom: 16, paddingTop: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="material-symbols-rounded" style={{ fontSize: 16 }}>storefront</span>
                Outlet &amp; Hours
              </div>

              <label>
                Restaurant Name <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>(shown in WhatsApp messages)</span>
                <input
                  className="form-input"
                  placeholder="Cafe Saisangeet"
                  value={form.restaurantName}
                  onChange={e => set("restaurantName", e.target.value)}
                />
              </label>

              {outlets.length > 0 && (
                <label>
                  Outlet *
                  <select className="form-input" value={form.outletId} onChange={e => set("outletId", e.target.value)}>
                    <option value="">— Select outlet —</option>
                    {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  Opening Time
                  <input type="time" className="form-input" value={form.openingTime} onChange={e => set("openingTime", e.target.value)} />
                </label>
                <label>
                  Closing Time
                  <input type="time" className="form-input" value={form.closingTime} onChange={e => set("closingTime", e.target.value)} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  Min Order (₹)
                  <input type="number" className="form-input" min="0" step="10" value={form.minOrderAmount} onChange={e => set("minOrderAmount", e.target.value)} />
                </label>
                <label>
                  Prep Time (minutes)
                  <input type="number" className="form-input" min="5" max="180" value={form.prepTimeMinutes} onChange={e => set("prepTimeMinutes", e.target.value)} />
                </label>
              </div>
            </div>

            {/* Section 3 — Ordering options */}
            <div className="integration-form" style={{ marginBottom: 16, paddingTop: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="material-symbols-rounded" style={{ fontSize: 16 }}>tune</span>
                Ordering Options
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>WhatsApp Ordering Active</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary,#888)", marginTop: 2 }}>Customers can place orders when this is on</div>
                </div>
                <button
                  type="button" role="switch" aria-checked={form.isActive}
                  onClick={() => set("isActive", !form.isActive)}
                  style={{
                    width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer", flexShrink: 0,
                    background: form.isActive ? "#1a7a3a" : "#ccc", position: "relative", transition: "background 0.2s",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 4, width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    left: form.isActive ? 22 : 4, transition: "left 0.2s",
                  }} />
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Allow Scheduled Pickup</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary,#888)", marginTop: 2 }}>Customers can choose a specific pickup time slot</div>
                </div>
                <button
                  type="button" role="switch" aria-checked={form.scheduledPickup}
                  onClick={() => set("scheduledPickup", !form.scheduledPickup)}
                  style={{
                    width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer", flexShrink: 0,
                    background: form.scheduledPickup ? "#1a7a3a" : "#ccc", position: "relative", transition: "background 0.2s",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 4, width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    left: form.scheduledPickup ? 22 : 4, transition: "left 0.2s",
                  }} />
                </button>
              </div>

              {categories.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Advance Booking Categories</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary,#888)", marginBottom: 10 }}>
                    Items in these categories require a date &amp; time selection (e.g. Custom Cakes need 2+ hours notice).
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {categories.map(cat => {
                      const selected = form.advanceCategoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id} type="button" onClick={() => toggleAdvCat(cat.id)}
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

            <div className="integration-form-actions" style={{ paddingBottom: 8 }}>
              <button type="submit" className="primary-btn" disabled={saving}>
                {saving ? "Saving…" : "Save Settings"}
              </button>
              {configured && (
                <span style={{ fontSize: 13, color: "var(--text-secondary,#888)" }}>
                  {config?.outletId ? "✓ Outlet linked" : "No outlet selected"}
                </span>
              )}
            </div>

          </form>

          {/* Phase 2 notice */}
          <div style={{
            margin: "8px 0 4px", padding: "12px 14px", borderRadius: 10,
            background: "var(--bg-elevated,#f8f8f8)", fontSize: 12,
            color: "var(--text-secondary,#888)", lineHeight: 1.6,
            borderLeft: "3px solid #FF5F15",
          }}>
            <strong>Coming in Phase 2:</strong> UPI payment via WhatsApp, delivery with zone-based charges,
            order-ready notifications, repeat order shortcut, and customer analytics.
          </div>

        </div>
      )}
    </div>
  );
}
