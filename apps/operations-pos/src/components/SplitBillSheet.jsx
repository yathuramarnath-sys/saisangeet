import { useState } from "react";
import { getFinancials } from "./OrderPanel";

export function SplitBillSheet({ order, tableLabel, onClose, onConfirmSplit, gstTreatment = "exclusive", defaultTaxRate = 0 }) {
  const seatLabels = order.seatLabels || [];
  const billable   = (order.items || []).filter(i => !i.isVoided && !i.isComp);
  const fin        = getFinancials(order, { gstTreatment });
  const totalAmt   = fin?.total || 0;

  // Tab: "item" | "equal" | "amount"
  const [tab, setTab] = useState("item");

  // ── By Item ──────────────────────────────────────────────────────────────
  const displayLabels = seatLabels.length > 0 ? seatLabels : ["Person 1", "Person 2"];
  const [assignments, setAssignments] = useState({});

  function toggleAssign(itemId, seatIdx) {
    setAssignments(prev => ({ ...prev, [itemId]: prev[itemId] === seatIdx ? 0 : seatIdx }));
  }

  function getSeatData(seatIdx) {
    const items       = billable.filter(i => (assignments[i.id] ?? 0) === seatIdx);
    const totalSub    = billable.reduce((s, i) => s + i.price * i.quantity, 0);
    const sub         = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const discountAmt = Math.min(order.discountAmount || 0, totalSub);
    const ratio       = totalSub > 0 ? sub / totalSub : 0;
    const seatDisc    = Math.floor(discountAmt * ratio);
    const afterDisc   = sub - seatDisc;
    const tax         = items.reduce((s, i) => {
      const lineAfter = totalSub > 0 ? (i.price * i.quantity) * ((totalSub - discountAmt) / totalSub) : 0;
      const rate      = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : defaultTaxRate;
      return s + Math.round(lineAfter * rate / 100);
    }, 0);
    return { items, sub, seatDisc, afterDisc, tax, total: afterDisc + tax };
  }

  const unassignedItems = billable.filter(i => (assignments[i.id] ?? 0) === 0);

  // ── By Equal ─────────────────────────────────────────────────────────────
  const [equalCount, setEqualCount] = useState(2);
  const equalShare = equalCount > 0 ? Math.floor(totalAmt / equalCount) : 0;
  const equalRemainder = equalCount > 0 ? totalAmt - equalShare * equalCount : 0;

  // ── By Amount ─────────────────────────────────────────────────────────────
  const [amountRows, setAmountRows] = useState([
    { label: "Person 1", amount: "" },
    { label: "Person 2", amount: "" },
  ]);
  const collected  = amountRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const remaining  = totalAmt - collected;

  // ── Confirm ───────────────────────────────────────────────────────────────
  function handleConfirm() {
    if (tab === "item") {
      const splits = displayLabels
        .map((label, idx) => {
          const si = idx + 1;
          const { items, sub, seatDisc, afterDisc, tax, total } = getSeatData(si);
          if (items.length === 0) return null;
          return { seatLabel: label, billNo: si, items: items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })), subtotal: sub, discount: seatDisc, afterDiscount: afterDisc, tax, total };
        })
        .filter(Boolean);
      if (!splits.length) return;
      onConfirmSplit(splits);
      onClose();
    } else if (tab === "equal") {
      const splits = Array.from({ length: equalCount }, (_, i) => {
        const share = i === equalCount - 1 ? equalShare + equalRemainder : equalShare;
        return { seatLabel: `Person ${i + 1}`, billNo: i + 1, items: [], subtotal: share, discount: 0, afterDiscount: share, tax: 0, total: share };
      });
      onConfirmSplit(splits);
      onClose();
    } else if (tab === "amount") {
      const filled = amountRows.filter(r => Number(r.amount) > 0);
      if (filled.length < 2) return;
      const splits = filled.map((r, i) => ({
        seatLabel: r.label || `Person ${i + 1}`, billNo: i + 1, items: [],
        subtotal: Number(r.amount), discount: 0, afterDiscount: Number(r.amount), tax: 0, total: Number(r.amount),
      }));
      onConfirmSplit(splits);
      onClose();
    }
  }

  const canConfirm = tab === "item"
    ? unassignedItems.length === 0 && billable.length > 0
    : tab === "equal"
    ? equalCount >= 2
    : amountRows.filter(r => Number(r.amount) > 0).length >= 2;

  return (
    <div className="split-overlay" role="dialog" aria-modal="true">
      <div className="split-sheet">

        {/* Header */}
        <div className="split-sheet-head">
          <div>
            <h3>Split Bill</h3>
            <p className="split-table-label">{tableLabel}</p>
          </div>
          <button type="button" className="split-close" onClick={onClose}>✕</button>
        </div>

        {/* Total */}
        <div className="split-total-display">
          <p className="split-total-label">Bill Total</p>
          <p className="split-total-amount">₹{totalAmt}</p>
        </div>

        {/* Tabs */}
        <div className="split-tabs">
          {[
            { id: "item",   label: "By Item"   },
            { id: "equal",  label: "By Equal"  },
            { id: "amount", label: "By Amount" },
          ].map(t => (
            <button key={t.id} type="button"
              className={`split-tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── By Item ─────────────────────────────────────────────────── */}
        {tab === "item" && (
          <>
            <div className="split-items-section">
              <p className="split-section-label">Tap a seat to assign each item</p>
              <div className="split-items-list">
                {billable.length === 0 && <p className="split-no-items">No billable items on this table.</p>}
                {billable.map(item => {
                  const assigned = assignments[item.id] ?? 0;
                  return (
                    <div key={item.id} className={`split-item-row${assigned > 0 ? " assigned" : ""}`}>
                      <div className="split-item-info">
                        <span className="split-item-name">{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ""}</span>
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

            {billable.length > 0 && (
              <>
                <div className="split-divider" />
                <div className="split-persons">
                  {displayLabels.map((label, idx) => {
                    const { items, total } = getSeatData(idx + 1);
                    if (!items.length) return null;
                    return (
                      <div key={idx} className="split-person-card">
                        <div className="split-person-info">
                          <span className="split-person-name">{label}</span>
                          <span className="split-person-share">₹{total}</span>
                          <span className="split-person-items">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                  {unassignedItems.length > 0 && (
                    <div className="split-person-card split-unassigned-card">
                      <div className="split-person-info">
                        <span className="split-person-name">⚠ Unassigned</span>
                        <span className="split-person-share" style={{ color: "#ef4444" }}>{unassignedItems.length} item{unassignedItems.length !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ── By Equal ────────────────────────────────────────────────── */}
        {tab === "equal" && (
          <div className="split-equal-section">
            <p className="split-section-label">Divide total equally among N people</p>
            <div className="split-equal-controls">
              <button type="button" className="split-count-btn"
                onClick={() => setEqualCount(n => Math.max(2, n - 1))}>−</button>
              <div className="split-count-display">
                <span className="split-count-num">{equalCount}</span>
                <span className="split-count-lbl">people</span>
              </div>
              <button type="button" className="split-count-btn"
                onClick={() => setEqualCount(n => Math.min(10, n + 1))}>+</button>
            </div>
            <div className="split-equal-share">
              <p className="split-equal-label">Each person pays</p>
              <p className="split-equal-amount">₹{equalShare}{equalRemainder > 0 ? ` / ₹${equalShare + equalRemainder}` : ""}</p>
            </div>
            <div className="split-persons">
              {Array.from({ length: equalCount }, (_, i) => {
                const share = i === equalCount - 1 ? equalShare + equalRemainder : equalShare;
                return (
                  <div key={i} className="split-person-card">
                    <div className="split-person-info">
                      <span className="split-person-name">Person {i + 1}</span>
                      <span className="split-person-share">₹{share}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── By Amount ───────────────────────────────────────────────── */}
        {tab === "amount" && (
          <div className="split-amount-section">
            <p className="split-section-label">Enter the amount each person pays</p>
            <div className="split-amount-rows">
              {amountRows.map((row, idx) => (
                <div key={idx} className="split-amount-row">
                  <span className="split-amount-person">{row.label}</span>
                  <div className="split-amount-input-wrap">
                    <span className="split-rupee">₹</span>
                    <input
                      type="number"
                      className="split-amount-input"
                      placeholder="0"
                      value={row.amount}
                      onChange={e => setAmountRows(prev =>
                        prev.map((r, i) => i === idx ? { ...r, amount: e.target.value } : r)
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="split-add-person-btn"
              onClick={() => setAmountRows(prev => [...prev, { label: `Person ${prev.length + 1}`, amount: "" }])}
              disabled={amountRows.length >= 8}>
              + Add Person
            </button>
            <div className={`split-amount-balance${remaining === 0 ? " balanced" : remaining < 0 ? " over" : ""}`}>
              {remaining === 0
                ? "✓ Balanced"
                : remaining > 0
                ? `₹${remaining} remaining`
                : `₹${Math.abs(remaining)} over total`}
            </div>
          </div>
        )}

        {/* Confirm */}
        <button
          type="button"
          className="split-pay-all-btn"
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          {tab === "item" && unassignedItems.length > 0
            ? `Assign ${unassignedItems.length} remaining item${unassignedItems.length !== 1 ? "s" : ""} first`
            : "Confirm Split → Record Bills"}
        </button>

      </div>
    </div>
  );
}
