import { useMemo } from "react";

function elapsedLabel(sentAt) {
  if (!sentAt) return "";
  const mins = Math.floor((Date.now() - new Date(sentAt).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} mins ago`;
}

export function KitchenTab({ orders, tableAreas }) {
  const activeKitchenOrders = useMemo(() => {
    const result = [];

    Object.entries(orders || {}).forEach(([tableId, order]) => {
      if (!order || order.isClosed) return;
      const items = (order.items || []).filter(i => !i.isVoided);
      if (!items.length) return;

      const sentItems    = items.filter(i => i.sentToKot);
      const pendingItems = items.filter(i => !i.sentToKot);

      if (!sentItems.length && !pendingItems.length) return;

      // Build table label
      let area = null;
      let table = null;
      for (const a of (tableAreas || [])) {
        table = (a.tables || []).find(t => t.id === tableId);
        if (table) { area = a; break; }
      }
      const isCounter  = tableId.startsWith("counter-");
      const tableLabel = isCounter
        ? `Ticket #${String(order.ticketNumber || "").padStart(3, "0")}`
        : table
          ? `${area?.name || "Table"} · T${table.number}`
          : tableId;

      const serviceMode  = order.serviceMode || "dine-in";
      const modeLabel    = serviceMode === "takeaway" ? "Takeaway"
                         : serviceMode === "delivery" ? "Delivery"
                         : null;

      // Earliest sentAt among sent items (for elapsed time)
      const sentAt = sentItems.reduce((earliest, i) => {
        if (!i.sentAt) return earliest;
        const t = new Date(i.sentAt).getTime();
        return !earliest || t < earliest ? t : earliest;
      }, null);

      result.push({ tableId, order, tableLabel, modeLabel, sentItems, pendingItems, sentAt });
    });

    // Sort: pending KOT first, then by sentAt (oldest first)
    return result.sort((a, b) => {
      const aPending = a.pendingItems.length > 0 ? 1 : 0;
      const bPending = b.pendingItems.length > 0 ? 1 : 0;
      if (bPending !== aPending) return bPending - aPending;
      return (a.sentAt || 0) - (b.sentAt || 0);
    });
  }, [orders, tableAreas]);

  const totalInKitchen = activeKitchenOrders.reduce((s, o) => s + o.sentItems.length, 0);
  const pendingCount   = activeKitchenOrders.filter(o => o.pendingItems.length > 0).length;

  return (
    <>
      <div className="kitchen-header">
        <div className="kitchen-title">Kitchen</div>
        <div className="kitchen-subtitle">
          {activeKitchenOrders.length} active orders · {totalInKitchen} items in kitchen
          {pendingCount > 0 && ` · ${pendingCount} with unsent KOT`}
        </div>
      </div>

      <div className="kitchen-grid">
        {activeKitchenOrders.length === 0 && (
          <div className="kitchen-empty">No active orders in kitchen right now</div>
        )}

        {activeKitchenOrders.map(({ tableId, tableLabel, modeLabel, sentItems, pendingItems, sentAt }) => (
          <div key={tableId} className="kitchen-card">
            <div className="kitchen-card-head">
              <div>
                <div className="kitchen-card-table">
                  {tableLabel}{modeLabel ? ` · ${modeLabel}` : ""}
                </div>
              </div>
              {sentAt && (
                <div className="kitchen-card-time">{elapsedLabel(sentAt)}</div>
              )}
            </div>

            <div className="kitchen-card-items">
              {sentItems.map((item, i) => (
                <div key={i} className="kitchen-item-row">
                  <span className="kitchen-item-qty">{item.quantity}×</span>
                  <span className="kitchen-item-name">{item.name}</span>
                  {item.kotNumber != null && (
                    <span className="kitchen-item-kot">KOT #{String(item.kotNumber).padStart(4, "0")}</span>
                  )}
                </div>
              ))}
            </div>

            {pendingItems.length > 0 && (
              <div className="kitchen-pending-badge">
                + {pendingItems.length} item{pendingItems.length !== 1 ? "s" : ""} not yet sent to kitchen
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
