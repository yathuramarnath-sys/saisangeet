import { useState } from "react";
import { tapImpact } from "../lib/haptics";

/**
 * CustomerInfoSheet — optional guest info capture
 * Saves to order.guestInfo — never blocks the workflow.
 *
 * Props:
 *   tableNumber  string | number
 *   guestInfo    object  — existing saved info (if any)
 *   onSave       (info) => void
 *   onClose      () => void
 */
export function CustomerInfoSheet({ tableNumber, guestInfo = {}, onSave, onClose }) {
  const [name,    setName]    = useState(guestInfo.name    || "");
  const [phone,   setPhone]   = useState(guestInfo.phone   || "");
  const [pax,     setPax]     = useState(guestInfo.pax     || "");
  const [note,    setNote]    = useState(guestInfo.note    || "");

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
      <div className="tas-backdrop" onClick={onClose} />
      <div className="tas-sheet cis-sheet">
        <div className="tas-handle" />

        <div className="cis-header">
          <span className="cis-header-icon">👤</span>
          <div>
            <div className="cis-header-title">Guest Info</div>
            <div className="cis-header-sub">Table {tableNumber} · optional</div>
          </div>
        </div>

        <div className="cis-form">
          <label className="cis-field">
            <span>Name</span>
            <input
              type="text"
              placeholder="Guest name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>

          <label className="cis-field">
            <span>Phone</span>
            <input
              type="tel"
              placeholder="10-digit number"
              value={phone}
              maxLength={10}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
            />
          </label>

          <label className="cis-field cis-field-sm">
            <span>Guests (PAX)</span>
            <input
              type="number"
              placeholder="0"
              min="1"
              max="50"
              value={pax}
              onChange={e => setPax(e.target.value)}
            />
          </label>

          <label className="cis-field">
            <span>Note</span>
            <input
              type="text"
              placeholder="e.g. Window seat, no onion…"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </label>
        </div>

        <div className="cis-footer">
          <button className="cis-btn-cancel" onClick={onClose}>Skip</button>
          <button className="cis-btn-save" onClick={handleSave}>Save Info</button>
        </div>
      </div>
    </>
  );
}
