import { useState } from "react";
import { api } from "../lib/api";
import toast from "react-hot-toast";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { return `₹${Number(n || 0).toFixed(0)}`; }

function timeAgo(isoStr) {
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Single incoming order card ────────────────────────────────────────────────
function IncomingCard({ order, onAccept, onReject, accepting }) {
  const total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  return (
    <div className="ico-card">
      <div className="ico-card-header">
        <div className="ico-table-badge">Table {order.tableLabel || order.tableId}</div>
        <div className="ico-meta">
          <span className="ico-customer">{order.customerName}</span>
          {order.customerPhone && (
            <span className="ico-phone">📞 {order.customerPhone}</span>
          )}
          <span className="ico-time">{timeAgo(order.createdAt)}</span>
        </div>
      </div>

      <div className="ico-items">
        {order.items.map((item, idx) => (
          <div key={idx} className="ico-item-row">
            <span className="ico-item-qty">{item.quantity}×</span>
            <span className="ico-item-name">{item.name}</span>
            <span className="ico-item-price">{fmt(item.price * item.quantity)}</span>
          </div>
        ))}
        {order.items[0]?.notes && (
          <p className="ico-notes">📝 {order.items[0].notes}</p>
        )}
      </div>

      <div className="ico-total-row">
        <span>Total</span>
        <strong>{fmt(total)}</strong>
      </div>

      <div className="ico-actions">
        <button
          className="ico-btn ico-reject"
          onClick={() => onReject(order.id)}
          disabled={accepting}
        >
          Reject
        </button>
        <button
          className="ico-btn ico-accept"
          onClick={() => onAccept(order.id)}
          disabled={accepting}
        >
          {accepting ? "Adding…" : "✓ Accept Order"}
        </button>
      </div>
    </div>
  );
}

// ── Main Sheet ────────────────────────────────────────────────────────────────
export function IncomingOrdersSheet({ orders, outletId, onClose, onOrderHandled }) {
  const [processingId, setProcessingId] = useState(null);

  async function handleAccept(orderId) {
    setProcessingId(orderId);
    try {
      await api.patch(`/operations/customer-order/${orderId}/accept`, { outletId });
      toast.success("Order accepted — items added to table order");
      onOrderHandled(orderId);
    } catch (err) {
      toast.error(err.message || "Failed to accept order");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(orderId) {
    setProcessingId(orderId);
    try {
      await api.patch(`/operations/customer-order/${orderId}/reject`, { outletId });
      toast("Order rejected", { icon: "🚫" });
      onOrderHandled(orderId);
    } catch (err) {
      toast.error(err.message || "Failed to reject order");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="ico-backdrop" onClick={onClose}>
      <div className="ico-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ico-sheet-header">
          <div className="ico-sheet-title">
            <span>📲</span>
            <span>Customer Orders</span>
            {orders.length > 0 && (
              <span className="ico-count-badge">{orders.length}</span>
            )}
          </div>
          <button className="ico-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="ico-body">
          {orders.length === 0 ? (
            <div className="ico-empty">
              <span style={{ fontSize: "2rem" }}>🍽️</span>
              <p>No pending customer orders</p>
            </div>
          ) : (
            orders.map((order) => (
              <IncomingCard
                key={order.id}
                order={order}
                onAccept={handleAccept}
                onReject={handleReject}
                accepting={processingId === order.id}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
