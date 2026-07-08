import { tapImpact } from "../lib/haptics";

export function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div className="lgm-overlay">
      <div className="lgm-card">
        <div className="lgm-icon-wrap">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
            stroke="#D92D20" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>
        <h2 className="lgm-title">Log out?</h2>
        <p className="lgm-body">
          You'll need your PIN to sign back in. Any unsent KOTs stay saved on this device.
        </p>
        <div className="lgm-btns">
          <button className="lgm-cancel-btn" onClick={() => { tapImpact(); onCancel(); }}>
            Cancel
          </button>
          <button className="lgm-confirm-btn" onClick={() => { tapImpact(); onConfirm(); }}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
