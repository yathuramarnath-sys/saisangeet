import { useState, useEffect } from "react";
import { tapImpact } from "../lib/haptics";

export function TableActionsSheet({
  tableNumber, areaName, order,
  onClose, onEditOrder, onSendKOT,
  onMoveTable, onMerge, onSplitBill, onPrintBill, onCustomerInfo,
}) {
  const [elapsed, setElapsed] = useState("");

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

  const items       = order?.items || [];
  const billable    = items.filter(i => !i.isVoided && !i.isComp);
  const unsent      = items.filter(i => !i.sentToKot && !i.isVoided);
  const itemCount   = billable.length;
  const unsentCount = unsent.length;

  const subtotal = billable.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  const tax      = billable.reduce((s, i) => {
    const r = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    return s + Math.round((i.price || 0) * (i.quantity || 0) * r / 100);
  }, 0);
  const total = subtotal + tax;

  return (
    <>
      <div className="tas-backdrop" onClick={onClose} />
      <div className="tas-sheet">
        <div className="tas-handle" />

        {/* Header */}
        <div className="tas-header">
          <div className="tas-table-badge">
            <div>
              <div className="tas-table-num">Table {tableNumber}</div>
              {areaName && <div className="tas-table-area">{areaName}</div>}
            </div>
          </div>
          <div className="tas-meta">
            {itemCount > 0 && <span className="tas-chip">{itemCount} items</span>}
            {total > 0 && <span className="tas-chip tas-chip-amount">₹{total.toLocaleString("en-IN")}</span>}
            {elapsed && <span className="tas-chip tas-chip-time">{elapsed}</span>}
          </div>
        </div>

        {/* All actions — plain list */}
        <div className="tas-section tas-section-secondary">

          {unsentCount > 0 && (
            <button className="tas-action-sm" onClick={() => { tapImpact(); onSendKOT(); }}>
              <span>Send to Kitchen</span>
              <span className="tas-unsent-badge">{unsentCount}</span>
            </button>
          )}

          {itemCount > 0 && (
            <button className="tas-action-sm" onClick={() => { tapImpact(); onPrintBill?.(); onClose(); }}>
              <span>Print Bill</span>
            </button>
          )}

          <button className="tas-action-sm" onClick={() => { tapImpact(); onMoveTable(); }}>
            <span>Move Table</span>
          </button>

          <button className="tas-action-sm" onClick={() => { tapImpact(); onMerge(); }}>
            <span>Merge Tables</span>
          </button>

          {itemCount > 0 && onSplitBill && (
            <button className="tas-action-sm" onClick={() => { tapImpact(); onSplitBill(); }}>
              <span>Split Bill</span>
            </button>
          )}

          {onCustomerInfo && (
            <button className="tas-action-sm tas-action-sm-ghost" onClick={() => { tapImpact(); onCustomerInfo(); }}>
              <span>Guest Info</span>
            </button>
          )}

        </div>

        <button className="tas-close-btn" onClick={onClose}>Close</button>
      </div>
    </>
  );
}
