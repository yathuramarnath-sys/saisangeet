import { useState } from "react";

const METHODS = ["Cash", "Card", "UPI", "Complimentary"];

export function SplitSettlementPanel({ order, onMarkPaid, onBack }) {
  const [paying, setPaying]   = useState(null); // billNo being paid
  const [method, setMethod]   = useState("Cash");

  const splits     = order.splitBills || [];
  const allPaid    = splits.length > 0 && splits.every(s => s.paid);
  const totalPaid  = splits.filter(s => s.paid).reduce((sum, s) => sum + (s.total || 0), 0);
  const totalDue   = splits.reduce((sum, s) => sum + (s.total || 0), 0);

  function handleConfirmPay(split) {
    onMarkPaid(split.billNo, method);
    setPaying(null);
    setMethod("Cash");
  }

  return (
    <div className="split-settle-panel">
      {/* Header */}
      <div className="split-settle-header">
        <button className="ssp-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div>
          <h3 className="ssp-title">Split Bill — {order.tableNumber}</h3>
          <p className="ssp-meta">
            {splits.filter(s => s.paid).length}/{splits.length} paid ·
            ₹{totalPaid.toFixed(0)} of ₹{totalDue.toFixed(0)}
          </p>
        </div>
        <span className={`ssp-status-tag ${allPaid ? "all-paid" : "pending"}`}>
          {allPaid ? "All Settled" : "Pending"}
        </span>
      </div>

      {/* Split rows */}
      <div className="ssp-rows">
        {splits.length === 0 && (
          <div className="ssp-empty">No split data yet — wait for Captain to print</div>
        )}
        {splits.map(split => (
          <div key={split.billNo} className={`ssp-row ${split.paid ? "ssp-row-paid" : ""}`}>
            <div className="ssp-row-left">
              <div className="ssp-row-label">
                {split.seatLabel}
                <span className="ssp-bill-no">#{split.billNo}</span>
              </div>
              <div className="ssp-row-items">
                {(split.items || []).map((item, i) => (
                  <span key={i} className="ssp-item-chip">
                    {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ""}
                  </span>
                ))}
              </div>
            </div>
            <div className="ssp-row-right">
              <span className="ssp-amount">₹{(split.total || 0).toFixed(0)}</span>
              {split.paid ? (
                <span className="ssp-paid-tag">
                  ✓ {split.paymentMethod}
                </span>
              ) : paying === split.billNo ? (
                <div className="ssp-pay-inline">
                  <div className="ssp-method-btns">
                    {METHODS.map(m => (
                      <button
                        key={m}
                        className={`ssp-method-btn${method === m ? " active" : ""}`}
                        onClick={() => setMethod(m)}
                      >{m}</button>
                    ))}
                  </div>
                  <div className="ssp-pay-actions">
                    <button className="ssp-cancel-btn" onClick={() => setPaying(null)}>Cancel</button>
                    <button className="ssp-confirm-btn" onClick={() => handleConfirmPay(split)}>
                      Confirm
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="ssp-pay-btn"
                  onClick={() => { setPaying(split.billNo); setMethod("Cash"); }}
                >
                  Mark Paid
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {allPaid && (
        <div className="ssp-footer">
          <p className="ssp-all-done">✓ All {splits.length} bills settled — closing table…</p>
        </div>
      )}
    </div>
  );
}
