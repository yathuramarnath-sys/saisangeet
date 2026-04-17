// ── Financials helper ─────────────────────────────────────────────────────────

export function getFinancials(order) {
  if (!order) return null;
  const subtotal    = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmt = Math.min(order.discountAmount || 0, subtotal);
  const afterDiscount = subtotal - discountAmt;
  const taxRate     = 0.05; // 5% GST
  const tax         = afterDiscount * taxRate;
  const total       = Math.round(afterDiscount + tax);
  const paid        = (order.payments || []).reduce((s, p) => s + p.amount, 0);
  const balance     = Math.max(total - paid, 0);
  return { subtotal, discountAmt, tax, total, paid, balance };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrderPanel({
  order,
  tableLabel,
  onChangeQty,
  onRemoveItem,
  onNoteChange,
  onSendKOT,
  onRequestBill,
  onOpenPayment,
  onOpenSplitBill,
  onGuestsChange,
  onDiscountChange
}) {
  if (!order) {
    return (
      <div className="order-panel order-panel-empty">
        <div className="order-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="14" rx="3" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>
        <p>Select a table to begin</p>
      </div>
    );
  }

  const fin         = getFinancials(order);
  const hasItems    = order.items?.length > 0;
  const unsentItems = (order.items || []).filter((i) => !i.sentToKot);
  const hasPaid     = fin && fin.paid > 0;

  const methodLabel = { cash: "Cash", upi: "UPI", card: "Card" };

  return (
    <div className="order-panel">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="order-panel-head">
        <div>
          <h3 className="order-table-label">{tableLabel}</h3>
          <p className="order-meta">
            {order.areaName} ·{" "}
            <input
              className="guests-input"
              type="number"
              min="0"
              max="20"
              value={order.guests || ""}
              placeholder="0"
              onChange={(e) => onGuestsChange(Number(e.target.value))}
            />
            {" "}guests
          </p>
        </div>
        <div className="order-head-right">
          {order.billRequested && <span className="order-badge bill">Bill Req.</span>}
          {order.voidRequested && <span className="order-badge void">Void</span>}
          {order.isClosed      && <span className="order-badge closed">Closed</span>}
        </div>
      </div>

      {/* ── Items list ─────────────────────────────────────────────────────── */}
      <div className="order-items">
        {!hasItems && (
          <p className="order-items-empty">Add items from the menu</p>
        )}
        {(order.items || []).map((item, idx) => (
          <div key={item.id || idx} className={`order-item${item.sentToKot ? " sent" : ""}`}>
            <div className="order-item-top">
              <div className="order-item-name-row">
                <span className="order-item-name">{item.name}</span>
                {item.sentToKot && <span className="order-item-kot-tag">KOT ✓</span>}
              </div>
            </div>
            <div className="order-item-controls">
              <button
                type="button"
                className="qty-btn"
                onClick={() => onChangeQty(idx, item.quantity - 1)}
              >−</button>
              <span className="qty-value">{item.quantity}</span>
              <button
                type="button"
                className="qty-btn"
                onClick={() => onChangeQty(idx, item.quantity + 1)}
              >+</button>
              <span className="order-item-price">₹{(item.price * item.quantity).toFixed(0)}</span>
              {!item.sentToKot && (
                <button
                  type="button"
                  className="order-item-remove"
                  onClick={() => onRemoveItem(idx)}
                  aria-label="Remove item"
                >✕</button>
              )}
            </div>
            {!item.sentToKot && (
              <input
                className="order-item-note"
                type="text"
                placeholder="Note (less spicy, no onion…)"
                value={item.note || ""}
                onChange={(e) => onNoteChange(idx, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Discount ───────────────────────────────────────────────────────── */}
      {hasItems && (
        <div className="order-discount">
          <label>
            <span>Discount (₹)</span>
            <input
              type="number"
              min="0"
              value={order.discountAmount || ""}
              placeholder="0"
              onChange={(e) => onDiscountChange(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {/* ── Totals ─────────────────────────────────────────────────────────── */}
      {hasItems && fin && (
        <div className="order-totals">
          <div className="order-total-row">
            <span>Subtotal</span>
            <span>₹{fin.subtotal.toFixed(2)}</span>
          </div>
          {fin.discountAmt > 0 && (
            <div className="order-total-row discount">
              <span>Discount</span>
              <span>−₹{fin.discountAmt.toFixed(2)}</span>
            </div>
          )}
          <div className="order-total-row">
            <span>GST (5%)</span>
            <span>₹{fin.tax.toFixed(2)}</span>
          </div>
          <div className="order-total-row total">
            <span>Total</span>
            <span>₹{fin.total}</span>
          </div>
        </div>
      )}

      {/* ── Payments recorded ──────────────────────────────────────────────── */}
      {hasPaid && fin && (
        <div className="order-payments-section">
          <p className="order-payments-label">Payments Recorded</p>
          {(order.payments || []).map((p, i) => (
            <div key={i} className="order-payment-chip">
              <span>{methodLabel[p.method] || p.method} {p.reference ? `· ${p.reference}` : ""}</span>
              <span>₹{p.amount}</span>
            </div>
          ))}
          {fin.balance > 0 && (
            <div className="order-balance-row">
              <span>Balance Remaining</span>
              <span>₹{fin.balance}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      {!order.isClosed && (
        <div className="order-actions">
          {/* Row 1: KOT + Split Bill */}
          {(unsentItems.length > 0 || hasItems) && (
            <div className="order-actions-row">
              {unsentItems.length > 0 && (
                <button type="button" className="pos-btn kot" onClick={onSendKOT}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5"/>
                    <polyline points="9 11 12 14 22 4"/>
                  </svg>
                  Send KOT ({unsentItems.length})
                </button>
              )}
              {hasItems && (
                <button type="button" className="pos-btn split" onClick={onOpenSplitBill}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l5.1 5.1M4 4l5 5"/>
                  </svg>
                  Split Bill
                </button>
              )}
            </div>
          )}

          {/* Row 2: Request Bill */}
          {hasItems && !order.billRequested && (
            <button type="button" className="pos-btn bill-req" onClick={onRequestBill}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Request Bill
            </button>
          )}

          {/* Row 3: Collect Payment */}
          {hasItems && (
            <button type="button" className="pos-btn pay" onClick={onOpenPayment}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              {fin && fin.balance > 0 && fin.paid > 0 ? `Pay Balance · ₹${fin.balance}` : "Collect Payment"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
