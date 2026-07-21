import { tapImpact } from "../lib/haptics";

export function SettlePaymentModal({ total, onCollect, onCancel }) {
  return (
    <>
      <div className="spm-backdrop" onClick={onCancel} />
      <div className="spm-sheet">
        <div className="spm-handle" />

        <p className="spm-title">Collect Payment</p>
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
