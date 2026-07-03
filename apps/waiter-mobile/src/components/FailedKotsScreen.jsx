function failedAgo(isoTs) {
  if (!isoTs) return "";
  const mins = Math.floor((Date.now() - new Date(isoTs).getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ago`;
}

export function FailedKotsScreen({ pendingKots, onRetry, onRetryAll, onClear, onClose }) {
  return (
    <div className="fkot-page">
      <div className="fkot-header">
        <button className="fkot-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 className="fkot-title">Pending KOTs</h2>
        {pendingKots.length > 0 && (
          <span className="fkot-count-badge">{pendingKots.length}</span>
        )}
      </div>

      {pendingKots.length === 0 ? (
        <div className="fkot-empty">
          <div className="fkot-empty-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p className="fkot-empty-title">All caught up!</p>
          <p className="fkot-empty-sub">No pending KOTs to retry.</p>
        </div>
      ) : (
        <>
          <div className="fkot-warn-bar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 9v4M12 17h.01"/>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
            No connection — KOTs queued for retry
          </div>

          <div className="fkot-scroll">
            {pendingKots.map((kot) => (
              <div key={kot.id} className="fkot-card">
                <div className="fkot-card-header">
                  <span className="fkot-table">Table {kot.tableNumber}</span>
                  <span className="fkot-area">{kot.areaName}</span>
                  <span className="fkot-time">{failedAgo(kot.failedAt)}</span>
                </div>
                <div className="fkot-items">
                  {(kot.items || []).slice(0, 3).map((i) => (
                    <span key={i.id || i.name} className="fkot-item-chip">
                      {i.name} ×{i.quantity}
                    </span>
                  ))}
                  {(kot.items || []).length > 3 && (
                    <span className="fkot-item-chip fkot-more">
                      +{kot.items.length - 3} more
                    </span>
                  )}
                </div>
                <div className="fkot-card-actions">
                  <button className="fkot-clear-btn" onClick={() => onClear(kot.id)}>
                    Dismiss
                  </button>
                  <button className="fkot-retry-btn" onClick={() => onRetry(kot)}>
                    Retry
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="fkot-bottom">
            <button className="fkot-retry-all-btn" onClick={onRetryAll}>
              Retry All · {pendingKots.length} KOT{pendingKots.length !== 1 ? "s" : ""}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
