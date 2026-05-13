import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { AdvanceOrderModal } from "./AdvanceOrderModal";

/**
 * AdvanceOrdersPanel — slide-in panel listing all advance bookings.
 *
 * Props:
 *   outlet         {id, name}
 *   menuItems      [{id, name, price, ...}]
 *   tableAreas     [{id, name, tables: [{id, number, ...}]}]
 *   orders         { [tableId]: orderObject } — live POS order state
 *   onClose        ()
 *   onCheckIn      (advanceOrder, tableId) — called after table is picked; App loads items
 */
export function AdvanceOrdersPanel({ outlet, menuItems = [], tableAreas = [], orders = {}, onClose, onCheckIn }) {
  const outletId = outlet?.id || "unknown";

  const [advOrders,    setAdvOrders]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filterStatus, setFilterStatus] = useState("active");
  const [editOrder,    setEditOrder]    = useState(null);
  const [showNew,      setShowNew]      = useState(false);
  const [actionBusy,   setActionBusy]   = useState(null);

  // Table picker state
  const [pendingCheckin, setPendingCheckin] = useState(null); // advance order awaiting table pick

  // ── Load orders ─────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    try {
      const statusParam = filterStatus !== "all" ? `&status=${filterStatus}` : "";
      const res = await api.get(`/advance-orders?outletId=${outletId}${statusParam}`);
      setAdvOrders(res.orders || []);
    } catch {
      setAdvOrders([]);
    } finally {
      setLoading(false);
    }
  }, [outletId, filterStatus]);

  useEffect(() => {
    setLoading(true);
    loadOrders();
  }, [loadOrders]);

  // ── Free tables for the picker ───────────────────────────────────────────────
  const freeTables = tableAreas.flatMap((area) =>
    area.tables
      .filter((t) => {
        const o = orders[t.id];
        const activeItems = o?.items?.filter((i) => !i.isVoided && !i.isComp);
        return !activeItems?.length && !o?.billRequested;
      })
      .map((t) => ({ ...t, areaName: area.name }))
  );

  // ── Check In → route by order type ─────────────────────────────────────────
  function startCheckIn(order) {
    if (order.orderType === "takeaway" || order.orderType === "delivery") {
      // No table needed — check in directly
      confirmCheckIn(null, order);
    } else {
      // Dine-in → show table picker
      setPendingCheckin(order);
    }
  }

  // ── Table picked (or null for counter) → API check-in → notify App ──────────
  async function confirmCheckIn(table, orderOverride) {
    const order = orderOverride || pendingCheckin;
    setPendingCheckin(null);
    setActionBusy(order.id);
    try {
      const res = await api.post(`/advance-orders/${order.id}/checkin`, {
        outletId,
        assignedTableId: table?.id || null,
      });
      setAdvOrders((prev) => prev.map((o) => o.id === order.id ? res.order : o));
      onCheckIn?.(res.order, table?.id || null);
    } catch (err) {
      alert("Check-in failed: " + (err.message || "Unknown error"));
    } finally {
      setActionBusy(null);
    }
  }

  // ── Cancel ───────────────────────────────────────────────────────────────────
  async function handleCancel(order) {
    const reason = window.prompt(
      `Cancel booking for "${order.customerName}"?\nEnter reason (optional):`
    );
    if (reason === null) return;
    setActionBusy(order.id);
    try {
      const res = await api.delete(`/advance-orders/${order.id}`, { outletId, reason });
      setAdvOrders((prev) => prev.map((o) => o.id === order.id ? res.order : o));
    } catch (err) {
      alert("Cancel failed: " + (err.message || "Unknown error"));
    } finally {
      setActionBusy(null);
    }
  }

  // ── Print slip ───────────────────────────────────────────────────────────────
  async function handlePrint(order) {
    try {
      const res = await api.get(`/advance-orders/${order.id}/print?outletId=${outletId}`);
      printAdvanceSlip(res.printData, outlet);
    } catch (err) {
      alert("Print failed: " + (err.message || "Unknown error"));
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function fmtDate(d) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
  }
  function fmtPrice(n) {
    return `₹${Number(n || 0).toLocaleString("en-IN")}`;
  }
  function statusBadge(status) {
    const map = {
      pending:   { label: "Pending",    cls: "adv-badge-pending"   },
      confirmed: { label: "Confirmed",  cls: "adv-badge-confirmed" },
      checkedin: { label: "Checked In", cls: "adv-badge-checkedin" },
      cancelled: { label: "Cancelled",  cls: "adv-badge-cancelled" },
    };
    const info = map[status] || { label: status, cls: "" };
    return <span className={`adv-status-badge ${info.cls}`}>{info.label}</span>;
  }

  function orderTypeBadge(orderType) {
    const map = {
      "dine-in":  { icon: "🪑", label: "Dine-In",  cls: "adv-otype-dinein"  },
      "takeaway": { icon: "🛍️", label: "Takeaway", cls: "adv-otype-takeaway" },
      "delivery": { icon: "🛵", label: "Delivery", cls: "adv-otype-delivery" },
    };
    const info = map[orderType] || { icon: "🪑", label: "Dine-In", cls: "adv-otype-dinein" };
    return (
      <span className={`adv-otype-badge ${info.cls}`}>
        {info.icon} {info.label}
      </span>
    );
  }

  const tabs = [
    { id: "active",    label: "Upcoming"   },
    { id: "checkedin", label: "Checked In" },
    { id: "cancelled", label: "Cancelled"  },
    { id: "all",       label: "All"        },
  ];

  return (
    <>
      {/* ── Panel overlay ─────────────────────────────────────────────────── */}
      <div className="advp-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} />
      <div className="advp-panel">

        {/* Header */}
        <div className="advp-head">
          <div>
            <h3>📅 Advance Orders</h3>
            <p>{outlet?.name || "Outlet"}</p>
          </div>
          <div className="advp-head-actions">
            <button type="button" className="advp-new-btn" onClick={() => setShowNew(true)}>
              + New Booking
            </button>
            <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="advp-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`advp-tab${filterStatus === t.id ? " active" : ""}`}
              onClick={() => setFilterStatus(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="advp-body">
          {loading ? (
            <div className="advp-loading">Loading bookings…</div>
          ) : advOrders.length === 0 ? (
            <div className="advp-empty">
              <div className="advp-empty-icon">📅</div>
              <p>No bookings found.</p>
              <button type="button" className="advp-new-btn" onClick={() => setShowNew(true)}>
                + Create First Booking
              </button>
            </div>
          ) : (
            <div className="advp-list">
              {advOrders.map((order) => {
                const isBusy     = actionBusy === order.id;
                const itemsTotal = (order.items || []).reduce(
                  (s, i) => s + (i.price || 0) * (i.quantity || 1), 0
                );
                const balanceDue = Math.max(0, itemsTotal - (order.advanceAmount || 0));

                return (
                  <div key={order.id} className={`advp-card${order.status === "cancelled" ? " cancelled" : ""}`}>

                    {/* Card header */}
                    <div className="advp-card-head">
                      <div className="advp-card-who">
                        <span className="advp-cust-name">{order.customerName}</span>
                        <span className="advp-cust-phone">{order.phone}</span>
                        <div className="advp-badges-row">
                          {statusBadge(order.status)}
                          {orderTypeBadge(order.orderType)}
                        </div>
                      </div>
                      <div className="advp-card-when">
                        <span className="advp-when-date">{fmtDate(order.date)}</span>
                        <span className="advp-when-time">{order.time}</span>
                        <span className="advp-guests">{order.guests} pax</span>
                      </div>
                    </div>

                    {/* Note */}
                    {order.note && (
                      <div className="advp-card-note">📝 {order.note}</div>
                    )}

                    {/* Pre-ordered items */}
                    {order.items?.length > 0 ? (
                      <div className="advp-card-items">
                        {order.items.map((item) => (
                          <span key={item.menuItemId} className="advp-item-chip">
                            {item.name} ×{item.quantity}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="advp-no-items">No items pre-ordered</div>
                    )}

                    {/* Financial summary */}
                    <div className="advp-card-fin">
                      {itemsTotal > 0 && (
                        <span className="advp-fin-item">
                          Items: <strong>{fmtPrice(itemsTotal)}</strong>
                        </span>
                      )}
                      {order.advanceAmount > 0 && (
                        <span className="advp-fin-item adv-paid">
                          Advance: <strong>{fmtPrice(order.advanceAmount)}</strong>
                          {order.advanceMethod && <em> ({order.advanceMethod.toUpperCase()})</em>}
                        </span>
                      )}
                      {order.advanceAmount > 0 && itemsTotal > 0 && (
                        <span className="advp-fin-item adv-balance">
                          Balance Due: <strong>{fmtPrice(balanceDue)}</strong>
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    {order.status !== "checkedin" && order.status !== "cancelled" && (
                      <div className="advp-card-actions">
                        <button
                          type="button"
                          className="advp-action-btn checkin"
                          disabled={isBusy}
                          onClick={() => startCheckIn(order)}
                        >
                          {isBusy ? "…" : "✓ Check In"}
                        </button>
                        <button
                          type="button"
                          className="advp-action-btn edit"
                          disabled={isBusy}
                          onClick={() => setEditOrder(order)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          className="advp-action-btn print"
                          disabled={isBusy}
                          onClick={() => handlePrint(order)}
                        >
                          🖨️ Print
                        </button>
                        <button
                          type="button"
                          className="advp-action-btn cancel"
                          disabled={isBusy}
                          onClick={() => handleCancel(order)}
                        >
                          ✕ Cancel
                        </button>
                      </div>
                    )}

                    {order.status === "checkedin" && (
                      <div className="advp-checkedin-row">
                        ✓ Checked in ·{" "}
                        {new Date(order.checkedInAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit", minute: "2-digit",
                        })}
                        {order.assignedTableId && (
                          <span style={{ marginLeft: 6, opacity: 0.8 }}>
                            · Table {order.assignedTableId}
                          </span>
                        )}
                        <button
                          type="button"
                          className="advp-action-btn print"
                          style={{ marginLeft: "auto" }}
                          onClick={() => handlePrint(order)}
                        >
                          🖨️ Print
                        </button>
                      </div>
                    )}

                    {order.status === "cancelled" && order.cancelReason && (
                      <div className="advp-cancel-reason">Reason: {order.cancelReason}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Table picker overlay ──────────────────────────────────────────── */}
      {pendingCheckin && (
        <div className="advp-table-picker-overlay" onClick={() => setPendingCheckin(null)}>
          <div className="advp-table-picker" onClick={(e) => e.stopPropagation()}>
            <div className="advp-tp-head">
              <div>
                <h4>Assign Table</h4>
                <p>
                  <strong>{pendingCheckin.customerName}</strong> ·{" "}
                  {pendingCheckin.guests} pax ·{" "}
                  {pendingCheckin.time}
                  {pendingCheckin.items?.length > 0 && (
                    <span className="advp-tp-items-hint">
                      {" "}· {pendingCheckin.items.length} item{pendingCheckin.items.length !== 1 ? "s" : ""} pre-ordered
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                className="sm-close-btn"
                onClick={() => setPendingCheckin(null)}
              >
                ✕
              </button>
            </div>

            {freeTables.length === 0 ? (
              <div className="advp-tp-empty">
                <p>No free tables available right now.</p>
                <p>Clear a table first or seat the customer at the counter.</p>
              </div>
            ) : (
              <>
                <p className="advp-tp-hint">
                  🪑 Pick a free table — pre-ordered items load automatically onto the order.
                </p>
                <div className="advp-tp-grid">
                  {freeTables.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      className="advp-tp-table"
                      onClick={() => confirmCheckIn(table)}
                    >
                      <span className="advp-tp-num">T{table.number}</span>
                      <span className="advp-tp-area">{table.areaName}</span>
                      <span className="advp-tp-free">Free</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Edit modal ────────────────────────────────────────────────────── */}
      {editOrder && (
        <AdvanceOrderModal
          outlet={outlet}
          menuItems={menuItems}
          editOrder={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={(updated) => {
            setAdvOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o));
            setEditOrder(null);
          }}
        />
      )}

      {/* ── New booking modal ─────────────────────────────────────────────── */}
      {showNew && (
        <AdvanceOrderModal
          outlet={outlet}
          menuItems={menuItems}
          onClose={() => setShowNew(false)}
          onSaved={(order) => {
            setAdvOrders((prev) => [order, ...prev]);
            setShowNew(false);
          }}
        />
      )}
    </>
  );
}

// ── Thermal print slip ────────────────────────────────────────────────────────

function printAdvanceSlip(printData, outlet) {
  if (!printData) return;

  const { order, itemsTotal, balanceDue } = printData;
  const outletName  = outlet?.name  || order.outletName || "Restaurant";
  const outletPhone = outlet?.phone || "";
  const outletAddr  = [outlet?.addressLine1, outlet?.city].filter(Boolean).join(", ");

  const fmtDate = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });

  const itemRows = (order.items || []).map((i) =>
    `<tr>
       <td>${i.name}</td>
       <td class="r">×${i.quantity}</td>
       <td class="r">₹${(i.price * i.quantity).toLocaleString("en-IN")}</td>
     </tr>`
  ).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @page { margin: 0; size: 80mm auto; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; padding: 4mm 0; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
  .sub { text-align: center; font-size: 11px; color: #555; }
  .divider { border: none; border-top: 1px dashed #999; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; font-size: 11px; }
  .r { text-align: right; }
  .bold { font-weight: bold; }
  .total-row td { font-weight: bold; font-size: 13px; padding-top: 4px; border-top: 1px solid #000; }
  .fin-row td { font-size: 11px; }
  .advance-label { text-align: center; font-size: 16px; font-weight: bold; margin: 6px 0; letter-spacing: 1px; }
  .footer { text-align: center; font-size: 10px; color: #777; margin-top: 6px; }
</style></head><body>
<h1>${outletName}</h1>
${outletAddr ? `<p class="sub">${outletAddr}</p>` : ""}
${outletPhone ? `<p class="sub">☎ ${outletPhone}</p>` : ""}
<hr class="divider">
<p class="advance-label">ADVANCE BOOKING SLIP</p>
<hr class="divider">

<table>
  <tr><td class="bold">Customer</td><td class="r">${order.customerName}</td></tr>
  <tr><td class="bold">Phone</td><td class="r">${order.phone}</td></tr>
  <tr><td class="bold">Date</td><td class="r">${fmtDate(order.date)}</td></tr>
  <tr><td class="bold">Time</td><td class="r">${order.time}</td></tr>
  <tr><td class="bold">Guests</td><td class="r">${order.guests} pax</td></tr>
</table>

${order.note ? `<hr class="divider"><p><em>Note: ${order.note}</em></p>` : ""}

${order.items?.length > 0 ? `
<hr class="divider">
<p class="bold">Pre-Ordered Items</p>
<table>
  ${itemRows}
  <tr class="total-row"><td>Total</td><td></td><td class="r">₹${itemsTotal.toLocaleString("en-IN")}</td></tr>
</table>` : ""}

${order.advanceAmount > 0 ? `
<hr class="divider">
<table>
  <tr class="fin-row"><td>Advance Paid</td><td class="r bold">₹${Number(order.advanceAmount).toLocaleString("en-IN")} (${(order.advanceMethod || "—").toUpperCase()})</td></tr>
  ${order.advanceRef ? `<tr class="fin-row"><td>Ref</td><td class="r">${order.advanceRef}</td></tr>` : ""}
  <tr class="fin-row"><td class="bold">Balance Due on Arrival</td><td class="r bold">₹${balanceDue.toLocaleString("en-IN")}</td></tr>
</table>` : ""}

<hr class="divider">
<p class="footer">Booked: ${new Date(order.createdAt).toLocaleString("en-IN")}</p>
<p class="footer">Please arrive on time. Thank you!</p>
</body></html>`;

  if (window.electronAPI?.printHTML) {
    window.electronAPI.printHTML(html);
    return;
  }
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.print(); w.close(); };
}
