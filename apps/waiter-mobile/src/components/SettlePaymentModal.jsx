import { tapImpact } from "../lib/haptics";

export function SettlePaymentModal({ order, defaultTaxRate = 0, onCollect, onCancel }) {
  const billable = (order?.items || []).filter(i => !i.isVoided && !i.isComp);
  const subtotal = billable.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  const tax      = Math.round(billable.reduce((s, i) => {
    const r = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : defaultTaxRate;
    return s + (i.price || 0) * (i.quantity || 0) * r / 100;
  }, 0));
  const total    = subtotal + tax;

  return (
    <>
      <div className="spm-backdrop" onClick={onCancel} />
      <div className="spm-sheet">
        <div className="spm-handle" />

        <p className="spm-title">Collect Payment</p>

        {/* Itemized breakdown */}
        <div className="spm-items">
          {billable.map((item, idx) => (
            <div key={item.id || idx} className="spm-item-row">
              <span className="spm-item-name">{item.name}</span>
              <span className="spm-item-qty">×{item.quantity}</span>
              <span className="spm-item-price">₹{((item.price || 0) * (item.quantity || 0)).toLocaleString("en-IN")}</span>
            </div>
          ))}
          <div className="spm-subtotals">
            <div className="spm-subtotal-row">
              <span>Subtotal</span>
              <span>₹{subtotal.toLocaleString("en-IN")}</span>
            </div>
            {tax > 0 && (
              <div className="spm-subtotal-row">
                <span>GST</span>
                <span>₹{tax.toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
        </div>

        <p className="spm-amount">₹{total.toLocaleString("en-IN")}</p>
        <p className="spm-hint">Select payment method</p>

        <div className="spm-methods">
          <button
            className="spm-method-btn spm-upi"
            onClick={() => { tapImpact(); onCollect("upi"); }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            UPI
          </button>
          <button
            className="spm-method-btn spm-card"
            onClick={() => { tapImpact(); onCollect("card"); }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
              <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            Card
          </button>
        </div>

        <button className="spm-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
