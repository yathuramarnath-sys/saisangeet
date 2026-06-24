import { useState } from "react";
import { tapImpact } from "../lib/haptics";
import { SettingsScreen } from "./SettingsScreen";
import { KotDetailScreen } from "./KotDetailScreen";

const APP_VERSION = "1.26";

/**
 * SideDrawer — Captain App utility menu
 *
 * Props:
 *   outletName      string
 *   serverUrl       string
 *   localPosIp      string | null  — LAN POS server this device connects to (also shown in footer)
 *   deviceIp        string | null  — this device's own LAN IP, shown in the footer
 *   serverId        string | null  — outlet/branch link code (e.g. VNB2-92345678), shown in footer
 *   pendingKots     array   — failed KOT payloads queued for retry
 *   onClose         ()
 *   onSync          ()      — force-pull orders + menu from server
 *   onFindPOS       ()      — re-scan network for local POS IP
 *   onRetryKot      (kot)   — retry a single pending KOT
 *   onRetryAll      ()      — retry all pending KOTs
 *   onClearKot      (kotId) — dismiss a pending KOT without retry
 *   scanning        bool    — true while network scan is running
 */
export function SideDrawer({
  outletName, serverUrl, localPosIp, deviceIp, serverId,
  pendingKots  = [],
  syncFailed   = 0,
  printFailed  = 0,
  updateInfo   = null,
  onClose, onSync, onFindPOS, onSignOut,
  onRetryKot, onRetryAll, onClearKot,
  scanning = false,
}) {
  const [syncing,      setSyncing]      = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showKotDetail, setShowKotDetail] = useState(false);

  async function handleSync() {
    tapImpact();
    setSyncing(true);
    try { await onSync(); } finally { setSyncing(false); }
  }

  if (showSettings) {
    return (
      <SettingsScreen
        outletName={outletName}
        serverUrl={serverUrl}
        localPosIp={localPosIp}
        onClose={() => setShowSettings(false)}
      />
    );
  }

  if (showKotDetail) {
    return (
      <KotDetailScreen
        pendingKots={pendingKots}
        syncFailed={syncFailed}
        printFailed={printFailed}
        onRetryKot={onRetryKot}
        onRetryAll={onRetryAll}
        onClearKot={onClearKot}
        onClose={() => setShowKotDetail(false)}
      />
    );
  }

  const unsuccessfulCount = pendingKots.length + syncFailed + printFailed;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />

      <div className="drawer-panel">
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-brand">
            <span className="drawer-brand-icon">🍽️</span>
            <div>
              <div className="drawer-brand-name">Plato Captain</div>
              <div className="drawer-brand-version">v{APP_VERSION}</div>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Update available ─────────────────────────────────────────── */}
        {updateInfo && (
          <div className="drawer-section">
            <div className="drawer-update-banner">
              <div className="drawer-update-text">
                <span className="drawer-update-icon">🎉</span>
                <div>
                  <strong>v{updateInfo.version} available</strong>
                  {updateInfo.changelog && <div style={{fontSize:12,opacity:0.85,marginTop:2}}>{updateInfo.changelog}</div>}
                </div>
              </div>
              <a
                href={updateInfo.apkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="drawer-update-btn"
                onClick={onClose}
              >
                Download APK
              </a>
            </div>
          </div>
        )}

        {/* ── Flat menu list (matches Petpooja's drawer layout) ──────────── */}
        <div className="drawer-section drawer-list">
          <button
            className="drawer-list-row"
            onClick={() => { tapImpact(); setShowKotDetail(true); }}
          >
            <span className="drawer-list-icon">📋</span>
            <span className="drawer-list-label">Unsuccessful KOT</span>
            {unsuccessfulCount > 0 && (
              <span className="drawer-badge drawer-badge-red">{unsuccessfulCount}</span>
            )}
          </button>

          <button
            className={`drawer-list-row${syncing ? " drawer-list-row-loading" : ""}`}
            onClick={handleSync}
            disabled={syncing}
          >
            <span className="drawer-list-icon">{syncing ? "⏳" : "🔄"}</span>
            <span className="drawer-list-label">{syncing ? "Syncing…" : "Sync Data"}</span>
          </button>

          <button
            className={`drawer-list-row${scanning ? " drawer-list-row-loading" : ""}`}
            onClick={() => { tapImpact(); onFindPOS(); }}
            disabled={scanning}
          >
            <span className="drawer-list-icon">{scanning ? "⏳" : "📡"}</span>
            <span className="drawer-list-label">{scanning ? "Scanning…" : "Find Server IP"}</span>
          </button>

          <button
            className="drawer-list-row"
            onClick={() => { tapImpact(); setShowSettings(true); }}
          >
            <span className="drawer-list-icon">⚙️</span>
            <span className="drawer-list-label">Settings</span>
          </button>

          <button
            className="drawer-list-row"
            onClick={() => { tapImpact(); onSignOut(); }}
          >
            <span className="drawer-list-icon">🚪</span>
            <span className="drawer-list-label">Logout</span>
          </button>
        </div>

        <div className="drawer-footer">
          <div>Server ID: {serverId || "—"}</div>
          <div>Device IP: {deviceIp || "—"}</div>
          <div>Local POS IP: {localPosIp || "—"}</div>
        </div>
      </div>
    </>
  );
}
