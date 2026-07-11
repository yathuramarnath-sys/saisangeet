import { tapImpact } from "../lib/haptics";

function formatTime(isoStr) {
  if (!isoStr) return "";
  return new Date(isoStr).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function KotReprintScreen({ kot, onReprint, onRetry, onVoid, onClose }) {
  if (!kot) return null;

  const isSent   = !!kot.kotNumber && !kot.failedAt;
  const isFailed = !!kot.failedAt;
  const sentTime = formatTime(kot.sentAt || kot.createdAt);
  const kotLabel = kot.kotNumber ? `KOT #${kot.kotNumber}` : "Queued KOT";

  const items = (kot.items || []).filter(i => !i.isVoided);
  const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  const tax      = items.reduce((s, i) => {
    const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    return s + Math.round((i.price || 0) * (i.quantity || 0) * rate / 100);
  }, 0);
  const total = subtotal + tax;

  return (
    <div className="kotdr-page">
      {/* Header */}
      <div className="kotdr-header">
        <button className="kotdr-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="kotdr-header-text">
          <h2 className="kotdr-title">{kotLabel}</h2>
          <p className="kotdr-subtitle">
            {[kot.tableNumber ? `Table T${kot.tableNumber}` : "", kot.areaName].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="kotdr-scroll">
        {/* Ticket card */}
        <div className="kotdr-ticket-card">
          <div className="kotdr-ticket-top">
            <span className="kotdr-ticket-eyebrow">Kitchen Ticket</span>
            {isSent ? (
              <span className="kotdr-status-pill kotdr-status-sent">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Sent
              </span>
            ) : (
              <span className="kotdr-status-pill kotdr-status-failed">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Failed
              </span>
            )}
          </div>
          <p className="kotdr-ticket-number">{kotLabel}</p>
          <p className="kotdr-ticket-meta">
            {[
              kot.tableNumber ? `Table T${kot.tableNumber}` : "",
              kot.areaName,
              sentTime,
            ].filter(Boolean).join(" · ")}
          </p>

          <div className="kotdr-divider" />

          {items.map((item, idx) => {
            const mods = [item.variant, ...(item.addons || [])].filter(Boolean);
            if (item.note) mods.push(item.note);
            const lineTotal = (item.price || 0) * (item.quantity || 0);
            return (
              <div key={item.id || idx} className="kotdr-item-row">
                <div className="kotdr-item-left">
                  <span className="kotdr-item-name">
                    {item.name}
                    <span className="kotdr-item-qty"> ×{item.quantity}</span>
                  </span>
                  {mods.length > 0 && (
                    <span className="kotdr-item-mods">{mods.join(" · ")}</span>
                  )}
                </div>
                <span className="kotdr-item-price">
                  ₹{lineTotal.toLocaleString("en-IN")}
                </span>
              </div>
            );
          })}

          <div className="kotdr-total-row">
            <span className="kotdr-total-label">{items.length} item{items.length !== 1 ? "s" : ""}</span>
            <span className="kotdr-total-amount">₹{total.toLocaleString("en-IN")}</span>
          </div>
        </div>

        {/* Last printed info */}
        {kot.lastPrinted && (
          <div className="kotdr-last-printed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            <span className="kotdr-last-printed-text">
              Last printed {formatTime(kot.lastPrinted)}
              {kot.printer ? ` · ${kot.printer}` : ""}
            </span>
          </div>
        )}

        {/* Void action — only for sent KOTs */}
        {isSent && onVoid && (
          <button className="kotdr-void-btn" onClick={() => { tapImpact(); onVoid(kot); }}>
            <span className="kotdr-void-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
            </span>
            <span className="kotdr-void-label">Void an item</span>
            <span className="kotdr-void-hint"> · needs manager</span>
          </button>
        )}
      </div>

      {/* Bottom actions */}
      <div className="kotdr-bottom">
        {isSent && onReprint ? (
          <button className="kotdr-reprint-btn" onClick={() => { tapImpact(); onReprint(kot); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Reprint KOT
          </button>
        ) : (
          onRetry && (
            <button className="kotdr-retry-btn" onClick={() => { tapImpact(); onRetry(kot); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
              </svg>
              Retry sending
            </button>
          )
        )}
      </div>
    </div>
  );
}
