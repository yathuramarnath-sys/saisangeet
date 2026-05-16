import { useState, useEffect } from "react";
import { tapImpact } from "../lib/haptics";

// ── Printer helpers ───────────────────────────────────────────────────────────
function loadPrinterIp()   { return localStorage.getItem("captain_printer_ip")   || ""; }
function loadPaperSize()   { return localStorage.getItem("captain_paper_size")   || "80mm"; }

function savePrinterConfig(ip, paper) {
  const ip2 = ip.trim();
  localStorage.setItem("captain_printer_ip",  ip2);
  localStorage.setItem("captain_paper_size",  paper);
  // Write into captain_printers so kotPrint / printBill can read it
  const printer = [{
    name: "Thermal Printer",
    type: "Both",
    ip: ip2,
    paper,
    isDefault: true,
    station: "",       // no station = waiter full copy + bill printer
  }];
  localStorage.setItem("captain_printers", JSON.stringify(printer));
}

const APP_VERSION = "1.16";

/**
 * SideDrawer — Captain App utility menu
 *
 * Props:
 *   outletName      string
 *   serverUrl       string
 *   localPosIp      string | null
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
  outletName, serverUrl, localPosIp,
  pendingKots  = [],
  syncFailed   = 0,
  printFailed  = 0,
  updateInfo   = null,
  onClose, onSync, onFindPOS, onSignOut,
  onRetryKot, onRetryAll, onClearKot,
  scanning = false,
}) {
  const [syncing,      setSyncing]    = useState(false);
  const [printerIp,   setPrinterIp]  = useState(loadPrinterIp);
  const [paperSize,   setPaperSize]  = useState(loadPaperSize);
  const [testStatus,  setTestStatus] = useState(null); // null | "testing" | "ok" | "fail"
  const [ipSaved,     setIpSaved]    = useState(false);

  async function handleTestPrinter() {
    const ip = printerIp.trim();
    if (!ip) { setTestStatus("fail"); return; }
    setTestStatus("testing");
    try {
      const { pingPrinter } = await import("../lib/thermalPrint.js");
      const result = await pingPrinter(ip);
      setTestStatus(result.ok ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
    setTimeout(() => setTestStatus(null), 3000);
  }

  function handleSavePrinter() {
    savePrinterConfig(printerIp, paperSize);
    setIpSaved(true);
    setTimeout(() => setIpSaved(false), 2000);
  }

  async function handleSync() {
    tapImpact();
    setSyncing(true);
    try { await onSync(); } finally { setSyncing(false); }
  }

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
              <div className="drawer-brand-outlet">{outletName || "Restaurant"}</div>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Pending KOTs ─────────────────────────────────────────────── */}
        <div className="drawer-section">
          <div className="drawer-section-title">
            <span>Pending KOTs</span>
            {pendingKots.length > 0 && (
              <span className="drawer-badge drawer-badge-red">{pendingKots.length}</span>
            )}
          </div>

          {pendingKots.length === 0 ? (
            <div className="drawer-empty-row">
              <span className="drawer-empty-icon">✅</span>
              <span>All KOTs sent successfully</span>
            </div>
          ) : (
            <>
              {pendingKots.map((kot) => (
                <div key={kot.id} className="drawer-kot-row">
                  <div className="drawer-kot-info">
                    <span className="drawer-kot-table">Table {kot.tableNumber}</span>
                    <span className="drawer-kot-items">
                      {kot.items?.length || 0} item{(kot.items?.length || 0) !== 1 ? "s" : ""}
                      {" · "}
                      {kot.areaName}
                    </span>
                    {kot.failedAt && (
                      <span className="drawer-kot-time">
                        Failed {timeSince(kot.failedAt)}
                      </span>
                    )}
                  </div>
                  <div className="drawer-kot-actions">
                    <button
                      className="drawer-kot-retry"
                      onClick={() => { tapImpact(); onRetryKot(kot); }}
                    >
                      Retry
                    </button>
                    <button
                      className="drawer-kot-clear"
                      onClick={() => { tapImpact(); onClearKot(kot.id); }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              {pendingKots.length > 1 && (
                <button
                  className="drawer-action-btn drawer-action-warn"
                  onClick={() => { tapImpact(); onRetryAll(); }}
                >
                  <span>🔄</span>
                  <span>Retry All ({pendingKots.length})</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Sync failures ────────────────────────────────────────────── */}
        {syncFailed > 0 && (
          <div className="drawer-section">
            <div className="drawer-empty-row" style={{ color: "#f59e0b", fontWeight: 600 }}>
              <span>⚠️</span>
              <span>
                {syncFailed} action{syncFailed !== 1 ? "s" : ""} failed to sync — retrying automatically
              </span>
            </div>
          </div>
        )}

        {/* ── Print failures ────────────────────────────────────────────── */}
        {printFailed > 0 && (
          <div className="drawer-section">
            <div className="drawer-empty-row" style={{ color: "#ef4444", fontWeight: 600 }}>
              <span>🖨️</span>
              <span>
                {printFailed} print{printFailed !== 1 ? "s" : ""} failed — check printer connection
              </span>
            </div>
          </div>
        )}

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

        {/* ── Sync & Tools ─────────────────────────────────────────────── */}
        <div className="drawer-section">
          <div className="drawer-section-title">Tools</div>

          <button
            className={`drawer-action-btn${syncing ? " drawer-action-loading" : ""}`}
            onClick={handleSync}
            disabled={syncing}
          >
            <span>{syncing ? "⏳" : "🔄"}</span>
            <span>{syncing ? "Syncing…" : "Sync Data"}</span>
            <span className="drawer-action-hint">Refresh orders + menu</span>
          </button>

          <button
            className={`drawer-action-btn${scanning ? " drawer-action-loading" : ""}`}
            onClick={() => { tapImpact(); onFindPOS(); }}
            disabled={scanning}
          >
            <span>{scanning ? "⏳" : "📡"}</span>
            <span>{scanning ? "Scanning network…" : "Find POS"}</span>
            <span className="drawer-action-hint">
              {localPosIp ? `Connected: ${localPosIp}` : "Scan Wi-Fi for POS machine"}
            </span>
          </button>
        </div>

        {/* ── Printer Settings ─────────────────────────────────────────── */}
        <div className="drawer-section">
          <div className="drawer-section-title">🖨️ Printer Settings</div>

          <div className="drawer-printer-row">
            <label className="drawer-printer-label">Printer IP</label>
            <input
              className="drawer-printer-input"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 192.168.1.200"
              value={printerIp}
              onChange={e => setPrinterIp(e.target.value)}
            />
          </div>

          <div className="drawer-printer-row">
            <label className="drawer-printer-label">Paper Size</label>
            <select
              className="drawer-printer-select"
              value={paperSize}
              onChange={e => setPaperSize(e.target.value)}
            >
              <option value="80mm">80mm</option>
              <option value="76mm">76mm</option>
              <option value="58mm">58mm</option>
            </select>
          </div>

          <div className="drawer-printer-btns">
            <button
              className="drawer-printer-test-btn"
              onClick={handleTestPrinter}
              disabled={testStatus === "testing"}
            >
              {testStatus === "testing" ? "Testing…"
                : testStatus === "ok"   ? "✅ Connected"
                : testStatus === "fail" ? "❌ Not found"
                : "Test Connection"}
            </button>
            <button
              className={`drawer-printer-save-btn${ipSaved ? " saved" : ""}`}
              onClick={handleSavePrinter}
            >
              {ipSaved ? "✅ Saved" : "Save"}
            </button>
          </div>
        </div>

        {/* ── Device Info ───────────────────────────────────────────────── */}
        <div className="drawer-section drawer-device-section">
          <div className="drawer-section-title">Device Info</div>
          <div className="drawer-device-grid">
            <DevRow label="App Version" value={`v${APP_VERSION}`} />
            <DevRow label="Outlet"      value={outletName || "—"} />
            <DevRow label="Server"      value={serverUrl  || "—"} mono />
            <DevRow label="Local POS"   value={localPosIp ? `${localPosIp}:4001` : "Not connected"} mono />
          </div>
        </div>

        {/* ── Sign Out ──────────────────────────────────────────────────── */}
        <div className="drawer-section">
          <button
            className="drawer-action-btn drawer-signout-btn"
            onClick={() => { tapImpact(); onSignOut(); }}
          >
            <span>🚪</span>
            <span>Sign Out</span>
            <span className="drawer-action-hint">Return to login screen</span>
          </button>
        </div>
      </div>
    </>
  );
}

function DevRow({ label, value, mono }) {
  return (
    <div className="drawer-dev-row">
      <span className="drawer-dev-label">{label}</span>
      <span className={`drawer-dev-value${mono ? " mono" : ""}`}>{value}</span>
    </div>
  );
}

function timeSince(ts) {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}
