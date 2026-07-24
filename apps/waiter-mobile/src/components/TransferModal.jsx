import { useState } from "react";
import { tapImpact } from "../lib/haptics";
import { tableStatusOf } from "./TableFloor";

const OCCUPIED_STATUS_LABEL = {
  running: "Dining",
  bill:    "Bill ready",
};

export function TransferModal({
  currentTableId, currentOrder, areas, orders, defaultTaxRate = 0,
  onTransfer, onMerge, onClose,
}) {
  const [selected, setSelected] = useState(null);
  // { type: 'transfer'|'merge', tableId, tableNumber }

  // Header subtitle: "From Table T{num} · {area} · ₹{amount}"
  const fromTableNum = currentOrder?.tableNumber;
  const fromArea = currentOrder?.areaName ||
    areas.find(a => a.tables.some(t => t.id === currentTableId))?.name || "";
  const fromItems = (currentOrder?.items || []).filter(i => !i.isVoided && !i.isComp);
  const fromSub = fromItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  const fromTax = fromItems.reduce((s, i) => {
    const r = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : defaultTaxRate;
    return s + Math.round((i.price || 0) * (i.quantity || 0) * r / 100);
  }, 0);
  const fromTotal = fromSub + fromTax;
  const headerSubtitle = [
    fromTableNum ? `From Table T${fromTableNum}` : null,
    fromArea || null,
    fromTotal > 0 ? `₹${fromTotal.toLocaleString("en-IN")}` : null,
  ].filter(Boolean).join(" · ");

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
          const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : defaultTaxRate;
          return s + Math.round((i.price || 0) * (i.quantity || 0) * rate / 100);
        }, 0);
        const guests = o?.covers || o?.guests || 0;
        occupiedTables.push({ table: t, area, order: o, total: sub + tax, st, guests });
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
    : `↔ Move to T${selected.tableNumber}`;

  return (
    <div className="mt2-page">
      <div className="mt2-header">
        <button className="mt2-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="mt2-header-text">
          <h2 className="mt2-title">Move table</h2>
          {headerSubtitle && <p className="mt2-subtitle">{headerSubtitle}</p>}
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
              {freeTables.map(({ table, area }, idx) => {
                const sel = selected?.tableId === table.id && selected?.type === "transfer";
                return (
                  <button
                    key={table.id}
                    className={`mt2-list-row${sel ? " mt2-list-row-sel" : ""}${idx > 0 ? " mt2-list-row-bordered" : ""}`}
                    onClick={() => {
                      tapImpact();
                      setSelected({ type: "transfer", tableId: table.id, tableNumber: table.number });
                    }}
                  >
                    <div className="mt2-list-info">
                      <span className="mt2-list-num">T{table.number}</span>
                      <span className="mt2-list-sub">
                        {[area.name, table.seats > 0 ? `${table.seats} seats` : null].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <span className={`mt2-radio${sel ? " mt2-radio-sel" : ""}`} />
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
              {occupiedTables.map(({ table, area, total, st, guests }, idx) => {
                const sel = selected?.tableId === table.id && selected?.type === "merge";
                const stLabel = OCCUPIED_STATUS_LABEL[st] || "Occupied";
                const subParts = [
                  stLabel,
                  guests ? `${guests} guests` : null,
                  total > 0 ? `₹${total.toLocaleString("en-IN")}` : null,
                ].filter(Boolean);
                return (
                  <button
                    key={table.id}
                    className={`mt2-list-row${sel ? " mt2-list-row-sel" : ""}${idx > 0 ? " mt2-list-row-bordered" : ""}`}
                    onClick={() => {
                      tapImpact();
                      setSelected({ type: "merge", tableId: table.id, tableNumber: table.number });
                    }}
                  >
                    <div className="mt2-list-info">
                      <span className="mt2-list-num">T{table.number}</span>
                      <span className="mt2-list-sub">{subParts.join(" · ")}</span>
                    </div>
                    <span className={`mt2-radio${sel ? " mt2-radio-sel" : ""}`} />
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
          {btnLabel}
        </button>
      </div>
    </div>
  );
}
