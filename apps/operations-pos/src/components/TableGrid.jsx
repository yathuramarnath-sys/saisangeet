export function TableGrid({ areas, orders, selectedTableId, onSelectTable }) {
  function tableStatus(tableId) {
    const order = orders[tableId];
    if (!order || !order.items?.length) return "available";
    if (order.isClosed)     return "closed";
    if (order.voidRequested) return "void";
    if (order.isOnHold)     return "hold";
    if (order.billRequested) return "bill";
    return "occupied";
  }

  function tableTotal(tableId) {
    const order = orders[tableId];
    if (!order?.items?.length) return null;
    const billable  = order.items.filter(i => !i.isVoided && !i.isComp);
    const subtotal  = billable.reduce((s, i) => s + i.price * i.quantity, 0);
    const disc      = Math.min(order.discountAmount || 0, subtotal);
    const afterDisc = subtotal - disc;
    const tax       = billable.reduce((s, i) => {
      const lineAfter = subtotal > 0 ? (i.price * i.quantity) * (afterDisc / subtotal) : 0;
      const rate      = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
      return s + Math.round(lineAfter * rate / 100);
    }, 0);
    return afterDisc + tax;
  }

  function tableGuests(tableId) {
    return orders[tableId]?.guests || 0;
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

              return (
                <button
                  key={table.id}
                  type="button"
                  className={`table-btn status-${status}${isSelected ? " selected" : ""}`}
                  onClick={() => onSelectTable(table.id)}
                >
                  <span className="table-btn-number">{table.number}</span>
                  <span className="table-btn-label">{statusLabels[status]}</span>
                  {status !== "available" && total !== null && (
                    <span className="table-btn-amount">₹{total}</span>
                  )}
                  {guests > 0 && status !== "available" && (
                    <span className="table-btn-seats">{guests}p</span>
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
