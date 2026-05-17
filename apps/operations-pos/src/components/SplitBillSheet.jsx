import { useState } from "react";
import { getFinancials } from "./OrderPanel";

export function SplitBillSheet({ order, tableLabel, onClose, onConfirmSplit }) {
  const seatLabels  = order.seatLabels || [];
  const billable    = (order.items || []).filter(i => !i.isVoided && !i.isComp);

  // Use real seat labels if available, else generic "Person N"
  const displayLabels = seatLabels.length > 0
    ? seatLabels
    : ["Person 1", "Person 2"];

  // assignments: { [itemId]: seatIndex 1-based, 0 = unassigned }
  const [assignments, setAssignments] = useState({});

  function toggleAssign(itemId, seatIdx) {
    setAssignments(prev => ({
      ...prev,
      [itemId]: prev[itemId] === seatIdx ? 0 : seatIdx,
    }));
  }

  function getSeatData(seatIdx) {
    const items    = billable.filter(i => (assignments[i.id] ?? 0) === seatIdx);
    const totalSub = billable.reduce((s, i) => s + i.price * i.quantity, 0);
    const sub      = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const discountAmt = Math.min(order.discountAmount || 0, totalSub);
    const ratio       = totalSub > 0 ? sub / totalSub : 0;
    const seatDisc    = Math.floor(discountAmt * ratio);
    const afterDisc   = sub - seatDisc;
    const tax = items.reduce((s, i) => {
      const lineAfter = totalSub > 0 ? (i.price * i.quantity) * ((totalSub - discountAmt) / totalSub) : 0;
      const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
      return s + Math.round(lineAfter * rate / 100);
    }, 0);
    return { items, sub, seatDisc, afterDisc, tax, total: afterDisc + tax };
  }

  const unassignedItems = billable.filter(i => (assignments[i.id] ?? 0) === 0);
  const fin = getFinancials(order);

  function handleConfirm() {
    const splits = displayLabels
      .map((label, idx) => {
        const seatIdx = idx + 1;
        const { items, sub, seatDisc, afterDisc, tax, total } = getSeatData(seatIdx);
        if (items.length === 0) return null;
        return {
          seatLabel:    label,
          billNo:       seatIdx,
          items:        items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
          subtotal:     sub,
          discount:     seatDisc,
          afterDiscount: afterDisc,
          tax,
          total,
        };
      })
      .filter(Boolean);

    if (splits.length === 0) return;
    onConfirmSplit(splits);
    onClose();
  }

  return (
    <div className="split-overlay" role="dialog" aria-modal="true">
      <div className="split-sheet">

        {/* Header */}
        <div className="split-sheet-head">
          <div>
            <h3>Split Bill</h3>
            <p className="split-table-label">{tableLabel}</p>
          </div>
          <button type="button" className="split-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Total */}
        <div className="split-total-display">
          <p className="split-total-label">Bill Total</p>
          <p className="split-total-amount">₹{fin?.total || 0}</p>
        </div>

        {/* Items assignment */}
        <div className="split-items-section">
          <p className="split-section-label">Tap a seat to assign each item</p>
          <div className="split-items-list">
            {billable.length === 0 && (
              <p className="split-no-items">No billable items on this table.</p>
            )}
            {billable.map(item => {
              const assigned = assignments[item.id] ?? 0;
              return (
                <div key={item.id} className={`split-item-row${assigned > 0 ? " assigned" : ""}`}>
                  <div className="split-item-info">
                    <span className="split-item-name">
                      {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ""}
                    </span>
                    <span className="split-item-price">₹{(item.price * item.quantity).toFixed(0)}</span>
                  </div>
                  <div className="split-seat-btns">
                    {displayLabels.map((lbl, idx) => (
                      <button key={idx} type="button"
                        className={`split-seat-pill${assignments[item.id] === idx + 1 ? " active" : ""}`}
                        onClick={() => toggleAssign(item.id, idx + 1)}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-seat totals */}
        {billable.length > 0 && (
          <>
            <div className="split-divider" />
            <div className="split-persons">
              {displayLabels.map((label, idx) => {
                const { items, total } = getSeatData(idx + 1);
                if (items.length === 0) return null;
                return (
                  <div key={idx} className="split-person-card">
                    <div className="split-person-info">
                      <span className="split-person-name">{label}</span>
                      <span className="split-person-share">₹{total}</span>
                      <span className="split-person-items">
                        {items.length} item{items.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
              {unassignedItems.length > 0 && (
                <div className="split-person-card split-unassigned-card">
                  <div className="split-person-info">
                    <span className="split-person-name">⚠ Unassigned</span>
                    <span className="split-person-share" style={{ color: "#ef4444" }}>
                      {unassignedItems.length} item{unassignedItems.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Confirm button */}
        <button
          type="button"
          className="split-pay-all-btn"
          disabled={unassignedItems.length > 0 || billable.length === 0}
          onClick={handleConfirm}
        >
          {unassignedItems.length > 0
            ? `Assign ${unassignedItems.length} remaining item${unassignedItems.length !== 1 ? "s" : ""} first`
            : "Confirm Split → Record Bills"}
        </button>

      </div>
    </div>
  );
}
