/**
 * WastageModal — log production wastage during a shift.
 * Triggered from the action bar by any logged-in cashier.
 * Saves to backend POST /operations/wastage and also local log.
 */
import { useState } from "react";
import { api } from "../lib/api";

const REASONS = ["Spoilage", "Overcooked", "Dropped", "Expired", "Over-produced", "Other"];

export function WastageModal({ shift, cashierName, outletId, menuItems = [], onClose }) {
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState(null); // { name, unit }
  const [quantity, setQuantity]     = useState("1");
  const [reason, setReason]         = useState(REASONS[0]);
  const [note, setNote]             = useState("");
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [log, setLog]               = useState([]); // entries logged this session

  // Filter menu items for autocomplete
  const suggestions = itemSearch.trim().length > 0
    ? (menuItems || [])
        .filter(i => (i.name || "").toLowerCase().includes(itemSearch.trim().toLowerCase()))
        .slice(0, 6)
    : [];

  function selectSuggestion(item) {
    setSelectedItem({ name: item.name, unit: item.unit || "" });
    setItemSearch(item.name);
  }

  function clearItem() {
    setSelectedItem(null);
    setItemSearch("");
  }

  async function handleSave() {
    const name = selectedItem?.name || itemSearch.trim();
    if (!name) return;
    const qty = parseFloat(quantity) || 0;
    if (qty <= 0) return;

    setSaving(true);
    const entry = {
      id:          `wst-${Date.now()}`,
      itemName:    name,
      unit:        selectedItem?.unit || "",
      quantity:    qty,
      reason,
      note:        note.trim(),
      shiftId:     shift?.id || "",
      cashierName: cashierName || shift?.cashier || "",
      outletId:    outletId || shift?.outletId || "",
      timestamp:   new Date().toISOString(),
    };

    try {
      await api.post("/operations/wastage", entry);
    } catch (_) {
      // offline — still log locally
    }

    // Local log for quick reference
    try {
      const stored = JSON.parse(localStorage.getItem("pos_wastage_log") || "[]");
      localStorage.setItem("pos_wastage_log", JSON.stringify([...stored, entry]));
    } catch (_) {}

    setLog(prev => [entry, ...prev]);
    // Reset form for next entry
    setItemSearch("");
    setSelectedItem(null);
    setQuantity("1");
    setNote("");
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const canSave = (selectedItem?.name || itemSearch.trim()) && parseFloat(quantity) > 0;

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sm-modal" style={{ maxWidth: 520, width: "95vw" }}>

        {/* Header */}
        <div className="sm-head">
          <div>
            <h3>🗑 Production Wastage</h3>
            <p className="sm-sub">
              {cashierName || shift?.cashier || "Cashier"}
              {shift?.outlet ? ` · ${shift.outlet}` : ""}
            </p>
          </div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="sm-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Item search */}
          <div className="sm-field" style={{ position: "relative" }}>
            <label>Item name *</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={itemSearch}
                onChange={e => { setItemSearch(e.target.value); setSelectedItem(null); }}
                placeholder="Type item name…"
                autoFocus
                style={{ flex: 1, padding: "8px 10px", borderRadius: 7, border: "1.5px solid #d1d5db", fontSize: 14 }}
              />
              {itemSearch && (
                <button type="button" onClick={clearItem}
                  style={{ padding: "0 10px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 7, cursor: "pointer", color: "#6b7280" }}>
                  ✕
                </button>
              )}
            </div>
            {/* Autocomplete dropdown */}
            {suggestions.length > 0 && !selectedItem && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                background: "#fff", border: "1.5px solid #d1d5db", borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)", marginTop: 2, overflow: "hidden"
              }}>
                {suggestions.map(item => (
                  <button key={item.id} type="button"
                    onClick={() => selectSuggestion(item)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "9px 14px", background: "none", border: "none",
                      cursor: "pointer", fontSize: 14, borderBottom: "1px solid #f3f4f6"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <strong>{item.name}</strong>
                    {item.unit && <span style={{ color: "#9ca3af", marginLeft: 6, fontSize: 12 }}>{item.unit}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quantity + unit row */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div className="sm-field" style={{ flex: 1 }}>
              <label>Quantity *</label>
              <input
                type="number"
                min="0.1"
                step="0.5"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 7, border: "1.5px solid #d1d5db", fontSize: 14, width: "100%" }}
              />
            </div>
            {selectedItem?.unit && (
              <div style={{ paddingBottom: 2, color: "#6b7280", fontSize: 14, fontWeight: 500 }}>
                {selectedItem.unit}
              </div>
            )}
          </div>

          {/* Reason pills */}
          <div className="sm-field">
            <label>Reason</label>
            <div className="sm-reason-pills">
              {REASONS.map(r => (
                <button key={r} type="button"
                  className={`sm-reason-pill${reason === r ? " active" : ""}`}
                  onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="sm-field">
            <label>Note <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span></label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. left on counter too long"
              style={{ padding: "8px 10px", borderRadius: 7, border: "1.5px solid #d1d5db", fontSize: 14 }}
            />
          </div>

          {/* This session log */}
          {log.length > 0 && (
            <div>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>
                Logged this session ({log.length})
              </p>
              <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {log.map(e => (
                  <div key={e.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "#f9fafb", borderRadius: 6, padding: "6px 10px",
                    fontSize: 13, border: "1px solid #e5e7eb"
                  }}>
                    <span>
                      <strong>{e.itemName}</strong>
                      <span style={{ color: "#6b7280", marginLeft: 6 }}>{e.quantity}{e.unit ? ` ${e.unit}` : ""}</span>
                    </span>
                    <span style={{ color: "#9ca3af", fontSize: 11 }}>{e.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sm-footer">
          <button type="button" className="sm-btn-cancel" onClick={onClose}>Done</button>
          <button
            type="button"
            className="sm-btn-action"
            style={{ background: canSave ? "#dc2626" : "#d1d5db", color: "#fff", minWidth: 140 }}
            disabled={!canSave || saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : saved ? "✓ Logged!" : "🗑 Log Wastage"}
          </button>
        </div>
      </div>
    </div>
  );
}
