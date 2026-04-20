import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { DEVICES_SHARED_KEY } from "./devices.seed";

/* ─────────────────────────────────────────────────────────────────────────────
   DEVICES PAGE  ·  Owner / Manager  ·  READ-ONLY status board
   Printers are configured on the POS terminal (Settings → Printers).
   This page shows the routing overview + live device status synced from POS.
───────────────────────────────────────────────────────────────────────────── */

function timeAgo(iso) {
  if (!iso) return "Never";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function StatusDot({ status }) {
  const colors = { online: "#1a7a3a", warning: "#e67e00", offline: "#d32f2f" };
  const glows  = { online: "rgba(26,122,58,0.18)", warning: "rgba(230,126,0,0.18)", offline: "rgba(211,47,47,0.18)" };
  const c = colors[status] || colors.offline;
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: c, flexShrink: 0,
      boxShadow: `0 0 0 3px ${glows[status] || glows.offline}`
    }} />
  );
}

// ── Station Routing Overview (read-only) ─────────────────────────────────────
function StationRoutingPanel({ stations, stationMap }) {
  if (stations.length === 0) {
    return (
      <div className="panel srt-empty-panel">
        <p className="srt-empty-msg">
          <span>🏗️</span>
          No kitchen stations yet. Go to <strong>Menu → Stations</strong> to create stations
          like <em>Hot Kitchen</em>, <em>Bar</em>, or <em>Bills &amp; KOTs</em>. Then configure
          a printer for each station on the POS terminal via <strong>Settings → Printers</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="panel srt-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Printer Routing</p>
          <h3>Station → Printer Assignment</h3>
        </div>
        <p className="srt-subtitle">
          KOTs route to each station's assigned printer automatically.
          To change assignments, open <strong>Settings → Printers</strong> on your POS terminal.
        </p>
      </div>

      <div className="srt-grid">
        {stations.map(station => {
          const printerInfo = stationMap[station.name];
          const isBilling   = /bill|kot/i.test(station.name);
          const isOffline   = printerInfo?.status === "offline";

          return (
            <div
              key={station.id}
              className={`srt-row${!printerInfo ? " srt-row-unassigned" : ""}${isOffline ? " srt-row-offline" : ""}`}
            >
              <div className="srt-station">
                <span className="srt-station-icon">{isBilling ? "🧾" : "🍳"}</span>
                <div>
                  <strong>{station.name}</strong>
                  {isBilling && <span className="srt-badge">KOTs &amp; Bills</span>}
                </div>
              </div>

              <div className="srt-arrow">→</div>

              <div className="srt-printer">
                {printerInfo ? (
                  <>
                    <StatusDot status={printerInfo.status || "online"} />
                    <div className="srt-printer-info">
                      <strong>{printerInfo.name}</strong>
                      <span className="srt-printer-meta">
                        {printerInfo.model || "Printer"}
                        {printerInfo.ip ? ` · ${printerInfo.ip}` : ""}
                        {isOffline && <span className="srt-offline-tag"> · Offline</span>}
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="srt-no-printer">No printer assigned</span>
                )}
              </div>

              {/* Read-only badge — no Assign button */}
              {!printerInfo && (
                <span className="srt-assign-hint">
                  Configure on POS
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="srt-hint">
        💡 To assign printers to stations, go to <strong>Settings → Printers</strong> on your
        POS terminal and set the <em>Station</em> field for each printer.
      </p>
    </div>
  );
}

// ── Device Status Card (read-only) ───────────────────────────────────────────
function DeviceCard({ device }) {
  const isOffline = device.status === "offline";

  return (
    <div className={`device-card${isOffline ? " device-offline" : ""}${device.paperLow && !isOffline ? " device-warning" : ""}`}>
      <div className="device-card-top">
        <div className="device-card-left">
          <span className="device-icon">{device.type === "printer" ? "🖨️" : "🖥️"}</span>
          <div className="device-card-info">
            <strong>{device.name}</strong>
            <span className="device-meta">
              {device.model}{device.ip ? ` · ${device.ip}` : ""}
            </span>
          </div>
        </div>
        <div className="device-card-right">
          <StatusDot status={device.status} />
          <span className={`device-status-text status-text-${device.status}`}>
            {isOffline ? "Offline" : "Online"}
          </span>
        </div>
      </div>

      {isOffline && (
        <div className="device-alert offline-alert">
          ⚠️ Offline {timeAgo(device.lastSeen)} — POS &amp; Captain app alerted
        </div>
      )}
      {device.paperLow && !isOffline && (
        <div className="device-alert paper-alert">
          🧻 Paper low — reload soon
        </div>
      )}

      <div className="device-assignment">
        {device.station ? (
          <span className="device-role-chip">📍 {device.station}</span>
        ) : (
          <span className="device-role-chip unassigned-chip">⚠️ No station assigned</span>
        )}
        {device.outlet && (
          <span className="device-outlet-badge">🏠 {device.outlet}</span>
        )}
        <span className="device-last-seen">Last seen {timeAgo(device.lastSeen)}</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function DevicesPage() {
  const { user } = useAuth();
  const [stations, setStations]         = useState([]);
  const [outlets, setOutlets]           = useState([]);
  const [activeOutlet, setActiveOutlet] = useState("all");
  const [devices, setDevices]           = useState([]);
  const [stationMap, setStationMap]     = useState({});
  const [lastSync, setLastSync]         = useState(null);

  const isOwner   = (user?.roles || []).includes("Owner");
  const isManager = !isOwner && (user?.roles || []).includes("Manager");

  // Load outlets + stations from API
  useEffect(() => {
    Promise.all([
      api.get("/outlets").catch(() => []),
      api.get("/menu/stations").catch(() => [])
    ]).then(([outletList, stationList]) => {
      setOutlets(outletList || []);
      setStations(stationList || []);

      if (isManager && user?.outletId) {
        const mine = (outletList || []).find(o => o.id === user.outletId);
        if (mine) setActiveOutlet(mine.name);
      }
    });
  }, [user, isManager]);

  // Read device status synced from POS (via pos_devices_assignments key)
  useEffect(() => {
    function readPosSync() {
      try {
        const raw = JSON.parse(localStorage.getItem(DEVICES_SHARED_KEY) || "null");
        if (raw) {
          setDevices(raw.devices || []);
          setStationMap(raw.stationMap || {});
          setLastSync(new Date().toISOString());
        }
      } catch {
        // no sync data yet
      }
    }

    readPosSync();

    // Re-read when storage changes (e.g. if owner-web and POS are on same machine)
    const handler = (e) => { if (e.key === DEVICES_SHARED_KEY) readPosSync(); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const visibleDevices = activeOutlet === "all"
    ? devices
    : devices.filter(d => d.outlet === activeOutlet);

  const total   = visibleDevices.length;
  const online  = visibleDevices.filter(d => d.status === "online").length;
  const offline = visibleDevices.filter(d => d.status === "offline").length;
  const unassigned = visibleDevices.filter(d => !d.station).length;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Devices &amp; Printer Routing</h2>
        </div>
        {lastSync && (
          <span className="devices-sync-badge">
            🔄 Synced from POS {timeAgo(lastSync)}
          </span>
        )}
      </header>

      {/* ── Setup guide banner ── */}
      <div className="devices-setup-banner">
        <span className="devices-setup-icon">💡</span>
        <div>
          <strong>How to set up printers</strong>
          <p>
            Printers are configured directly on your POS terminal — it's on the same
            local network as your printers, so it can reach them.
            Go to <strong>Settings → Printers</strong> on the POS, add each printer,
            and set its <em>Station</em>. The routing map below will update automatically.
          </p>
        </div>
      </div>

      {/* Outlet tabs */}
      {outlets.length > 0 && (
        <div className="device-outlet-tabs">
          {isOwner && (
            <button
              className={`device-outlet-tab${activeOutlet === "all" ? " active" : ""}`}
              onClick={() => setActiveOutlet("all")}
            >
              All Outlets
              <span className="device-outlet-tab-count">{devices.length}</span>
            </button>
          )}
          {outlets.map(outlet => (
            <button
              key={outlet.id}
              className={`device-outlet-tab${activeOutlet === outlet.name ? " active" : ""}${outlet.isActive === false ? " inactive-outlet" : ""}`}
              onClick={() => !isManager && setActiveOutlet(outlet.name)}
              disabled={isManager && activeOutlet !== outlet.name}
            >
              {outlet.name}
              {outlet.isActive === false && <span className="device-outlet-tab-off"> (off)</span>}
              <span className="device-outlet-tab-count">
                {devices.filter(d => d.outlet === outlet.name).length}
              </span>
            </button>
          ))}
          {isManager && (
            <span className="device-outlet-tab-locked">🔒 Your outlet only</span>
          )}
        </div>
      )}

      {/* Stats row */}
      {total > 0 && (
        <div className="devices-stats">
          <div className="dev-stat"><strong>{total}</strong><span>Devices</span></div>
          <div className="dev-stat ok"><strong>{online}</strong><span>Online</span></div>
          <div className={`dev-stat ${offline > 0 ? "bad" : ""}`}>
            <strong>{offline}</strong><span>Offline</span>
          </div>
          <div className={`dev-stat ${unassigned > 0 ? "warn" : ""}`}>
            <strong>{unassigned}</strong><span>Unassigned</span>
          </div>
        </div>
      )}

      {/* Offline banner */}
      {offline > 0 && (
        <div className="devices-offline-banner">
          <strong>⚠️ {offline} device{offline > 1 ? "s" : ""} offline</strong>
          <span>
            {visibleDevices.filter(d => d.status === "offline").map(d => d.name).join(", ")}
            {" "}— POS and Captain app have been alerted
          </span>
        </div>
      )}

      {/* ── Station Routing Panel (read-only) ── */}
      <StationRoutingPanel
        stations={stations}
        stationMap={stationMap}
      />

      {/* ── Device Status Cards ── */}
      {devices.length === 0 ? (
        <div className="panel devices-empty">
          <span className="devices-empty-icon">🖨️</span>
          <p>
            No devices synced yet.
          </p>
          <p className="muted-hint">
            Once you add printers on the POS terminal (Settings → Printers), they'll
            appear here with live status.
          </p>
        </div>
      ) : (
        <section className="devices-section">
          <div className="devices-section-head">
            <span className="section-icon">🖨️</span>
            <div>
              <h3>Connected Devices</h3>
              <p>{visibleDevices.length} device{visibleDevices.length !== 1 ? "s" : ""} · status synced from POS</p>
            </div>
          </div>
          <div className="devices-grid">
            {visibleDevices.map(device => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
