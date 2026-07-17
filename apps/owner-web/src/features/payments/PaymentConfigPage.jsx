import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const DEFAULT_CONFIG = {
  cash:   { enabled: true,  label: "Cash" },
  upi:    { enabled: true,  label: "UPI", mode: "static", staticUpiId: "", staticQrUrl: "", paytmMerchantId: "", paytmMerchantKey: "", paytmMode: "STAGING" },
  card:   { enabled: false, label: "Card", hasEdc: false, edcLabel: "Card Machine" },
  credit: { enabled: false, label: "Credit" },
};

function deepMerge(defaults, saved) {
  if (!saved) return { ...defaults };
  return {
    cash:   { ...defaults.cash,   ...saved.cash },
    upi:    { ...defaults.upi,    ...saved.upi },
    card:   { ...defaults.card,   ...saved.card },
    credit: { ...defaults.credit, ...saved.credit },
  };
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`pc-toggle ${checked ? "on" : "off"}`}
      onClick={() => onChange(!checked)}
    />
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="pc-field">
      <label className="pc-field-label">{label}</label>
      {children}
      {hint && <span className="pc-field-hint">{hint}</span>}
    </div>
  );
}

export function PaymentConfigPage() {
  const [outlets, setOutlets]       = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [config, setConfig]         = useState(DEFAULT_CONFIG);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    api.get("/outlets").then(list => {
      setOutlets(list || []);
      if (list?.length > 0) setSelectedId(list[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const outlet = outlets.find(o => o.id === selectedId);
    setConfig(deepMerge(DEFAULT_CONFIG, outlet?.paymentConfig));
    setSaved(false);
    setError(null);
  }, [selectedId, outlets]);

  function setMethod(method, patch) {
    setConfig(c => ({ ...c, [method]: { ...c[method], ...patch } }));
    setSaved(false);
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const cleaned = {
        cash:   { enabled: config.cash.enabled,  label: config.cash.label || "Cash" },
        upi: {
          enabled:         config.upi.enabled,
          label:           config.upi.label || "UPI",
          mode:            config.upi.mode,
          staticUpiId:     config.upi.mode === "static"        ? config.upi.staticUpiId    : "",
          staticQrUrl:     config.upi.mode === "static"        ? config.upi.staticQrUrl    : "",
          paytmMerchantId: config.upi.mode === "paytm_dynamic" ? config.upi.paytmMerchantId : "",
          paytmMerchantKey:config.upi.mode === "paytm_dynamic" ? config.upi.paytmMerchantKey: "",
          paytmMode:       config.upi.mode === "paytm_dynamic" ? config.upi.paytmMode       : "STAGING",
        },
        card: {
          enabled:  config.card.enabled,
          label:    config.card.label || "Card",
          hasEdc:   config.card.hasEdc,
          edcLabel: config.card.hasEdc ? (config.card.edcLabel || "Card Machine") : "",
        },
        credit: { enabled: config.credit.enabled, label: config.credit.label || "Credit" },
      };

      await api.patch(`/outlets/${selectedId}/payment-config`, { paymentConfig: cleaned });

      setOutlets(prev => prev.map(o =>
        o.id === selectedId ? { ...o, paymentConfig: cleaned } : o
      ));
      setSaved(true);
    } catch (e) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const outlet = outlets.find(o => o.id === selectedId);

  return (
    <div className="page-shell pc-page">
      <div className="pc-header">
        <div>
          <p className="pc-eyebrow">Per-Outlet Settings</p>
          <h1 className="pc-title">Payment Methods</h1>
          <p className="pc-subtitle">Choose which payment types each outlet accepts, and configure UPI / card machine details.</p>
        </div>
      </div>

      {outlets.length > 1 && (
        <div className="pc-outlet-row">
          {outlets.map(o => (
            <button
              key={o.id}
              type="button"
              className={`pc-outlet-chip ${o.id === selectedId ? "active" : ""}`}
              onClick={() => setSelectedId(o.id)}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="pc-loading">Loading outlets…</div>
      ) : !outlet ? (
        <div className="pc-empty">No outlets found. Add an outlet first.</div>
      ) : (
        <>
          <div className="pc-outlet-label">
            Configuring: <strong>{outlet.name}</strong>
          </div>

          <div className="pc-grid">
            {/* ── CASH ─────────────────────────────────────────────────────── */}
            <div className={`pc-card ${config.cash.enabled ? "enabled" : "disabled"}`}>
              <div className="pc-card-head">
                <div className="pc-card-icon">💵</div>
                <div className="pc-card-info">
                  <strong>Cash</strong>
                  <span>Physical cash payments</span>
                </div>
                <Toggle checked={config.cash.enabled} onChange={v => setMethod("cash", { enabled: v })} />
              </div>
              {config.cash.enabled && (
                <div className="pc-card-body">
                  <Field label="Button label on POS">
                    <input
                      className="pc-input"
                      value={config.cash.label}
                      onChange={e => setMethod("cash", { label: e.target.value })}
                      placeholder="Cash"
                    />
                  </Field>
                </div>
              )}
            </div>

            {/* ── UPI / QR ─────────────────────────────────────────────────── */}
            <div className={`pc-card ${config.upi.enabled ? "enabled" : "disabled"}`}>
              <div className="pc-card-head">
                <div className="pc-card-icon">📲</div>
                <div className="pc-card-info">
                  <strong>UPI / QR Code</strong>
                  <span>Paytm, GPay, PhonePe, any UPI</span>
                </div>
                <Toggle checked={config.upi.enabled} onChange={v => setMethod("upi", { enabled: v })} />
              </div>
              {config.upi.enabled && (
                <div className="pc-card-body">
                  <Field label="Button label on POS">
                    <input
                      className="pc-input"
                      value={config.upi.label}
                      onChange={e => setMethod("upi", { label: e.target.value })}
                      placeholder="UPI"
                    />
                  </Field>

                  <Field label="QR mode">
                    <div className="pc-radio-group">
                      <label className="pc-radio">
                        <input type="radio" name="upiMode" value="static"
                          checked={config.upi.mode === "static"}
                          onChange={() => setMethod("upi", { mode: "static" })} />
                        <span>
                          <strong>Static QR / printed</strong>
                          <small>Customer scans your printed Paytm/UPI QR. Cashier confirms manually.</small>
                        </span>
                      </label>
                      <label className="pc-radio">
                        <input type="radio" name="upiMode" value="paytm_dynamic"
                          checked={config.upi.mode === "paytm_dynamic"}
                          onChange={() => setMethod("upi", { mode: "paytm_dynamic" })} />
                        <span>
                          <strong>Paytm Dynamic QR</strong>
                          <small>Amount-specific QR per bill. Auto-confirms via Paytm webhook.</small>
                        </span>
                      </label>
                    </div>
                  </Field>

                  {config.upi.mode === "static" && (
                    <>
                      <Field label="UPI ID (optional)" hint="e.g. merchant@paytm — shown on receipt">
                        <input
                          className="pc-input"
                          value={config.upi.staticUpiId}
                          onChange={e => setMethod("upi", { staticUpiId: e.target.value })}
                          placeholder="yourshop@paytm"
                        />
                      </Field>
                      <Field label="QR image URL (optional)" hint="Paste a hosted URL of your printed QR image">
                        <input
                          className="pc-input"
                          value={config.upi.staticQrUrl}
                          onChange={e => setMethod("upi", { staticQrUrl: e.target.value })}
                          placeholder="https://..."
                        />
                      </Field>
                      {config.upi.staticQrUrl && (
                        <div className="pc-qr-preview">
                          <img src={config.upi.staticQrUrl} alt="QR preview" />
                          <span>QR preview</span>
                        </div>
                      )}
                    </>
                  )}

                  {config.upi.mode === "paytm_dynamic" && (
                    <div className="pc-credentials">
                      <div className="pc-credentials-note">
                        Get your credentials from the <strong>Paytm for Business</strong> dashboard
                        under Developer Settings → API Keys.
                      </div>
                      <Field label="Merchant ID (MID)">
                        <input
                          className="pc-input"
                          value={config.upi.paytmMerchantId}
                          onChange={e => setMethod("upi", { paytmMerchantId: e.target.value })}
                          placeholder="PAYTM_MID_XXXXXXXX"
                        />
                      </Field>
                      <Field label="Merchant Key">
                        <input
                          className="pc-input pc-input-secret"
                          type="password"
                          value={config.upi.paytmMerchantKey}
                          onChange={e => setMethod("upi", { paytmMerchantKey: e.target.value })}
                          placeholder="32-character merchant key"
                        />
                      </Field>
                      <Field label="Environment">
                        <div className="pc-radio-group horizontal">
                          <label className="pc-radio">
                            <input type="radio" name="paytmMode" value="STAGING"
                              checked={config.upi.paytmMode === "STAGING"}
                              onChange={() => setMethod("upi", { paytmMode: "STAGING" })} />
                            <span><strong>Sandbox</strong><small>Testing</small></span>
                          </label>
                          <label className="pc-radio">
                            <input type="radio" name="paytmMode" value="PRODUCTION"
                              checked={config.upi.paytmMode === "PRODUCTION"}
                              onChange={() => setMethod("upi", { paytmMode: "PRODUCTION" })} />
                            <span><strong>Production</strong><small>Live payments</small></span>
                          </label>
                        </div>
                      </Field>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── CARD ─────────────────────────────────────────────────────── */}
            <div className={`pc-card ${config.card.enabled ? "enabled" : "disabled"}`}>
              <div className="pc-card-head">
                <div className="pc-card-icon">💳</div>
                <div className="pc-card-info">
                  <strong>Card / EDC Machine</strong>
                  <span>Debit, credit card via swipe terminal</span>
                </div>
                <Toggle checked={config.card.enabled} onChange={v => setMethod("card", { enabled: v })} />
              </div>
              {config.card.enabled && (
                <div className="pc-card-body">
                  <Field label="Button label on POS">
                    <input
                      className="pc-input"
                      value={config.card.label}
                      onChange={e => setMethod("card", { label: e.target.value })}
                      placeholder="Card"
                    />
                  </Field>
                  <div className="pc-check-row">
                    <label className="pc-check">
                      <input type="checkbox"
                        checked={!!config.card.hasEdc}
                        onChange={e => setMethod("card", { hasEdc: e.target.checked })} />
                      <span>We have a physical card machine (EDC)</span>
                    </label>
                  </div>
                  {config.card.hasEdc && (
                    <Field label="Machine label" hint="e.g. Paytm EDC, Pine Labs, MSwipe">
                      <input
                        className="pc-input"
                        value={config.card.edcLabel}
                        onChange={e => setMethod("card", { edcLabel: e.target.value })}
                        placeholder="Paytm EDC"
                      />
                    </Field>
                  )}
                </div>
              )}
            </div>

            {/* ── CREDIT ───────────────────────────────────────────────────── */}
            <div className={`pc-card ${config.credit.enabled ? "enabled" : "disabled"}`}>
              <div className="pc-card-head">
                <div className="pc-card-icon">📋</div>
                <div className="pc-card-info">
                  <strong>Credit / Due</strong>
                  <span>Bill recorded, payment collected later</span>
                </div>
                <Toggle checked={config.credit.enabled} onChange={v => setMethod("credit", { enabled: v })} />
              </div>
              {config.credit.enabled && (
                <div className="pc-card-body">
                  <Field label="Button label on POS">
                    <input
                      className="pc-input"
                      value={config.credit.label}
                      onChange={e => setMethod("credit", { label: e.target.value })}
                      placeholder="Credit"
                    />
                  </Field>
                </div>
              )}
            </div>
          </div>

          <div className="pc-save-row">
            {error && <span className="pc-error">{error}</span>}
            {saved && <span className="pc-success">Saved successfully</span>}
            <button
              type="button"
              className="btn-primary pc-save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Payment Config"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
