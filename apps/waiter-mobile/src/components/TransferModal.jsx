import { useState } from "react";
import { tapImpact } from "../lib/haptics";
import { tableStatusOf } from "./TableFloor";

export function TransferModal({
  currentTableId, currentOrder, areas, orders,
  onTransfer, onMerge, onClose,
}) {
  const [selected, setSelected] = useState(null);
  // { type: 'transfer'|'merge', tableId, tableNumber }

  const freeTables = [];
  const occupiedTables = [];

  areas.forEach((area) => {
    area.tables.forEach((t) => {
      if (t.id === currentTableId) return;
      const st = tableStatusOf(orders, t.id);
      const o  = orders[t.id];
      if (st === "open") {
        freeTables.push({ table: t, area });
      } else {
        const items = (o?.items || []).filter((i) => !i.isVoided && !i.isComp);
        const sub   = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
        const tax   = items.reduce((s, i) => {
          const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
          return s + Math.round((i.price || 0) * (i.quantity || 0) * rate / 100);
        }, 0);
        occupiedTables.push({ table: t, area, order: o, status: st, total: sub + tax });
      }
    });
  });

  // Compute current table total for subtitle
  const currentItems = (currentOrder?.items || []).filter(i => !i.isVoided && !i.isComp);
  const currentSub   = currentItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  const currentTax   = currentItems.reduce((s, i) => {
    const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    return s + Math.round((i.price || 0) * (i.quantity || 0) * rate / 100);
  }, 0);
  const currentTotal = currentSub + currentTax;

  const tableNum  = currentOrder?.tableNumber || "";
  const areaName  = currentOrder?.areaName || "";
  const subtitle  = [
    tableNum ? `From Table T${tableNum}` : "",
    areaName,
    currentTotal > 0 ? `₹${currentTotal.toLocaleString("en-IN")}` : "",
  ].filter(Boolean).join(" · ");

  function handleConfirm() {
    if (!selected) return;
    tapImpact();
    if (selected.type === "transfer") {
      onTransfer?.(currentTableId, selected.tableId);
    } else {
      onMerge?.(currentTableId, selected.tableId);
    }
  }

  const btnLabel = !selected
    ? "Select a table"
    : selected.type === "transfer"
    ? `Move to T${selected.tableNumber}`
    : `Merge with T${selected.tableNumber}`;

  const statusLabel = { open: "Free", running: "Dining", bill: "Bill", hold: "Hold", ordering: "Ordering" };

  return (
    <div className="mt2-page">
      <div className="mt2-header">
        <button className="mt2-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="mt2-header-block">
          <h2 className="mt2-title">Move table</h2>
          {subtitle && <p className="mt2-subtitle">{subtitle}</p>}
        </div>
      </div>

      <div className="mt2-scroll">
        {/* Free tables */}
        <div className="mt2-section">
          <div className="mt2-section-head">
            <span className="mt2-section-label">MOVE TO A FREE TABLE</span>
          </div>
          {freeTables.length === 0 ? (
            <p className="mt2-empty-hint">No free tables available</p>
          ) : (
            <div className="mt2-list-card">
              {freeTables.map(({ table, area }) => {
                const sel = selected?.tableId === table.id && selected?.type === "transfer";
                return (
                  <button
                    key={table.id}
                    className={`mt2-list-row${sel ? " mt2-list-row-sel" : ""}`}
                    onClick={() => {
                      tapImpact();
                      setSelected({ type: "transfer", tableId: table.id, tableNumber: table.number });
                    }}
                  >
                    <div className="mt2-list-row-info">
                      <span className="mt2-list-num">T{table.number}</span>
                      <span className="mt2-list-meta">
                        {area.name}{table.seats ? ` · ${table.seats} seats` : ""}
                      </span>
                    </div>
                    <span className={`mt2-radio2${sel ? " mt2-radio2-sel" : ""}`}>
                      {sel && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Occupied / merge targets */}
        {occupiedTables.length > 0 && (
          <div className="mt2-section">
            <div className="mt2-section-head">
              <span className="mt2-section-label">OR MERGE WITH OCCUPIED</span>
            </div>
            <div className="mt2-list-card">
              {occupiedTables.map(({ table, area, status, total }) => {
                const sel = selected?.tableId === table.id && selected?.type === "merge";
                const meta = [
                  statusLabel[status] || status,
                  total > 0 ? `₹${total.toLocaleString("en-IN")}` : "",
                ].filter(Boolean).join(" · ");
                return (
                  <button
                    key={table.id}
                    className={`mt2-list-row${sel ? " mt2-list-row-sel" : ""}`}
                    onClick={() => {
                      tapImpact();
                      setSelected({ type: "merge", tableId: table.id, tableNumber: table.number });
                    }}
                  >
                    <div className="mt2-list-row-info">
                      <span className="mt2-list-num">T{table.number}</span>
                      <span className="mt2-list-meta">{meta}</span>
                    </div>
                    <span className={`mt2-radio2${sel ? " mt2-radio2-sel" : ""}`}>
                      {sel && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt2-bottom">
        <button
          className={`mt2-confirm-btn${!selected ? " mt2-confirm-btn-dim" : ""}`}
          disabled={!selected}
          onClick={handleConfirm}
        >
          <span className="mt2-confirm-with-icon">
            {selected && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            )}
            {btnLabel}
          </span>
        </button>
      </div>
    </div>
  );
}
