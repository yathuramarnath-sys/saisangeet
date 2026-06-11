import { useEffect, useState } from "react";
import {
  TAX_SETTINGS_KEY, RECEIPT_SETTINGS_KEY,
  defaultTaxProfiles, defaultReceiptSettings,
} from "./taxes.seed";
import { api } from "../../lib/api";

// ── Bill Number Settings Panel ────────────────────────────────────────────────
function BillNumberPanel() {
  const [config,    setConfig]    = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [resetting, setResetting] = useState(false);
  const [msg,       setMsg]       = useState("");
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    api.get("/counter/config").then(setConfig).catch(() => {});
  }, []);

  function flash(text) { setMsg(text); setTimeout(() => setMsg(""), 3500); }

  async function handleModeChange(mode) {
    setSaving(true);
    try {
      const updated = await api.patch("/counter/config", { billMode: mode });
      setConfig(updated);
      flash(`Bill numbering changed to ${mode === "fy" ? "Financial Year (Apr–Mar)" : "Daily Reset"}.`);
    } catch (err) {
      flash(`Error: ${err.message}`);
    } finally { setSaving(false); }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await api.post("/counter/reset-bill", { confirm: true });
      setConfig(res.config);
      setShowReset(false);
      flash("Bill counter reset to 0. Next bill will be #1.");
    } catch (err) {
      flash(`Error: ${err.message}`);
    } finally { setResetting(false); }
  }

  if (!config) return null;

  const isFY    = config.billMode === "fy";
  const isDaily = config.billMode === "daily";

  return (
    <section className="bn-panel">
      <div className="bn-header">
        <div>
          <p className="eyebrow">Billing Setup</p>
          <h3>Bill Number Sequencing</h3>
          <p className="bn-desc">Choose how bill numbers are assigned. KOT numbers always reset daily.</p>
        </div>
      </div>

      <div className="bn-options">
        <label className={`bn-option ${isFY ? "bn-option-active" : ""}`}>
          <input type="radio" name="billMode" value="fy" checked={isFY} disabled={saving}
            onChange={() => handleModeChange("fy")} />
          <div className="bn-option-body">
            <div className="bn-option-title">
              📅 Financial Year <span className="bn-badge bn-badge-default">Default</span>
            </div>
            <p className="bn-option-desc">
              Continuous from <strong>Apr 1 → Mar 31</strong>. Never resets during the year.
              Best for GST compliance and audits.
            </p>
            {isFY && (
              <div className="bn-stat-row">
                <span>Current FY: <strong>{config.fyBillFY || config.currentFY}</strong></span>
                <span>Last Bill No: <strong>#{config.fyBillLast}</strong></span>
              </div>
            )}
          </div>
        </label>

        <label className={`bn-option ${isDaily ? "bn-option-active" : ""}`}>
          <input type="radio" name="billMode" value="daily" checked={isDaily} disabled={saving}
            onChange={() => handleModeChange("daily")} />
          <div className="bn-option-body">
            <div className="bn-option-title">🔄 Daily Reset</div>
            <p className="bn-option-desc">
              Starts at <strong>1 every morning</strong>. Simple for small
              single-outlet restaurants that prefer daily numbering.
            </p>
            {isDaily && (
              <div className="bn-stat-row">
                <span>Today: <strong>{config.dailyBillDate}</strong></span>
                <span>Bills today: <strong>#{config.dailyBillLast}</strong></span>
              </div>
            )}
          </div>
        </label>
      </div>

      <div className="bn-kot-info">
        <span>🎫 KOT Numbers</span>
        <span>Daily reset · Today: <strong>{config.kotDate}</strong> · Last KOT: <strong>#{config.kotLast}</strong></span>
      </div>

      <div className="bn-reset-row">
        {!showReset ? (
          <button className="ghost-chip" onClick={() => setShowReset(true)}>Reset bill counter to #1</button>
        ) : (
          <div className="bn-reset-confirm">
            <span>⚠️ This cannot be undone. Reset bill counter to 0?</span>
            <button className="primary-btn" onClick={handleReset} disabled={resetting}>
              {resetting ? "Resetting…" : "Yes, Reset"}
            </button>
            <button className="ghost-chip" onClick={() => setShowReset(false)}>Cancel</button>
          </div>
        )}
      </div>

      {msg && <p className="bn-msg">{msg}</p>}
    </section>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
  catch { return fallback; }
}

function Toggle({ on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on}
      onClick={() => onChange(!on)}
      className={`inv-toggle${on ? " inv-toggle-on" : ""}`}>
      <span className="inv-toggle-knob" />
    </button>
  );
}

// ── Collapsible receipt builder section ───────────────────────────────────────
function RbSection({ title, icon, open, onToggle, children }) {
  return (
    <div className="rb-section">
      <button type="button" className="rb-section-head" onClick={onToggle}>
        <span className="rb-section-title">
          {icon && <span className="rb-section-icon">{icon}</span>}
          {title}
        </span>
        <svg className={`rb-chevron${open ? " open" : ""}`} width="16" height="16"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="rb-section-body">{children}</div>}
    </div>
  );
}

// Map backend field names (cgstRate/sgstRate…) → frontend names (cgst/sgst…)
function apiToProfile(tp) {
  return {
    id:        tp.id,
    name:      tp.name,
    cgst:      tp.cgstRate    ?? tp.cgst    ?? 0,
    sgst:      tp.sgstRate    ?? tp.sgst    ?? 0,
    igst:      tp.igstRate    ?? tp.igst    ?? 0,
    cess:      tp.cessRate    ?? tp.cess    ?? 0,
    inclusive: tp.isInclusive ?? tp.inclusive ?? false,
    isDefault: tp.isDefault   ?? false,
  };
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function TaxesReceiptsPage() {
  const [profiles,   setProfiles]   = useState(() => load(TAX_SETTINGS_KEY + "_profiles", defaultTaxProfiles));
  const [receipt,    setReceipt]    = useState(() => load(RECEIPT_SETTINGS_KEY, defaultReceiptSettings));
  const [msg,        setMsg]        = useState("");
  const [editProf,   setEditProf]   = useState(null);
  const [profDraft,  setProfDraft]  = useState(null);
  const [outletId,   setOutletId]   = useState(null);   // primary outlet (list[0])
  const [allOutletIds, setAllOutletIds] = useState([]); // ALL outlet IDs — so receipt settings apply to every outlet
  const [outletData, setOutletData] = useState(null);

  // Which sections are open
  const [open, setOpen] = useState({
    branding: true, itemsTotal: true, discount: true, business: true, additionalText: false,
  });

  // ── Load tax profiles from backend on mount ──────────────────────────────────
  useEffect(() => {
    api.get("/tax-profiles")
      .then(list => { if (list?.length) setProfiles(list.map(apiToProfile)); })
      .catch(() => {});
  }, []);

  // ── Load receipt settings from backend outlet on mount ──────────────────────
  useEffect(() => {
    api.get("/outlets")
      .then(list => {
        if (!list?.length) return;
        const o = list[0];
        setOutletId(o.id);
        setOutletData(o);
        // Store ALL outlet IDs so updateReceipt can apply settings to every outlet,
        // not just the first one. A multi-outlet restaurant must have the same GST
        // treatment on every POS — they all share one Owner Console receipt config.
        setAllOutletIds(list.map(outlet => outlet.id));
        const fromOutlet = {
          gstTreatment:       o.gstTreatment       || defaultReceiptSettings.gstTreatment,
          showDiscountOnBill: o.showDiscountOnBill ?? defaultReceiptSettings.showDiscountOnBill,
          showGstBreakdown:   o.showGstBreakdown   ?? defaultReceiptSettings.showGstBreakdown,
          showItemDesc:       o.showItemDesc       ?? defaultReceiptSettings.showItemDesc,
          showSavings:        o.showSavings        ?? defaultReceiptSettings.showSavings,
          showQR:             o.showQR             ?? defaultReceiptSettings.showQR,
          showPhone:          o.showPhone          ?? defaultReceiptSettings.showPhone,
          showAddress:        o.showAddress        ?? defaultReceiptSettings.showAddress,
          showGstin:          o.showGstin          ?? defaultReceiptSettings.showGstin,
          showFssai:          o.showFssai          ?? defaultReceiptSettings.showFssai,
          footerNote:         o.footerNote         || defaultReceiptSettings.footerNote,
          gstBillingEnabled:  o.gstBillingEnabled  ?? defaultReceiptSettings.gstBillingEnabled,
          gstBillDelivery:    o.gstBillDelivery    ?? defaultReceiptSettings.gstBillDelivery,
        };
        setReceipt(fromOutlet);
        localStorage.setItem(RECEIPT_SETTINGS_KEY, JSON.stringify(fromOutlet));
      })
      .catch(() => {});
  }, []);

  function flash(t) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  // Update receipt setting — saves to ALL outlets so every POS terminal picks it up.
  // gstTreatment especially must be consistent: a setting changed on Owner Console
  // that only reaches the first outlet would leave other outlets on the old value.
  async function updateReceipt(key, val) {
    const ids = allOutletIds.length ? allOutletIds : (outletId ? [outletId] : []);

    // Warn before applying GST treatment change to multiple outlets — billing impact is immediate
    if (key === "gstTreatment" && ids.length > 1) {
      const label = val === "inclusive"
        ? "Tax-Inclusive (GST extracted from item price)"
        : "Tax-Exclusive (GST added on top of item price)";
      const ok = window.confirm(
        `Change GST treatment to "${label}" across all ${ids.length} outlets?\n\n` +
        `⚠ This affects GST calculation on every POS terminal immediately.\n\n` +
        `Inform all cashiers before changing this during an active shift.`
      );
      if (!ok) return;
    }

    const next = { ...receipt, [key]: val };
    setReceipt(next);
    localStorage.setItem(RECEIPT_SETTINGS_KEY, JSON.stringify(next));
    if (!ids.length) return;
    try {
      await Promise.all(ids.map(id => api.patch(`/outlets/${id}/settings`, { [key]: val })));
    } catch {
      flash("⚠️ Could not save setting to server — please try again.");
    }
  }

  function toggleSection(key) {
    setOpen(s => ({ ...s, [key]: !s[key] }));
  }

  function startEditProfile(p) { setEditProf(p.id); setProfDraft({ ...p }); }
  async function saveProfile() {
    try {
      const updated = await api.patch(`/tax-profiles/${profDraft.id}`, {
        name:        profDraft.name,
        cgstRate:    profDraft.cgst,
        sgstRate:    profDraft.sgst,
        igstRate:    profDraft.igst,
        cessRate:    profDraft.cess,
        isInclusive: profDraft.inclusive,
      });
      setProfiles(ps => ps.map(p => p.id === profDraft.id ? apiToProfile(updated) : p));
      setEditProf(null);
      flash("Tax profile updated.");
    } catch {
      flash("⚠️ Could not save — please try again.");
    }
  }

  // ── Preview data (uses live outlet data) ────────────────────────────────────
  const pvName   = outletData?.name || "Your Restaurant";
  const pvPhone  = outletData?.phone || "9876543210";
  const pvAddr   = [outletData?.addressLine1, outletData?.city].filter(Boolean).join(", ") || "123 Main Street, City";
  const pvGstin  = outletData?.gstin || "29ABCDE1234F1Z5";
  const pvFooter = receipt.footerNote || "Thank you for dining with us!";

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Taxes &amp; Receipts</h2>
        </div>
      </header>

      {msg && <div className="mobile-banner">{msg}</div>}

      {/* ── Bill Number Sequencing ────────────────────────────────────────── */}
      <BillNumberPanel />

      {/* ── GST Treatment ────────────────────────────────────────────────── */}
      <section className="bn-panel" style={{ marginTop: 20 }}>
        <div className="bn-header">
          <div>
            <p className="eyebrow">Pricing Setup</p>
            <h3>GST Treatment</h3>
            <p className="bn-desc">Choose how item prices are defined in your menu — this affects totals on every bill.</p>
          </div>
        </div>
        <div className="bn-options">
          <label className={`bn-option ${receipt.gstTreatment === "exclusive" ? "bn-option-active" : ""}`}>
            <input type="radio" name="gstTreatment" value="exclusive"
              checked={receipt.gstTreatment === "exclusive"}
              onChange={() => { updateReceipt("gstTreatment", "exclusive"); flash("GST Treatment set to Exclusive — GST added on top of item price."); }} />
            <div className="bn-option-body">
              <div className="bn-option-title">
                ➕ GST Exclusive <span className="bn-badge bn-badge-default">Default</span>
              </div>
              <p className="bn-option-desc">
                Menu price is the <strong>base price</strong>. GST is calculated and added on top.<br />
                Example: Item ₹100 + 5% GST = <strong>Customer pays ₹105</strong>
              </p>
            </div>
          </label>
          <label className={`bn-option ${receipt.gstTreatment === "inclusive" ? "bn-option-active" : ""}`}>
            <input type="radio" name="gstTreatment" value="inclusive"
              checked={receipt.gstTreatment === "inclusive"}
              onChange={() => { updateReceipt("gstTreatment", "inclusive"); flash("GST Treatment set to Inclusive — GST extracted from item price."); }} />
            <div className="bn-option-body">
              <div className="bn-option-title">
                ✅ GST Inclusive
              </div>
              <p className="bn-option-desc">
                Menu price <strong>already includes GST</strong>. GST is extracted and shown separately for compliance.<br />
                Example: Item ₹100 (incl. 5% GST) = GST ₹4.76, <strong>Customer pays ₹100</strong>
              </p>
            </div>
          </label>
        </div>
        {msg && <p className="bn-msg">{msg}</p>}
      </section>

      {/* ── Tax Profiles ─────────────────────────────────────────────────── */}
      <section className="bn-panel" style={{ marginTop: 20 }}>
        <div className="bn-header">
          <div>
            <p className="eyebrow">GST Slabs</p>
            <h3>Tax Profiles</h3>
            <p className="bn-desc">Standard GST rates applied to menu items. Assign profiles to items in Menu setup.</p>
          </div>
        </div>
        <div className="tax-profiles-list">
          {profiles.map(p => (
            <div key={p.id} className="tax-profile-card">
              {editProf === p.id ? (
                <div className="tax-form-grid">
                  <label>Profile Name
                    <input value={profDraft.name}
                      onChange={e => setProfDraft(d => ({ ...d, name: e.target.value }))} />
                  </label>
                  <label>CGST %
                    <input type="number" min="0" max="50" step="0.5" value={profDraft.cgst}
                      onChange={e => setProfDraft(d => ({ ...d, cgst: parseFloat(e.target.value) || 0 }))} />
                  </label>
                  <label>SGST %
                    <input type="number" min="0" max="50" step="0.5" value={profDraft.sgst}
                      onChange={e => setProfDraft(d => ({ ...d, sgst: parseFloat(e.target.value) || 0 }))} />
                  </label>
                  <label>IGST %
                    <input type="number" min="0" max="50" step="0.5" value={profDraft.igst}
                      onChange={e => setProfDraft(d => ({ ...d, igst: parseFloat(e.target.value) || 0 }))} />
                  </label>
                  <label>Cess %
                    <input type="number" min="0" max="50" step="0.5" value={profDraft.cess}
                      onChange={e => setProfDraft(d => ({ ...d, cess: parseFloat(e.target.value) || 0 }))} />
                  </label>
                  <label className="tax-inline-toggle">
                    <span>Tax-inclusive pricing</span>
                    <Toggle on={profDraft.inclusive} onChange={v => setProfDraft(d => ({ ...d, inclusive: v }))} />
                  </label>
                  <div className="tax-form-actions">
                    <button className="primary-btn" onClick={saveProfile}>Save</button>
                    <button className="ghost-chip" onClick={() => setEditProf(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="tax-profile-top">
                    <strong>{p.name}</strong>
                    <button className="ghost-chip" onClick={() => startEditProfile(p)}>Edit</button>
                  </div>
                  <div className="tax-profile-rates">
                    <span>CGST {p.cgst}%</span>
                    <span>SGST {p.sgst}%</span>
                    <span>IGST {p.igst}%</span>
                    {p.cess > 0 && <span>Cess {p.cess}%</span>}
                    {p.inclusive && <span className="tax-badge">Inclusive</span>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Receipt Builder — Square-style two column ─────────────────────── */}
      <div className="rb-layout">

        {/* LEFT: sticky live receipt preview */}
        <div className="rb-preview-col">
          <p className="rb-preview-label">Live Preview</p>
          <div className="trp-shell">
            <div className="trp-paper">

              <div className="trp-logo-circle">{pvName[0] || "R"}</div>
              <div className="trp-brand">{pvName}</div>
              {receipt.showAddress && pvAddr  && <div className="trp-brand-sub">{pvAddr}</div>}
              {receipt.showPhone   && pvPhone && <div className="trp-brand-sub">Ph: {pvPhone}</div>}
              {receipt.showGstin   && pvGstin && <div className="trp-brand-sub">GSTIN: {pvGstin}</div>}

              <div className="trp-dash" />

              <div className="trp-meta-grid">
                <div><span>Bill No</span><strong>#0042</strong></div>
                <div><span>Date</span><strong>21 May 2026</strong></div>
                <div><span>Time</span><strong>1:32 PM</strong></div>
                <div><span>Table</span><strong>T-04</strong></div>
                <div><span>Type</span><strong>Dine In</strong></div>
                <div><span>Cashier</span><strong>Ravi</strong></div>
              </div>

              <div className="trp-dash" />

              <div className="trp-items-head">
                <span className="trp-col-item">Item</span>
                <span className="trp-col-qty">Qty</span>
                <span className="trp-col-rate">Rate</span>
                <span className="trp-col-amt">Amt</span>
              </div>
              <div className="trp-thin" />

              {[
                { name: "Paneer Tikka", qty: 2, rate: 240, amt: 480 },
                { name: "Veg Biryani",  qty: 1, rate: 240, amt: 240 },
                { name: "Butter Naan",  qty: 3, rate:  40, amt: 120 },
                { name: "Masala Chai",  qty: 2, rate:  30, amt:  60 },
              ].map(item => (
                <div key={item.name} className="trp-item-row">
                  <span className="trp-col-item">
                    {item.name}
                    {receipt.showItemDesc && <span className="trp-item-desc">Chef's special recipe</span>}
                  </span>
                  <span className="trp-col-qty">{item.qty}</span>
                  <span className="trp-col-rate">{item.rate}</span>
                  <span className="trp-col-amt">{item.amt}</span>
                </div>
              ))}

              <div className="trp-dash" />

              <div className="trp-total-block">
                <div className="trp-total-row"><span>Subtotal</span><span>₹900</span></div>
                {receipt.showDiscountOnBill && (
                  <div className="trp-total-row discount"><span>Discount (10%)</span><span>– ₹90</span></div>
                )}
                <div className="trp-total-row muted"><span>Taxable Amount</span><span>₹810</span></div>
                {receipt.showGstBreakdown ? (
                  <>
                    <div className="trp-total-row muted"><span>CGST @ 2.5%</span><span>₹20.25</span></div>
                    <div className="trp-total-row muted"><span>SGST @ 2.5%</span><span>₹20.25</span></div>
                  </>
                ) : (
                  <div className="trp-total-row muted"><span>GST @ 5%</span><span>₹40.50</span></div>
                )}
                {receipt.showSavings && (
                  <div className="trp-total-row saved"><span>★ You saved</span><span>₹90.00</span></div>
                )}
                <div className="trp-dash" />
                <div className="trp-grand-total"><span>TOTAL</span><span>₹850.50</span></div>
              </div>

              <div className="trp-dash" />

              <div className="trp-payment-row"><span>💳 UPI Payment</span><span>₹850.50</span></div>

              {receipt.showQR && (
                <div className="trp-qr-block">
                  <div className="trp-qr-box">
                    <div className="trp-qr-inner">
                      <div className="trp-qr-grid">
                        {Array.from({ length: 25 }).map((_, i) => (
                          <div key={i} className={`trp-qr-cell${[0,1,2,3,4,6,12,18,20,21,22,23,24,7,14].includes(i) ? " filled" : ""}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <span>Scan to pay or reorder</span>
                </div>
              )}

              <div className="trp-dash" />

              <div className="trp-footer-block">
                <span className="trp-footer-msg">{pvFooter}</span>
                <span className="trp-powered">Powered by Plato POS</span>
              </div>

            </div>
            <div className="trp-tear" />
          </div>
        </div>

        {/* RIGHT: collapsible settings sections */}
        <div className="rb-settings-col">

          {/* Branding */}
          <RbSection title="Branding" icon="🎨" open={open.branding} onToggle={() => toggleSection("branding")}>
            <div className="rb-field-row">
              <span className="rb-field-label">Display name on receipt</span>
              <span className="rb-field-value">{pvName}</span>
            </div>
            <p className="rb-hint">Set in Business Profile → Trade Name</p>
          </RbSection>

          {/* Items & Total */}
          <RbSection title="Items &amp; Total" icon="🧾" open={open.itemsTotal} onToggle={() => toggleSection("itemsTotal")}>
            <div className="tax-toggle-list">
              {[
                { key: "showGstBreakdown", label: "Show GST breakdown",    desc: "Print CGST and SGST as separate lines" },
                { key: "showItemDesc",     label: "Show item notes",       desc: "Print item-level notes on the receipt" },
                { key: "showSavings",      label: "Show savings row",      desc: "Print 'You saved ₹X' line when discount is applied" },
                { key: "showQR",           label: "Show QR payment block", desc: "Print QR code at the bottom of the receipt" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="tax-toggle-row">
                  <div><strong>{label}</strong><span>{desc}</span></div>
                  <Toggle on={receipt[key]}
                    onChange={v => { updateReceipt(key, v); flash(`${label} ${v ? "enabled" : "disabled"}.`); }} />
                </div>
              ))}
            </div>
          </RbSection>

          {/* Discount */}
          <RbSection title="Discount" icon="🏷️" open={open.discount} onToggle={() => toggleSection("discount")}>
            <div className="tax-toggle-list">
              <div className="tax-toggle-row" style={{ borderBottom: "none" }}>
                <div>
                  <strong>Show discount on printed bill</strong>
                  <span>Print the discount line on receipt when a discount is applied</span>
                </div>
                <Toggle on={receipt.showDiscountOnBill}
                  onChange={v => { updateReceipt("showDiscountOnBill", v); flash(`Discount on bill ${v ? "enabled" : "disabled"}.`); }} />
              </div>
            </div>
          </RbSection>

          {/* Business Details */}
          <RbSection title="Business Details" icon="🏢" open={open.business} onToggle={() => toggleSection("business")}>
            <div className="tax-toggle-list">
              {[
                { key: "showPhone",   label: "Show phone number", desc: "Print outlet phone number on receipt header" },
                { key: "showAddress", label: "Show address",       desc: "Print outlet address on receipt header" },
                { key: "showGstin",   label: "Show GSTIN",         desc: "Print GSTIN number on receipt header" },
                { key: "showFssai",   label: "Show FSSAI",         desc: "Print FSSAI licence number on receipt header" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="tax-toggle-row">
                  <div><strong>{label}</strong><span>{desc}</span></div>
                  <Toggle on={receipt[key]}
                    onChange={v => { updateReceipt(key, v); flash(`${label} ${v ? "shown" : "hidden"} on receipt.`); }} />
                </div>
              ))}
            </div>
            <p className="rb-hint" style={{ marginTop: 8 }}>Edit details in Business Profile</p>
          </RbSection>

          {/* Additional Text */}
          <RbSection title="Additional Text" icon="📝" open={open.additionalText} onToggle={() => toggleSection("additionalText")}>
            <label className="tax-footer-label">
              Receipt footer message
              <input className="tax-footer-input"
                value={receipt.footerNote}
                onChange={e => updateReceipt("footerNote", e.target.value)}
                onBlur={() => flash("Footer note saved.")}
                placeholder="Thank you for dining with us!" />
            </label>

            <div className="rb-divider" />

            <p className="tax-section-note">
              When enabled, cashier sees a <strong>"Request GST Bill"</strong> button at checkout.
            </p>
            <div className="tax-toggle-row" style={{ borderBottom: "none" }}>
              <div>
                <strong>Enable GST billing at POS</strong>
                <span>Cashier can collect customer details and issue GST invoice</span>
              </div>
              <Toggle on={receipt.gstBillingEnabled}
                onChange={v => { updateReceipt("gstBillingEnabled", v); flash(v ? "GST billing enabled." : "GST billing disabled."); }} />
            </div>

            {receipt.gstBillingEnabled && (
              <div className="tax-delivery-group">
                <p className="tax-sub-label">GST bill delivery</p>
                <div className="tax-delivery-options">
                  {[
                    { value: "print", label: "🖨️ Print only" },
                    { value: "email", label: "📧 Email only" },
                    { value: "both",  label: "🖨️ + 📧 Both" },
                  ].map(opt => (
                    <label key={opt.value}
                      className={`tax-delivery-chip${receipt.gstBillDelivery === opt.value ? " selected" : ""}`}>
                      <input type="radio" name="gstDelivery" value={opt.value}
                        checked={receipt.gstBillDelivery === opt.value}
                        onChange={() => { updateReceipt("gstBillDelivery", opt.value); flash("Delivery method saved."); }} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </RbSection>

        </div>
      </div>
    </>
  );
}
