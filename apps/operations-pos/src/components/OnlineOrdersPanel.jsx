import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";

/* ══════════════════════════════════════════════════════════════════════════════
   Online Orders Panel
   Pulls live orders from backend (GET /online-orders).
   Socket event "online:order:new" pushes new orders in real-time.
   Accept  → creates POS order + auto-sends KOT + auto-generates bill
   Reject  → asks reason, marks rejected on backend
   ══════════════════════════════════════════════════════════════════════════════ */

const REJECT_REASONS = [
  "Kitchen busy",
  "Item unavailable",
  "Closing soon",
  "Too far to deliver",
  "Other"
];

const PLATFORM_STYLES = {
  Swiggy:  { bg: "#FF5733", light: "#FFF0ED", emoji: "🟠" },
  Zomato:  { bg: "#E23744", light: "#FDEDEC", emoji: "🔴" },
  Direct:  { bg: "#2980B9", light: "#EBF5FB", emoji: "🔵" },
  Dunzo:   { bg: "#00B140", light: "#E9F7EF", emoji: "🟢" },
  Online:  { bg: "#6B46C1", light: "#F3E8FF", emoji: "📦" },
};

/* ── Countdown timer ────────────────────────────────────────────────────── */
function TimeAgo({ isoDate }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    function calc() {
      const secs = Math.floor((Date.now() - new Date(isoDate)) / 1000);
      if (secs < 60) setLabel(`${secs}s ago`);
      else setLabel(`${Math.floor(secs / 60)}m ago`);
    }
    calc();
    const id = setInterval(calc, 10000);
    return () => clearInterval(id);
  }, [isoDate]);
  return <span className="oo-time">{label}</span>;
}

/* ── Main component ─────────────────────────────────────────────────────── */
export function OnlineOrdersPanel({ outletId, socket, onAccept, onClose }) {
  const [orders,       setOrders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [filter,       setFilter]       = useState("pending");

  // ── Fetch from backend ──────────────────────────────────────────────────
  const fetchOrders = useCallback(() => {
    if (!outletId) return;
    api.get(`/online-orders?outletId=${outletId}`)
      .then(data => { setOrders(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [outletId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Real-time push from backend ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    function handleNew({ order }) {
      setOrders(prev => {
        // Deduplicate by id
        if (prev.some(o => o.id === order.id)) return prev;
        return [order, ...prev];
      });
      // Play alert sound
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
      } catch (_) {}
    }
    socket.on("online:order:new", handleNew);
    return () => socket.off("online:order:new", handleNew);
  }, [socket]);

  // ── Accept ──────────────────────────────────────────────────────────────
  function handleAccept(order) {
    // Optimistic update
    setOrders(prev => prev.map(o =>
      o.id === order.id ? { ...o, status: "accepted", acceptedAt: new Date().toISOString() } : o
    ));
    // Tell backend
    api.post(`/online-orders/${order.id}/accept`, { outletId }).catch(() => {});
    // Hand off to App.jsx to create POS order + send KOT
    onAccept(order);
  }

  // ── Reject ──────────────────────────────────────────────────────────────
  function handleReject() {
    const order = rejectTarget;
    setOrders(prev => prev.map(o =>
      o.id === order.id
        ? { ...o, status: "rejected", rejectReason, rejectedAt: new Date().toISOString() }
        : o
    ));
    api.post(`/online-orders/${order.id}/reject`, { outletId, reason: rejectReason }).catch(() => {});
    setRejectTarget(null);
  }

  const visible      = orders.filter(o => o.status === filter);
  const pendingCount = orders.filter(o => o.status === "pending").length;

  return (
    <>
      <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="oo-modal sm-modal wide" style={{ maxWidth: 640, maxHeight: "88vh" }}>

          {/* Header */}
          <div className="sm-head">
            <div>
              <h3>📦 Online Orders</h3>
              <p className="sm-sub">
                Swiggy · Zomato · Direct orders
                {pendingCount > 0 && <span className="oo-pending-badge">{pendingCount} pending</span>}
              </p>
            </div>
            <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Status tabs */}
          <div className="oo-tabs">
            {["pending","accepted","rejected"].map(t => (
              <button key={t} type="button"
                className={`oo-tab${filter === t ? " active" : ""}`}
                onClick={() => setFilter(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
                <span className="oo-tab-count">
                  {orders.filter(o => o.status === t).length}
                </span>
              </button>
            ))}
          </div>

          {/* Order list */}
          <div className="oo-list">
            {loading ? (
              <div className="pset-empty" style={{ padding: 40 }}>Loading orders…</div>
            ) : visible.length === 0 ? (
              <div className="pset-empty" style={{ padding: 40 }}>
                No {filter} orders right now
              </div>
            ) : (
              visible.map(order => {
                const plt   = PLATFORM_STYLES[order.platform] || PLATFORM_STYLES.Online;
                const total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);

                return (
                  <div key={order.id} className="oo-card">
                    {/* Platform badge + order ID */}
                    <div className="oo-card-head">
                      <div className="oo-platform-badge"
                        style={{ background: plt.light, color: plt.bg, borderColor: plt.bg }}>
                        {plt.emoji} {order.platform}
                      </div>
                      <div className="oo-order-id">{order.orderId}</div>
                      <TimeAgo isoDate={order.receivedAt || order.createdAt} />
                      {order.etaMin && filter === "pending" && (
                        <span className="oo-eta">🕐 {order.etaMin} min ETA</span>
                      )}
                    </div>

                    {/* Customer */}
                    <div className="oo-customer">
                      <span className="oo-cust-name">👤 {order.customer?.name}</span>
                      {order.customer?.phone && <span className="oo-cust-phone">{order.customer.phone}</span>}
                      {order.customer?.address && (
                        <span className="oo-cust-addr">📍 {order.customer.address}</span>
                      )}
                    </div>

                    {/* Items */}
                    <div className="oo-items">
                      {order.items.map((item, i) => (
                        <div key={i} className="oo-item-row">
                          <span>{item.name} × {item.quantity}</span>
                          <span>₹{item.price * item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    {/* Notes */}
                    {order.notes && <div className="oo-notes">📝 {order.notes}</div>}

                    {/* Total + actions */}
                    <div className="oo-card-footer">
                      <span className="oo-total">₹{total.toLocaleString("en-IN")}</span>
                      {filter === "pending" && (
                        <div className="oo-actions">
                          <button type="button" className="oo-reject-btn"
                            onClick={() => { setRejectTarget(order); setRejectReason(REJECT_REASONS[0]); }}>
                            Reject
                          </button>
                          <button type="button" className="oo-accept-btn"
                            style={{ background: plt.bg }}
                            onClick={() => handleAccept(order)}>
                            ✓ Accept &amp; Send KOT
                          </button>
                        </div>
                      )}
                      {filter === "accepted" && (
                        <span className="oo-status-pill accepted">✓ Accepted · KOT sent</span>
                      )}
                      {filter === "rejected" && (
                        <span className="oo-status-pill rejected">✕ {order.rejectReason}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="sm-overlay" onClick={e => e.target === e.currentTarget && setRejectTarget(null)}>
          <div className="sm-modal" style={{ maxWidth: 360 }}>
            <div className="sm-head">
              <div><h3>Reject Order</h3><p className="sm-sub">{rejectTarget.orderId}</p></div>
              <button type="button" className="sm-close-btn" onClick={() => setRejectTarget(null)}>✕</button>
            </div>
            <div className="sm-body">
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--sq-muted)", display: "block", marginBottom: 8 }}>
                Reason
              </label>
              <div className="sm-reason-pills">
                {REJECT_REASONS.map(r => (
                  <button key={r} type="button"
                    className={`sm-reason-pill${rejectReason === r ? " active" : ""}`}
                    onClick={() => setRejectReason(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm-footer">
              <button type="button" className="sm-btn-cancel" onClick={() => setRejectTarget(null)}>Cancel</button>
              <button type="button" className="sm-btn-action close-warn" onClick={handleReject}>
                Reject Order
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
