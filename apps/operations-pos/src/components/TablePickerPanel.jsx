import { useState } from "react";

export function TablePickerPanel({ tableAreas, orders, onSelectTable, serviceMode, onNewCounterOrder, onDeleteCounterOrder, gstTreatment = "exclusive" }) {
  const [activeArea, setActiveArea] = useState(null);
  const inclusive = gstTreatment === "inclusive";

  function tableStatus(tableId) {
    const o = orders[tableId];
    const activeItems = o?.items?.filter(i => !i.isVoided && !i.isComp);
    // After handleSettle the order is reset to a blank order; isClosed won't exist.
    // We only show "closed" briefly before the reset — but the table is still clickable.
    if (!o || !activeItems?.length) return "available";
    if (o.isClosed)      return "available";   // brief settle flash → treat as available
    if (o.isOnHold)      return "hold";
    if (o.voidRequested) return "void";
    if (o.billRequested) return "bill";
    return "occupied";
  }

  function tableTotal(tableId) {
    const o = orders[tableId];
    const billable  = o?.items?.filter(i => !i.isVoided && !i.isComp);
    if (!billable?.length) return null;
    const sub       = billable.reduce((s, i) => s + i.price * i.quantity, 0);
    const disc      = Math.min(o.discountAmount || 0, sub);
    const afterDisc = sub - disc;
    const tax       = billable.reduce((s, i) => {
      const lineAfter = sub > 0 ? (i.price * i.quantity) * (afterDisc / sub) : 0;
      const rate      = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 0;
      return s + Math.round(lineAfter * rate / (inclusive ? (100 + rate) : 100));
    }, 0);
    return inclusive ? afterDisc : afterDisc + tax;
  }

  const filtered = activeArea
    ? tableAreas.filter(a => a.id === activeArea)
    : tableAreas;

  const STATUS_COLORS = {
    available: { bg: "#ffffff", border: "#E2E8F0", text: "#374151",  label: "Free",     dot: "#059669" },
    occupied:  { bg: "#FF6600", border: "#FF6600", text: "#ffffff",  label: "Occupied", dot: "#059669" },
    hold:      { bg: "#F59E0B", border: "#F59E0B", text: "#ffffff",  label: "On Hold",  dot: "#059669" },
    bill:      { bg: "#3B82F6", border: "#3B82F6", text: "#ffffff",  label: "Bill",     dot: "#059669" },
    void:      { bg: "#EF4444", border: "#EF4444", text: "#ffffff",  label: "Void",     dot: "#059669" },
    closed:    { bg: "#F1F5F9", border: "#E2E8F0", text: "#94A3B8",  label: "Closed",   dot: "#94A3B8" },
  };

  // Summary counts
  const allTables    = tableAreas.flatMap(a => a.tables);
  const freeCount    = allTables.filter(t => tableStatus(t.id) === "available").length;
  const occupiedCount = allTables.filter(t => tableStatus(t.id) === "occupied" || tableStatus(t.id) === "bill").length;
  const holdCount    = allTables.filter(t => tableStatus(t.id) === "hold").length;

  if (serviceMode !== "dine-in") {
    const modeLabel   = serviceMode === "delivery" ? "Delivery" : "Takeaway";
    const modeIcon    = serviceMode === "delivery" ? "🛵" : "🛍";

    // Open counter tickets for this mode
    const openTickets = Object.values(orders).filter(
      o => o.isCounter && !o.isClosed &&
           (serviceMode === "delivery"
             ? (o.areaName === "Delivery" || o.onlinePlatform)
             : o.areaName !== "Delivery")
    );

    function fmt(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
    function ticketTotal(order) {
      const billable  = (order.items || []).filter(i => !i.isVoided && !i.isComp);
      const sub       = billable.reduce((s, i) => s + i.price * i.quantity, 0);
      const disc      = Math.min(order.discountAmount || 0, sub);
      const afterDisc = sub - disc;
      const tax       = billable.reduce((s, i) => {
        const lineAfter = sub > 0 ? (i.price * i.quantity) * (afterDisc / sub) : 0;
        const rate      = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 0;
        return s + Math.round(lineAfter * rate / (inclusive ? (100 + rate) : 100));
      }, 0);
      return inclusive ? afterDisc : afterDisc + tax;
    }

    return (
      <div className="tpp">
        <div className="tpp-head">
          <h3>{modeIcon} {modeLabel}</h3>
          <p>{openTickets.length} open order{openTickets.length !== 1 ? "s" : ""}</p>
        </div>

        <button type="button" className="tpp-new-order-btn" onClick={onNewCounterOrder}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New {modeLabel} Order
        </button>

        {/* Open tickets list */}
        {openTickets.length === 0 ? (
          <p className="tpp-hint">No open orders · tap above to start one</p>
        ) : (
          <div className="tpp-counter-list">
            {openTickets
              .sort((a, b) => (a.ticketNumber || 0) - (b.ticketNumber || 0))
              .map(ticket => {
                const total   = ticketTotal(ticket);
                const itemCnt = (ticket.items || []).filter(i => !i.isVoided).reduce((s, i) => s + i.quantity, 0);
                return (
                  <div key={ticket.tableId}
                    className={`tpp-counter-ticket${ticket.billRequested ? " bill-req" : ""}`}>
                    <button type="button" className="tpp-ct-main"
                      onClick={() => onSelectTable(ticket.tableId)}>
                      <div className="tpp-ct-row">
                        <span className="tpp-ct-num">#{String(ticket.ticketNumber || "").padStart(3, "0")}</span>
                        {ticket.billRequested && <span className="tpp-ct-bill-tag">Bill</span>}
                        {ticket.onlinePlatform && <span className="tpp-ct-platform">{ticket.onlinePlatform}</span>}
                        {itemCnt === 0 && <span className="tpp-ct-empty-tag">Empty</span>}
                      </div>
                      <div className="tpp-ct-meta">
                        {itemCnt} item{itemCnt !== 1 ? "s" : ""}
                        {total > 0 && <span className="tpp-ct-total">{fmt(total)}</span>}
                      </div>
                    </button>
                    {itemCnt === 0 && onDeleteCounterOrder && (
                      <button type="button" className="tpp-ct-delete"
                        title="Remove empty order"
                        onClick={e => { e.stopPropagation(); onDeleteCounterOrder(ticket.tableId); }}>
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tpp">
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
                    {(table.seats || 0) > 0 && <span className="tpp-table-seats">{table.seats} seats</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
