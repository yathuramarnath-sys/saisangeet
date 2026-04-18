import { useEffect, useState } from "react";

/* ══════════════════════════════════════════════════════════════════════════════
   Online Orders Panel
   Shows incoming Swiggy / Zomato / direct online orders.
   Accept  → creates POS order + auto-sends KOT + auto-generates bill
   Reject  → asks reason, marks rejected
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
};

/* ── Seed mock online orders ─────────────────────────────────────────────── */
function getSeedOrders() {
  return [
    {
      id:       "online-1",
      platform: "Swiggy",
      orderId:  "SWG-48291",
      customer: { name: "Arun Kumar",  phone: "9876543210", address: "14, 3rd Cross, Indiranagar" },
      items: [
        { name: "Paneer Tikka",  price: 220, quantity: 2 },
        { name: "Crispy Corn",   price: 180, quantity: 1 },
        { name: "Butter Naan",   price: 60,  quantity: 3 },
      ],
      total:     800,
      etaMin:    35,
      notes:     "Less spicy please",
      status:    "pending",
      createdAt: new Date(Date.now() - 2 * 60000).toISOString()
    },
    {
      id:       "online-2",
      platform: "Zomato",
      orderId:  "ZMT-99132",
      customer: { name: "Sneha Rao",   phone: "9123456780", address: "5B, 2nd Main, Koramangala" },
      items: [
        { name: "Chicken Biryani", price: 320, quantity: 1 },
        { name: "Raita",           price: 60,  quantity: 1 },
      ],
      total:     380,
      etaMin:    45,
      notes:     "",
      status:    "pending",
      createdAt: new Date(Date.now() - 5 * 60000).toISOString()
    },
    {
      id:       "online-3",
      platform: "Direct",
      orderId:  "WEB-00341",
      customer: { name: "Rahul Verma", phone: "9988776655", address: "22, 1st Block, HSR Layout" },
      items: [
        { name: "Veg Manchurian", price: 160, quantity: 2 },
        { name: "Fried Rice",     price: 180, quantity: 1 },
      ],
      total:     500,
      etaMin:    30,
      notes:     "Extra sauce on the side",
      status:    "pending",
      createdAt: new Date(Date.now() - 1 * 60000).toISOString()
    }
  ];
}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
  catch { return fallback; }
}

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
export function OnlineOrdersPanel({ onAccept, onClose }) {
  const [orders,       setOrders]       = useState(() => load("pos_online_orders", getSeedOrders()));
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [filter,       setFilter]       = useState("pending"); // pending | accepted | rejected

  // Seed if empty
  useEffect(() => {
    const stored = load("pos_online_orders", null);
    if (!stored) {
      const seed = getSeedOrders();
      localStorage.setItem("pos_online_orders", JSON.stringify(seed));
      setOrders(seed);
    }
  }, []);

  function persist(updated) {
    setOrders(updated);
    localStorage.setItem("pos_online_orders", JSON.stringify(updated));
  }

  function handleAccept(order) {
    const updated = orders.map(o =>
      o.id === order.id ? { ...o, status: "accepted", acceptedAt: new Date().toISOString() } : o
    );
    persist(updated);
    onAccept(order); // App.jsx handles creating POS order + KOT
  }

  function handleReject() {
    const updated = orders.map(o =>
      o.id === rejectTarget.id
        ? { ...o, status: "rejected", rejectReason, rejectedAt: new Date().toISOString() }
        : o
    );
    persist(updated);
    setRejectTarget(null);
  }

  const visible = orders.filter(o => o.status === filter);
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
            {visible.length === 0 && (
              <div className="pset-empty" style={{ padding: 40 }}>
                No {filter} orders right now
              </div>
            )}
            {visible.map(order => {
              const plt   = PLATFORM_STYLES[order.platform] || PLATFORM_STYLES.Direct;
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
                    <TimeAgo isoDate={order.createdAt} />
                    {order.etaMin && filter === "pending" && (
                      <span className="oo-eta">🕐 {order.etaMin} min ETA</span>
                    )}
                  </div>

                  {/* Customer */}
                  <div className="oo-customer">
                    <span className="oo-cust-name">👤 {order.customer.name}</span>
                    <span className="oo-cust-phone">{order.customer.phone}</span>
                    {order.customer.address && (
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
                  {order.notes && (
                    <div className="oo-notes">📝 {order.notes}</div>
                  )}

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
                      <span className="oo-status-pill accepted">
                        ✓ Accepted · KOT sent
                      </span>
                    )}
                    {filter === "rejected" && (
                      <span className="oo-status-pill rejected">
                        ✕ {order.rejectReason}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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
