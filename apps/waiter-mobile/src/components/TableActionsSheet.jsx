import { useState, useEffect } from "react";
import { tapImpact } from "../lib/haptics";

export function TableActionsSheet({
  tableNumber, areaName, order,
  onClose, onMoveTable, onMerge, onSplitBill, onPrintBill, onCustomerInfo,
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

  const items    = order?.items || [];
  const billable = items.filter(i => !i.isVoided && !i.isComp);
  const itemCount = billable.length;

  const subtotal = billable.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  const tax      = billable.reduce((s, i) => {
    const r = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    return s + Math.round((i.price || 0) * (i.quantity || 0) * r / 100);
  }, 0);
  const total = subtotal + tax;

  return (
    <>
      <div className="tas2-backdrop" onClick={onClose} />
      <div className="tas2-sheet">
        <div className="tas2-handle" />

        {/* Header */}
        <div className="tas2-header">
          <div className="tas2-table-info">
            <span className="tas2-table-num">Table {tableNumber}</span>
            {areaName && <span className="tas2-area">{areaName}</span>}
          </div>
          <div className="tas2-chips">
            {itemCount > 0 && <span className="tas2-chip">{itemCount} items</span>}
            {total > 0 && (
              <span className="tas2-chip tas2-chip-amount">
                ₹{total.toLocaleString("en-IN")}
              </span>
            )}
            {elapsed && <span className="tas2-chip tas2-chip-time">{elapsed}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="tas2-actions">
          {itemCount > 0 && (
            <button
              className="tas2-action"
              onClick={() => { tapImpact(); onPrintBill?.(); onClose(); }}
            >
              <span className="tas2-action-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
              </span>
              <span className="tas2-action-label">Print Bill</span>
              <svg className="tas2-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}

          <button className="tas2-action" onClick={() => { tapImpact(); onMoveTable(); }}>
            <span className="tas2-action-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="5 9 2 12 5 15"/>
                <polyline points="9 5 12 2 15 5"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <line x1="12" y1="2" x2="12" y2="22"/>
                <polyline points="15 19 12 22 9 19"/>
                <polyline points="19 9 22 12 19 15"/>
              </svg>
            </span>
            <span className="tas2-action-label">Move Table</span>
            <svg className="tas2-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

          <button className="tas2-action" onClick={() => { tapImpact(); onMerge(); }}>
            <span className="tas2-action-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="8" height="8" rx="1"/>
                <rect x="14" y="3" width="8" height="8" rx="1"/>
                <rect x="8" y="13" width="8" height="8" rx="1"/>
                <line x1="6" y1="11" x2="6" y2="13"/>
                <line x1="18" y1="11" x2="18" y2="13"/>
                <line x1="6" y1="13" x2="12" y2="13"/>
                <line x1="18" y1="13" x2="12" y2="13"/>
              </svg>
            </span>
            <span className="tas2-action-label">Merge Tables</span>
            <svg className="tas2-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

          {itemCount > 0 && onSplitBill && (
            <button className="tas2-action" onClick={() => { tapImpact(); onSplitBill(); }}>
              <span className="tas2-action-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="2" x2="12" y2="22"/>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </span>
              <span className="tas2-action-label">Split Bill</span>
              <svg className="tas2-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}

          {onCustomerInfo && (
            <button className="tas2-action tas2-action-ghost" onClick={() => { tapImpact(); onCustomerInfo(); }}>
              <span className="tas2-action-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <span className="tas2-action-label">Guest Info</span>
              <svg className="tas2-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}
        </div>

        <button className="tas2-close" onClick={onClose}>Close</button>
      </div>
    </>
  );
}
