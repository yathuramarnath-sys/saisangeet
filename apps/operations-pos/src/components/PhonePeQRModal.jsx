import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";

/**
 * PhonePeQRModal
 * Shows a PhonePe payment QR for the exact bill amount.
 * Waits for socket event "payment:phonepe:confirmed" or polls as fallback.
 *
 * Props:
 *   order       — the order object (needs tableId, tableLabel, amount)
 *   outletId    — current outlet
 *   socket      — socket.io instance (from App.jsx socketRef.current)
 *   onConfirmed — called when payment is confirmed
 *   onClose     — called when cashier manually closes (cancel / use different method)
 */
export function PhonePeQRModal({ order, outletId, socket, onConfirmed, onClose }) {
  const [state,   setState]   = useState("loading"); // loading | ready | confirmed | error
  const [qr,      setQr]      = useState(null);      // { qrDataUrl, amount, txnId, expiresInSecs }
  const [elapsed, setElapsed] = useState(0);
  const [errMsg,  setErrMsg]  = useState("");

  const amount     = order?.totalAmount ?? order?.total ?? 0;
  const tableLabel = order?.tableLabel  ?? order?.areaName
    ? `${order.areaName} — Table ${order.tableNumber}`
    : `Table ${order?.tableNumber || ""}`;

  // ── Initiate payment on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!outletId || !amount) { setErrMsg("Missing outletId or amount."); setState("error"); return; }

    api.post("/payments/phonepe/initiate", {
      outletId,
      tableId:     order.tableId,
      tableLabel,
      amount,
      orderNumber: order.orderNumber,
    })
      .then(data => {
        setQr(data);
        setState("ready");
      })
      .catch(err => {
        setErrMsg(err.message || "PhonePe not configured.");
        setState("error");
      });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Listen for socket confirmation (ignore if QR already expired) ──────
  useEffect(() => {
    if (!socket) return;
    function onConfirm(payload) {
      if (payload.tableId !== order.tableId) return;
      // Reject late socket payment if QR has already expired — prevents double-billing
      // when a customer scans an old QR after the cashier switched to cash payment.
      if (qr?.expiresInSecs && elapsed >= qr.expiresInSecs) return;
      setState("confirmed");
      speakConfirmation(payload.amount, tableLabel);
      setTimeout(() => onConfirmed(payload), 1200);
    }
    socket.on("payment:phonepe:confirmed", onConfirm);
    return () => socket.off("payment:phonepe:confirmed", onConfirm);
  }, [socket, order.tableId, elapsed, qr?.expiresInSecs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling fallback (every 5s) — stops automatically when QR expires ──
  useEffect(() => {
    if (state !== "ready" || !qr?.merchantTransactionId) return;
    let localElapsed = 0;
    const interval = setInterval(async () => {
      localElapsed += 5;
      setElapsed(localElapsed);
      // Stop polling once QR has expired — no point checking a dead QR
      if (qr.expiresInSecs && localElapsed >= qr.expiresInSecs) {
        clearInterval(interval);
        return;
      }
      try {
        const res = await api.get(`/payments/phonepe/status/${qr.merchantTransactionId}`);
        if (res?.resolved) {
          clearInterval(interval);
          setState("confirmed");
          speakConfirmation(amount, tableLabel);
          setTimeout(() => onConfirmed({ tableId: order.tableId, amount }), 1200);
        }
      } catch (_) {}
    }, 5000);
    return () => clearInterval(interval);
  }, [state, qr]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-close 30 s after expiry so cashier can't forget the modal open ─
  useEffect(() => {
    if (state !== "ready" || !qr?.expiresInSecs || elapsed < qr.expiresInSecs) return;
    const timer = setTimeout(onClose, 30_000);
    return () => clearTimeout(timer);
  }, [elapsed, state, qr?.expiresInSecs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── QR expiry countdown ─────────────────────────────────────────────────
  const timeLeft = qr ? Math.max(0, qr.expiresInSecs - elapsed) : 0;
  const expired  = timeLeft === 0 && state === "ready";

  return (
    <div className="ppqr-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ppqr-modal">

        {/* Header */}
        <div className="ppqr-head">
          <div className="ppqr-logo">
            <span className="ppqr-phonepe-icon">📱</span>
            <span className="ppqr-title">PhonePe QR Payment</span>
          </div>
          <button className="ppqr-close" onClick={onClose}>✕</button>
        </div>

        {/* Amount */}
        <div className="ppqr-amount">
          <span className="ppqr-amt-label">{tableLabel}</span>
          <strong className="ppqr-amt-value">₹{Number(amount).toLocaleString("en-IN")}</strong>
          <span className="ppqr-amt-hint">Scan with any UPI app</span>
        </div>

        {/* States */}
        {state === "loading" && (
          <div className="ppqr-center">
            <span className="pos-spinner" />
            <p style={{marginTop:12,color:"#6b7280",fontSize:13}}>Generating QR…</p>
          </div>
        )}

        {state === "error" && (
          <div className="ppqr-center ppqr-error">
            <span style={{fontSize:36}}>⚠️</span>
            <p style={{marginTop:8,fontWeight:600}}>QR unavailable</p>
            <p style={{fontSize:12,color:"#6b7280",marginTop:4}}>{errMsg}</p>
            <button className="ppqr-retry-btn" onClick={onClose}>Use another payment method</button>
          </div>
        )}

        {state === "ready" && qr && !expired && (
          <>
            <div className="ppqr-qr-wrap">
              <img
                src={qr.qrDataUrl}
                alt="PhonePe Payment QR"
                className="ppqr-qr-img"
                width={220}
                height={220}
              />
              <div className="ppqr-platforms">
                <span>PhonePe</span>
                <span>GPay</span>
                <span>Paytm</span>
                <span>BHIM</span>
                <span>& all UPI apps</span>
              </div>
            </div>
            <div className="ppqr-timer">
              <div
                className="ppqr-timer-bar"
                style={{ width: `${Math.round((timeLeft / qr.expiresInSecs) * 100)}%` }}
              />
            </div>
            <p className="ppqr-timer-label">
              Expires in {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
              {" · "}Waiting for payment…
            </p>
          </>
        )}

        {state === "ready" && expired && (
          <div className="ppqr-center">
            <p style={{fontWeight:600,color:"#dc2626"}}>QR expired</p>
            <p style={{fontSize:12,color:"#6b7280",marginTop:4}}>
              Closing in {Math.max(0, 30 - (elapsed - (qr?.expiresInSecs || 0)))}s — use another payment method
            </p>
            <button className="ppqr-retry-btn" onClick={() => {
              setState("loading"); setElapsed(0); setQr(null);
              api.post("/payments/phonepe/initiate", {
                outletId, tableId: order.tableId, tableLabel, amount, orderNumber: order.orderNumber,
              }).then(d => { setQr(d); setState("ready"); }).catch(e => { setErrMsg(e.message); setState("error"); });
            }}>
              Generate new QR
            </button>
          </div>
        )}

        {state === "confirmed" && (
          <div className="ppqr-center ppqr-success">
            <div className="ppqr-check">✓</div>
            <p className="ppqr-success-label">Payment received!</p>
            <p style={{fontSize:12,color:"#16a34a",marginTop:4}}>
              ₹{Number(amount).toLocaleString("en-IN")} · Table clearing…
            </p>
          </div>
        )}

        {/* Cancel button */}
        {(state === "ready" || state === "loading") && (
          <button className="ppqr-cancel-btn" onClick={onClose}>
            Use different payment method
          </button>
        )}

      </div>
    </div>
  );
}

// ── Voice notification — device speaker ────────────────────────────────────
export function speakPaymentConfirmed(amount, tableLabel) {
  speakConfirmation(amount, tableLabel);
}

function speakConfirmation(amount, tableLabel) {
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const text = `Payment received. Rupees ${amount}. ${tableLabel} is now cleared.`;
    const utt  = new SpeechSynthesisUtterance(text);
    utt.lang   = "en-IN";
    utt.rate   = 0.92;
    utt.pitch  = 1.05;
    utt.volume = 1;
    window.speechSynthesis.speak(utt);
  } catch (_) {}
}
