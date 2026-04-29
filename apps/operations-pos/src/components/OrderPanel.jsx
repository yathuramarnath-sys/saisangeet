import { useState } from "react";

// ── Financials ─────────────────────────────────────────────────────────────────
export function getFinancials(order) {
  if (!order) return null;
  const items      = order.items || [];
  const subtotal   = items.filter(i => !i.isVoided && !i.isComp)
    .reduce((s, i) => s + i.price * i.quantity, 0);
  const compTotal  = items.filter(i => i.isComp && !i.isVoided)
    .reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmt = Math.min(order.discountAmount || 0, subtotal);
  const afterDiscount = subtotal - discountAmt;
  const taxRate    = 0.05;
  const tax        = afterDiscount * taxRate;
  const total      = Math.round(afterDiscount + tax);
  const paid       = (order.payments || []).reduce((s, p) => s + p.amount, 0);
  const balance    = Math.max(total - paid, 0);
  return { subtotal, compTotal, discountAmt, tax, total, paid, balance };
}

// ── Transfer Table mini-modal ─────────────────────────────────────────────────
function TransferModal({ tableAreas, orders, currentId, onTransfer, onClose }) {
  function getStatus(tid) {
    const o = orders[tid];
    if (!o || !o.items?.length) return "free";
    if (o.isClosed)  return "closed";
    if (o.isOnHold)  return "hold";
    return "occupied";
  }

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sm-modal" style={{ maxWidth: 360 }}>
        <div className="sm-head">
          <div><h3>Transfer Table</h3><p className="sm-sub">Select a free table</p></div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="sm-body" style={{ gap: 14 }}>
          {tableAreas.map(area => (
            <div key={area.id}>
              <div className="sm-area-lbl">{area.name}</div>
              <div className="sm-tbl-grid">
                {area.tables.map(t => {
                  const st = getStatus(t.id);
                  const isFree = st === "free" && t.id !== currentId;
                  return (
                    <button key={t.id} type="button"
                      className={`sm-tbl-btn ${st}${!isFree ? " disabled" : ""}`}
                      disabled={!isFree}
                      onClick={() => { onTransfer(t.id); onClose(); }}>
                      {t.number}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── VoidReasonPicker ─────────────────────────────────────────────────────────
const VOID_REASONS = ["Wrong order","Customer changed mind","Item unavailable","Duplicate entry","Other"];

function VoidPicker({ onVoid, onCancel }) {
  const [reason, setReason] = useState(VOID_REASONS[0]);
  return (
    <div className="void-picker">
      <p className="void-picker-label">Void reason</p>
      <div className="void-picker-reasons">
        {VOID_REASONS.map(r => (
          <button key={r} type="button"
            className={`void-reason-pill${reason === r ? " active" : ""}`}
            onClick={() => setReason(r)}>{r}</button>
        ))}
      </div>
      <div className="void-picker-actions">
        <button type="button" className="sm-btn-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="void-confirm-btn" onClick={() => onVoid(reason)}>Void Item</button>
      </div>
    </div>
  );
}

// ── Main OrderPanel ────────────────────────────────────────────────────────────
export function OrderPanel({
  order,
  tableLabel,
  tableAreas,
  orders,
  onChangeQty,
  onRemoveItem,
  onNoteChange,
  onSendKOT,
  onRequestBill,
  onOpenPayment,
  onOpenSplitBill,
  onGuestsChange,
  onDiscountChange,
  onHoldToggle,
  onTransferTable,
  onOrderNoteChange,
  onCompToggle,
  onVoidItem,
  onReprintKOT,
  onPrintBill,
}) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [showNote,     setShowNote]     = useState(false);
  const [voidingIdx,   setVoidingIdx]   = useState(null); // index of item being voided

  if (!order) {
    return (
      <div className="order-panel order-panel-empty">
        <div className="order-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="14" rx="3"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
        </div>
        <p>Select a table to begin</p>
      </div>
    );
  }

  const fin         = getFinancials(order);
  const activeItems = (order.items || []).filter(i => !i.isVoided);
  const hasItems    = activeItems.length > 0;
  const unsentItems = activeItems.filter(i => !i.sentToKot && !i.isComp);
  const hasPaid     = fin && fin.paid > 0;
  const methodLabel = { cash: "Cash", upi: "UPI", card: "Card" };

  return (
    <div className="order-panel">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="order-panel-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="order-table-label">{tableLabel}</h3>
          <p className="order-meta">
            {order.areaName} ·{" "}
            <input className="guests-input" type="number" min="0" max="99"
              value={order.guests || ""} placeholder="0"
              onChange={e => onGuestsChange(Number(e.target.value))} />
            {" "}guests
          </p>
        </div>
        <div className="order-head-right">
          {order.isOnHold      && <span className="order-badge hold">On Hold</span>}
          {order.billRequested && <span className="order-badge bill">Bill Req.</span>}
          {order.voidRequested && <span className="order-badge void">Void</span>}
          {order.isClosed      && <span className="order-badge closed">Closed</span>}
        </div>
      </div>

      {/* ── Inline quick actions bar ──────────────────────────────────────── */}
      <div className="order-quick-bar">
        <button type="button"
          className={`oq-btn${order.isOnHold ? " active-hold" : ""}`}
          onClick={() => onHoldToggle?.()}>
          {order.isOnHold ? "▶ Resume" : "⏸ Hold"}
        </button>
        <button type="button" className="oq-btn"
          onClick={() => setShowTransfer(true)}>
          ⇄ Transfer
        </button>
        <button type="button"
          className={`oq-btn${showNote || order.orderNote ? " active-note" : ""}`}
          onClick={() => setShowNote(v => !v)}>
          📝 Note
        </button>
      </div>

      {/* ── Order Note ────────────────────────────────────────────────────── */}
      {(showNote || order.orderNote) && (
        <div className="order-note-wrap">
          <input
            className="order-note-input"
            type="text"
            placeholder="Order note (allergy, occasion, special request…)"
            value={order.orderNote || ""}
            onChange={e => onOrderNoteChange?.(e.target.value)}
          />
        </div>
      )}

      {/* ── Items list ────────────────────────────────────────────────────── */}
      <div className="order-items">
        {!hasItems && (
          <p className="order-items-empty">Add items from the menu →</p>
        )}

        {(order.items || []).map((item, idx) => (
          <div key={item.id || idx}
            className={`order-item${item.sentToKot ? " sent" : ""}${item.isVoided ? " voided" : ""}${item.isComp ? " comped" : ""}`}>

            {/* Void picker inline */}
            {voidingIdx === idx && (
              <VoidPicker
                onVoid={reason => { onVoidItem?.(idx, reason); setVoidingIdx(null); }}
                onCancel={() => setVoidingIdx(null)}
              />
            )}

            {voidingIdx !== idx && (
              <>
                <div className="order-item-top">
                  <div className="order-item-name-row">
                    <span className="order-item-name"
                      style={{ textDecoration: item.isVoided ? "line-through" : "none" }}>
                      {item.name}{item.unit ? <span className="order-item-unit">/{item.unit}</span> : null}
                    </span>
                    {item.sentToKot && !item.isVoided && (
                      <span className="order-item-kot-tag">KOT ✓</span>
                    )}
                    {item.isComp && (
                      <span className="order-item-comp-tag">COMP</span>
                    )}
                    {item.isVoided && (
                      <span className="order-item-void-tag">VOID</span>
                    )}
                  </div>
                  {/* Item actions: comp + void */}
                  {!item.isVoided && !order.isClosed && (
                    <div className="item-action-btns">
                      <button type="button"
                        className={`item-act-btn comp${item.isComp ? " on" : ""}`}
                        title={item.isComp ? "Remove comp" : "Complimentary"}
                        onClick={() => onCompToggle?.(idx)}>
                        🎁
                      </button>
                      <button type="button"
                        className="item-act-btn void"
                        title="Void item"
                        onClick={() => setVoidingIdx(idx)}>
                        🗑
                      </button>
                    </div>
                  )}
                </div>

                {!item.isVoided && (
                  <div className="order-item-controls">
                    {!item.sentToKot && (
                      <button type="button" className="qty-btn"
                        onClick={() => onChangeQty(idx, item.quantity - 1)}>−</button>
                    )}
                    <span className="qty-value">{item.quantity}</span>
                    {!item.sentToKot && (
                      <button type="button" className="qty-btn"
                        onClick={() => onChangeQty(idx, item.quantity + 1)}>+</button>
                    )}
                    <span className="order-item-price"
                      style={{ textDecoration: item.isComp ? "line-through" : "none", opacity: item.isComp ? 0.45 : 1 }}>
                      ₹{(item.price * item.quantity).toFixed(0)}
                    </span>
                    {item.isComp && <span className="order-item-comp-price">FREE</span>}
                    {!item.sentToKot && !item.isComp && (
                      <button type="button" className="order-item-remove"
                        onClick={() => onRemoveItem(idx)}>✕</button>
                    )}
                  </div>
                )}

                {!item.sentToKot && !item.isVoided && (
                  <input className="order-item-note" type="text"
                    placeholder="Note (less spicy, no onion…)"
                    value={item.note || ""}
                    onChange={e => onNoteChange(idx, e.target.value)} />
                )}

                {item.isVoided && item.voidReason && (
                  <p className="void-reason-display">Reason: {item.voidReason}</p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── Discount ──────────────────────────────────────────────────────── */}
      {hasItems && (
        <div className="order-discount">
          <label>
            <span>Discount (₹)</span>
            <input type="number" min="0"
              value={order.discountAmount || ""}
              placeholder="0"
              onChange={e => onDiscountChange(Number(e.target.value))} />
          </label>
        </div>
      )}

      {/* ── Totals ────────────────────────────────────────────────────────── */}
      {hasItems && fin && (
        <div className="order-totals">
          <div className="order-total-row">
            <span>Subtotal</span>
            <span>₹{fin.subtotal.toFixed(2)}</span>
          </div>
          {fin.compTotal > 0 && (
            <div className="order-total-row comp">
              <span>Complimentary</span>
              <span>−₹{fin.compTotal.toFixed(2)}</span>
            </div>
          )}
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

      {/* ── Payments recorded ─────────────────────────────────────────────── */}
      {hasPaid && fin && (
        <div className="order-payments-section">
          <p className="order-payments-label">Payments Recorded</p>
          {(order.payments || []).map((p, i) => (
            <div key={i} className="order-payment-chip">
              <span>{methodLabel[p.method] || p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
              <span>₹{p.amount}</span>
            </div>
          ))}
          {fin.balance > 0 && (
            <div className="order-balance-row">
              <span>Balance Remaining</span><span>₹{fin.balance}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      {!order.isClosed && !order.isOnHold && (
        <div className="order-actions">
          {/* Row 1: KOT + Split */}
          {(unsentItems.length > 0 || hasItems) && (
            <div className="order-actions-row">
              {unsentItems.length > 0 && (
                <button type="button" className="pos-btn kot" onClick={onSendKOT}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5"/>
                    <polyline points="9 11 12 14 22 4"/>
                  </svg>
                  Send KOT ({unsentItems.length})
                </button>
              )}
              {unsentItems.length === 0 && hasItems && onReprintKOT && (
                <button type="button" className="pos-btn kot" onClick={onReprintKOT}
                  title="Reprint last KOT to kitchen printer">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 1 0 .49-3.36"/>
                  </svg>
                  Reprint KOT
                </button>
              )}
              {hasItems && (
                <button type="button" className="pos-btn split" onClick={onOpenSplitBill}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l5.1 5.1M4 4l5 5"/>
                  </svg>
                  Split Bill
                </button>
              )}
            </div>
          )}

          {/* Row 2: Request Bill + Print Bill */}
          {hasItems && (
            <div className="order-actions-row">
              {!order.billRequested && (
                <button type="button" className="pos-btn bill-req" onClick={onRequestBill}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  Request Bill
                </button>
              )}
              {onPrintBill && (
                <button type="button" className="pos-btn print-bill" onClick={onPrintBill}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  Print Bill
                </button>
              )}
            </div>
          )}

          {/* Row 3: Collect Payment */}
          {hasItems && (
            <button type="button" className="pos-btn pay" onClick={onOpenPayment}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              {fin && fin.balance > 0 && fin.paid > 0
                ? `Pay Balance · ₹${fin.balance}`
                : `Collect Payment${fin && fin.total > 0 ? ` · ₹${fin.total}` : ""}`}
            </button>
          )}
        </div>
      )}

      {/* On Hold message */}
      {order.isOnHold && (
        <div className="order-on-hold-msg">
          <span>⏸ Order is on hold</span>
          <button type="button" className="pos-btn pay" style={{ marginTop: 8 }}
            onClick={() => onHoldToggle?.()}>
            ▶ Resume Order
          </button>
        </div>
      )}

      {/* Transfer modal */}
      {showTransfer && (
        <TransferModal
          tableAreas={tableAreas || []}
          orders={orders || {}}
          currentId={order.tableId}
          onTransfer={onTransferTable}
          onClose={() => setShowTransfer(false)}
        />
      )}
    </div>
  );
}
