import { tapImpact } from "../lib/haptics";

function timeSince(ts) {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

/**
 * KotDetailScreen — full-screen list of KOTs that failed to send, with
 * per-KOT retry/clear and a retry-all action. Opened from the "Unsuccessful
 * KOT" row in the drawer's flat list.
 *
 * Props:
 *   pendingKots  array
 *   syncFailed   number  — failed order-sync mutations (also retrying automatically)
 *   printFailed  number  — failed bill/KOT prints (also retrying automatically)
 *   onRetryKot   (kot)
 *   onRetryAll   ()
 *   onClearKot   (kotId)
 *   onClose      ()
 */
export function KotDetailScreen({
  pendingKots = [], syncFailed = 0, printFailed = 0,
  onRetryKot, onRetryAll, onClearKot, onClose,
}) {
  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button className="settings-back" onClick={onClose}>←</button>
        <span className="settings-title">Unsuccessful KOT</span>
      </div>

      <div className="settings-body">
        {(syncFailed > 0 || printFailed > 0) && (
          <div className="drawer-section">
            {syncFailed > 0 && (
              <div className="drawer-empty-row" style={{ color: "#f59e0b", fontWeight: 600 }}>
                <span>⚠️</span>
                <span>
                  {syncFailed} action{syncFailed !== 1 ? "s" : ""} failed to sync — retrying automatically
                </span>
              </div>
            )}
            {printFailed > 0 && (
              <div className="drawer-empty-row" style={{ color: "#ef4444", fontWeight: 600 }}>
                <span>🖨️</span>
                <span>
                  {printFailed} print{printFailed !== 1 ? "s" : ""} failed — check printer connection
                </span>
              </div>
            )}
          </div>
        )}

        <div className="drawer-section">
          {pendingKots.length === 0 ? (
            <div className="drawer-empty-row">
              <span className="drawer-empty-icon">✅</span>
              <span>All KOTs sent successfully</span>
            </div>
          ) : (
            <>
              {pendingKots.map((kot) => (
                <div key={kot.id} className="drawer-kot-row">
                  <div className="drawer-kot-info">
                    <span className="drawer-kot-table">Table {kot.tableNumber}</span>
                    <span className="drawer-kot-items">
                      {kot.items?.length || 0} item{(kot.items?.length || 0) !== 1 ? "s" : ""}
                      {" · "}
                      {kot.areaName}
                    </span>
                    {kot.failedAt && (
                      <span className="drawer-kot-time">
                        Failed {timeSince(kot.failedAt)}
                      </span>
                    )}
                  </div>
                  <div className="drawer-kot-actions">
                    <button
                      className="drawer-kot-retry"
                      onClick={() => { tapImpact(); onRetryKot(kot); }}
                    >
                      Retry
                    </button>
                    <button
                      className="drawer-kot-clear"
                      onClick={() => { tapImpact(); onClearKot(kot.id); }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              {pendingKots.length > 1 && (
                <button
                  className="drawer-action-btn drawer-action-warn"
                  onClick={() => { tapImpact(); onRetryAll(); }}
                >
                  <span>🔄</span>
                  <span>Retry All ({pendingKots.length})</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
