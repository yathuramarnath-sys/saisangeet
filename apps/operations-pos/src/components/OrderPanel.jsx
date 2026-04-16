export function getFinancials(order) {
  if (!order) return null;
  const subtotal = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmt = Math.min(order.discountAmount || 0, subtotal);
  const afterDiscount = subtotal - discountAmt;
  const taxRate = 0.05; // 5% GST
  const tax = afterDiscount * taxRate;
  const total = Math.round(afterDiscount + tax);
  const paid = (order.payments || []).reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(total - paid, 0);
  return { subtotal, discountAmt, tax, total, paid, balance };
}

export function OrderPanel({
  order,
  tableLabel,
  onChangeQty,
  onRemoveItem,
  onNoteChange,
  onSendKOT,
  onRequestBill,
  onOpenPayment,
  onGuestsChange,
  onDiscountChange
}) {
  if (!order) {
    return (
      <div className="order-panel order-panel-empty">
        <div className="order-empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="14" rx="3" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>
        <p>Select a table to begin</p>
      </div>
    );
  }

  const fin = getFinancials(order);
  const hasItems = order.items?.length > 0;
  const unsentItems = (order.items || []).filter((i) => !i.sentToKot);

  return (
    <div className="order-panel">
      {/* Header */}
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
              placeholder="Guests"
              onChange={(e) => onGuestsChange(Number(e.target.value))}
            />
            {" "}guests
          </p>
        </div>
        <div className="order-head-status">
          {order.billRequested && <span className="order-badge bill">Bill Req.</span>}
          {order.voidRequested && <span className="order-badge void">Void Req.</span>}
          {order.isClosed && <span className="order-badge closed">Closed</span>}
        </div>
      </div>

      {/* Items list */}
      <div className="order-items">
        {!hasItems && (
          <p className="order-items-empty">Add items from the menu</p>
        )}
        {(order.items || []).map((item, idx) => (
          <div key={item.id || idx} className={`order-item${item.sentToKot ? " sent" : ""}`}>
            <div className="order-item-main">
              <span className="order-item-name">{item.name}</span>
              {item.sentToKot && <span className="order-item-kot-tag">KOT</span>}
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
                  aria-label="Remove"
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

      {/* Discount */}
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

      {/* Totals */}
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

      {/* Actions */}
      {!order.isClosed && (
        <div className="order-actions">
          {unsentItems.length > 0 && (
            <button type="button" className="pos-btn kot" onClick={onSendKOT}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5"/><polyline points="9 11 12 14 22 4"/></svg>
              Send KOT ({unsentItems.length})
            </button>
          )}
          {hasItems && !order.billRequested && (
            <button type="button" className="pos-btn bill-req" onClick={onRequestBill}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Request Bill
            </button>
          )}
          {hasItems && (
            <button type="button" className="pos-btn pay" onClick={onOpenPayment}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              Collect Payment
            </button>
          )}
        </div>
      )}
    </div>
  );
}
