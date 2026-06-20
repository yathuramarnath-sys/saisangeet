import { useMemo } from "react";
import { getFinancials } from "./OrderPanel";

// An order is "held / in progress" if it has at least one item already sent
// to the kitchen (KOT) and isn't closed yet — no separate flag/toggle needed.
export function isHeldOrder(order) {
  if (!order || order.isClosed) return false;
  return (order.items || []).some(i => i.sentToKot && !i.isVoided);
}

export function HeldOrdersModal({ orders, onSelect, onClose, gstTreatment = "exclusive" }) {
  const held = useMemo(() => {
    return Object.values(orders || {})
      .filter(isHeldOrder)
      .sort((a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0));
  }, [orders]);

  function label(order) {
    if (order.isCounter) {
      return `${order.areaName || "Counter"} #${String(order.ticketNumber || "").padStart(3, "0")}`;
    }
    return `Table ${order.tableNumber} · ${order.areaName || ""}`;
  }

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sm-modal" style={{ maxWidth: 420 }}>
        <div className="sm-head">
          <div>
            <h3>⏳ Held Orders</h3>
            <p className="sm-sub">{held.length} order{held.length !== 1 ? "s" : ""} with KOT sent · not yet billed</p>
          </div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="sm-body" style={{ gap: 8 }}>
          {held.length === 0 && (
            <p className="tpp-hint">No held orders right now</p>
          )}
          {held.map(order => {
            const fin = getFinancials(order, { gstTreatment });
            const itemCount = (order.items || []).filter(i => !i.isVoided).reduce((s, i) => s + i.quantity, 0);
            return (
              <button
                key={order.tableId}
                type="button"
                className="held-order-row"
                onClick={() => { onSelect(order.tableId); onClose(); }}
              >
                <div className="held-order-row-main">
                  <span className="held-order-row-label">{label(order)}</span>
                  <span className="held-order-row-meta">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
                </div>
                {fin && <span className="held-order-row-total">₹{fin.total}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
