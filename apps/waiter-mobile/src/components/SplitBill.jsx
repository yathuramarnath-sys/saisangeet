import { useState } from "react";
import { tapImpact } from "../lib/haptics";
import { printBill } from "../lib/printBill";

const SEAT_COLORS = [
  { bg: "#F3F4F6", text: "#374151" },
  { bg: "#DBEAFE", text: "#1D4ED8" },
  { bg: "#DCFCE7", text: "#15803D" },
  { bg: "#FEF9C3", text: "#854D0E" },
];

export function SplitBill({ order, outletName, onBack }) {
  const [seats,       setSeats]       = useState(2);
  const [assignments, setAssignments] = useState({});

  const items = order.items || [];
  const billable = items.filter(i => !i.isVoided && !i.isComp);
  const splitSub = billable.reduce((s, i) => s + i.price * i.quantity, 0);
  const splitTax = billable.reduce((s, i) => {
    const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    return s + Math.round(i.price * i.quantity * rate / 100);
  }, 0);
  const total    = splitSub + splitTax;

  function cycleAssignment(itemId) {
    tapImpact();
    setAssignments(prev => {
      const cur  = prev[itemId] ?? 0;
      return { ...prev, [itemId]: cur >= seats ? 0 : cur + 1 };
    });
  }

  function changeSeatCount(n) {
    setSeats(n);
    setAssignments(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => { if (next[id] > n) next[id] = 0; });
      return next;
    });
  }

  function getItemsForSeat(seatNum) {
    return items.filter(i => {
      const a = assignments[i.id] ?? 0;
      return seatNum === 0 ? true : (a === 0 || a === seatNum);
    });
  }

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
          <p className="split-meta">Table {order.tableNumber} · ₹{total} total</p>
        </div>
      </div>

      {/* Split count */}
      <div className="split-count-row">
        <span className="split-count-label">Split between</span>
        <div className="split-count-btns">
          {[2, 3, 4].map(n => (
            <button
              key={n}
              className={`split-count-btn${seats === n ? " active" : ""}`}
              onClick={() => { changeSeatCount(n); tapImpact(); }}
            >
              {n} people
            </button>
          ))}
        </div>
      </div>

      <p className="split-hint">Tap an item to assign to a person — grey = shared</p>

      {/* Items */}
      <div className="split-items">
        {items.map(item => {
          const seat = assignments[item.id] ?? 0;
          const clr  = SEAT_COLORS[seat] || SEAT_COLORS[0];
          return (
            <button key={item.id} className="split-item" onClick={() => cycleAssignment(item.id)}>
              <div className="split-item-left">
                <span className="split-item-name">{item.name}</span>
                {item.note && <span className="split-item-note">{item.note}</span>}
              </div>
              <div className="split-item-right">
                <span className="split-item-price">×{item.quantity} · ₹{(item.price * item.quantity).toFixed(0)}</span>
                <span className="split-seat-tag" style={{ background: clr.bg, color: clr.text }}>
                  {seat === 0 ? "All" : `P${seat}`}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Print actions */}
      <div className="split-actions">
        <div className="split-persons-grid">
          {Array.from({ length: seats }, (_, i) => i + 1).map(n => {
            const cnt = getItemsForSeat(n).length;
            return (
              <button
                key={n}
                className="split-person-btn"
                disabled={cnt === 0}
                onClick={() => {
                  const si = getItemsForSeat(n);
                  if (si.length) { tapImpact(); printBill(order, si, outletName, { seatLabel: `Person ${n}` }); }
                }}
              >
                <span>🖨 Person {n}</span>
                <span className="split-person-count">{cnt} items</span>
              </button>
            );
          })}
        </div>
        <button
          className="action-btn primary-btn"
          onClick={() => { tapImpact(); printBill(order, items, outletName); }}
        >
          🖨 Print Full Bill
        </button>
      </div>
    </div>
  );
}
