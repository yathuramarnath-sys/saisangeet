import { useState } from "react";
import { api } from "../lib/api";
import toast from "react-hot-toast";

function fmt(n) { return `₹${Number(n || 0).toFixed(0)}`; }

function timeAgo(isoStr) {
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function IncomingCard({ order, onAccept, onReject, accepting }) {
  const total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  return (
    <div className="ico2-card">
      <div className="ico2-card-top">
        <span className="ico2-table-badge">Table {order.tableLabel || order.tableId}</span>
        <span className="ico2-time">{timeAgo(order.createdAt)}</span>
      </div>

      {(order.customerName || order.customerPhone) && (
        <div className="ico2-guest">
          {order.customerName && <span className="ico2-guest-name">{order.customerName}</span>}
          {order.customerPhone && <span className="ico2-guest-phone">📞 {order.customerPhone}</span>}
        </div>
      )}

      <div className="ico2-items">
        {order.items.map((item, idx) => (
          <div key={idx} className="ico2-item-row">
            <span className="ico2-qty">{item.quantity}×</span>
            <span className="ico2-name">{item.name}</span>
            <span className="ico2-price">{fmt(item.price * item.quantity)}</span>
          </div>
        ))}
        {order.items[0]?.notes && (
          <p className="ico2-notes">📝 {order.items[0].notes}</p>
        )}
      </div>

      <div className="ico2-total">
        <span>Total</span>
        <strong>{fmt(total)}</strong>
      </div>

      <div className="ico2-actions">
        <button
          className="ico2-reject"
          onClick={() => onReject(order.id)}
          disabled={accepting}
        >
          Reject
        </button>
        <button
          className="ico2-accept"
          onClick={() => onAccept(order.id)}
          disabled={accepting}
        >
          {accepting ? "Adding…" : "✓ Accept"}
        </button>
      </div>
    </div>
  );
}

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
    <div className="ico2-backdrop" onClick={onClose}>
      <div className="ico2-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ico2-handle" />

        <div className="ico2-header">
          <div className="ico2-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
            <span>Customer Orders</span>
            {orders.length > 0 && (
              <span className="ico2-badge">{orders.length}</span>
            )}
          </div>
          <button className="ico2-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="ico2-body">
          {orders.length === 0 ? (
            <div className="ico2-empty">
              <span className="ico2-empty-icon">🍽️</span>
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
