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

  const [localPayments, setLocalPayments] = useState([]);
  const [currentMethod, setCurrentMethod] = useState("cash");
  const [showCredit,   setShowCredit]   = useState(false);
  const [creditForm,   setCreditForm]   = useState(BLANK_CREDIT);
  const [creditError,  setCreditError]  = useState("");
  // Cash starts empty so denomination buttons build up from 0 (click ₹500 → 500, not 100+500=600).
  // UPI/Card pre-fill with the exact amount due since there's no denomination picking.
  const [currentAmount, setCurrentAmount] = useState("");
  const [currentRef,   setCurrentRef]   = useState("");
  const [loading,      setLoading]      = useState(false);
  const [customerList,   setCustomerList]   = useState([]);
  const [custSearch,     setCustSearch]     = useState("");
  const [showCustDrop,   setShowCustDrop]   = useState(false);
  const [existingCredit, setExistingCredit] = useState(null);
  const creditCheckTimer = useRef(null);

  useEffect(() => {
    if (!showCredit) return;
    api.get("/customers").then(list => setCustomerList(Array.isArray(list) ? list : [])).catch(() => {});
  }, [showCredit]); // eslint-disable-line react-hooks/exhaustive-deps

  const custDropList = custSearch.trim().length >= 1
    ? customerList.filter(c =>
        (c.name  || "").toLowerCase().includes(custSearch.toLowerCase()) ||
        (c.phone || "").includes(custSearch)
      ).slice(0, 8)
    : customerList.slice(0, 8);

  function pickCustomer(c) {
    setCreditForm({ name: c.name || "", gstin: c.gstin || "", address: c.address || "", phone: c.phone || "", poNumber: "" });
    setCustSearch(c.name || "");
    setShowCustDrop(false);
  }

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
          const total = unpaid.reduce((s, b) => { const p = b.payments?.find(p => p.method === "credit"); return s + (p?.amount || 0); }, 0);
          setExistingCredit({ count: unpaid.length, total, bills: unpaid });
        } else {
          setExistingCredit(null);
        }
      } catch { setExistingCredit(null); }
    }, 600);
    return () => { if (creditCheckTimer.current) clearTimeout(creditCheckTimer.current); };
  }, [creditForm.name, showCredit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!fin) return null;

  const preExistingPaid = fin.paid;
  const localPaid  = localPayments.reduce((s, p) => s + p.amount, 0);
  const remaining  = Math.max(fin.balance - localPaid, 0);
  const isFullyPaid = remaining === 0;
  const amountNum  = Number(currentAmount) || 0;

  const changeToReturn = currentMethod === "cash"
    ? (remaining > 0 ? Math.max(amountNum - remaining, 0) : Math.max(amountNum - fin.total, 0))
    : 0;

  async function handleSettle() {
    setLoading(true);
    try { await onSettle(localPayments); } finally { setLoading(false); }
  }

  async function handleCreditSettle() {
    if (!creditForm.name.trim()) { setCreditError("Customer / Company name is required."); return; }
    setCreditError("");
    setLoading(true);
    try {
      await onSettle([{
        method: "credit",
        amount: fin.balance > 0 ? fin.balance : fin.total,
        creditCustomer: {
          name:     creditForm.name.trim(),
          gstin:    creditForm.gstin.trim().toUpperCase() || null,
          address:  creditForm.address.trim()  || null,
          phone:    creditForm.phone.trim()    || null,
          poNumber: creditForm.poNumber.trim() || null,
        },
      }]);
      // Persist to customer master so this credit customer shows up in
      // future autocomplete (the generic Customer form already does this).
      api.post("/customers", {
        name:    creditForm.name.trim(),
        phone:   creditForm.phone.trim()   || "",
        gstin:   creditForm.gstin.trim().toUpperCase() || "",
        address: creditForm.address.trim() || "",
      }).catch(() => {});
    } finally { setLoading(false); }
  }

  async function handleCollect() {
    if (loading) return;
    if (isFullyPaid) { await handleSettle(); return; }
    const effectiveAmount = amountNum > 0 ? Math.min(amountNum, remaining) : remaining;
    if (effectiveAmount <= 0) return;
    const payment = { method: currentMethod, amount: effectiveAmount, reference: currentRef.trim() || undefined };
    const nextPayments = [...localPayments, payment];
    setLocalPayments(nextPayments);
    const newRemaining = Math.max(remaining - effectiveAmount, 0);
    if (newRemaining === 0) {
      setLoading(true);
      try { await onSettle(nextPayments); } finally { setLoading(false); }
    } else {
      setCurrentAmount(String(newRemaining));
      setCurrentRef("");
      setCurrentMethod("cash");
    }
  }

  const methodLabel = { cash: "Cash", upi: "UPI", card: "Card", phonepe: "PhonePe QR", credit: "Credit" };

  return (
    <div className="pay2-overlay" role="dialog" aria-modal="true">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="pay2-header">
        <button type="button" className="pay2-back" onClick={onClose}>← {tableLabel}</button>
        <span className="pay2-title">Collect Payment</span>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div className="pay2-scroll">

        {/* Amount Due */}
        <div className="pay2-amount-section">
          <p className="pay2-due-label">{isFullyPaid ? "AMOUNT PAID" : "AMOUNT DUE"}</p>
          <p className="pay2-due-value">₹{(isFullyPaid ? fin.total : remaining).toLocaleString("en-IN")}</p>
          {localPayments.length > 0 && !isFullyPaid && (
            <p className="pay2-partial-note">₹{localPaid} paid · ₹{remaining} remaining</p>
          )}
        </div>

        {/* Pre-existing payments */}
        {preExistingPaid > 0 && (
          <div className="pay2-section">
            <p className="pay2-section-label">Previously Paid</p>
            {(order.payments || []).map((p, i) => (
              <div key={i} className="pay2-paid-chip">
                <span>✓ {methodLabel[p.method] || p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span>₹{p.amount}</span>
              </div>
            ))}
          </div>
        )}

        {/* Method tabs */}
        {!showCredit && !isFullyPaid && (
          <div className="pay2-methods">
            {METHODS.map(m => (
              <button key={m.id} type="button"
                className={`pay2-method-tab${currentMethod === m.id ? " active" : ""}`}
                onClick={() => { setCurrentMethod(m.id); setCurrentRef(""); setCurrentAmount(m.id === "cash" ? "" : String(remaining > 0 ? remaining : fin.total)); }}>
                {m.label}
              </button>
            ))}
            {remaining > 0 && (
              <button type="button" className="pay2-method-tab"
                onClick={() => { setShowCredit(true); setCreditError(""); }}>
                Credit
              </button>
            )}
            {onPhonePeQR && remaining > 0 && (
              <button type="button" className="pay2-method-tab pay2-method-phonepe" onClick={onPhonePeQR}>
                PhonePe
              </button>
            )}
          </div>
        )}

        {/* Credit form */}
        {showCredit && (
          <div className="payment-credit-form">
            <div className="payment-credit-form-head">
              <span>📋 Credit Sale Details</span>
              <button type="button" className="payment-credit-close"
                onClick={() => { setShowCredit(false); setCurrentMethod("cash"); }}>✕</button>
            </div>
            <div className="payment-credit-amount-row">
              <span>Credit Amount</span>
              <strong>₹{remaining > 0 ? remaining : fin.total}</strong>
            </div>
            <div className="payment-credit-fields">
              <div className="pcf-field pcf-picker-wrap">
                <label>Company / Customer Name <span className="pcf-req">*</span></label>
                <input type="text" placeholder="Search saved customers or type new name…"
                  value={custSearch || creditForm.name} autoFocus autoComplete="off"
                  onChange={e => { setCustSearch(e.target.value); setCreditForm(p => ({ ...p, name: e.target.value })); setShowCustDrop(true); }}
                  onFocus={() => setShowCustDrop(true)}
                  onBlur={() => setTimeout(() => setShowCustDrop(false), 180)} />
                {showCustDrop && custDropList.length > 0 && (
                  <div className="pcf-drop">
                    {custDropList.map(c => (
                      <div key={c.id} className="pcf-drop-item" onMouseDown={() => pickCustomer(c)}>
                        <span className="pcf-drop-name">{c.name}</span>
                        <span className="pcf-drop-meta">{c.phone && `📞 ${c.phone}`}{c.gstin && ` · GST`}</span>
                      </div>
                    ))}
                  </div>
                )}
                {showCustDrop && custDropList.length === 0 && custSearch.trim().length > 0 && (
                  <div className="pcf-drop"><div className="pcf-drop-empty">No saved customer — will create new</div></div>
                )}
              </div>
              {existingCredit && (
                <div className="pcf-outstanding-warn">
                  <span className="pcf-warn-icon">⚠️</span>
                  <div className="pcf-warn-body">
                    <strong>{creditForm.name.trim()}</strong> has <strong>{existingCredit.count} unpaid bill{existingCredit.count > 1 ? "s" : ""}</strong> totalling{" "}
                    <strong>₹{Number(existingCredit.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                    <div className="pcf-warn-bills">
                      {existingCredit.bills.map(b => {
                        const p = b.payments?.find(p => p.method === "credit");
                        return <span key={b.id} className="pcf-warn-bill-chip">Bill #{b.billNo || b.orderNumber} · ₹{Number(p?.amount || 0).toLocaleString("en-IN")}</span>;
                      })}
                    </div>
                  </div>
                </div>
              )}
              <div className="pcf-field">
                <label>GSTIN <span className="pcf-optional">(optional — required for Tax Invoice)</span></label>
                <input type="text" placeholder="e.g. 29ABCDE1234F1Z5" value={creditForm.gstin}
                  onChange={e => setCreditForm(p => ({ ...p, gstin: e.target.value }))} maxLength={15} style={{ textTransform: "uppercase" }} />
              </div>
              <div className="pcf-field">
                <label>Address <span className="pcf-optional">(optional)</span></label>
                <input type="text" placeholder="Billing address" value={creditForm.address}
                  onChange={e => setCreditForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div className="pcf-row-2">
                <div className="pcf-field">
                  <label>Phone</label>
                  <input type="tel" placeholder="Contact number" value={creditForm.phone}
                    onChange={e => setCreditForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="pcf-field">
                  <label>PO / Ref No.</label>
                  <input type="text" placeholder="e.g. PO-2024-01" value={creditForm.poNumber}
                    onChange={e => setCreditForm(p => ({ ...p, poNumber: e.target.value }))} />
                </div>
              </div>
              {creditError && <p className="pcf-error">{creditError}</p>}
            </div>
          </div>
        )}

        {/* Cash: denomination grid */}
        {!showCredit && currentMethod === "cash" && !isFullyPaid && (
          <div className="pay2-denom-grid">
            {[100, 200, 500, 1000, 2000].map(amt => (
              <button key={amt} type="button" className="pay2-denom-btn"
                onClick={() => setCurrentAmount(String(amt))}>
                ₹{amt}
              </button>
            ))}
            <button type="button" className="pay2-denom-btn pay2-exact"
              onClick={() => setCurrentAmount(String(remaining))}>Exact</button>
            <input type="number" className="pay2-denom-input" placeholder="Amount"
              value={currentAmount} onChange={e => setCurrentAmount(e.target.value)} />
            <button type="button" className="pay2-denom-btn pay2-clear"
              onClick={() => setCurrentAmount("")}>Clear</button>
            <button type="button" className="pay2-denom-btn pay2-plus500"
              onClick={() => setCurrentAmount(String((Number(currentAmount) || 0) + 500))}>+₹500</button>
          </div>
        )}

        {/* UPI / Card: amount + optional ref */}
        {!showCredit && (currentMethod === "upi" || currentMethod === "card") && !isFullyPaid && (
          <div className="pay2-entry-section">
            <div className="pay2-entry-amount-row">
              <span className="pay2-rupee-big">₹</span>
              <input type="number" className="pay2-entry-amount" autoFocus
                value={currentAmount} onChange={e => setCurrentAmount(e.target.value)} />
            </div>
            <input type="text" className="pay2-ref-field"
              placeholder={currentMethod === "upi" ? "UPI Transaction ID (optional)" : "Card Last 4 / Reference (optional)"}
              value={currentRef} onChange={e => setCurrentRef(e.target.value)} />
          </div>
        )}

        {/* Payments added this session */}
        {localPayments.length > 0 && (
          <div className="pay2-section">
            <p className="pay2-section-label">Payments Added</p>
            {localPayments.map((p, i) => (
              <div key={i} className="pay2-paid-chip">
                <span>✓ {methodLabel[p.method]}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span>₹{p.amount}</span>
              </div>
            ))}
          </div>
        )}

        {/* Amount Received / Change to Return */}
        {!showCredit && (
          <div className="pay2-summary-rows">
            <div className="pay2-summary-row">
              <span>Amount Received</span>
              <span>₹{isFullyPaid ? fin.total : (amountNum || 0)}</span>
            </div>
            <div className={`pay2-summary-row${changeToReturn > 0 ? " pay2-change-row" : ""}`}>
              <span>Change to Return</span>
              <span>{changeToReturn > 0 ? `₹${Math.round(changeToReturn)}` : "—"}</span>
            </div>
          </div>
        )}

      </div>

      {/* ── Sticky footer ────────────────────────────────────────────────── */}
      <div className="pay2-footer">
        {showCredit ? (
          <button type="button" className="pay2-collect-btn pay2-credit-btn"
            disabled={loading} onClick={handleCreditSettle}>
            {loading ? <span className="pos-spinner" /> : `✓ Confirm Credit · ₹${remaining > 0 ? remaining : fin.total}`}
          </button>
        ) : isFullyPaid ? (
          <button type="button" className="pay2-collect-btn"
            disabled={loading} onClick={handleSettle}>
            {loading ? <span className="pos-spinner" /> : `✓ Settle & Close · ₹${fin.total}`}
          </button>
        ) : (
          <button type="button" className="pay2-collect-btn"
            disabled={loading} onClick={handleCollect}>
            {loading ? <span className="pos-spinner" /> : `Collect ₹${remaining.toLocaleString("en-IN")}`}
          </button>
        )}
      </div>

    </div>
  );
}
