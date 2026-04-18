import { useState } from "react";

/* ── CustomerFormModal ────────────────────────────────────────────────────────
   Shown when:
     • GST billing is enabled (owner set in Taxes page)
     • Delivery mode — address is mandatory
   Props:
     order        — current order object
     serviceMode  — "dine-in" | "takeaway" | "delivery"
     onSave(data) — called with { name, phone, email, gstn, address }
     onClose      — dismiss without saving
   ──────────────────────────────────────────────────────────────────────────── */
export function CustomerFormModal({ order, serviceMode, onSave, onClose }) {
  const existing = order?.customer || {};
  const isDelivery = serviceMode === "delivery";

  const [name,    setName]    = useState(existing.name    || "");
  const [phone,   setPhone]   = useState(existing.phone   || "");
  const [email,   setEmail]   = useState(existing.email   || "");
  const [gstn,    setGstn]    = useState(existing.gstn    || "");
  const [address, setAddress] = useState(existing.address || "");
  const [errors,  setErrors]  = useState({});

  function validate() {
    const e = {};
    if (!name.trim())                       e.name    = "Customer name is required";
    if (!phone.trim())                      e.phone   = "Phone number is required";
    if (phone && !/^\d{10}$/.test(phone))   e.phone   = "Enter a valid 10-digit number";
    if (isDelivery && !address.trim())      e.address = "Delivery address is required";
    if (gstn && !/^[0-9A-Z]{15}$/.test(gstn.toUpperCase())) e.gstn = "Enter valid 15-char GSTIN";
    return e;
  }

  function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({
      name:    name.trim(),
      phone:   phone.trim(),
      email:   email.trim(),
      gstn:    gstn.trim().toUpperCase(),
      address: address.trim()
    });
  }

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cust-modal sm-modal">

        {/* Header */}
        <div className="sm-head">
          <div>
            <h3>
              {isDelivery ? "🛵 Delivery Details" : "🧾 Customer Details"}
            </h3>
            <p className="sm-sub">
              {isDelivery
                ? "Fill delivery address & contact"
                : "Required for GST invoice"}
            </p>
          </div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="sm-body cust-body">

          {/* Name + Phone */}
          <div className="cust-row-2">
            <div className="cust-field">
              <label>Customer Name <span className="req">*</span></label>
              <input
                type="text"
                className={`cust-input${errors.name ? " err" : ""}`}
                placeholder="Full name"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: "" })); }}
              />
              {errors.name && <span className="cust-err">{errors.name}</span>}
            </div>
            <div className="cust-field">
              <label>Phone <span className="req">*</span></label>
              <input
                type="tel"
                className={`cust-input${errors.phone ? " err" : ""}`}
                placeholder="10-digit mobile"
                value={phone}
                maxLength={10}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, "")); setErrors(p => ({ ...p, phone: "" })); }}
              />
              {errors.phone && <span className="cust-err">{errors.phone}</span>}
            </div>
          </div>

          {/* Email + GSTN */}
          <div className="cust-row-2">
            <div className="cust-field">
              <label>Email <span className="opt">(Optional)</span></label>
              <input
                type="email"
                className="cust-input"
                placeholder="customer@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="cust-field">
              <label>GSTIN <span className="opt">(For B2B)</span></label>
              <input
                type="text"
                className={`cust-input${errors.gstn ? " err" : ""}`}
                placeholder="22AAAAA0000A1Z5"
                value={gstn}
                maxLength={15}
                onChange={e => { setGstn(e.target.value.toUpperCase()); setErrors(p => ({ ...p, gstn: "" })); }}
              />
              {errors.gstn && <span className="cust-err">{errors.gstn}</span>}
            </div>
          </div>

          {/* Delivery address (full width when delivery mode) */}
          {isDelivery && (
            <div className="cust-field">
              <label>Delivery Address <span className="req">*</span></label>
              <textarea
                className={`cust-textarea${errors.address ? " err" : ""}`}
                placeholder="Flat no, building, street, area, city…"
                rows={3}
                value={address}
                onChange={e => { setAddress(e.target.value); setErrors(p => ({ ...p, address: "" })); }}
              />
              {errors.address && <span className="cust-err">{errors.address}</span>}
            </div>
          )}

          {/* Info note */}
          <div className="cust-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {isDelivery
              ? "Customer details will be printed on the delivery slip."
              : "GSTIN is required only when customer needs a B2B invoice."}
          </div>
        </div>

        {/* Footer */}
        <div className="sm-footer">
          <button type="button" className="sm-btn-cancel" onClick={onClose}>Skip</button>
          <button type="button" className="sm-btn-action close-ok" onClick={handleSave}>
            Save Customer Details
          </button>
        </div>
      </div>
    </div>
  );
}
