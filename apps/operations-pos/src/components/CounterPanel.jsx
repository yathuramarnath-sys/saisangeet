/* Counter / Ticket panel — shown for Takeaway & Delivery modes */

export function CounterPanel({ orders, selectedId, onSelect, onNewOrder, mode }) {
  const tickets = Object.values(orders).filter(o => o.isCounter && !o.isClosed);
  const closed  = Object.values(orders).filter(o => o.isCounter && o.isClosed).slice(-3);

  function fmt(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }

  function ticketTotal(order) {
    const sub  = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0);
    const disc = Math.min(order.discountAmount || 0, sub);
    return Math.round((sub - disc) * 1.05);
  }

  const modeLabel = mode === "delivery" ? "Delivery" : "Takeaway";
  const modeIcon  = mode === "delivery" ? "🛵" : "🛍";

  return (
    <div className="counter-panel">
      {/* New Order button */}
      <div className="counter-top">
        <button type="button" className="counter-new-btn" onClick={onNewOrder}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New {modeLabel} Order
        </button>
      </div>

      {/* Open tickets */}
      <div className="counter-section-label">
        {modeIcon} Open — {tickets.length} order{tickets.length !== 1 ? "s" : ""}
      </div>

      {tickets.length === 0 && (
        <div className="counter-empty">
          <p>No open orders</p>
          <span>Tap "New {modeLabel} Order" to start</span>
        </div>
      )}

      <div className="counter-list">
        {tickets.map(ticket => {
          const total    = ticketTotal(ticket);
          const itemCnt  = (ticket.items || []).reduce((s, i) => s + i.quantity, 0);
          const isActive = ticket.tableId === selectedId;

          return (
            <button key={ticket.tableId} type="button"
              className={`counter-ticket${isActive ? " active" : ""}${ticket.billRequested ? " bill" : ""}`}
              onClick={() => onSelect(ticket.tableId)}>
              <div className="ct-top">
                <span className="ct-num">#{String(ticket.ticketNumber || "").padStart(3, "0")}</span>
                {ticket.billRequested && <span className="ct-bill-tag">Bill</span>}
              </div>
              <div className="ct-items">{itemCnt} item{itemCnt !== 1 ? "s" : ""}</div>
              {total > 0 && <div className="ct-total">{fmt(total)}</div>}
            </button>
          );
        })}
      </div>

      {/* Recently closed */}
      {closed.length > 0 && (
        <>
          <div className="counter-section-label" style={{ marginTop: 12 }}>
            ✓ Closed
          </div>
          <div className="counter-list">
            {closed.map(ticket => (
              <div key={ticket.tableId} className="counter-ticket closed">
                <div className="ct-top">
                  <span className="ct-num">#{String(ticket.ticketNumber || "").padStart(3, "0")}</span>
                  <span className="ct-bill-tag closed">Paid</span>
                </div>
                <div className="ct-total">{fmt(ticketTotal(ticket))}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
