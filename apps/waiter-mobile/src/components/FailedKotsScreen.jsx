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

export function FailedKotsScreen({ pendingKots, sentKots = [], outletName, onRetry, onRetryAll, onClear, onClose, onReprint }) {
  const [tab,         setTab]         = useState("all"); // "all" | "sent" | "failed"
  const [selectedKot, setSelectedKot] = useState(null);

  if (selectedKot) {
    return (
      <KotReprintScreen
        kot={selectedKot}
        isSent={selectedKot.status === "sent"}
        onRetry={(kot) => { onRetry(kot); setSelectedKot(null); }}
        onReprint={onReprint ? (kot) => { onReprint(kot); setSelectedKot(null); } : undefined}
        onClose={() => setSelectedKot(null)}
      />
    );
  }

  const failedCount = pendingKots.length;
  const sentCount   = sentKots.filter(k => k.status === "sent").length;
  const totalCount  = sentKots.length;

  // Merge sentKots (history) with pendingKots that have no history entry yet
  const pendingIds  = new Set(pendingKots.map(k => k.id));
  const historyIds  = new Set(sentKots.map(k => k.id));
  const orphanFailed = pendingKots.filter(k => !historyIds.has(k.id)).map(k => ({
    id:          k.id,
    kotNumber:   k.kotNumber || null,
    tableNumber: k.tableNumber,
    items:       k.items,
    sentAt:      k.failedAt || k.createdAt,
    status:      "failed",
  }));

  const allKots = [...orphanFailed, ...sentKots]
    .sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));

  const visibleKots = tab === "all"    ? allKots
                    : tab === "sent"   ? allKots.filter(k => k.status === "sent")
                    : allKots.filter(k => k.status === "failed");

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
          <h2 className="fkot2-title">Kitchen tickets</h2>
          <p className="fkot2-subtitle">
            {sentCount} sent{failedCount > 0 ? ` · ${failedCount} unsuccessful this shift` : " this shift"}
          </p>
        </div>
      </div>

      {/* Tab pills */}
      <div className="fkot2-tabs">
        <button
          className={`fkot2-tab${tab === "all"    ? " fkot2-tab-active" : ""}`}
          onClick={() => { tapImpact(); setTab("all"); }}
        >All</button>
        <button
          className={`fkot2-tab${tab === "sent"   ? " fkot2-tab-active" : ""}`}
          onClick={() => { tapImpact(); setTab("sent"); }}
        >Sent</button>
        <button
          className={`fkot2-tab${tab === "failed" ? " fkot2-tab-active" : ""}`}
          onClick={() => { tapImpact(); setTab("failed"); }}
        >
          Unsuccessful
          {failedCount > 0 && <span className="fkot2-tab-badge">{failedCount}</span>}
        </button>
      </div>

      {/* Offline alert — only on failed tab or when there are failures in all tab */}
      {failedCount > 0 && (tab === "failed" || tab === "all") && (
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
      )}

      {/* Empty state */}
      {visibleKots.length === 0 ? (
        <div className="fkot2-empty">
          <div className="fkot2-empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p className="fkot2-empty-title">
            {tab === "failed" ? "All caught up!" : "No tickets yet"}
          </p>
          <p className="fkot2-empty-sub">
            {tab === "failed" ? "No failed KOTs to retry." : "KOTs you send will appear here."}
          </p>
        </div>
      ) : (
        <>
          <div className="fkot2-scroll">
            {visibleKots.map((kot) => {
              const isFailed = kot.status === "failed";
              const pendingEntry = isFailed ? pendingKots.find(p => p.id === kot.id) : null;
              return (
                <div key={kot.id}
                  className={`fkot2-card${isFailed ? " fkot2-card-fail" : ""}`}
                  onClick={() => { tapImpact(); setSelectedKot({ ...kot, isSent: !isFailed }); }}
                >
                  <div className="fkot2-card-inner">
                    <div className="fkot2-card-head">
                      <span className="fkot2-kot-id">
                        {kot.kotNumber ? `KOT #${kot.kotNumber}` : "KOT"} · Table {kot.tableNumber}
                      </span>
                      <span className="fkot2-time">{formatTime(kot.sentAt)}</span>
                    </div>

                    {isFailed ? (
                      <p className="fkot2-status-fail">
                        <span className="fkot2-status-dot" />
                        Couldn't reach kitchen
                      </p>
                    ) : (
                      <p className="fkot2-status-ok">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Sent to kitchen
                      </p>
                    )}

                    <p className="fkot2-items">{itemsSummary(kot.items)}</p>

                    {isFailed && pendingEntry && (
                      <button
                        className="fkot2-retry-btn"
                        onClick={(e) => { e.stopPropagation(); tapImpact(); onRetry(pendingEntry); }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 4 1 10 7 10"/>
                          <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
                        </svg>
                        Retry now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom bar — only on failed tab when there are failed KOTs */}
          {failedCount > 0 && tab === "failed" && (
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
          )}
        </>
      )}
    </div>
  );
}
