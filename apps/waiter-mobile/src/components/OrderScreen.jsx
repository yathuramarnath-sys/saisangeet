import { useEffect, useState } from "react";
import { tapImpact } from "../lib/haptics";
import { MenuBrowser } from "./MenuBrowser";
import { NoteModal }   from "./NoteModal";
import { SplitBill }   from "./SplitBill";
import { TransferModal } from "./TransferModal";
import { MergeModal }    from "./MergeModal";
import { PhonePeQRModal } from "./PhonePeQRModal";
import {
  getStockState,
  subscribeStock,
  setItemAvailability,
} from "../../../../packages/shared-types/src/stockAvailability.js";

export function OrderScreen({
  order, tableLabel, areas, categories, menuItems, outletName,
  orders, outletId, socket,
  onBack, onSendKOT, onRequestBill, onPrintBill,
  onToggleHold, onUpdateOrder, onRemoveItem, onAddItem,
  onTransfer, onMerge, onForceClear,
}) {
  const [screen,        setScreen]        = useState("order"); // order | menu | split
  const [noteItemIdx,   setNoteItemIdx]   = useState(null);
  const [showTransfer,  setShowTransfer]  = useState(false);
  const [showMerge,     setShowMerge]     = useState(false);
  const [showPhonePeQR, setShowPhonePeQR] = useState(false);
  const [stockState,    setStockState]    = useState(() => getStockState());

  useEffect(() => {
    const unsub = subscribeStock((s) => setStockState({ ...s }));
    return unsub;
  }, []);

  // Sync item availability from POS via socket
  useEffect(() => {
    if (!socket) return;
    function onAvail(data) {
      setItemAvailability(data.itemId, data.available);
    }
    function onAvailState(state) {
      Object.entries(state || {}).forEach(([id, val]) => setItemAvailability(id, val !== false));
    }
    socket.on("item:availability", onAvail);
    socket.on("item:availability:state", onAvailState);
    return () => {
      socket.off("item:availability", onAvail);
      socket.off("item:availability:state", onAvailState);
    };
  }, [socket]);

  const items      = order.items || [];
  const unsentCount = items.filter(i => !i.sentToKot).length;
  const billableItems = items.filter(i => !i.isVoided && !i.isComp);
  const totalSub    = billableItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalTax    = billableItems.reduce((s, i) => {
    const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    return s + Math.round(i.price * i.quantity * rate / 100);
  }, 0);
  const totalAmount = totalSub + totalTax;
  const hasItems    = items.length > 0;

  function changeQty(idx, delta) {
    const next = [...items];
    const item  = next[idx];
    const newQty = (item?.quantity || 1) + delta;
    if (newQty <= 0) {
      // Use dedicated remove handler so backend memory store is updated too
      // (socket order:update alone doesn't update backend — causes stuck item bug)
      if (onRemoveItem && item?.id) onRemoveItem(item.id);
      else { next.splice(idx, 1); onUpdateOrder({ ...order, items: next }); }
    } else {
      next[idx] = { ...item, quantity: newQty };
      onUpdateOrder({ ...order, items: next });
    }
    tapImpact();
  }

  function saveNote(idx, val) {
    const next = [...items];
    next[idx] = { ...next[idx], note: val };
    onUpdateOrder({ ...order, items: next });
    setNoteItemIdx(null);
  }

  if (screen === "menu") {
    return (
      <MenuBrowser
        order={order}
        categories={categories}
        menuItems={menuItems}
        stockState={stockState}
        onUpdateOrder={(next) => { onUpdateOrder(next); onAddItem?.(next.items?.at(-1)); }}
        onBack={() => setScreen("order")}
      />
    );
  }

  if (screen === "split") {
    return <SplitBill order={order} outletName={outletName} onBack={() => setScreen("order")} />;
  }

  return (
    <div className="order-page">
      {/* Header */}
      <div className="order-header">
        <div className="order-header-row">
          <button className="icon-back-btn" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div className="order-title-block">
            <h2 className="order-table-title">{tableLabel}</h2>
            <p className="order-table-meta">
              {order.areaName}
              {order.isOnHold && <span className="hold-badge">⏸ Hold</span>}
            </p>
          </div>
          <div className="order-guests-block">
            <span className="guests-label">Guests</span>
            <input
              className="guests-input"
              type="number"
              min="0"
              max="20"
              value={order.guests || ""}
              placeholder="0"
              onChange={e => onUpdateOrder({ ...order, guests: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="order-items">
        {!hasItems && (
          <div className="order-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".25">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
            <p className="order-empty-title">No items yet</p>
            <p className="order-empty-sub">Tap Add Items below to start the order</p>
            {onForceClear && (
              <button
                className="force-clear-btn"
                onClick={() => { tapImpact(); onForceClear(); }}
              >
                Mark Table as Free
              </button>
            )}
          </div>
        )}

        {items.map((item, idx) => (
          <div key={item.id || idx} className={`order-item${item.sentToKot ? " item-sent" : ""}`}>
            <div className="order-item-left">
              <div className="order-item-name-row">
                <span className="order-item-name">{item.name}</span>
                {item.sentToKot && (
                  <span className="kot-badge">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    KOT
                  </span>
                )}
              </div>
              {!item.sentToKot ? (
                <button
                  className={`note-btn${item.note ? " note-btn-active" : ""}`}
                  onClick={() => setNoteItemIdx(idx)}
                >
                  {item.note ? `📝 ${item.note}` : "+ add note"}
                </button>
              ) : item.note ? (
                <span className="note-sent">{item.note}</span>
              ) : null}
            </div>
            <div className="order-item-right">
              {!item.sentToKot ? (
                <div className="qty-ctrl">
                  <button className="qty-minus" onClick={() => changeQty(idx, -1)}>−</button>
                  <span className="qty-value">{item.quantity}</span>
                  <button className="qty-plus" onClick={() => changeQty(idx, +1)}>+</button>
                </div>
              ) : (
                <span className="qty-sent">×{item.quantity}</span>
              )}
              <span className="item-price">₹{(item.price * item.quantity).toFixed(0)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add items + total bar */}
      <div className="add-bar">
        <button className="add-items-btn" onClick={() => { tapImpact(); setScreen("menu"); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Items
          {unsentCount > 0 && <span className="unsent-badge">{unsentCount}</span>}
        </button>
        {totalAmount > 0 && (
          <span className="running-total">₹{totalAmount}</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="order-actions">
        {/* Send KOT */}
        {unsentCount > 0 && (
          <button className={`action-btn kot-btn${unsentCount > 0 ? " has-pending" : ""}`} onClick={() => { tapImpact(); onSendKOT(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            Send KOT · {unsentCount} item{unsentCount > 1 ? "s" : ""}
          </button>
        )}

        {hasItems && (
          <>
            {/* Hold only — Merge/Transfer/Split/Print Bill via long press on table */}
            <button
              className={`action-btn${order.isOnHold ? " hold-active-btn" : " hold-btn"}`}
              onClick={() => { tapImpact(); onToggleHold(); }}
            >
              {order.isOnHold ? "▶ Resume Order" : "⏸ Hold"}
            </button>
          </>
        )}
      </div>

      {/* Note modal */}
      {noteItemIdx !== null && (
        <NoteModal
          item={items[noteItemIdx]}
          initialNote={items[noteItemIdx]?.note || ""}
          onSave={val => saveNote(noteItemIdx, val)}
          onClose={() => setNoteItemIdx(null)}
        />
      )}

      {/* Transfer modal */}
      {showTransfer && (
        <TransferModal
          currentTableId={order.tableId}
          areas={areas}
          orders={orders}
          onTransfer={(from, to) => {
            setShowTransfer(false);
            onTransfer?.(from, to);
          }}
          onClose={() => setShowTransfer(false)}
        />
      )}

      {/* Merge modal */}
      {showMerge && (
        <MergeModal
          currentTableId={order.tableId}
          currentOrder={order}
          areas={areas}
          orders={orders}
          onMerge={(cur, from) => {
            setShowMerge(false);
            onMerge?.(cur, from);
          }}
          onClose={() => setShowMerge(false)}
        />
      )}

      {/* PhonePe QR modal — captain collects payment at the table */}
      {showPhonePeQR && (
        <PhonePeQRModal
          order={order}
          outletId={outletId}
          socket={socket}
          onConfirmed={() => {
            // Payment confirmed — table will clear via socket "order:updated"
            // broadcast from the backend webhook. Just close the modal.
            setShowPhonePeQR(false);
          }}
          onClose={() => setShowPhonePeQR(false)}
        />
      )}
    </div>
  );
}
