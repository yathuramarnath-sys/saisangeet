import { useState, useEffect } from "react";
import { tapImpact } from "../lib/haptics";

/**
 * TableActionsSheet
 * ─────────────────
 * Bottom sheet that slides up when a captain taps an OCCUPIED table.
 * Does NOT replace the existing OrderScreen — it's a shortcut layer on top.
 *
 * Props:
 *   tableId       string
 *   tableNumber   string | number
 *   areaName      string
 *   order         object   — current order for this table
 *   onClose       ()       — dismiss sheet
 *   onEditOrder   ()       — open full OrderScreen (existing flow)
 *   onSendKOT     ()       — quick-send KOT from floor (unsent items exist)
 *   onRequestBill ()       — request bill
 *   onHoldToggle  ()       — hold / unhold
 *   onMoveTable   ()       — open TransferModal
 *   onMerge       ()       — open MergeModal
 *   onCustomerInfo()       — optional customer info sheet
 */
export function TableActionsSheet({
  tableNumber, areaName, order,
  onClose, onEditOrder, onSendKOT,
  onRequestBill, onHoldToggle, onMoveTable, onMerge, onCustomerInfo,
}) {
  const [elapsed, setElapsed] = useState("");

  // ── Calculate time seated ─────────────────────────────────────────────────
  useEffect(() => {
    function calc() {
      const ts = order?.seatedAt || order?.createdAt || order?.openedAt;
      if (!ts) { setElapsed(""); return; }
      const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
      if (mins < 1)         setElapsed("< 1 min");
      else if (mins < 60)   setElapsed(`${mins} min`);
      else {
        const h = Math.floor(mins / 60), m = mins % 60;
        setElapsed(`${h}h ${m}m`);
      }
    }
    calc();
    const t = setInterval(calc, 30000);
    return () => clearInterval(t);
  }, [order]);

  const items        = order?.items || [];
  const billable     = items.filter(i => !i.isVoided && !i.isComp);
  const unsent       = items.filter(i => !i.sentToKot && !i.isVoided);
  const itemCount    = billable.length;
  const unsentCount  = unsent.length;
  const isOnHold     = order?.isOnHold;
  const billRequested = order?.billRequested;

  const subtotal = billable.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  const tax      = billable.reduce((s, i) => {
    const r = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    return s + Math.round((i.price || 0) * (i.quantity || 0) * r / 100);
  }, 0);
  const total = subtotal + tax;

  return (
    <>
      {/* Backdrop */}
      <div className="tas-backdrop" onClick={onClose} />

      {/* Sheet */}
      <div className="tas-sheet">

        {/* Drag handle */}
        <div className="tas-handle" />

        {/* Table info header */}
        <div className="tas-header">
          <div className="tas-table-badge">
            <span className="tas-table-icon">🪑</span>
            <div>
              <div className="tas-table-num">Table {tableNumber}</div>
              {areaName && <div className="tas-table-area">{areaName}</div>}
            </div>
          </div>
          <div className="tas-meta">
            {itemCount > 0 && (
              <span className="tas-chip">{itemCount} items</span>
            )}
            {total > 0 && (
              <span className="tas-chip tas-chip-amount">₹{total.toLocaleString("en-IN")}</span>
            )}
            {elapsed && (
              <span className="tas-chip tas-chip-time">🕐 {elapsed}</span>
            )}
          </div>
        </div>

        {/* ── Primary actions ─────────────────────────────────────────── */}
        <div className="tas-section">

          {/* Edit / View Order — always shown */}
          <button className="tas-action tas-primary" onClick={() => { tapImpact(); onEditOrder(); }}>
            <span className="tas-action-icon">📋</span>
            <div className="tas-action-body">
              <span className="tas-action-label">
                {itemCount > 0 ? "View / Edit Order" : "Start Order"}
              </span>
              {itemCount > 0 && (
                <span className="tas-action-hint">Add items, modify quantities</span>
              )}
            </div>
            <span className="tas-action-chevron">›</span>
          </button>

          {/* Send KOT — only if unsent items exist */}
          {unsentCount > 0 && (
            <button className="tas-action tas-action-kot" onClick={() => { tapImpact(); onSendKOT(); }}>
              <span className="tas-action-icon">🔥</span>
              <div className="tas-action-body">
                <span className="tas-action-label">Send to Kitchen</span>
                <span className="tas-action-hint">{unsentCount} item{unsentCount > 1 ? "s" : ""} not yet sent</span>
              </div>
              <span className="tas-unsent-badge">{unsentCount}</span>
            </button>
          )}

          {/* Request Bill */}
          {!billRequested ? (
            <button className="tas-action tas-action-bill" onClick={() => { tapImpact(); onRequestBill(); }}>
              <span className="tas-action-icon">🧾</span>
              <div className="tas-action-body">
                <span className="tas-action-label">Request Bill</span>
                <span className="tas-action-hint">Notify cashier to prepare bill</span>
              </div>
              <span className="tas-action-chevron">›</span>
            </button>
          ) : (
            <div className="tas-action tas-action-bill-done">
              <span className="tas-action-icon">✅</span>
              <div className="tas-action-body">
                <span className="tas-action-label">Bill Requested</span>
                <span className="tas-action-hint">Cashier has been notified</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Secondary actions ───────────────────────────────────────── */}
        <div className="tas-section tas-section-secondary">

          {/* Hold / Unhold */}
          <button className="tas-action-sm" onClick={() => { tapImpact(); onHoldToggle(); }}>
            <span>{isOnHold ? "▶" : "⏸"}</span>
            <span>{isOnHold ? "Resume Order" : "Put on Hold"}</span>
          </button>

          {/* Move Table */}
          <button className="tas-action-sm" onClick={() => { tapImpact(); onMoveTable(); }}>
            <span>↔</span>
            <span>Move Table</span>
          </button>

          {/* Merge Tables */}
          <button className="tas-action-sm" onClick={() => { tapImpact(); onMerge(); }}>
            <span>⊕</span>
            <span>Merge Tables</span>
          </button>

          {/* Customer Info — optional, soft */}
          {onCustomerInfo && (
            <button className="tas-action-sm tas-action-sm-ghost" onClick={() => { tapImpact(); onCustomerInfo(); }}>
              <span>👤</span>
              <span>Guest Info</span>
            </button>
          )}

        </div>

        {/* Close */}
        <button className="tas-close-btn" onClick={onClose}>Close</button>

      </div>
    </>
  );
}
