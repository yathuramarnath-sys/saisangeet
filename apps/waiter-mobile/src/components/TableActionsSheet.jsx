import { tapImpact } from "../lib/haptics";

export function TableActionsSheet({
  tableNumber, areaName, order, defaultTaxRate = 0,
  onClose, onMoveTable, onPrintBill, onMarkFree, onSplitBill,
  // kept for API compatibility but not rendered in this design:
  onMerge, onCustomerInfo, onEditOrder, onSendKOT,
}) {
  const items    = order?.items || [];
  const billable = items.filter(i => !i.isVoided && !i.isComp);
  const guests   = order?.covers || order?.guests || null;

  const subtotal = billable.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  const tax      = billable.reduce((s, i) => {
    const r = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : defaultTaxRate;
    return s + Math.round((i.price || 0) * (i.quantity || 0) * r / 100);
  }, 0);
  const total = subtotal + tax;

  const subtitle = [
    areaName || null,
    guests ? `${guests} guests` : null,
    total > 0 ? `₹${total.toLocaleString("en-IN")} running` : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <div className="tas2-backdrop" onClick={onClose} />
      <div className="tas2-sheet">
        <div className="tas2-handle" />

        {/* Header */}
        <div className="tas2-header">
          <p className="tas2-table-num">Table {tableNumber}</p>
          {subtitle && <p className="tas2-subtitle">{subtitle}</p>}
        </div>

        {/* Body — two cards */}
        <div className="tas2-body">

          {/* Main actions card */}
          <div className="tas2-card">
            {billable.length > 0 && (
              <>
                <button
                  className="tas2-row"
                  onClick={() => { tapImpact(); onPrintBill?.(); onClose(); }}
                >
                  <span className="tas2-row-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 6 2 18 2 18 9"/>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                      <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                  </span>
                  <span className="tas2-row-label">Print Bill</span>
                  <svg className="tas2-row-chevron" width="16" height="16" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
                <div className="tas2-divider" />
                {onSplitBill && (
                  <>
                    <button
                      className="tas2-row"
                      onClick={() => { tapImpact(); onSplitBill(); onClose(); }}
                    >
                      <span className="tas2-row-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="2" x2="12" y2="22"/>
                          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                        </svg>
                      </span>
                      <span className="tas2-row-label">Split Bill</span>
                      <svg className="tas2-row-chevron" width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                    <div className="tas2-divider" />
                  </>
                )}
              </>
            )}

            <button
              className="tas2-row"
              onClick={() => { tapImpact(); onMoveTable?.(); }}
            >
              <span className="tas2-row-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="5 9 2 12 5 15"/>
                  <polyline points="9 5 12 2 15 5"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <line x1="12" y1="2" x2="12" y2="22"/>
                  <polyline points="15 19 12 22 9 19"/>
                  <polyline points="19 9 22 12 19 15"/>
                </svg>
              </span>
              <span className="tas2-row-label">Move table</span>
              <svg className="tas2-row-chevron" width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          {/* Danger card */}
          <div className="tas2-card">
            <button
              className="tas2-row tas2-row-danger"
              onClick={() => { tapImpact(); onMarkFree?.(); }}
            >
              <span className="tas2-row-icon tas2-row-icon-danger">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                  <line x1="9.5" y1="14.5" x2="14.5" y2="19.5"/>
                  <line x1="14.5" y1="14.5" x2="9.5" y2="19.5"/>
                </svg>
              </span>
              <span className="tas2-row-label tas2-row-label-danger">Mark table as free</span>
              <svg className="tas2-row-chevron" width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

        </div>

        {/* Cancel */}
        <button className="tas2-cancel" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}
