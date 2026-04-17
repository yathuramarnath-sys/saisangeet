export function TableGrid({ areas, orders, selectedTableId, onSelectTable }) {
  function tableStatus(tableId) {
    const order = orders[tableId];
    if (!order || !order.items?.length) return "available";
    if (order.voidRequested) return "void";
    if (order.billRequested) return "bill";
    if (order.isClosed) return "closed";
    return "occupied";
  }

  function tableGuests(tableId) {
    return orders[tableId]?.guests || 0;
  }

  function tableTotal(tableId) {
    const order = orders[tableId];
    if (!order?.items?.length) return null;
    const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
    return `₹${Math.round(subtotal)}`;
  }

  const statusLabels = {
    available: "Free",
    occupied: "Occupied",
    bill: "Bill",
    void: "Void",
    closed: "Closed"
  };

  return (
    <div className="table-grid-shell">
      {areas.map((area) => (
        <div key={area.id} className="table-area">
          <p className="table-area-label">{area.name}</p>
          <div className="table-area-grid">
            {area.tables.map((table) => {
              const status = tableStatus(table.id);
              const isSelected = table.id === selectedTableId;
              const guests = tableGuests(table.id);
              const total = tableTotal(table.id);

              return (
                <button
                  key={table.id}
                  type="button"
                  className={`table-btn status-${status}${isSelected ? " selected" : ""}`}
                  onClick={() => onSelectTable(table.id)}
                >
                  <span className="table-btn-number">{table.number}</span>
                  <span className="table-btn-status">{statusLabels[status]}</span>
                  {status !== "available" && (
                    <span className="table-btn-meta">
                      {guests > 0 && <span>{guests}p</span>}
                      {total && <span>{total}</span>}
                    </span>
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
