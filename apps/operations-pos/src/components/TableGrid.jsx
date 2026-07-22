export function TableGrid({ areas, orders, selectedTableId, onSelectTable }) {
  function tableStatus(tableId) {
    const order = orders[tableId];
    const activeItems = order?.items?.filter(i => !i.isVoided && !i.isComp);
    if (!order || !activeItems?.length) return "available";
    if (order.isClosed)      return "closed";
    if (order.voidRequested) return "void";
    if (order.isOnHold)      return "hold";
    if (order.billRequested) return "bill";
    return "occupied";
  }

  function tableTotal(tableId) {
    const order = orders[tableId];
    const billable  = order?.items?.filter(i => !i.isVoided && !i.isComp);
    if (!billable?.length) return null;
    const subtotal  = billable.reduce((s, i) => s + i.price * i.quantity, 0);
    const disc      = Math.min(order.discountAmount || 0, subtotal);
    const afterDisc = subtotal - disc;
    const tax       = Math.round(billable.reduce((s, i) => {
      const lineAfter = subtotal > 0 ? (i.price * i.quantity) * (afterDisc / subtotal) : 0;
      const rate      = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
      return s + lineAfter * rate / 100;
    }, 0));
    return afterDisc + tax;
  }

  function tableGuests(tableId) {
    return orders[tableId]?.guests || 0;
  }

  function tableStaff(tableId) {
    const order = orders[tableId];
    if (!order) return null;
    const captain = order.captainName || null;
    const waiter  = order.assignedWaiter || null;
    if (!captain && !waiter) return null;
    if (captain && waiter && captain !== waiter) return `${captain} / ${waiter}`;
    return captain || waiter;
  }

  const statusLabels = {
    available: "Free",
    occupied:  "Occupied",
    hold:      "On Hold",
    bill:      "Bill Req",
    void:      "Void",
    closed:    "Closed"
  };

  return (
    <div className="table-grid-shell">
      {areas.map((area) => (
        <div key={area.id} className="table-area">
          <p className="table-area-label">{area.name}</p>
          <div className="table-area-grid">
            {area.tables.map((table) => {
              const status    = tableStatus(table.id);
              const isSelected = table.id === selectedTableId;
              const total     = tableTotal(table.id);
              const guests    = tableGuests(table.id);

              const isSplit = orders[table.id]?.isSplitBill && orders[table.id]?.billRequested;
              const seatCount = table.seats || 0;
              const staff = tableStaff(table.id);
              const hasNext = (!!orders[table.id]?.hasNextOrder && !!orders[table.id]?.billRequested)
                           || (!!orders[`${table.id}_next`] && !orders[`${table.id}_next`]?.isClosed);
              return (
                <button
                  key={table.id}
                  type="button"
                  className={`table-btn status-${status}${isSelected ? " selected" : ""}`}
                  onClick={() => onSelectTable(table.id)}
                >
                  <span className="table-btn-number">{table.number}</span>
                  <span className="table-btn-label">
                    {statusLabels[status]}
                    {isSplit && <span className="split-badge">SPLIT</span>}
                  </span>
                  {status !== "available" && total !== null && (
                    <span className="table-btn-amount">₹{total}</span>
                  )}
                  {seatCount > 0 && (
                    <span className="table-btn-seats">{seatCount} seats</span>
                  )}
                  {staff && status !== "available" && (
                    <span className="table-btn-staff">{staff}</span>
                  )}
                  {hasNext && (
                    <span className="table-btn-next">+NEW</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
