import { useState } from "react";
import {
  TAX_SETTINGS_KEY, RECEIPT_SETTINGS_KEY,
  OUTLETS, defaultTaxProfiles, defaultBusinessGST,
  defaultReceiptSettings, defaultOutletProfiles
} from "./taxes.seed";

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
  catch { return fallback; }
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`inv-toggle${on ? " inv-toggle-on" : ""}`}
    >
      <span className="inv-toggle-knob" />
    </button>
  );
}

function Section({ title, eyebrow, children }) {
  return (
    <article className="panel tax-panel">
      <div className="panel-head">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h3>{title}</h3>
        </div>
      </div>
      {children}
    </article>
  );
}

export function TaxesReceiptsPage() {
  const [profiles,  setProfiles]  = useState(() => load(TAX_SETTINGS_KEY + "_profiles", defaultTaxProfiles));
  const [business,  setBusiness]  = useState(() => load(TAX_SETTINGS_KEY + "_biz",      defaultBusinessGST));
  const [receipt,   setReceipt]   = useState(() => load(RECEIPT_SETTINGS_KEY,            defaultReceiptSettings));
  const [outlets,   setOutlets]   = useState(() => load(TAX_SETTINGS_KEY + "_outlets",   defaultOutletProfiles));
  const [msg,       setMsg]       = useState("");
  const [editBiz,   setEditBiz]   = useState(false);
  const [bizDraft,  setBizDraft]  = useState(business);
  const [editProf,  setEditProf]  = useState(null); // profile id being edited
  const [profDraft, setProfDraft] = useState(null);

  function flash(t) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  function saveAll(b, p, r, o) {
    localStorage.setItem(TAX_SETTINGS_KEY + "_biz",      JSON.stringify(b));
    localStorage.setItem(TAX_SETTINGS_KEY + "_profiles", JSON.stringify(p));
    localStorage.setItem(RECEIPT_SETTINGS_KEY,            JSON.stringify(r));
    localStorage.setItem(TAX_SETTINGS_KEY + "_outlets",  JSON.stringify(o));
    // Write merged settings for POS to read
    localStorage.setItem(TAX_SETTINGS_KEY, JSON.stringify({
      gstBillingEnabled: r.gstBillingEnabled,
      gstBillDelivery:   r.gstBillDelivery,
      businessGST:       b,
      outletProfiles:    o,
      profiles:          p
    }));
  }

  function saveBiz() {
    setBusiness(bizDraft);
    saveAll(bizDraft, profiles, receipt, outlets);
    setEditBiz(false);
    flash("Business GST details saved.");
  }

  function startEditProfile(p) {
    setEditProf(p.id);
    setProfDraft({ ...p });
  }

  function saveProfile() {
    const next = profiles.map(p => p.id === profDraft.id ? profDraft : p);
    setProfiles(next);
    saveAll(business, next, receipt, outlets);
    setEditProf(null);
    flash("Tax profile updated.");
  }

  function updateReceipt(key, val) {
    const next = { ...receipt, [key]: val };
    setReceipt(next);
    saveAll(business, profiles, next, outlets);
  }

  function updateOutlet(outlet, profileId) {
    const next = { ...outlets, [outlet]: profileId };
    setOutlets(next);
    saveAll(business, profiles, receipt, next);
  }

  function profileName(id) {
    return profiles.find(p => p.id === id)?.name || id;
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Taxes &amp; Receipts</h2>
        </div>
      </header>

      {msg && <div className="mobile-banner">{msg}</div>}

      <div className="tax-page-grid">

        {/* LEFT COLUMN */}
        <div className="tax-left-col">

          {/* Business GST Details */}
          <Section title="Business GST Details" eyebrow="Your GSTIN">
            {editBiz ? (
              <div className="tax-form-grid">
                <label>GSTIN
                  <input value={bizDraft.gstin} onChange={e => setBizDraft(d => ({ ...d, gstin: e.target.value }))} placeholder="29ABCDE1234F1Z5" />
                </label>
                <label>Legal Name
                  <input value={bizDraft.legalName} onChange={e => setBizDraft(d => ({ ...d, legalName: e.target.value }))} />
                </label>
                <label>Trade / Brand Name
                  <input value={bizDraft.tradeName} onChange={e => setBizDraft(d => ({ ...d, tradeName: e.target.value }))} />
                </label>
                <label>Registered Address
                  <input value={bizDraft.address} onChange={e => setBizDraft(d => ({ ...d, address: e.target.value }))} />
                </label>
                <label>Billing Email (for GST bills)
                  <input type="email" value={bizDraft.email} onChange={e => setBizDraft(d => ({ ...d, email: e.target.value }))} />
                </label>
                <label>Phone
                  <input value={bizDraft.phone} onChange={e => setBizDraft(d => ({ ...d, phone: e.target.value }))} />
                </label>
                <div className="tax-form-actions">
                  <button className="primary-btn" onClick={saveBiz}>Save</button>
                  <button className="ghost-chip" onClick={() => { setBizDraft(business); setEditBiz(false); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="tax-biz-card">
                <div className="tax-biz-rows">
                  <div className="tax-biz-row"><span>GSTIN</span><strong>{business.gstin}</strong></div>
                  <div className="tax-biz-row"><span>Legal Name</span><strong>{business.legalName}</strong></div>
                  <div className="tax-biz-row"><span>Trade Name</span><strong>{business.tradeName}</strong></div>
                  <div className="tax-biz-row"><span>Address</span><strong>{business.address}</strong></div>
                  <div className="tax-biz-row"><span>Billing Email</span><strong>{business.email}</strong></div>
                  <div className="tax-biz-row"><span>Phone</span><strong>{business.phone}</strong></div>
                </div>
                <button className="ghost-chip" onClick={() => { setBizDraft(business); setEditBiz(true); }}>Edit</button>
              </div>
            )}
          </Section>

          {/* Tax Profiles */}
          <Section title="Tax Profiles" eyebrow="GST Slabs">
            <div className="tax-profiles-list">
              {profiles.map(p => (
                <div key={p.id} className="tax-profile-card">
                  {editProf === p.id ? (
                    <div className="tax-form-grid">
                      <label>Profile Name
                        <input value={profDraft.name} onChange={e => setProfDraft(d => ({ ...d, name: e.target.value }))} />
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
          </Section>

          {/* Outlet Defaults */}
          <Section title="Outlet Tax Defaults" eyebrow="Per Branch">
            <div className="tax-outlet-list">
              {OUTLETS.map(o => (
                <div key={o} className="tax-outlet-row">
                  <span>{o}</span>
                  <select value={outlets[o] || "gst-5"}
                    onChange={e => { updateOutlet(o, e.target.value); flash(`${o} updated.`); }}>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </Section>

        </div>

        {/* RIGHT COLUMN */}
        <div className="tax-right-col">

          {/* GST Billing on POS */}
          <Section title="GST Billing on POS" eyebrow="Customer GST Bill">
            <p className="tax-section-note">
              When enabled, cashier sees a <strong>"Request GST Bill"</strong> button at checkout.
              Customer fills in Name, Phone, Email and GST number — bill is printed or emailed.
            </p>
            <div className="tax-toggle-row">
              <div>
                <strong>Enable GST billing at POS</strong>
                <span>Cashier can collect customer details and issue GST invoice</span>
              </div>
              <Toggle on={receipt.gstBillingEnabled} onChange={v => { updateReceipt("gstBillingEnabled", v); flash(v ? "GST billing enabled on POS." : "GST billing disabled."); }} />
            </div>

            {receipt.gstBillingEnabled && (
              <>
                <div className="tax-delivery-group">
                  <p className="tax-sub-label">GST bill delivery method</p>
                  <div className="tax-delivery-options">
                    {[
                      { value: "print", label: "🖨️ Print only" },
                      { value: "email", label: "📧 Email only" },
                      { value: "both",  label: "🖨️ + 📧 Print & Email" }
                    ].map(opt => (
                      <label key={opt.value} className={`tax-delivery-chip${receipt.gstBillDelivery === opt.value ? " selected" : ""}`}>
                        <input type="radio" name="gstDelivery" value={opt.value}
                          checked={receipt.gstBillDelivery === opt.value}
                          onChange={() => { updateReceipt("gstBillDelivery", opt.value); flash("Delivery method saved."); }} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="tax-customer-fields-preview">
                  <p className="tax-sub-label">Customer form fields (shown on POS)</p>
                  <div className="tax-field-chips">
                    <span className="tax-field-chip required">Name *</span>
                    <span className="tax-field-chip required">Phone *</span>
                    <span className="tax-field-chip">Email</span>
                    <span className="tax-field-chip">GST Number</span>
                  </div>
                  <p className="tax-hint">* Required fields. Email required when delivery = Email or Both.</p>
                </div>
              </>
            )}
          </Section>

          {/* Receipt Settings */}
          <Section title="Receipt Settings" eyebrow="What to Print">
            <div className="tax-toggle-list">
              {[
                { key: "showGstBreakdown", label: "Show GST breakdown",       desc: "Print CGST and SGST separately under subtotal" },
                { key: "showItemDesc",     label: "Show item descriptions",    desc: "Display detail lines under each ordered item" },
                { key: "showSavings",      label: "Show total savings row",    desc: "Summary line when discounts are applied" },
                { key: "showQR",           label: "Show QR payment block",     desc: "Payment QR on dine-in and takeaway receipts" }
              ].map(({ key, label, desc }) => (
                <div key={key} className="tax-toggle-row">
                  <div>
                    <strong>{label}</strong>
                    <span>{desc}</span>
                  </div>
                  <Toggle on={receipt[key]} onChange={v => { updateReceipt(key, v); flash(`${label} ${v ? "enabled" : "disabled"}.`); }} />
                </div>
              ))}
            </div>

            <label className="tax-footer-label">
              Receipt footer message
              <input
                className="tax-footer-input"
                value={receipt.footerNote}
                onChange={e => updateReceipt("footerNote", e.target.value)}
                onBlur={() => flash("Footer note saved.")}
                placeholder="Thank you for dining with us!"
              />
            </label>
          </Section>

          {/* Receipt Preview */}
          <Section title="Receipt Preview" eyebrow="Sample Bill — Live Preview">
            <div className="trp-shell">
              <div className="trp-paper">

                {/* Restaurant Header */}
                <div className="trp-logo-circle">{business.tradeName?.[0] || "A"}</div>
                <div className="trp-brand">{business.tradeName}</div>
                <div className="trp-brand-sub">{business.address}</div>
                <div className="trp-brand-sub">Ph: {business.phone}</div>
                <div className="trp-brand-sub">GSTIN: {business.gstin}</div>

                <div className="trp-dash" />

                {/* Bill Meta */}
                <div className="trp-meta-grid">
                  <div><span>Bill No</span><strong>#0042</strong></div>
                  <div><span>Date</span><strong>17 Apr 2026</strong></div>
                  <div><span>Time</span><strong>1:32 PM</strong></div>
                  <div><span>Table</span><strong>T-04</strong></div>
                  <div><span>Type</span><strong>Dine In</strong></div>
                  <div><span>Cashier</span><strong>Ravi</strong></div>
                </div>

                <div className="trp-dash" />

                {/* Items header */}
                <div className="trp-items-head">
                  <span className="trp-col-item">Item</span>
                  <span className="trp-col-qty">Qty</span>
                  <span className="trp-col-rate">Rate</span>
                  <span className="trp-col-amt">Amt</span>
                </div>
                <div className="trp-thin" />

                {/* Items */}
                {[
                  { name: "Paneer Tikka",    qty: 2, rate: 240, amt: 480 },
                  { name: "Veg Biryani",     qty: 1, rate: 240, amt: 240 },
                  { name: "Butter Naan",     qty: 3, rate:  40, amt: 120 },
                  { name: "Masala Chai",     qty: 2, rate:  30, amt:  60 }
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

                {/* Totals */}
                <div className="trp-total-block">
                  <div className="trp-total-row"><span>Subtotal</span><span>₹900</span></div>
                  <div className="trp-total-row discount"><span>Discount (Member 10%)</span><span>– ₹90</span></div>
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
                  <div className="trp-grand-total">
                    <span>TOTAL</span>
                    <span>₹850.50</span>
                  </div>
                </div>

                <div className="trp-dash" />

                {/* Payment */}
                <div className="trp-payment-row">
                  <span>💳 UPI Payment</span>
                  <span>₹850.50</span>
                </div>
                <div className="trp-payment-row muted"><span>Txn: UPI2026041701234</span></div>

                {/* QR block */}
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

                {/* Footer */}
                <div className="trp-footer-block">
                  <span className="trp-footer-msg">{receipt.footerNote}</span>
                  <span className="trp-powered">Powered by RestaurantOS</span>
                </div>

              </div>

              {/* Paper tear edge */}
              <div className="trp-tear" />
            </div>
          </Section>

        </div>
      </div>
    </>
  );
}
