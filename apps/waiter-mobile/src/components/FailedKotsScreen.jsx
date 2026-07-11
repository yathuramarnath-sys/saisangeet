import { useState } from "react";
import { tapImpact } from "../lib/haptics";
import { KotReprintScreen } from "./KotReprintScreen";

function formatTime(isoTs) {
  if (!isoTs) return "";
  return new Date(isoTs).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function itemsSummary(items = []) {
  const active = items.filter(i => !i.isVoided);
  const names  = active.slice(0, 3).map(i => i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name);
  const extra  = active.length > 3 ? `...` : "";
  return `${active.length} item${active.length !== 1 ? "s" : ""} · ${names.join(", ")}${extra}`;
}

export function FailedKotsScreen({ pendingKots, outletName, onRetry, onRetryAll, onClear, onClose }) {
  const [selectedKot, setSelectedKot] = useState(null);

  if (selectedKot) {
    return (
      <KotReprintScreen
        kot={selectedKot}
        onRetry={(kot) => { onRetry(kot); setSelectedKot(null); }}
        onClose={() => setSelectedKot(null)}
      />
    );
  }

  return (
    <div className="fkot2-page">
      {/* Header */}
      <div className="fkot2-header">
        <button className="fkot2-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div>
          <h2 className="fkot2-title">Unsuccessful KOTs</h2>
          {pendingKots.length > 0 && (
            <p className="fkot2-subtitle">{pendingKots.length} ticket{pendingKots.length !== 1 ? "s" : ""} waiting to send</p>
          )}
        </div>
      </div>

      {pendingKots.length === 0 ? (
        <div className="fkot2-empty">
          <div className="fkot2-empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p className="fkot2-empty-title">All caught up!</p>
          <p className="fkot2-empty-sub">No failed KOTs to retry.</p>
        </div>
      ) : (
        <>
          {/* Offline alert card */}
          <div className="fkot2-alert-card">
            <svg className="fkot2-alert-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#E07A1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
              <line x1="12" y1="20" x2="12.01" y2="20"/>
            </svg>
            <div>
              <p className="fkot2-alert-title">No connection to {outletName || "server"}</p>
              <p className="fkot2-alert-body">Tickets will auto-send the moment you reconnect.</p>
            </div>
          </div>

          {/* KOT cards */}
          <div className="fkot2-scroll">
            {pendingKots.map((kot) => (
              <div key={kot.id} className="fkot2-card">
                <div className="fkot2-card-inner">
                  {/* Card header */}
                  <div className="fkot2-card-head">
                    <span className="fkot2-kot-id">
                      {kot.kotNumber ? `KOT #${kot.kotNumber}` : "KOT"} · Table {kot.tableNumber}
                    </span>
                    <span className="fkot2-time">{formatTime(kot.failedAt || kot.createdAt)}</span>
                  </div>

                  {/* Status */}
                  <p className="fkot2-status-fail">
                    <span className="fkot2-status-dot" />
                    Couldn't reach the kitchen
                  </p>

                  {/* Items summary */}
                  <p className="fkot2-items">{itemsSummary(kot.items)}</p>

                  {/* Retry button */}
                  <button
                    className="fkot2-retry-btn"
                    onClick={(e) => { e.stopPropagation(); tapImpact(); onRetry(kot); }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"/>
                      <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
                    </svg>
                    Retry now
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="fkot2-bottom">
            <button className="fkot2-retry-all-btn" onClick={() => { tapImpact(); onRetryAll?.(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
              </svg>
              Retry all tickets
            </button>
            <p className="fkot2-auto-caption">Auto-retrying every 30s while offline</p>
          </div>
        </>
      )}
    </div>
  );
}
