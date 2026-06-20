import { useState } from "react";
import { PinConfirm } from "./PinConfirm";

// ── Financials ─────────────────────────────────────────────────────────────────
// gstTreatment: "exclusive" (default) — GST added on top of price
//               "inclusive"           — GST extracted from price (customer pays same)
export function getFinancials(order, { gstTreatment = "exclusive" } = {}) {
  if (!order) return null;
  const inclusive     = gstTreatment === "inclusive";
  const items         = order.items || [];
  const billable      = items.filter(i => !i.isVoided && !i.isComp);
  const compTotal     = items.filter(i => i.isComp && !i.isVoided)
    .reduce((s, i) => s + i.price * i.quantity, 0);
  const subtotal      = billable.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmt   = Math.min(order.discountAmount || 0, subtotal);
  const afterDiscount = subtotal - discountAmt;

  const tax = billable.reduce((s, i) => {
    const lineAfter = subtotal > 0
      ? (i.price * i.quantity) * (afterDiscount / subtotal)
      : 0;
    const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 0;
    // Exclusive: tax added on top  → tax = base × rate/100
    // Inclusive: tax extracted      → tax = price × rate/(100+rate)
    return s + Math.round(lineAfter * rate / (inclusive ? (100 + rate) : 100));
  }, 0);

  // Exclusive: customer pays subtotal - disc + tax
  // Inclusive: customer pays subtotal - disc  (tax already inside)
  const total   = inclusive ? afterDiscount : afterDiscount + tax;
  const paid    = (order.payments || []).reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(total - paid, 0);
  return { subtotal, compTotal, discountAmt, tax, total, paid, balance, inclusive };
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

// ── DiscountPicker ───────────────────────────────────────────────────────────
// Single dropdown — cashier picks one rule or enters a custom ₹ amount.
// Only rendered when the logged-in cashier has canApplyDiscount=true.
function DiscountPicker({ discountRules, subtotal, currentAmount, onSelect }) {
  const [customAmt, setCustomAmt] = useState(currentAmount > 0 ? String(currentAmount) : "");

  function ruleAmount(rule) {
    if (rule.discountType === "flat") return Number(rule.value) || 0;
    return Math.round((subtotal || 0) * (rule.value || 0) / 100);
  }

  // Find which rule matches the current discount amount (if any)
  const activeRuleId = discountRules.find(r => {
    const amt = ruleAmount(r);
    return amt > 0 && amt === currentAmount;
  })?.id || (currentAmount > 0 ? "__custom__" : "");

  function handleChange(e) {
    const val = e.target.value;
    if (val === "") {
      onSelect(0);
      setCustomAmt("");
      return;
    }
    if (val === "__custom__") {
      setCustomAmt("");
      return;
    }
    const rule = discountRules.find(r => r.id === val);
    if (rule) {
      onSelect(ruleAmount(rule));
      setCustomAmt("");
    }
  }

  const showCustomInput = activeRuleId === "__custom__" ||
    (discountRules.length === 0);

  return (
    <div className="discount-picker-dropdown">
      {discountRules.length > 0 && (
        <select
          className="discount-select"
          value={activeRuleId}
          onChange={handleChange}
          style={{ fontSize: 13, padding: "3px 6px", borderRadius: 6, border: "1.5px solid #d1d5db", background: "#fff", cursor: "pointer", maxWidth: 160 }}
        >
          <option value="">— No Discount —</option>
          {discountRules.map(rule => (
            <option key={rule.id} value={rule.id}>
              {rule.name} {rule.discountType === "flat" ? `(₹${rule.value})` : `(${rule.value}%)`}
            </option>
          ))}
          <option value="__custom__">Custom ₹</option>
        </select>
      )}
      {showCustomInput && (
        <input
          className="discount-inline-input"
          type="number" min="0" step="0.01"
          value={customAmt}
          placeholder="₹ amount"
          style={{ width: 80, marginLeft: discountRules.length > 0 ? 6 : 0 }}
          onChange={e => {
            setCustomAmt(e.target.value);
            onSelect(Number(e.target.value) || 0);
          }}
        />
      )}
      {currentAmount > 0 && (
        <span style={{ marginLeft: 6, color: "#059669", fontWeight: 600, fontSize: 13 }}>
          −₹{currentAmount}
        </span>
      )}
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

// ── Counter checkout — payment-method-first quick flow ─────────────────────────
const METHODS_FOR_COUNTER = [
  { id: "cash",   label: "Cash",   icon: "₹"  },
  { id: "upi",    label: "UPI",    icon: "⚡" },
  { id: "card",   label: "Card",   icon: "💳" },
  { id: "credit", label: "Credit", icon: "📋" },
];

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
  onCancelOrder,
  onReprintKOT,
  onPrintBill,
  onCounterPrintBill,
  gstTreatment = "exclusive",
  discountRules = [],
  canApplyDiscount = false,
  cashierName = "",
  cashierPin  = "",
}) {
  const [showTransfer,    setShowTransfer]    = useState(false);
  const [counterMethod,   setCounterMethod]   = useState("cash");
  const [counterPrinting, setCounterPrinting] = useState(false);
  const [showNote,        setShowNote]        = useState(false);
  const [voidingIdx,      setVoidingIdx]      = useState(null);   // index of item being voided
  const [pinForVoidIdx,   setPinForVoidIdx]   = useState(null);   // waiting PIN before VoidPicker
  const [showCancelPin,   setShowCancelPin]   = useState(false);  // waiting PIN before cancel order
  const [showCancelConfirm, setShowCancelConfirm] = useState(false); // "Are you sure?" after PIN
  const [editingQtyIdx,   setEditingQtyIdx]   = useState(null);   // index of item whose qty is being typed
  const [editingQtyVal,  setEditingQtyVal]  = useState("");     // current typed value

  // Helper: does this cashier need a PIN check? (PIN set and not 0000)
  const needsPin = cashierPin && cashierPin !== "0000";

  function commitQtyEdit(idx) {
    const n = parseInt(editingQtyVal, 10);
    if (!isNaN(n) && n !== (order.items?.[idx]?.quantity || 1)) {
      onChangeQty(idx, n);  // n=0 removes the item (existing behaviour)
    }
    setEditingQtyIdx(null);
    setEditingQtyVal("");
  }

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

  const fin         = getFinancials(order, { gstTreatment });
  const activeItems = (order.items || []).filter(i => !i.isVoided);
  const hasItems    = activeItems.length > 0;
  const unsentItems = activeItems.filter(i => !i.sentToKot && !i.isComp);
  const hasPaid     = fin && fin.paid > 0;
  const methodLabel = { cash: "Cash", upi: "UPI", card: "Card" };

  return (
    <div className="order-panel">
      {/* ── Header — compact single row: area/guests + icons ─────────────── */}
      <div className="order-panel-head">
        <p className="order-meta" style={{ flex: 1, minWidth: 0 }}>
          {order.areaName} ·{" "}
          <input className="guests-input" type="number" min="0" max="99"
            value={order.guests || ""} placeholder="0"
            onChange={e => onGuestsChange(Number(e.target.value))} />
          {" "}guests
        </p>
        <div className="order-head-right">
          {!order.isClosed && (
            <>
              <button type="button"
                className={`oq-icon-btn${order.isOnHold ? " active-hold" : ""}`}
                title={order.isOnHold ? "Resume Order" : "Hold Order"}
                onClick={() => onHoldToggle?.()}>
                {order.isOnHold ? "▶" : "⏸"}
              </button>
              <button type="button" className="oq-icon-btn"
                title="Transfer Table"
                onClick={() => setShowTransfer(true)}>⇄</button>
              <button type="button"
                className={`oq-icon-btn${showNote || order.orderNote ? " active-note" : ""}`}
                title="Order Note"
                onClick={() => setShowNote(v => !v)}>✏️</button>
              {hasItems && (
                <button type="button" className="oq-icon-btn"
                  title="Split Bill"
                  onClick={onOpenSplitBill}>✂️</button>
              )}
              {hasItems && !order.isClosed && (
                <button type="button" className="oq-icon-btn cancel-icon-btn"
                  title="Cancel Order"
                  onClick={() => {
                    if (needsPin) { setShowCancelPin(true); }
                    else          { setShowCancelConfirm(true); }
                  }}>🗑</button>
              )}
            </>
          )}
          {order.isOnHold      && <span className="order-badge hold">On Hold</span>}
          {order.billRequested && <span className="order-badge bill">Bill Req.</span>}
          {order.voidRequested && <span className="order-badge void">Void</span>}
          {order.isClosed      && <span className="order-badge closed">Closed</span>}
        </div>
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

            {/* Void picker inline — shown after PIN confirmed */}
            {voidingIdx === idx && (
              <VoidPicker
                onVoid={reason => { onVoidItem?.(idx, reason); setVoidingIdx(null); }}
                onCancel={() => setVoidingIdx(null)}
              />
            )}

            {voidingIdx !== idx && (
              <>
                {/* Name + controls on one row */}
                <div className="order-item-row">
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
                  </div>

                  {!item.isVoided && (
                    <div className="order-item-controls">
                      {!item.sentToKot && (
                        <button type="button" className="qty-btn"
                          onClick={() => onChangeQty(idx, item.quantity - 1)}>−</button>
                      )}
                      {/* Tap qty number to type a value directly */}
                      {!item.sentToKot && editingQtyIdx === idx ? (
                        <input
                          className="qty-edit-input"
                          type="number"
                          min="0"
                          autoFocus
                          value={editingQtyVal}
                          onChange={e => setEditingQtyVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter")  { e.preventDefault(); commitQtyEdit(idx); }
                            if (e.key === "Escape") { setEditingQtyIdx(null); setEditingQtyVal(""); }
                          }}
                          onBlur={() => commitQtyEdit(idx)}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className={`qty-value${!item.sentToKot ? " qty-value-tap" : ""}`}
                          title={!item.sentToKot ? "Tap to edit quantity" : ""}
                          onClick={() => {
                            if (item.sentToKot) return;
                            setEditingQtyIdx(idx);
                            setEditingQtyVal(String(item.quantity));
                          }}
                        >{item.quantity}</span>
                      )}
                      {!item.sentToKot && (
                        <button type="button" className="qty-btn"
                          onClick={() => onChangeQty(idx, item.quantity + 1)}>+</button>
                      )}
                      <span className="order-item-price"
                        style={{ textDecoration: item.isComp ? "line-through" : "none", opacity: item.isComp ? 0.45 : 1 }}>
                        ₹{(item.price * item.quantity).toFixed(0)}
                      </span>
                      {item.isComp && <span className="order-item-comp-price">FREE</span>}
                      {/* Pre-KOT: free remove */}
                      {!item.sentToKot && !item.isComp && (
                        <button type="button" className="order-item-remove"
                          onClick={() => onRemoveItem(idx)}>✕</button>
                      )}
                      {/* Post-KOT: void requires cashier PIN */}
                      {item.sentToKot && !item.isComp && (
                        <button type="button" className="order-item-void-btn"
                          title="Void item (PIN required)"
                          onClick={() => {
                            if (needsPin) { setPinForVoidIdx(idx); }
                            else          { setVoidingIdx(idx); }
                          }}>
                          🚫
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Note: compact single line below */}
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

      {/* ── Totals + Discount inline ──────────────────────────────────────── */}
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
          {/* Discount — only visible for cashiers with canApplyDiscount=true */}
          {canApplyDiscount && (
            <div className="order-total-row discount-row">
              <span>Discount</span>
              <DiscountPicker
                discountRules={discountRules}
                subtotal={fin.subtotal}
                currentAmount={order.discountAmount || 0}
                onSelect={onDiscountChange}
              />
            </div>
          )}
          <div className="order-total-row">
            <span>GST</span>
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
          {/* Row 1: KOT + Split + Print Bill — all in one row */}
          {hasItems && (
            <div className="order-actions-row">
              {unsentItems.length > 0 ? (
                <button type="button" className="pos-btn kot" onClick={onSendKOT}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5"/>
                    <polyline points="9 11 12 14 22 4"/>
                  </svg>
                  KOT
                </button>
              ) : onReprintKOT ? (
                <button type="button" className="pos-btn kot" onClick={onReprintKOT}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 1 0 .49-3.36"/>
                  </svg>
                  Reprint
                </button>
              ) : null}
              {!order.isCounter && onPrintBill && (
                <button
                  type="button"
                  className={`pos-btn print-bill${order.billRequested ? " bill-reprinted" : ""}`}
                  onClick={onPrintBill}
                  title={order.billRequested ? "Bill already printed — click to reprint" : "Print bill"}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  {order.billRequested ? "✓ Print" : "Print"}
                </button>
              )}
            </div>
          )}

          {/* Row 2: Counter orders pick a method then Print+Settle in one tap.
              Table orders keep the unchanged "Pay" button → PaymentSheet flow. */}
          {hasItems && order.isCounter && onCounterPrintBill ? (
            <div className="order-pay-row counter-checkout-row">
              <div className="counter-method-picker">
                {METHODS_FOR_COUNTER.map(m => (
                  <button key={m.id} type="button"
                    className={`counter-method-chip${counterMethod === m.id ? " active" : ""}`}
                    onClick={() => setCounterMethod(m.id)}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              {counterMethod === "credit" ? (
                <button type="button" className="pos-btn pay" onClick={onOpenPayment}>
                  Enter Credit Details
                </button>
              ) : (
                <button type="button" className="pos-btn pay counter-print-settle"
                  disabled={counterPrinting}
                  onClick={async () => {
                    setCounterPrinting(true);
                    try { await onCounterPrintBill(counterMethod); }
                    finally { setCounterPrinting(false); }
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  {counterPrinting ? "Printing…" : "Print Bill & Settle"}
                </button>
              )}
            </div>
          ) : hasItems ? (
            <div className="order-pay-row">
              <button type="button" className="pos-btn pay" onClick={onOpenPayment}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                Pay
              </button>
            </div>
          ) : null}
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

      {/* ── PIN confirm for void item ─────────────────────────────────────── */}
      {pinForVoidIdx !== null && (
        <PinConfirm
          cashierName={cashierName}
          cashierPin={cashierPin}
          title="Void Item — Confirm PIN"
          onConfirm={() => { setVoidingIdx(pinForVoidIdx); setPinForVoidIdx(null); }}
          onCancel={() => setPinForVoidIdx(null)}
        />
      )}

      {/* ── PIN confirm for cancel order ─────────────────────────────────── */}
      {showCancelPin && (
        <PinConfirm
          cashierName={cashierName}
          cashierPin={cashierPin}
          title="Cancel Order — Confirm PIN"
          onConfirm={() => { setShowCancelPin(false); setShowCancelConfirm(true); }}
          onCancel={() => setShowCancelPin(false)}
        />
      )}

      {/* ── "Are you sure?" confirmation after PIN ───────────────────────── */}
      {showCancelConfirm && (
        <div className="pin-confirm-overlay" onClick={() => setShowCancelConfirm(false)}>
          <div className="pin-confirm-card" onClick={e => e.stopPropagation()} style={{ gap: 16, maxWidth: 300 }}>
            <p className="pin-confirm-title" style={{ color: "#dc2626" }}>Cancel Order?</p>
            <p className="pin-confirm-sub" style={{ textAlign: "center", lineHeight: 1.5 }}>
              All items will be voided.<br />You will have 5 seconds to undo.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 8, width: "100%" }}>
              <button
                type="button"
                className="pin-confirm-cancel"
                style={{ flex: 1, margin: 0 }}
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep Order
              </button>
              <button
                type="button"
                className="void-confirm-btn"
                style={{ flex: 1, background: "#dc2626", border: "none" }}
                onClick={() => { setShowCancelConfirm(false); onCancelOrder?.(); }}
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
