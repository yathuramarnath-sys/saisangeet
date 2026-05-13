import { useState } from "react";
import { getFinancials } from "./OrderPanel";

const METHODS = [
  { id: "cash", label: "Cash",  icon: "₹"  },
  { id: "upi",  label: "UPI",   icon: "⚡" },
  { id: "card", label: "Card",  icon: "💳" }
];

export function PaymentSheet({ order, tableLabel, onClose, onSettle, onPhonePeQR }) {
  const fin = getFinancials(order);

  // Local payments added during this modal session (not yet persisted)
  const [localPayments, setLocalPayments] = useState([]);
  const [currentMethod, setCurrentMethod] = useState("cash");
  // Default to the remaining balance, or full total if already pre-paid (for change calc)
  const [currentAmount, setCurrentAmount] = useState(() => {
    const bal = fin?.balance ?? fin?.total ?? 0;
    return String(bal > 0 ? bal : (fin?.total ?? ""));
  });
  const [currentRef,    setCurrentRef]    = useState("");
  const [loading,       setLoading]       = useState(false);

  if (!fin) return null;

  // How much already settled before this modal was opened
  const preExistingPaid = fin.paid;
  // How much added so far in this session
  const localPaid   = localPayments.reduce((s, p) => s + p.amount, 0);
  // Remaining balance after local payments
  const remaining   = Math.max(fin.balance - localPaid, 0);
  const isFullyPaid = remaining === 0;

  const amountNum = Number(currentAmount) || 0;

  // Change to return — works whether balance is remaining or already zeroed
  const totalCovered = preExistingPaid + localPaid;
  const change = currentMethod === "cash" && amountNum > 0
    ? Math.max(amountNum - Math.max(remaining, 0) - (isFullyPaid && localPaid === 0 ? 0 : 0), 0)
    : 0;

  // Simpler, correct change calculation:
  // If balance remains → change = max(amountEntered - remaining, 0)
  // If already fully paid (pre-existing) → change = max(amountEntered - fin.total, 0)
  const changeToReturn = currentMethod === "cash"
    ? (remaining > 0
        ? Math.max(amountNum - remaining, 0)
        : Math.max(amountNum - fin.total, 0))
    : 0;

  // Quick amount suggestions (cash, only when balance remains)
  const quickAmounts = currentMethod === "cash" && remaining > 0
    ? [remaining, Math.ceil(remaining / 100) * 100, Math.ceil(remaining / 500) * 500]
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 3)
    : [];

  function handleAddPayment() {
    if (amountNum <= 0 || remaining <= 0) return;
    const effectiveAmount = Math.min(amountNum, remaining);
    const payment = {
      method:    currentMethod,
      amount:    effectiveAmount,
      reference: currentRef.trim() || undefined
    };
    const next = [...localPayments, payment];
    setLocalPayments(next);
    const newRemaining = Math.max(remaining - effectiveAmount, 0);
    // After recording, keep amount visible so cashier still sees change due
    setCurrentAmount(String(newRemaining > 0 ? newRemaining : amountNum));
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

  const methodLabel = { cash: "Cash", upi: "UPI", card: "Card", phonepe: "PhonePe QR" };

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
            <span>GST</span>
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

        {/* ── Payment entry form — ALWAYS visible ───────────────────────── */}
        {/* Payment method selector */}
        <div className="payment-methods">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`payment-method-btn${currentMethod === m.id ? " active" : ""}`}
              onClick={() => {
                setCurrentMethod(m.id);
                setCurrentRef("");
                setCurrentAmount(String(remaining > 0 ? remaining : fin.total));
              }}
            >
              <span className="payment-method-icon">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* PhonePe QR — full-amount quick pay */}
        {onPhonePeQR && remaining > 0 && (
          <button
            type="button"
            className="payment-phonepe-btn"
            onClick={onPhonePeQR}
          >
            <span className="payment-phonepe-btn-icon">📱</span>
            Pay ₹{remaining} via PhonePe QR
          </button>
        )}

        {/* Amount input */}
        <div className="payment-amount-wrap">
          <label className="payment-amount-label">
            {isFullyPaid ? "Cash Received (for change)" : "Amount"}
          </label>
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

        {/* UPI / Card reference */}
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

        {/* Change to return — shown for cash whenever customer over-pays */}
        {changeToReturn > 0 && (
          <div className="payment-balance-indicator change" style={{ marginBottom: 0, marginTop: 10 }}>
            <span>Return Change to Customer</span>
            <strong>₹{changeToReturn.toFixed(2)}</strong>
          </div>
        )}

        {/* Add Payment — only active when balance is still remaining */}
        {!isFullyPaid && (
          <button
            type="button"
            className="payment-add-btn"
            disabled={amountNum <= 0}
            onClick={handleAddPayment}
          >
            Add Payment · ₹{amountNum > 0 ? Math.min(amountNum, remaining) : 0}
          </button>
        )}

        {/* Settle & Close — shown once fully paid */}
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
