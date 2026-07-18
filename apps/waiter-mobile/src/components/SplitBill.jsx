import { useState } from "react";
import { tapImpact } from "../lib/haptics";

const SEAT_COLORS = [
  { bg: "#F3F4F6", text: "#374151" }, // All / unassigned
  { bg: "#DBEAFE", text: "#1D4ED8" },
  { bg: "#DCFCE7", text: "#15803D" },
  { bg: "#FEF9C3", text: "#854D0E" },
  { bg: "#FFE4E6", text: "#BE123C" },
  { bg: "#EDE9FE", text: "#6D28D9" },
  { bg: "#FFEDD5", text: "#C2410C" },
];

export function SplitBill({ order, onBack, onPrint }) {
  const [assignments, setAssignments] = useState({});

  // Seat labels from owner console (e.g. TEST4S1, TEST4S2, TEST4S3, TEST4S4)
  const seatLabels = order.seatLabels || [];
  const seats      = seatLabels.length || 2; // fallback to 2 if no config

  const items    = order.items || [];
  const billable = items.filter(i => !i.isVoided && !i.isComp);
  const total    = billable.reduce((s, i) => {
    const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    const sub  = i.price * i.quantity;
    return s + sub + Math.round(sub * rate / 100);
  }, 0);

  // Cycle: 0 (All) → 1 → 2 → ... → seats → back to 0
  function cycleAssignment(itemId) {
    tapImpact();
    setAssignments(prev => {
      const cur = prev[itemId] ?? 0;
      return { ...prev, [itemId]: cur >= seats ? 0 : cur + 1 };
    });
  }

  // Get items for seat index (1-based). seatIdx=0 means all shared items
  function getItemsForSeat(seatIdx) {
    return billable.filter(i => {
      const a = assignments[i.id] ?? 0;
      return a === 0 || a === seatIdx;
    });
  }

  // Subtotal + tax for a seat's items
  function seatTotal(seatIdx) {
    const seatItems = getItemsForSeat(seatIdx);
    return seatItems.reduce((s, i) => {
      const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
      const sub  = i.price * i.quantity;
      return s + sub + Math.round(sub * rate / 100);
    }, 0);
  }

  // Only seats that have at least 1 item assigned (not counting shared "All" items)
  const seatsWithItems = seatLabels.filter((_, idx) => {
    const seatIdx = idx + 1;
    return billable.some(i => (assignments[i.id] ?? 0) === seatIdx);
  });

  return (
    <div className="split-page">
      {/* Header */}
      <div className="split-header">
        <button className="icon-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div>
          <h2 className="split-title">Split Bill</h2>
          <p className="split-meta">
            Table {order.tableNumber}
            {seatLabels.length > 0 && ` · ${seatLabels.length} seats`}
            {` · ₹${total.toFixed(0)} total`}
          </p>
        </div>
      </div>

      <p className="split-hint">
        Tap an item to assign to a seat — grey = shared between all
      </p>

      {/* Items */}
      <div className="split-items">
        {items.map(item => {
          if (item.isVoided) return null;
          const seatIdx = assignments[item.id] ?? 0;
          const label   = seatIdx === 0 ? "All" : (seatLabels[seatIdx - 1] || `S${seatIdx}`);
          const clr     = SEAT_COLORS[seatIdx % SEAT_COLORS.length] || SEAT_COLORS[0];
          return (
            <button key={item.id} className="split-item" onClick={() => cycleAssignment(item.id)}>
              <div className="split-item-left">
                <span className="split-item-name">{item.name}</span>
                {item.note && <span className="split-item-note">{item.note}</span>}
              </div>
              <div className="split-item-right">
                <span className="split-item-price">×{item.quantity} · ₹{(item.price * item.quantity).toFixed(0)}</span>
                <span className="split-seat-tag" style={{ background: clr.bg, color: clr.text }}>
                  {label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Print actions */}
      <div className="split-actions">

        {/* Seat print buttons — only for seats with assigned items */}
        {seatsWithItems.length > 0 && (
          <div className="split-persons-grid">
            {seatsWithItems.map(label => {
              const seatIdx = seatLabels.indexOf(label) + 1;
              const seatItems = getItemsForSeat(seatIdx);
              const amount    = seatTotal(seatIdx);
              return (
                <button
                  key={label}
                  className="split-person-btn"
                  onClick={() => { tapImpact(); onPrint(seatItems, label); }}
                >
                  <span>🖨 {label}</span>
                  <span className="split-person-count">₹{amount.toFixed(0)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Full bill */}
        <button
          className="action-btn primary-btn"
          onClick={() => { tapImpact(); onPrint(billable, null); }}
        >
          🖨 Print Full Bill
        </button>
      </div>
    </div>
  );
}
