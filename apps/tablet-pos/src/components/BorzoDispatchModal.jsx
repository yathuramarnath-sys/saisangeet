import { useEffect, useState } from "react";
import { api } from "../lib/api";

/**
 * BorzoDispatchModal
 *
 * Shown when cashier clicks "🛵 Dispatch Rider" on an accepted delivery order.
 *
 * Flow:
 *   1. Opens with pre-filled pickup (outlet address) + drop (customer address)
 *   2. Fetches delivery fee estimate automatically
 *   3. Cashier confirms → calls POST /delivery/borzo/dispatch
 *   4. Shows live rider status via socket event "delivery:borzo:status"
 *   5. Polling fallback every 15s while active
 *
 * Props:
 *   order      — the online/delivery order object
 *   outletId   — current outlet id
 *   outletName — outlet display name
 *   outletAddress — restaurant pickup address (from outlet config)
 *   socket     — socket.io instance
 *   onClose    — called when user closes
 */

const STATUS_LABELS = {
  new:        { label: "Finding rider…",    icon: "🔍", color: "#f59e0b" },
  available:  { label: "Looking for rider…",icon: "🔍", color: "#f59e0b" },
  active:     { label: "Rider on the way",  icon: "🛵", color: "#3b82f6" },
  delayed:    { label: "Slightly delayed",  icon: "⏳", color: "#f59e0b" },
  completed:  { label: "Delivered ✓",       icon: "✅", color: "#16a34a" },
  canceled:   { label: "Cancelled",         icon: "✕",  color: "#dc2626" },
  failed:     { label: "Failed",            icon: "✕",  color: "#dc2626" },
  returned:   { label: "Returned",          icon: "↩",  color: "#6b7280" },
};

export function BorzoDispatchModal({ order, outletId, outletName, outletAddress, socket, onClose }) {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [pickupAddress,  setPickupAddress]  = useState(outletAddress || "");
  const [pickupName,     setPickupName]     = useState(outletName    || "Restaurant");
  const [pickupPhone,    setPickupPhone]    = useState("");
  const [dropAddress,    setDropAddress]    = useState(order?.customer?.address || "");
  const [dropName,       setDropName]       = useState(order?.customer?.name    || "");
  const [dropPhone,      setDropPhone]      = useState(order?.customer?.phone   || "");
  const [collectAmount,  setCollectAmount]  = useState(0);  // 0 = already paid online
  const [notes,          setNotes]          = useState("");

  // ── Estimate + dispatch state ──────────────────────────────────────────────
  const [estimating,  setEstimating]  = useState(false);
  const [estimate,    setEstimate]    = useState(null);   // { deliveryFeeMin, eta }
  const [estErr,      setEstErr]      = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatched,  setDispatched]  = useState(null);   // { borzoOrderId, status, ... }
  const [liveStatus,  setLiveStatus]  = useState(null);   // latest socket/poll update
  const [dispErr,     setDispErr]     = useState("");
  const [cancelling,  setCancelling]  = useState(false);

  const orderTotal = order?.items?.reduce((s, i) => s + i.price * i.quantity, 0) || 0;

  // ── Auto-estimate when addresses are present ───────────────────────────────
  useEffect(() => {
    if (!pickupAddress || !dropAddress) return;
    const t = setTimeout(fetchEstimate, 600); // debounce
    return () => clearTimeout(t);
  }, [pickupAddress, dropAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchEstimate() {
    if (!pickupAddress.trim() || !dropAddress.trim()) return;
    setEstimating(true); setEstErr(""); setEstimate(null);
    try {
      const res = await api.post("/delivery/borzo/calculate", {
        outletId,
        pickup: { address: pickupAddress, contactName: pickupName, contactPhone: pickupPhone },
        drop:   { address: dropAddress,   contactName: dropName,   contactPhone: dropPhone,
                  collectAmount },
      });
      setEstimate(res);
    } catch (err) {
      setEstErr(err.message || "Could not estimate fee");
    } finally {
      setEstimating(false);
    }
  }

  // ── Socket listener for live status updates ────────────────────────────────
  useEffect(() => {
    if (!socket || !dispatched) return;
    function onStatus(payload) {
      if (payload.borzoOrderId !== dispatched.borzoOrderId) return;
      setLiveStatus(payload);
    }
    socket.on("delivery:borzo:status", onStatus);
    return () => socket.off("delivery:borzo:status", onStatus);
  }, [socket, dispatched]);

  // ── Polling fallback every 15s after dispatch ──────────────────────────────
  useEffect(() => {
    if (!dispatched) return;
    const cur = liveStatus?.status || dispatched.status;
    if (["completed","canceled","failed","returned"].includes(cur)) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/delivery/borzo/status/${dispatched.borzoOrderId}`);
        setLiveStatus(prev => ({ ...prev, ...res }));
      } catch (_) {}
    }, 15000);
    return () => clearInterval(interval);
  }, [dispatched, liveStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dispatch ───────────────────────────────────────────────────────────────
  async function handleDispatch() {
    if (!pickupAddress || !dropAddress || !pickupPhone || !dropPhone) {
      setDispErr("Fill in all address and phone fields before dispatching.");
      return;
    }
    setDispatching(true); setDispErr("");
    try {
      const res = await api.post("/delivery/borzo/dispatch", {
        outletId,
        onlineOrderId: order.id,
        orderRef:      order.orderId || order.id,
        pickup: { address: pickupAddress, contactName: pickupName, contactPhone: pickupPhone },
        drop:   { address: dropAddress,   contactName: dropName,   contactPhone: dropPhone,
                  collectAmount: Number(collectAmount) },
        notes,
      });
      setDispatched(res);
    } catch (err) {
      setDispErr(err.message || "Dispatch failed");
    } finally {
      setDispatching(false);
    }
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────
  async function handleCancel() {
    if (!dispatched?.borzoOrderId) return;
    setCancelling(true);
    try {
      await api.post(`/delivery/borzo/cancel/${dispatched.borzoOrderId}`);
      setLiveStatus(prev => ({ ...prev, status: "canceled" }));
    } catch (err) {
      setDispErr(err.message || "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  const currentStatus = liveStatus?.status || dispatched?.status;
  const statusInfo    = currentStatus ? (STATUS_LABELS[currentStatus] || { label: currentStatus, icon: "📦", color: "#6b7280" }) : null;
  const isTerminal    = ["completed","canceled","failed","returned"].includes(currentStatus);
  const courier       = liveStatus?.courierName || dispatched?.courierName;
  const courierPhone  = liveStatus?.courierPhone || dispatched?.courierPhone;
  const trackingUrl   = liveStatus?.trackingUrl  || dispatched?.trackingUrl;

  return (
    <div className="brz-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="brz-modal">

        {/* Header */}
        <div className="brz-head">
          <div className="brz-logo">
            <span className="brz-icon">🛵</span>
            <div>
              <span className="brz-title">Borzo Delivery</span>
              <span className="brz-subtitle">
                {order?.orderId ? `Order #${order.orderId}` : "Dispatch Rider"}
              </span>
            </div>
          </div>
          <button className="brz-close" onClick={onClose}>✕</button>
        </div>

        {/* ── After dispatch — live tracking view ───────────────────────── */}
        {dispatched ? (
          <div className="brz-tracking">

            {/* Status banner */}
            <div className="brz-status-banner" style={{ borderColor: statusInfo?.color, background: statusInfo?.color + "18" }}>
              <span className="brz-status-icon">{statusInfo?.icon}</span>
              <div>
                <p className="brz-status-label" style={{ color: statusInfo?.color }}>{statusInfo?.label}</p>
                <p className="brz-status-id">Borzo #{dispatched.borzoOrderId}</p>
              </div>
              {!isTerminal && <span className="brz-pulse" style={{ background: statusInfo?.color }} />}
            </div>

            {/* Courier info */}
            {courier && (
              <div className="brz-courier">
                <span className="brz-courier-icon">👤</span>
                <div>
                  <p className="brz-courier-name">{courier}</p>
                  {courierPhone && <p className="brz-courier-phone">{courierPhone}</p>}
                </div>
                {courierPhone && (
                  <a href={`tel:${courierPhone}`} className="brz-call-btn">📞 Call</a>
                )}
              </div>
            )}

            {/* Delivery fee */}
            {dispatched.deliveryFee > 0 && (
              <div className="brz-fee-row">
                <span>Delivery fee</span>
                <strong>₹{dispatched.deliveryFee}</strong>
              </div>
            )}

            {/* Track link */}
            {trackingUrl && (
              <a href={trackingUrl} target="_blank" rel="noreferrer" className="brz-track-link">
                📍 Track live on Borzo →
              </a>
            )}

            {/* Drop address */}
            <div className="brz-addr-row">
              <span className="brz-addr-dot drop" />
              <span>{dropAddress}</span>
            </div>

            {/* Cancel + close */}
            <div className="brz-tracking-actions">
              {!isTerminal && (
                <button className="brz-cancel-btn" onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? "Cancelling…" : "Cancel Delivery"}
                </button>
              )}
              <button className="brz-done-btn" onClick={onClose}>
                {isTerminal ? "Close" : "Minimise"}
              </button>
            </div>
          </div>

        ) : (
          /* ── Before dispatch — dispatch form ───────────────────────────── */
          <div className="brz-form">

            {/* Customer + total */}
            <div className="brz-order-summary">
              <div className="brz-order-cust">
                <span>👤 {order?.customer?.name || "Customer"}</span>
                {order?.customer?.phone && <span>{order.customer.phone}</span>}
              </div>
              <strong className="brz-order-total">₹{orderTotal.toLocaleString("en-IN")}</strong>
            </div>

            {/* Pickup */}
            <p className="brz-section-label">📍 Pickup (Restaurant)</p>
            <div className="brz-field-row">
              <input className="brz-input" placeholder="Restaurant address *"
                value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} />
            </div>
            <div className="brz-field-row two-col">
              <input className="brz-input" placeholder="Contact name"
                value={pickupName} onChange={e => setPickupName(e.target.value)} />
              <input className="brz-input" placeholder="Phone *"
                value={pickupPhone} onChange={e => setPickupPhone(e.target.value)} />
            </div>

            {/* Drop */}
            <p className="brz-section-label" style={{ marginTop: 12 }}>🏠 Drop (Customer)</p>
            <div className="brz-field-row">
              <input className="brz-input" placeholder="Customer delivery address *"
                value={dropAddress} onChange={e => setDropAddress(e.target.value)} />
            </div>
            <div className="brz-field-row two-col">
              <input className="brz-input" placeholder="Customer name"
                value={dropName} onChange={e => setDropName(e.target.value)} />
              <input className="brz-input" placeholder="Phone *"
                value={dropPhone} onChange={e => setDropPhone(e.target.value)} />
            </div>

            {/* COD amount */}
            <div className="brz-field-row two-col" style={{ marginTop: 10 }}>
              <div>
                <p className="brz-section-label" style={{ marginBottom: 4 }}>Cash to collect from customer</p>
                <div className="brz-amount-wrap">
                  <span className="brz-rupee">₹</span>
                  <input className="brz-input brz-amount-input" type="number" min="0"
                    placeholder="0 if paid online"
                    value={collectAmount}
                    onChange={e => setCollectAmount(e.target.value)} />
                </div>
              </div>
              <div>
                <p className="brz-section-label" style={{ marginBottom: 4 }}>Delivery note</p>
                <input className="brz-input" placeholder="e.g. Leave at door"
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

            {/* Estimate */}
            <div className="brz-estimate-row">
              {estimating && <span className="brz-estimating">Estimating fee…</span>}
              {!estimating && estErr && <span className="brz-est-err">⚠ {estErr}</span>}
              {!estimating && estimate && (
                <div className="brz-estimate-chip">
                  <span>🛵 Delivery fee</span>
                  <strong>≈ ₹{estimate.deliveryFeeMin}</strong>
                  {estimate.eta && <span className="brz-eta">· {estimate.eta} min ETA</span>}
                </div>
              )}
              {!estimating && !estimate && !estErr && (
                <button type="button" className="brz-recalc-btn" onClick={fetchEstimate}>
                  Get fee estimate
                </button>
              )}
            </div>

            {dispErr && <p className="brz-disp-err">⚠ {dispErr}</p>}

            {/* Dispatch button */}
            <button
              className="brz-dispatch-btn"
              onClick={handleDispatch}
              disabled={dispatching || !pickupAddress || !dropAddress}
            >
              {dispatching ? (
                <span className="pos-spinner" />
              ) : (
                <>🛵 Dispatch Borzo Rider{estimate ? ` · ₹${estimate.deliveryFeeMin}` : ""}</>
              )}
            </button>

            <button className="brz-back-link" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
