import { useState } from "react";
import { tapImpact } from "../lib/haptics";

export function CustomerInfoSheet({ tableNumber, guestInfo = {}, onSave, onClose }) {
  const [name,  setName]  = useState(guestInfo.name  || "");
  const [phone, setPhone] = useState(guestInfo.phone || "");
  const [pax,   setPax]   = useState(guestInfo.pax   || "");
  const [note,  setNote]  = useState(guestInfo.note  || "");

  function handleSave() {
    const info = {
      name:  name.trim(),
      phone: phone.trim(),
      pax:   Number(pax) || 0,
      note:  note.trim(),
    };
    onSave(info);
    tapImpact();
    onClose();
  }

  return (
    <>
      <div className="cis2-backdrop" onClick={onClose} />
      <div className="cis2-sheet">
        <div className="cis2-handle" />

        <div className="cis2-header">
          <div className="cis2-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div>
            <div className="cis2-title">Guest Info</div>
            <div className="cis2-sub">Table {tableNumber} · optional</div>
          </div>
        </div>

        <div className="cis2-form">
          <div className="cis2-field">
            <label className="cis2-label">Name</label>
            <input
              className="cis2-input"
              type="text"
              placeholder="Guest name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="cis2-field">
            <label className="cis2-label">Phone</label>
            <input
              className="cis2-input"
              type="tel"
              placeholder="10-digit number"
              value={phone}
              maxLength={10}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          <div className="cis2-field cis2-field-sm">
            <label className="cis2-label">Guests (PAX)</label>
            <input
              className="cis2-input"
              type="number"
              placeholder="0"
              min="1"
              max="50"
              value={pax}
              onChange={e => setPax(e.target.value)}
            />
          </div>

          <div className="cis2-field">
            <label className="cis2-label">Note</label>
            <input
              className="cis2-input"
              type="text"
              placeholder="e.g. Window seat, no onion…"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="cis2-footer">
          <button className="cis2-cancel" onClick={onClose}>Skip</button>
          <button className="cis2-save" onClick={handleSave}>Save Info</button>
        </div>
      </div>
    </>
  );
}
