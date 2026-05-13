import { useState } from "react";
import { getFinancials } from "./OrderPanel";

const SPLIT_OPTIONS = [2, 3, 4, 5, 6, 7, 8];

export function SplitBillSheet({ order, tableLabel, onClose, onPaySplit }) {
  const [splitCount, setSplitCount] = useState(2);

  const fin = getFinancials(order);
  if (!fin) return null;

  const total     = fin.total;
  const perPerson = Math.floor(total / splitCount);
  // Person 1 gets the remainder so total adds up exactly
  const remainder  = total - perPerson * splitCount;

  const persons = Array.from({ length: splitCount }, (_, i) => ({
    index:  i + 1,
    share:  i === 0 ? perPerson + remainder : perPerson,
    isFirst: i === 0
  }));

  function handleCharge(amount) {
    onPaySplit(amount);
    onClose();
  }

  function handlePayAll() {
    onPaySplit(total);
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
          <p className="split-total-amount">₹{total}</p>
        </div>

        {/* Split count selector */}
        <div className="split-count-section">
          <p className="split-count-label">Split between</p>
          <div className="split-count-pills">
            {SPLIT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={`split-count-pill${splitCount === n ? " active" : ""}`}
                onClick={() => setSplitCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="split-divider" />

        {/* Per-person cards */}
        <div className="split-persons">
          {persons.map((person) => (
            <div key={person.index} className="split-person-card">
              <div className="split-person-info">
                <span className="split-person-name">Person {person.index}</span>
                <span className="split-person-share">₹{person.share}</span>
                {person.isFirst && remainder > 0 && (
                  <span className="split-person-note">Includes ₹{remainder} rounding</span>
                )}
              </div>
              <button
                type="button"
                className="split-charge-btn"
                onClick={() => handleCharge(person.share)}
              >
                Charge
              </button>
            </div>
          ))}
        </div>

        {/* Pay all button */}
        <button type="button" className="split-pay-all-btn" onClick={handlePayAll}>
          Pay All Equal Splits · ₹{total}
        </button>
      </div>
    </div>
  );
}
