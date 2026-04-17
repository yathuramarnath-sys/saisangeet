import { useState } from "react";
import { getFinancials } from "./OrderPanel";

const METHODS = [
  { id: "cash", label: "Cash",  icon: "₹"  },
  { id: "upi",  label: "UPI",   icon: "⚡" },
  { id: "card", label: "Card",  icon: "💳" }
];

export function PaymentSheet({ order, tableLabel, onClose, onSettle }) {
  const fin = getFinancials(order);

  // Local payments added during this modal session (not yet persisted)
  const [localPayments, setLocalPayments] = useState([]);
  const [currentMethod, setCurrentMethod] = useState("cash");
  const [currentAmount, setCurrentAmount] = useState(() => String(fin?.balance || fin?.total || ""));
  const [currentRef,    setCurrentRef]    = useState("");
  const [loading,       setLoading]       = useState(false);

  if (!fin) return null;

  // How much already settled before this modal was opened
  const preExistingPaid = fin.paid;
  // How much added so far in this session
  const localPaid  = localPayments.reduce((s, p) => s + p.amount, 0);
  // Remaining balance after local payments
  const remaining  = Math.max(fin.balance - localPaid, 0);
  // For cash: how much change to return
  const amountNum  = Number(currentAmount) || 0;
  const change     = currentMethod === "cash" && amountNum > remaining && remaining > 0
    ? amountNum - remaining
    : currentMethod === "cash" && remaining === 0 && localPaid === 0 && amountNum > fin.total
    ? amountNum - fin.total
    : 0;

  const isFullyPaid = remaining === 0;

  // Quick amount suggestions (cash only)
  const quickAmounts = currentMethod === "cash" && remaining > 0
    ? [remaining, Math.ceil(remaining / 100) * 100, Math.ceil(remaining / 500) * 500]
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 3)
    : [];

  function handleAddPayment() {
    if (amountNum <= 0) return;
    const effectiveAmount = Math.min(amountNum, remaining);
    const payment = {
      method:    currentMethod,
      amount:    effectiveAmount,
      reference: currentRef.trim() || undefined
    };
    const next = [...localPayments, payment];
    setLocalPayments(next);
    const newRemaining = Math.max(remaining - effectiveAmount, 0);
    setCurrentAmount(String(newRemaining || ""));
    setCurrentRef("");
  }

  async function handleSettle() {
    setLoading(true);
    try {
      await onSettle(localPayments);
    } finally {
      setLoading(false);
    }
  }

  const methodLabel = { cash: "Cash", upi: "UPI", card: "Card" };

  return (
    <div className="payment-overlay" role="dialog" aria-modal="true">
      <div className="payment-sheet">
        {/* Header */}
        <div className="payment-sheet-head">
          <div>
            <h3>Collect Payment</h3>
            <p className="payment-table-label">{tableLabel}</p>
          </div>
          <button type="button" className="payment-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Bill summary */}
        <div className="payment-summary">
          <div className="payment-summary-row">
            <span>Subtotal</span>
            <span>₹{fin.subtotal.toFixed(2)}</span>
          </div>
          {fin.discountAmt > 0 && (
            <div className="payment-summary-row discount">
              <span>Discount</span>
              <span>−₹{fin.discountAmt.toFixed(2)}</span>
            </div>
          )}
          <div className="payment-summary-row">
            <span>GST (5%)</span>
            <span>₹{fin.tax.toFixed(2)}</span>
          </div>
          <div className="payment-summary-row total">
            <span>Amount Due</span>
            <span>₹{fin.total}</span>
          </div>
        </div>

        {/* Payments recorded this session */}
        {localPayments.length > 0 && (
          <div className="payment-recorded-section">
            <p className="payment-recorded-label">Payments Added</p>
            {localPayments.map((p, i) => (
              <div key={i} className="payment-recorded-chip">
                <span>
                  <span className="payment-recorded-chip-icon">✓</span>{" "}
                  {methodLabel[p.method]}{p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span>₹{p.amount}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pre-existing payments from order */}
        {preExistingPaid > 0 && (
          <div className="payment-recorded-section">
            <p className="payment-recorded-label">Previously Paid</p>
            {(order.payments || []).map((p, i) => (
              <div key={i} className="payment-recorded-chip">
                <span>
                  <span className="payment-recorded-chip-icon">✓</span>{" "}
                  {methodLabel[p.method] || p.method}{p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span>₹{p.amount}</span>
              </div>
            ))}
          </div>
        )}

        {/* Balance indicator */}
        <div className={`payment-balance-indicator ${isFullyPaid ? "zero" : "remaining"}`}>
          <span>{isFullyPaid ? "Fully Paid" : "Remaining Balance"}</span>
          <strong>₹{isFullyPaid ? fin.total : remaining}</strong>
        </div>

        {/* Only show input section if there's balance left */}
        {!isFullyPaid && (
          <>
            {/* Payment method */}
            <div className="payment-methods">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`payment-method-btn${currentMethod === m.id ? " active" : ""}`}
                  onClick={() => {
                    setCurrentMethod(m.id);
                    setCurrentRef("");
                    setCurrentAmount(String(remaining));
                  }}
                >
                  <span className="payment-method-icon">{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            {/* Amount input */}
            <div className="payment-amount-wrap">
              <label className="payment-amount-label">Amount</label>
              <div className="payment-amount-input-wrap">
                <span className="payment-rupee">₹</span>
                <input
                  className="payment-amount-input"
                  type="number"
                  min="0"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  autoFocus
                />
              </div>
              {quickAmounts.length > 0 && (
                <div className="payment-quick-amounts">
                  {quickAmounts.map((qa) => (
                    <button
                      key={qa}
                      type="button"
                      className="payment-quick-btn"
                      onClick={() => setCurrentAmount(String(qa))}
                    >
                      ₹{qa}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* UPI/Card reference */}
            {(currentMethod === "upi" || currentMethod === "card") && (
              <div className="payment-ref-wrap">
                <label className="payment-amount-label">
                  {currentMethod === "upi" ? "UPI Reference / Transaction ID" : "Card Last 4 / Reference"}
                </label>
                <input
                  className="payment-ref-input"
                  type="text"
                  placeholder={currentMethod === "upi" ? "Transaction ID" : "Last 4 digits"}
                  value={currentRef}
                  onChange={(e) => setCurrentRef(e.target.value)}
                />
              </div>
            )}

            {/* Change indicator (cash) */}
            {change > 0 && (
              <div className="payment-balance-indicator change" style={{ marginBottom: 0, marginTop: 10 }}>
                <span>Return Change to Customer</span>
                <strong>₹{change.toFixed(2)}</strong>
              </div>
            )}

            {/* Add payment button */}
            <button
              type="button"
              className="payment-add-btn"
              disabled={amountNum <= 0}
              onClick={handleAddPayment}
            >
              Add Payment · ₹{amountNum > 0 ? Math.min(amountNum, remaining) : 0}
            </button>
          </>
        )}

        {/* Settle button — shown once fully paid */}
        {isFullyPaid && (
          <button
            type="button"
            className="payment-settle-btn"
            disabled={loading}
            onClick={handleSettle}
          >
            {loading ? (
              <span className="pos-spinner" />
            ) : (
              `Settle & Close · ₹${fin.total}`
            )}
          </button>
        )}
      </div>
    </div>
  );
}
