import { useState } from "react";
import { getFinancials } from "./OrderPanel";

const METHODS = [
  { id: "cash", label: "Cash", icon: "₹" },
  { id: "upi", label: "UPI", icon: "⚡" },
  { id: "card", label: "Card", icon: "💳" }
];

export function PaymentSheet({ order, tableLabel, onClose, onSettle }) {
  const fin = getFinancials(order);
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState(String(fin?.balance || fin?.total || ""));
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);

  if (!fin) return null;

  const amountNum = Number(amount) || 0;
  const remaining = Math.max(fin.total - amountNum, 0);
  const change = amountNum > fin.total ? amountNum - fin.total : 0;

  async function handleSettle() {
    if (amountNum <= 0) return;
    setLoading(true);
    try {
      await onSettle({ method, amount: amountNum, reference: ref || undefined });
    } finally {
      setLoading(false);
    }
  }

  const quickAmounts = method === "cash"
    ? [fin.total, Math.ceil(fin.total / 100) * 100, Math.ceil(fin.total / 500) * 500]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 3)
    : [];

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

        {/* Payment method */}
        <div className="payment-methods">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`payment-method-btn${method === m.id ? " active" : ""}`}
              onClick={() => setMethod(m.id)}
            >
              <span className="payment-method-icon">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Amount input */}
        <div className="payment-amount-wrap">
          <label className="payment-amount-label">Amount Received</label>
          <div className="payment-amount-input-wrap">
            <span className="payment-rupee">₹</span>
            <input
              className="payment-amount-input"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          {quickAmounts.length > 0 && (
            <div className="payment-quick-amounts">
              {quickAmounts.map((qa) => (
                <button key={qa} type="button" className="payment-quick-btn" onClick={() => setAmount(String(qa))}>
                  ₹{qa}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* UPI/Card reference */}
        {(method === "upi" || method === "card") && (
          <div className="payment-ref-wrap">
            <label className="payment-amount-label">{method === "upi" ? "UPI Reference" : "Card Last 4 / Ref"}</label>
            <input
              className="payment-ref-input"
              type="text"
              placeholder={method === "upi" ? "Transaction ID" : "Last 4 digits"}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
            />
          </div>
        )}

        {/* Change / Balance */}
        {method === "cash" && change > 0 && (
          <div className="payment-change">
            <span>Return Change</span>
            <strong>₹{change.toFixed(2)}</strong>
          </div>
        )}
        {remaining > 0 && amountNum > 0 && (
          <div className="payment-balance">
            <span>Balance Remaining</span>
            <strong>₹{remaining.toFixed(2)}</strong>
          </div>
        )}

        {/* Settle button */}
        <button
          type="button"
          className="payment-settle-btn"
          disabled={amountNum <= 0 || loading}
          onClick={handleSettle}
        >
          {loading ? (
            <span className="pos-spinner" />
          ) : remaining > 0 ? (
            `Add Payment · ₹${amountNum}`
          ) : (
            `Settle & Close · ₹${fin.total}`
          )}
        </button>
      </div>
    </div>
  );
}
