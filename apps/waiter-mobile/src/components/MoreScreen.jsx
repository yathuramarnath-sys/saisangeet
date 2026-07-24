import { useState } from "react";
import { tapImpact } from "../lib/haptics";
import { avatarBg } from "./LoginScreen";
import { SyncProgressModal } from "./SyncProgressModal";
import { FindPosScreen }     from "./FindPosScreen";
import { SettingsScreen }    from "./SettingsScreen";
import { APP_VERSION }       from "../lib/version";

const STEP_LABELS = ["Menu & prices", "Tables & sections", "Open orders", "Unsent KOTs check"];

const CHEVRON = (
  <svg className="more2-section-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

function formatSyncAge(ts) {
  if (!ts) return null;
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return "Just synced";
  if (mins < 60) return `Last synced ${mins} min ago`;
  return `Last synced ${Math.floor(mins / 60)}h ago`;
}

export function MoreScreen({
  loggedInStaff, outletName, serverId, localPosIp, deviceIp,
  serverUrl, updateInfo, orders = {}, billAlerts = {}, tableAreas = [],
  onSync, onSignOut, canSettleBill = false, onSettleBill,
}) {
  const [sub,        setSub]        = useState(null); // null | 'findPos' | 'settings' | 'pendingBills'
  const [syncSteps,  setSyncSteps]  = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [syncOpen,   setSyncOpen]   = useState(true);
  const [appOpen,    setAppOpen]    = useState(true);

  // Compute pending bills once — used in nav row and sub-screen
  // billAlerts is keyed by orderNumber (not tableId) so a new order on the same table
  // doesn't overwrite the old pending bill. Build a tableId → alert lookup from values.
  const billAlertByTable = Object.values(billAlerts).reduce((acc, b) => {
    if (!acc[b.tableId] || b.orderNumber > acc[b.tableId].orderNumber) acc[b.tableId] = b;
    return acc;
  }, {});
  const allTables = tableAreas.flatMap(a => (a.tables || []).map(t => ({ ...t, areaName: a.name })));
  const pendingBills = allTables.filter(t => {
    const o = orders[t.id] || billAlertByTable[t.id];
    return o && o.billRequested && !o.isClosed &&
           (o.items || []).some(i => !i.isVoided && !i.isComp);
  });

  async function handleSync() {
    tapImpact();
    const upd = (i, st) =>
      setSyncSteps((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], state: st };
        return next;
      });

    setSyncSteps(STEP_LABELS.map((label) => ({ label, state: "waiting" })));
    upd(0, "syncing");

    const syncPromise = onSync?.();

    const tick = (ms) => new Promise((r) => setTimeout(r, ms));
    await tick(650);  upd(0, "done"); upd(1, "syncing");
    await tick(550);  upd(1, "done"); upd(2, "syncing");
    await tick(500);  upd(2, "done"); upd(3, "syncing");
    try { await syncPromise; } catch (_) {}
    upd(3, "done");
    await tick(1100);
    setSyncSteps(null);
    setLastSynced(Date.now());
  }

  if (sub === "findPos") {
    return (
      <FindPosScreen
        localPosIp={localPosIp}
        outletName={outletName}
        onClose={() => setSub(null)}
      />
    );
  }

  if (sub === "settings") {
    return (
      <SettingsScreen
        outletName={outletName}
        serverUrl={serverUrl}
        localPosIp={localPosIp}
        onClose={() => setSub(null)}
      />
    );
  }

  if (sub === "pendingBills") {
    return (
      <div className="more2-page">
        <div className="more2-pb-header">
          <button className="more2-pb-back" onClick={() => setSub(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="more2-pb-title">Pending Bills</span>
          <span className="more2-pending-count">{pendingBills.length}</span>
        </div>
        <div className="more2-scroll">
          <div className="more2-pending-grid">
            {pendingBills.map((t) => {
              const o = orders[t.id] || billAlertByTable[t.id];
              const billable = (o.items || []).filter(i => !i.isVoided && !i.isComp);
              const amt = billable.reduce((s, i) => s + i.price * i.quantity, 0);
              return (
                <div key={t.id} className="more2-pending-tile">
                  <span className="more2-pending-tile-num">{t.number || t.id}</span>
                  {amt > 0 && <span className="more2-pending-tile-amt">₹{amt.toLocaleString("en-IN")}</span>}
                  {canSettleBill && (
                    <button
                      className="more2-pb-collect-btn"
                      onClick={(e) => { e.stopPropagation(); tapImpact(); onSettleBill?.(t.id); }}
                    >
                      Collect
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="more2-page">
      {syncSteps && <SyncProgressModal steps={syncSteps} outletName={outletName} />}

      {/* Profile card */}
      <div className="more2-profile-card">
        <div
          className="more2-avatar"
          style={{ background: avatarBg(loggedInStaff?.name || "") }}
        >
          {loggedInStaff?.avatar || loggedInStaff?.name?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="more2-profile-info">
          <div className="more2-profile-name">{loggedInStaff?.name || "—"}</div>
          <div className="more2-profile-sub">
            {loggedInStaff?.role || "Captain"} · {outletName || "Restaurant"}
          </div>
        </div>
      </div>

      <div className="more2-scroll">
        {/* Update banner */}
        {updateInfo && (
          <div className="more2-update-banner">
            <div>
              <div className="more2-update-title">v{updateInfo.version} available</div>
              {updateInfo.changelog && (
                <div className="more2-update-log">{updateInfo.changelog}</div>
              )}
            </div>
            <a
              href={updateInfo.apkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="more2-update-btn"
            >
              Download
            </a>
          </div>
        )}

        {/* DEVICE & SYNC — collapsible */}
        <div className={`more2-section${syncOpen ? " more2-section-open" : ""}`}>
          <div className="more2-section-head" onClick={() => { tapImpact(); setSyncOpen(o => !o); }}>
            <span>DEVICE &amp; SYNC</span>
            {CHEVRON}
          </div>
          <div className="more2-section-body">
            <div className="more2-card">
              <div className="more2-row more2-row-sync">
                <div className="more2-row-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10"/>
                    <polyline points="23 20 23 14 17 14"/>
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                  </svg>
                </div>
                <div className="more2-row-body">
                  <span className="more2-row-label">Sync data</span>
                  <span className="more2-row-sub">{formatSyncAge(lastSynced) || "Pull latest menu & orders"}</span>
                </div>
                <button className="more2-sync-now-btn" onClick={handleSync} disabled={!!syncSteps}>
                  {syncSteps ? "Syncing…" : "Sync now"}
                </button>
              </div>
              <div className="more2-divider" />
              <button className="more2-row" onClick={() => { tapImpact(); setSub("findPos"); }}>
                <div className="more2-row-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="2"/>
                    <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
                  </svg>
                </div>
                <div className="more2-row-body">
                  <span className="more2-row-label">Find server IP</span>
                  <span className="more2-row-sub">
                    {localPosIp ? `Connected · ${localPosIp}` : "Not connected"}
                  </span>
                </div>
                <svg className="more2-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* APP — collapsible */}
        <div className={`more2-section${appOpen ? " more2-section-open" : ""}`}>
          <div className="more2-section-head" onClick={() => { tapImpact(); setAppOpen(o => !o); }}>
            <span>APP</span>
            {CHEVRON}
          </div>
          <div className="more2-section-body">
            <div className="more2-card">
              <button className="more2-row" onClick={() => { tapImpact(); setSub("settings"); }}>
                <div className="more2-row-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </div>
                <div className="more2-row-body">
                  <span className="more2-row-label">Settings</span>
                  <span className="more2-row-sub">Printer, paper size</span>
                </div>
                <svg className="more2-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* PENDING BILLS — nav row */}
        {pendingBills.length > 0 && (
          <button className="more2-nav-row" onClick={() => { tapImpact(); setSub("pendingBills"); }}>
            <div className="more2-row-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/>
                <line x1="8" y1="17" x2="16" y2="17"/>
              </svg>
            </div>
            <div className="more2-row-body">
              <span className="more2-row-label">
                Pending bills
                <span className="more2-pending-count">{pendingBills.length}</span>
              </span>
              <span className="more2-row-sub">Tables waiting for cashier</span>
            </div>
            <svg className="more2-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}

        {/* Log out */}
        <button className="more2-logout-btn" onClick={() => { tapImpact(); onSignOut?.(); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Log out
        </button>

        <div className="more2-footer">
          Plato Captain · v{APP_VERSION}
          {serverId && <span> · {serverId}</span>}
          {deviceIp && <span> · {deviceIp}</span>}
        </div>
      </div>
    </div>
  );
}
