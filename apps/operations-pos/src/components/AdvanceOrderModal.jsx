import { useState } from "react";

const OUTLETS = ["Indiranagar", "Koramangala", "HSR Layout", "Whitefield"];

export function AdvanceOrderModal({ onClose, onSaved }) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  const [name,   setName]   = useState("");
  const [phone,  setPhone]  = useState("");
  const [guests, setGuests] = useState("2");
  const [date,   setDate]   = useState(defaultDate);
  const [time,   setTime]   = useState("13:00");
  const [outlet, setOutlet] = useState(OUTLETS[0]);
  const [note,   setNote]   = useState("");
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!name.trim())  e.name  = "Required";
    if (!phone.trim() || phone.length < 10) e.phone = "Enter valid phone";
    return e;
  }

  function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    const advance = {
      id:           `adv-${Date.now()}`,
      customerName: name.trim(),
      phone:        phone.trim(),
      guests:       Number(guests) || 1,
      date,
      time,
      outlet,
      note:         note.trim(),
      createdAt:    new Date().toISOString(),
      status:       "pending"
    };

    let existing = [];
    try { existing = JSON.parse(localStorage.getItem("pos_advance_orders") || "[]") || []; }
    catch {}
    localStorage.setItem("pos_advance_orders", JSON.stringify([...existing, advance]));

    onSaved?.(advance);
    onClose();
  }

  const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="adv-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adv-modal">

        {/* Header */}
        <div className="adv-head">
          <div>
            <h3>📅 Advance Order</h3>
            <p>Schedule a future order for a customer</p>
          </div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="adv-body">

          {/* Customer info */}
          <div className="adv-section-label">Customer Details</div>
          <div className="adv-row-2">
            <div className="adv-field">
              <label>Name <span className="adv-req">*</span></label>
              <input
                type="text"
                placeholder="Full name"
                value={name}
                className={errors.name ? "error" : ""}
                onChange={e => { setName(e.target.value); setErrors(v => ({ ...v, name: "" })); }}
              />
              {errors.name && <span className="adv-err">{errors.name}</span>}
            </div>
            <div className="adv-field">
              <label>Phone <span className="adv-req">*</span></label>
              <input
                type="tel"
                placeholder="10-digit number"
                value={phone}
                maxLength={10}
                className={errors.phone ? "error" : ""}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, "")); setErrors(v => ({ ...v, phone: "" })); }}
              />
              {errors.phone && <span className="adv-err">{errors.phone}</span>}
            </div>
          </div>

          {/* Booking details */}
          <div className="adv-section-label">Booking Details</div>
          <div className="adv-row-3">
            <div className="adv-field">
              <label>Date</label>
              <input type="date" value={date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => setDate(e.target.value)} />
              <span className="adv-hint">{fmtDate(date)}</span>
            </div>
            <div className="adv-field">
              <label>Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div className="adv-field">
              <label>Guests</label>
              <input type="number" min="1" max="100" value={guests}
                onChange={e => setGuests(e.target.value)} />
            </div>
          </div>

          <div className="adv-field">
            <label>Outlet</label>
            <select value={outlet} onChange={e => setOutlet(e.target.value)}>
              {OUTLETS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div className="adv-field">
            <label>Special Instructions</label>
            <textarea
              placeholder="Dietary requirements, occasion, seating preference, allergies…"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />
          </div>

          {/* Preview */}
          {name && phone && (
            <div className="adv-preview">
              <div className="adv-preview-icon">📅</div>
              <div>
                <strong>{name}</strong> · {phone}
                <p>{fmtDate(date)} at {time} · {guests} guests · {outlet}</p>
                {note && <p className="adv-preview-note">"{note}"</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="adv-footer">
          <button type="button" className="sm-btn-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="adv-save-btn"
            disabled={!name || !phone}
            onClick={handleSave}>
            📅 Book Advance Order
          </button>
        </div>

      </div>
    </div>
  );
}
