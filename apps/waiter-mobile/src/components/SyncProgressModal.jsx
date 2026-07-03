export function SyncProgressModal({ steps, outletName }) {
  const doneCount = steps.filter((s) => s.state === "done").length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="spm-overlay">
      <div className="spm-card">
        <div className="spm-heading">Syncing with {outletName || "POS"}</div>
        <div className="spm-steps">
          {steps.map((step, i) => (
            <div key={i} className="spm-step">
              <div className={`spm-icon spm-icon-${step.state}`}>
                {step.state === "done" ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : step.state === "syncing" ? (
                  <div className="spm-spinner" />
                ) : null}
              </div>
              <span className="spm-step-label">{step.label}</span>
              <span className={`spm-step-status spm-ss-${step.state}`}>
                {step.state === "done"
                  ? "Updated ✓"
                  : step.state === "syncing"
                  ? "Syncing..."
                  : "Waiting"}
              </span>
            </div>
          ))}
        </div>
        <div className="spm-track">
          <div className="spm-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
