import { useEffect, useState } from "react";
import { tapImpact } from "../lib/haptics";
import { MenuBrowser } from "./MenuBrowser";
import { NoteModal }   from "./NoteModal";
import { SplitBill }   from "./SplitBill";
import { TransferModal } from "./TransferModal";
import { PhonePeQRModal } from "./PhonePeQRModal";
import { CoursingScreen } from "./CoursingScreen";
import {
  getStockState,
  subscribeStock,
  setItemAvailability,
} from "../../../../packages/shared-types/src/stockAvailability.js";
import {
  getCategoryStockState,
  subscribeCategoryStock,
  setCategoryAvailability,
} from "../../../../packages/shared-types/src/categoryAvailability.js";

function elapsedLabel(ts) {
  if (!ts) return null;
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1)   return "< 1m";
  if (mins < 60)  return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

export function OrderScreen({
  order, tableLabel, areas, categories, menuItems, outletName,
  orders, outletId, socket, staff = [],
  onBack, onSendKOT, onRequestBill, onPrintBill, onPrintSplitBill,
  onToggleHold, onUpdateOrder, onUpdateGuests, onRemoveItem, onAddItem,
  onTransfer, onMerge, onForceClear, onCustomerInfo,
  onRequestRemoveItem,
  autoOpen = null, // "menu" | "transfer" | "merge" | "split" — open screen/modal immediately on mount
}) {
  const [screen,          setScreen]          = useState(
    autoOpen === "split" ? "split" : autoOpen === "menu" ? "menu" : "order"
  );
  const [noteItemIdx,     setNoteItemIdx]      = useState(null);
  const [showTransfer,    setShowTransfer]     = useState(autoOpen === "transfer");
  const [showMerge,       setShowMerge]        = useState(autoOpen === "merge");
  const [showPhonePeQR,   setShowPhonePeQR]    = useState(false);
  const [showAssignModal, setShowAssignModal]  = useState(false);
  const [assignPick,      setAssignPick]       = useState(order.assignedWaiter || "");
  const [guestVal,        setGuestVal]         = useState(order.guests || "");
  // Only show Waiter/Server/Steward roles in the assign modal (not Captains)
  const waiterStaff = staff.filter(s => /waiter|server|steward/i.test(s.role || ""));
  const [stockState,      setStockState]       = useState(() => getStockState());
  const [categoryStockState, setCategoryStockState] = useState(() => getCategoryStockState());

  useEffect(() => {
    const unsub = subscribeStock((s) => setStockState({ ...s }));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeCategoryStock((s) => setCategoryStockState({ ...s }));
    return unsub;
  }, []);

  // Keep local guestVal in sync when order.guests changes (e.g. after backend sync)
  useEffect(() => {
    setGuestVal(order.guests || "");
  }, [order.guests]);

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

  // Sync category availability from POS via socket
  useEffect(() => {
    if (!socket) return;
    function onCatAvail(data) {
      setCategoryAvailability(data.categoryId, data.available !== false, data.availableAt || null);
    }
    function onCatAvailState(state) {
      Object.entries(state || {}).forEach(([id, entry]) =>
        setCategoryAvailability(id, entry.available !== false, entry.availableAt || null)
      );
    }
    socket.on("category:availability", onCatAvail);
    socket.on("category:availability:state", onCatAvailState);
    return () => {
      socket.off("category:availability", onCatAvail);
      socket.off("category:availability:state", onCatAvailState);
    };
  }, [socket]);

  const items         = order.items || [];
  const unsentCount   = items.filter(i => !i.sentToKot).length;
  const sentItems     = items.filter(i =>  i.sentToKot && !i.isVoided);
  const unsentItems   = items.filter(i => !i.sentToKot && !i.isVoided);
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
      // Show confirm dialog if available; otherwise remove directly
      if (onRequestRemoveItem && item?.id) {
        onRequestRemoveItem({ itemId: item.id, itemName: item.name, isSent: !!item.sentToKot });
      } else if (onRemoveItem && item?.id) {
        // Use dedicated remove handler so backend memory store is updated too
        // (socket order:update alone doesn't update backend — causes stuck item bug)
        onRemoveItem(item.id);
      } else {
        next.splice(idx, 1);
        onUpdateOrder({ ...order, items: next });
      }
    } else {
      // captainAdjusted: true signals an explicit minus tap so handleAddItem's REST
      // reconciliation knows to preserve this qty instead of using the server's
      // accumulated value (which is higher when − was tapped while a + call was in flight).
      next[idx] = { ...item, quantity: newQty, captainAdjusted: delta < 0 };
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
        categoryStockState={categoryStockState}
        outletId={outletId}
        socket={socket}
        onUpdateOrder={onUpdateOrder}
        onItemAdded={onAddItem}
        onItemRemoved={(itemId) => onRemoveItem?.(itemId)}
        onBack={() => setScreen("order")}
        tableLabel={tableLabel}
      />
    );
  }

  if (screen === "courses") {
    return (
      <CoursingScreen
        order={order}
        tableLabel={tableLabel}
        onBack={() => setScreen("order")}
      />
    );
  }

  if (screen === "split") {
    return (
      <SplitBill
        order={order}
        outletName={outletName}
        onBack={() => setScreen("order")}
        onPrint={(items, seatLabel) => onPrintSplitBill?.(order.tableId, items, seatLabel)}
      />
    );
  }

  const seatedTs   = order.openedAt || order.createdAt;
  const seatedTimer = seatedTs ? elapsedLabel(seatedTs) : null;
  const headerSub   = [
    order.areaName,
    order.guests ? `${order.guests} guests` : null,
    seatedTimer,
  ].filter(Boolean).join(" · ");

  return (
    <div className="os2-page">
      {/* Header */}
      <div className="os2-header">
        <button className="os2-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="os2-header-text">
          <h2 className="os2-title">{tableLabel}</h2>
          {headerSub && (
            <p className="os2-subtitle">
              {headerSub}
              {order.isOnHold && <span className="os2-hold-badge"> · Hold</span>}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {hasItems && (
            <button
              className="crs-courses-btn"
              onClick={() => { tapImpact(); setScreen("courses"); }}
              aria-label="Coursing"
              title="Coursing"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/>
              </svg>
            </button>
          )}
          <div className="os2-synced-pill">
            <span className="os2-synced-dot"/>
            <span className="os2-synced-label">Synced</span>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="os2-scroll">
        {/* Empty state */}
        {!hasItems && (
          <div className="os2-empty">
            <div className="os2-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
                <path d="M9 12h6M9 16h4"/>
              </svg>
            </div>
            <p className="os2-empty-title">No items yet</p>
            <p className="os2-empty-sub">Add your first item below to start the order</p>

            <div className="os2-guests-card">
              <span className="os2-guests-label">Guests</span>
              <div className="os2-guests-stepper">
                <button
                  className="os2-guest-btn"
                  onClick={() => {
                    tapImpact();
                    const n = Math.max(0, Number(guestVal || 0) - 1);
                    setGuestVal(n || "");
                    onUpdateGuests?.(order.tableId, n);
                  }}
                >−</button>
                <input
                  className="os2-guest-input"
                  type="number"
                  min="0"
                  max="20"
                  value={guestVal}
                  placeholder="0"
                  onChange={e => setGuestVal(e.target.value)}
                  onBlur={e => {
                    const n = Math.max(0, Number(e.target.value) || 0);
                    setGuestVal(n || "");
                    onUpdateGuests?.(order.tableId, n);
                  }}
                />
                <button
                  className="os2-guest-btn os2-guest-btn-add"
                  onClick={() => {
                    tapImpact();
                    const n = Math.min(20, Number(guestVal || 0) + 1);
                    setGuestVal(n || "");
                    onUpdateGuests?.(order.tableId, n);
                  }}
                >+</button>
              </div>
            </div>

            {onForceClear && (
              <button
                className="force-clear-btn"
                style={{ marginTop: 16 }}
                onClick={() => { tapImpact(); onForceClear(); }}
              >
                Mark Table as Free
              </button>
            )}
          </div>
        )}

        {/* Unsent items */}
        {unsentItems.length > 0 && (
          <div className="os2-section os2-section-unsent">
            <div className="os2-section-head">
              <span className="os2-section-label">NOT SENT YET</span>
              <span className="os2-section-count">{unsentItems.length}</span>
            </div>
            {unsentItems.map((item) => {
              const idx = items.findIndex(i => i.id === item.id);
              return (
                <div key={item.id || idx} className="os2-item os2-item-unsent">
                  <div className="os2-item-left">
                    <span className="os2-item-name">{item.name}</span>
                    <button
                      className={`os2-note-btn${item.note ? " os2-note-btn-active" : ""}`}
                      onClick={() => setNoteItemIdx(idx)}
                    >
                      {item.note ? `📝 ${item.note}` : "+ add note"}
                    </button>
                  </div>
                  <div className="os2-item-right">
                    <span className="os2-item-price">₹{(item.price * item.quantity).toFixed(0)}</span>
                    <div className="os2-qty-ctrl">
                      <button className="os2-qty-btn" onClick={() => changeQty(idx, -1)}>−</button>
                      <span className="os2-qty-val">{item.quantity}</span>
                      <button className="os2-qty-btn os2-qty-plus" onClick={() => changeQty(idx, +1)}>+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sent items */}
        {sentItems.length > 0 && (
          <div className="os2-section os2-section-sent">
            <div className="os2-section-head">
              <span className="os2-section-label">SENT TO KITCHEN</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            {sentItems.map((item) => {
              const idx = items.findIndex(i => i.id === item.id);
              return (
                <div key={item.id || idx} className="os2-item os2-item-sent">
                  <div className="os2-item-left">
                    <span className="os2-item-name">{item.name}</span>
                    {item.isComp && <span className="os2-comp-tag">COMP</span>}
                    {item.note && <span className="os2-note-sent">{item.note}</span>}
                  </div>
                  <div className="os2-item-right">
                    <span className="os2-item-price">₹{(item.price * item.quantity).toFixed(0)}</span>
                    <span className="os2-qty-sent">×{item.quantity}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Running total */}
        {totalAmount > 0 && (
          <div className="os2-total-card">
            <div className="os2-total-row">
              <span className="os2-total-label">Sub total</span>
              <span className="os2-total-val">₹{totalSub.toLocaleString("en-IN")}</span>
            </div>
            <div className="os2-total-row">
              <span className="os2-total-label">Tax</span>
              <span className="os2-total-val">₹{totalTax.toLocaleString("en-IN")}</span>
            </div>
            <div className="os2-total-row os2-total-grand">
              <span className="os2-total-label">Total</span>
              <span className="os2-total-val">₹{totalAmount.toLocaleString("en-IN")}</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="os2-bottom">
        <button className="os2-add-btn" onClick={() => { tapImpact(); setScreen("menu"); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Items
        </button>
        {unsentCount > 0 && (
          <button className="os2-kot-btn" onClick={() => { tapImpact(); onSendKOT(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Send to Kitchen · {unsentCount}
          </button>
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

      {/* Move Table — combined transfer + merge full-screen */}
      {(showTransfer || showMerge) && (
        <TransferModal
          currentTableId={order.tableId}
          currentOrder={order}
          areas={areas}
          orders={orders}
          onTransfer={(from, to) => {
            setShowTransfer(false);
            setShowMerge(false);
            onTransfer?.(from, to);
          }}
          onMerge={(cur, from) => {
            setShowTransfer(false);
            setShowMerge(false);
            onMerge?.(cur, from);
          }}
          onClose={() => { setShowTransfer(false); setShowMerge(false); }}
        />
      )}

      {/* Assign Waiter modal */}
      {showAssignModal && (
        <div className="assign-backdrop" onClick={() => setShowAssignModal(false)}>
          <div className="assign-modal" onClick={e => e.stopPropagation()}>
            <div className="assign-modal-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Assign Waiter
            </div>
            <div className="assign-staff-list">
              {/* None option */}
              <label className="assign-staff-row">
                <span className="assign-staff-name">None</span>
                <input
                  type="radio" name="assign-waiter"
                  checked={assignPick === ""}
                  onChange={() => setAssignPick("")}
                />
              </label>
              {waiterStaff.map(s => (
                <label key={s.id} className="assign-staff-row">
                  <span className="assign-staff-name">{s.name}</span>
                  <input
                    type="radio" name="assign-waiter"
                    checked={assignPick === s.name}
                    onChange={() => setAssignPick(s.name)}
                  />
                </label>
              ))}
            </div>
            <div className="assign-modal-actions">
              <button className="assign-cancel-btn" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button className="assign-done-btn" onClick={() => {
                tapImpact();
                onUpdateOrder({ ...order, assignedWaiter: assignPick || null });
                setShowAssignModal(false);
              }}>Done</button>
            </div>
          </div>
        </div>
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
