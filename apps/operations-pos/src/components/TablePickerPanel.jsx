import { useState } from "react";

export function TablePickerPanel({ tableAreas, orders, onSelectTable, serviceMode, onNewCounterOrder }) {
  const [activeArea, setActiveArea] = useState(null);

  function tableStatus(tableId) {
    const o = orders[tableId];
    // After handleSettle the order is reset to a blank order; isClosed won't exist.
    // We only show "closed" briefly before the reset — but the table is still clickable.
    if (!o || !o.items?.length) return "available";
    if (o.isClosed)      return "available";   // brief settle flash → treat as available
    if (o.isOnHold)      return "hold";
    if (o.voidRequested) return "void";
    if (o.billRequested) return "bill";
    return "occupied";
  }

  function tableTotal(tableId) {
    const o = orders[tableId];
    if (!o?.items?.length) return null;
    const billable  = o.items.filter(i => !i.isVoided && !i.isComp);
    const sub       = billable.reduce((s, i) => s + i.price * i.quantity, 0);
    const disc      = Math.min(o.discountAmount || 0, sub);
    const afterDisc = sub - disc;
    const tax       = billable.reduce((s, i) => {
      const lineAfter = sub > 0 ? (i.price * i.quantity) * (afterDisc / sub) : 0;
      const rate      = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
      return s + Math.round(lineAfter * rate / 100);
    }, 0);
    return afterDisc + tax;
  }

  const filtered = activeArea
    ? tableAreas.filter(a => a.id === activeArea)
    : tableAreas;

  const STATUS_COLORS = {
    available: { bg: "#ffffff", border: "#E2E8F0", text: "#374151",  label: "Free",     dot: "#10B981" },
    occupied:  { bg: "#FF6600", border: "#FF6600", text: "#ffffff",  label: "Occupied", dot: "#FF6600" },
    hold:      { bg: "#F59E0B", border: "#F59E0B", text: "#ffffff",  label: "On Hold",  dot: "#F59E0B" },
    bill:      { bg: "#3B82F6", border: "#3B82F6", text: "#ffffff",  label: "Bill",     dot: "#3B82F6" },
    void:      { bg: "#EF4444", border: "#EF4444", text: "#ffffff",  label: "Void",     dot: "#EF4444" },
    closed:    { bg: "#F1F5F9", border: "#E2E8F0", text: "#94A3B8",  label: "Closed",   dot: "#94A3B8" },
  };

  // Summary counts
  const allTables    = tableAreas.flatMap(a => a.tables);
  const freeCount    = allTables.filter(t => tableStatus(t.id) === "available").length;
  const occupiedCount = allTables.filter(t => tableStatus(t.id) === "occupied" || tableStatus(t.id) === "bill").length;
  const holdCount    = allTables.filter(t => tableStatus(t.id) === "hold").length;

  if (serviceMode !== "dine-in") {
    return (
      <div className="tpp">
        <div className="tpp-head">
          <h3>{serviceMode === "delivery" ? "🛵 Delivery" : "🛍 Takeaway"}</h3>
          <p>Create a numbered ticket for this order</p>
        </div>
        <button type="button" className="tpp-new-order-btn" onClick={onNewCounterOrder}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New {serviceMode === "delivery" ? "Delivery" : "Takeaway"} Order
        </button>
        <p className="tpp-hint">Each order gets a ticket number (#001, #002…)</p>
      </div>
    );
  }

  return (
    <div className="tpp">
      {/* Header */}
      <div className="tpp-head">
        <h3>🪑 Select Table</h3>
        <p>Pick a table to start billing</p>
      </div>

      {/* Status summary */}
      <div className="tpp-summary">
        <div className="tpp-sum-pill free">{freeCount} Free</div>
        <div className="tpp-sum-pill occ">{occupiedCount} Occupied</div>
        {holdCount > 0 && <div className="tpp-sum-pill hold">{holdCount} On Hold</div>}
      </div>

      {/* Area tabs */}
      {tableAreas.length > 1 && (
        <div className="tpp-area-tabs">
          <button type="button"
            className={`tpp-area-tab${!activeArea ? " active" : ""}`}
            onClick={() => setActiveArea(null)}>All</button>
          {tableAreas.map(a => (
            <button key={a.id} type="button"
              className={`tpp-area-tab${activeArea === a.id ? " active" : ""}`}
              onClick={() => setActiveArea(a.id)}>
              {a.name}
            </button>
          ))}
        </div>
      )}

      {/* Table grid */}
      <div className="tpp-areas">
        {filtered.map(area => (
          <div key={area.id} className="tpp-area">
            <p className="tpp-area-label">{area.name}</p>
            <div className="tpp-table-grid">
              {area.tables.map(table => {
                const st     = tableStatus(table.id);
                const col    = STATUS_COLORS[st] || STATUS_COLORS.available;
                const total  = tableTotal(table.id);
                const guests = orders[table.id]?.guests || 0;
                const isOpen = true; // tables are always clickable; closed state is reset instantly
                return (
                  <button
                    key={table.id}
                    type="button"
                    className={`tpp-table-btn${!isOpen ? " closed" : ""}`}
                    style={{
                      background:  col.bg,
                      borderColor: col.border,
                      color:       col.text
                    }}
                    disabled={!isOpen}
                    onClick={() => isOpen && onSelectTable(table.id)}
                  >
                    {/* Status dot */}
                    <span className="tpp-status-dot" style={{ background: col.dot || col.border }} />
                    <span className="tpp-table-num">{table.number}</span>
                    <span className="tpp-table-status" style={{ color: st === "available" ? col.dot : col.text }}>{col.label}</span>
                    {total !== null && <span className="tpp-table-amt">₹{total}</span>}
                    {guests > 0 && <span className="tpp-table-guests">{guests}p</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="tpp-legend">
        {Object.entries(STATUS_COLORS).slice(0, 4).map(([key, val]) => (
          <span key={key} className="tpp-legend-item"
            style={{ background: val.bg, color: val.text, borderColor: val.border }}>
            {val.label}
          </span>
        ))}
      </div>
    </div>
  );
}
