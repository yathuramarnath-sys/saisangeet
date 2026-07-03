import { useEffect, useRef } from "react";

export function KotProgressOverlay({ kotState, onClose, onAddMore }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (kotState?.phase === "success") {
      timerRef.current = setTimeout(() => onClose(), 3000);
    }
    return () => clearTimeout(timerRef.current);
  }, [kotState?.phase]);

  if (!kotState) return null;

  if (kotState.phase === "sending") {
    return (
      <div className="kot-overlay">
        <div className="kot-sending-card">
          <div className="kot-spinner" />
          <p className="kot-sending-title">Sending to kitchen…</p>
          <p className="kot-sending-sub">
            {kotState.itemCount} item{kotState.itemCount !== 1 ? "s" : ""} · {kotState.tableLabel}
          </p>
          <div className="kot-progress-track">
            <div className="kot-progress-fill" />
          </div>
          <p className="kot-outlet-line">Connecting to outlet</p>
        </div>
      </div>
    );
  }

  if (kotState.phase === "success") {
    const kotNum = kotState.kotNumber
      ? `KOT-${String(kotState.kotNumber).padStart(4, "0")}`
      : "KOT";
    const timeStr = new Date().toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });

    return (
      <div className="kot-success-page">
        <div className="kot-success-icon-wrap">
          <div className="kot-success-halo" />
          <div className="kot-success-circle">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
              stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        </div>

        <h2 className="kot-success-title">Sent to kitchen</h2>
        <p className="kot-success-sub">
          {kotState.tableLabel} · {kotState.itemCount} item{kotState.itemCount !== 1 ? "s" : ""}
        </p>

        <div className="kot-ticket-card">
          <div className="kot-ticket-row">
            <span className="kot-ticket-label">KOT Number</span>
            <span className="kot-ticket-num">{kotNum}</span>
          </div>
          <div className="kot-ticket-divider" />
          <div className="kot-ticket-row">
            <span className="kot-ticket-label">Time</span>
            <span className="kot-ticket-time">{timeStr}</span>
          </div>
        </div>

        <p className="kot-return-hint">Returning to floor in 3s…</p>

        <div className="kot-success-btns">
          <button
            className="kot-addmore-btn"
            onClick={() => { clearTimeout(timerRef.current); onAddMore(); }}
          >
            Add more to {kotState.tableLabel}
          </button>
          <button
            className="kot-floor-btn"
            onClick={() => { clearTimeout(timerRef.current); onClose(); }}
          >
            Back to Floor
          </button>
        </div>
      </div>
    );
  }

  return null;
}
