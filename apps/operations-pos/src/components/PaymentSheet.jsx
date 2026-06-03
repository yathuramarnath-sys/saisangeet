import { useState, useEffect, useRef } from "react";
import { getFinancials } from "./OrderPanel";
import { api } from "../lib/api";

const METHODS = [
  { id: "cash", label: "Cash",  icon: "₹"  },
  { id: "upi",  label: "UPI",   icon: "⚡" },
  { id: "card", label: "Card",  icon: "💳" }
];

const BLANK_CREDIT = { name: "", gstin: "", address: "", phone: "", poNumber: "" };

export function PaymentSheet({ order, tableLabel, onClose, onSettle, onPhonePeQR, gstTreatment = "exclusive", outletId }) {
  const fin = getFinancials(order, { gstTreatment });

  // Local payments added during this modal session (not yet persisted)
  const [localPayments, setLocalPayments] = useState([]);
  const [currentMethod, setCurrentMethod] = useState("cash");
  // Credit sale state
  const [showCredit,   setShowCredit]   = useState(false);
  const [creditForm,   setCreditForm]   = useState(BLANK_CREDIT);
  const [creditError,  setCreditError]  = useState("");
  // Default to the remaining balance, or full total if already pre-paid (for change calc)
  const [currentAmount, setCurrentAmount] = useState(() => {
    const bal = fin?.balance ?? fin?.total ?? 0;
    return String(bal > 0 ? bal : (fin?.total ?? ""));
  });
  const [currentRef,    setCurrentRef]    = useState("");
  const [loading,       setLoading]       = useState(false);
  // Customer master — loaded when credit section opens
  const [customerList,    setCustomerList]    = useState([]);
  const [custSearch,      setCustSearch]      = useState("");
  const [showCustDrop,    setShowCustDrop]    = useState(false);
  // Outstanding credit warning
  const [existingCredit,  setExistingCredit]  = useState(null);
  const creditCheckTimer = useRef(null);

  // Load customer master when credit section opens
  useEffect(() => {
    if (!showCredit) return;
    api.get("/customers").then(list => setCustomerList(Array.isArray(list) ? list : [])).catch(() => {});
  }, [showCredit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered dropdown list
  const custDropList = custSearch.trim().length >= 1
    ? customerList.filter(c =>
        (c.name  || "").toLowerCase().includes(custSearch.toLowerCase()) ||
        (c.phone || "").includes(custSearch)
      ).slice(0, 8)
    : customerList.slice(0, 8);

  function pickCustomer(c) {
    setCreditForm({
      name:      c.name    || "",
      gstin:     c.gstin   || "",
      address:   c.address || "",
      phone:     c.phone   || "",
      poNumber:  "",
    });
    setCustSearch(c.name || "");
    setShowCustDrop(false);
  }

  // Outstanding credit check when customer name is set
  useEffect(() => {
    const name = creditForm.name.trim();
    if (!name || !showCredit) { setExistingCredit(null); return; }
    if (creditCheckTimer.current) clearTimeout(creditCheckTimer.current);
    creditCheckTimer.current = setTimeout(async () => {
      try {
        const credUrl = outletId ? `/operations/credits?outletId=${outletId}` : "/operations/credits";
        const all = await api.get(credUrl);
        const unpaid = (Array.isArray(all) ? all : []).filter(b =>
          b.creditStatus !== "paid" &&
          (b.creditCustomer?.name || "").trim().toLowerCase() === name.toLowerCase()
        );
        if (unpaid.length > 0) {
          const total = unpaid.reduce((s, b) => {
            const p = b.payments?.find(p => p.method === "credit");
            return s + (p?.amount || 0);
          }, 0);
          setExistingCredit({ count: unpaid.length, total, bills: unpaid });
        } else {
          setExistingCredit(null);
        }
      } catch { setExistingCredit(null); }
    }, 600);
    return () => { if (creditCheckTimer.current) clearTimeout(creditCheckTimer.current); };
  }, [creditForm.name, showCredit]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleCreditSettle() {
    if (!creditForm.name.trim()) { setCreditError("Customer / Company name is required."); return; }
    setCreditError("");
    setLoading(true);
    try {
      // Credit = full remaining balance settled as a single credit payment
      await onSettle([{
        method:        "credit",
        amount:        fin.balance > 0 ? fin.balance : fin.total,
        creditCustomer: {
          name:     creditForm.name.trim(),
          gstin:    creditForm.gstin.trim().toUpperCase() || null,
          address:  creditForm.address.trim()  || null,
          phone:    creditForm.phone.trim()    || null,
          poNumber: creditForm.poNumber.trim() || null,
        },
      }]);
    } finally {
      setLoading(false);
    }
  }

  const methodLabel = { cash: "Cash", upi: "UPI", card: "Card", phonepe: "PhonePe QR", credit: "Credit" };

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
        {/* Payment method selector + Credit option in one row */}
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
                if (showCredit) setShowCredit(false);
              }}
            >
              <span className="payment-method-icon">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
          {/* Credit Sale — shown as a 4th method button so it's always visible */}
          {!showCredit && remaining > 0 && (
            <button
              type="button"
              className="payment-method-btn payment-method-btn--credit"
              onClick={() => { setShowCredit(true); setCreditError(""); }}
            >
              <span className="payment-method-icon">📋</span>
              <span>Credit</span>
            </button>
          )}
        </div>

        {/* PhonePe QR — full-amount quick pay */}
        {onPhonePeQR && remaining > 0 && !showCredit && (
          <button
            type="button"
            className="payment-phonepe-btn"
            onClick={onPhonePeQR}
          >
            <span className="payment-phonepe-btn-icon">📱</span>
            Pay ₹{remaining} via PhonePe QR
          </button>
        )}

        {/* Credit customer form */}
        {showCredit && (
          <div className="payment-credit-form">
            <div className="payment-credit-form-head">
              <span>📋 Credit Sale Details</span>
              <button type="button" className="payment-credit-close" onClick={() => setShowCredit(false)}>✕</button>
            </div>
            <div className="payment-credit-amount-row">
              <span>Credit Amount</span>
              <strong>₹{remaining > 0 ? remaining : fin.total}</strong>
            </div>
            <div className="payment-credit-fields">
              {/* Customer search picker */}
              <div className="pcf-field pcf-picker-wrap">
                <label>Company / Customer Name <span className="pcf-req">*</span></label>
                <input
                  type="text"
                  placeholder="Search saved customers or type new name…"
                  value={custSearch || creditForm.name}
                  autoFocus
                  autoComplete="off"
                  onChange={e => {
                    setCustSearch(e.target.value);
                    setCreditForm(p => ({ ...p, name: e.target.value }));
                    setShowCustDrop(true);
                  }}
                  onFocus={() => setShowCustDrop(true)}
                  onBlur={() => setTimeout(() => setShowCustDrop(false), 180)}
                />
                {showCustDrop && custDropList.length > 0 && (
                  <div className="pcf-drop">
                    {custDropList.map(c => (
                      <div key={c.id} className="pcf-drop-item" onMouseDown={() => pickCustomer(c)}>
                        <span className="pcf-drop-name">{c.name}</span>
                        <span className="pcf-drop-meta">
                          {c.phone && `📞 ${c.phone}`}
                          {c.gstin && ` · GST`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {showCustDrop && custDropList.length === 0 && custSearch.trim().length > 0 && (
                  <div className="pcf-drop">
                    <div className="pcf-drop-empty">No saved customer — will create new</div>
                  </div>
                )}
              </div>
              {/* Outstanding credit warning */}
              {existingCredit && (
                <div className="pcf-outstanding-warn">
                  <span className="pcf-warn-icon">⚠️</span>
                  <div className="pcf-warn-body">
                    <strong>{creditForm.name.trim()}</strong> has <strong>{existingCredit.count} unpaid bill{existingCredit.count > 1 ? "s" : ""}</strong> totalling{" "}
                    <strong>₹{Number(existingCredit.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                    <div className="pcf-warn-bills">
                      {existingCredit.bills.map(b => {
                        const p = b.payments?.find(p => p.method === "credit");
                        return (
                          <span key={b.id} className="pcf-warn-bill-chip">
                            Bill #{b.billNo || b.orderNumber} · ₹{Number(p?.amount || 0).toLocaleString("en-IN")}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="pcf-field">
                <label>GSTIN <span className="pcf-optional">(optional — required for Tax Invoice)</span></label>
                <input
                  type="text"
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  value={creditForm.gstin}
                  onChange={e => setCreditForm(p => ({ ...p, gstin: e.target.value }))}
                  maxLength={15}
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              <div className="pcf-field">
                <label>Address <span className="pcf-optional">(optional)</span></label>
                <input
                  type="text"
                  placeholder="Billing address"
                  value={creditForm.address}
                  onChange={e => setCreditForm(p => ({ ...p, address: e.target.value }))}
                />
              </div>
              <div className="pcf-row-2">
                <div className="pcf-field">
                  <label>Phone</label>
                  <input
                    type="tel"
                    placeholder="Contact number"
                    value={creditForm.phone}
                    onChange={e => setCreditForm(p => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                <div className="pcf-field">
                  <label>PO / Ref No.</label>
                  <input
                    type="text"
                    placeholder="e.g. PO-2024-01"
                    value={creditForm.poNumber}
                    onChange={e => setCreditForm(p => ({ ...p, poNumber: e.target.value }))}
                  />
                </div>
              </div>
              {creditError && <p className="pcf-error">{creditError}</p>}
            </div>
            <button
              type="button"
              className="payment-credit-settle-btn"
              disabled={loading}
              onClick={handleCreditSettle}
            >
              {loading ? <span className="pos-spinner" /> : `✓ Confirm Credit · ₹${remaining > 0 ? remaining : fin.total}`}
            </button>
          </div>
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
