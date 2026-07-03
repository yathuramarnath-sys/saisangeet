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
        occupiedTables.push({ table: t, area, order: o, total: sub + tax });
      }
    });
  });

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
    ? `Move to Table ${selected.tableNumber}`
    : `Merge with Table ${selected.tableNumber}`;

  return (
    <div className="mt2-page">
      <div className="mt2-header">
        <button className="mt2-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 className="mt2-title">
          Move {currentOrder?.tableNumber ? `Table ${currentOrder.tableNumber}` : "Table"}
        </h2>
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
            <div className="mt2-table-grid">
              {freeTables.map(({ table, area }) => {
                const sel = selected?.tableId === table.id && selected?.type === "transfer";
                return (
                  <button
                    key={table.id}
                    className={`mt2-table-chip${sel ? " mt2-table-chip-sel" : ""}`}
                    onClick={() => {
                      tapImpact();
                      setSelected({ type: "transfer", tableId: table.id, tableNumber: table.number });
                    }}
                  >
                    <span className="mt2-chip-num">T{table.number}</span>
                    <span className="mt2-chip-area">{area.name}</span>
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
            {occupiedTables.map(({ table, area, total }) => {
              const sel = selected?.tableId === table.id && selected?.type === "merge";
              return (
                <button
                  key={table.id}
                  className={`mt2-merge-row${sel ? " mt2-merge-row-sel" : ""}`}
                  onClick={() => {
                    tapImpact();
                    setSelected({ type: "merge", tableId: table.id, tableNumber: table.number });
                  }}
                >
                  <div className="mt2-merge-info">
                    <span className="mt2-merge-num">Table {table.number}</span>
                    <span className="mt2-merge-area">{area.name}</span>
                  </div>
                  <div className="mt2-merge-right">
                    {total > 0 && (
                      <span className="mt2-merge-amount">₹{total.toLocaleString("en-IN")}</span>
                    )}
                    <span className={`mt2-radio${sel ? " mt2-radio-sel" : ""}`} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt2-bottom">
        <button
          className={`mt2-confirm-btn${!selected ? " mt2-confirm-btn-dim" : ""}`}
          disabled={!selected}
          onClick={handleConfirm}
        >
          {btnLabel}
        </button>
      </div>
    </div>
  );
}
