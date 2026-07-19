import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";

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

const DEVICE_TYPE_ICONS = { pos: "🖥️", captain: "📱", kds: "📺", kiosk: "📲" };
const DEVICE_TYPE_LABELS = { pos: "POS Terminal", captain: "Captain App", kds: "KDS", kiosk: "Kiosk" };

// ── Device Status Card (read-only) ───────────────────────────────────────────
function DeviceCard({ device }) {
  const isOffline   = device.status === "offline";
  const typeKey     = (device.deviceType || "pos").toLowerCase();
  const icon        = DEVICE_TYPE_ICONS[typeKey]  || "🖥️";
  const typeLabel   = DEVICE_TYPE_LABELS[typeKey] || device.deviceType;
  const displayName = device.deviceName || typeLabel;

  return (
    <div className={`device-card${isOffline ? " device-offline" : ""}`}>
      <div className="device-card-top">
        <div className="device-card-left">
          <span className="device-icon">{icon}</span>
          <div className="device-card-info">
            <strong>{displayName}</strong>
            <span className="device-meta">
              {typeLabel}
              {device.platform ? ` · ${device.platform}` : ""}
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

      <div className="device-assignment">
        {device.outlet && (
          <span className="device-outlet-badge">🏠 {device.outlet}</span>
        )}
        <span className="device-last-seen">Last seen {timeAgo(device.lastSeenAt)}</span>
      </div>
    </div>
  );
}

// ── Link Code Card ───────────────────────────────────────────────────────────
function LinkCodeCard({ data, onDismiss }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(data.linkCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="link-code-card">
      <div className="link-code-card-top">
        <div>
          <p className="link-code-label">Link code for <strong>{data.outletName}</strong></p>
          <p className="link-code-hint">Enter this on the POS or Captain app to connect the device</p>
        </div>
        <button className="ghost-btn sm" onClick={onDismiss}>✕</button>
      </div>
      <div className="link-code-display">
        <span className="link-code-value">{data.linkCode}</span>
        <button className="primary-btn sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="link-code-expiry">Expires in 24 hours · Works for POS and Captain app</p>
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
  const [stationMap]                    = useState({});
  const [loading, setLoading]           = useState(true);
  const [linkCodeData, setLinkCodeData] = useState(null);
  const [linkGenerating, setLinkGenerating] = useState(false);
  const refreshRef                      = useRef(null);

  const isOwner   = (user?.roles || []).includes("Owner");
  const isManager = !isOwner && (user?.roles || []).includes("Manager");

  const outletsRef = useRef([]);

  function loadDevices() {
    api.get("/devices").then((list) => {
      const rows = (list || []).map((d) => {
        const outletName = outletsRef.current.find(o => o.id === d.outletId)?.name || d.outletId;
        return {
          ...d,
          status: d.onlineStatus || "offline",
          outlet: outletName,
        };
      });
      setDevices(rows);
    }).catch(() => {}).finally(() => setLoading(false));
  }

  // Load outlets + stations + devices from API
  useEffect(() => {
    Promise.all([
      api.get("/outlets").catch(() => []),
      api.get("/kitchen-stations").catch(() => [])
    ]).then(([outletList, stationList]) => {
      outletsRef.current = outletList || [];
      setOutlets(outletList || []);
      setStations(stationList || []);

      if (isManager && user?.outletId) {
        const mine = (outletList || []).find(o => o.id === user.outletId);
        if (mine) setActiveOutlet(mine.name);
      }

      loadDevices();
    });

    // Auto-refresh devices every 30s so online/offline status stays current
    refreshRef.current = setInterval(loadDevices, 30_000);
    return () => clearInterval(refreshRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isManager]);

  async function generateLinkCode() {
    const outletObj = outlets.find(o => o.name === activeOutlet || o.id === activeOutlet);
    if (!outletObj) return;
    setLinkGenerating(true);
    setLinkCodeData(null);
    try {
      const result = await api.post("/devices/link-token", {
        outletCode: outletObj.code || outletObj.name,
        outletId:   outletObj.id,
      });
      setLinkCodeData({ linkCode: result.linkCode, outletName: outletObj.name });
    } catch (e) {
      alert(e.message || "Could not generate link code.");
    } finally {
      setLinkGenerating(false);
    }
  }

  const visibleDevices = activeOutlet === "all"
    ? devices
    : devices.filter(d => d.outlet === activeOutlet || d.outletId === activeOutlet);

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
        <button
          className="ghost-btn sm"
          onClick={() => { setLoading(true); loadDevices(); }}
          title="Refresh device status"
        >
          Refresh
        </button>
      </header>

      {/* ── Setup guide banner ── */}
      <div className="devices-setup-banner">
        <span className="devices-setup-icon">💡</span>
        <div>
          <strong>How to set up devices</strong>
          <p>
            Open the POS or Captain app, enter the branch link code from <strong>App Store → Link Device</strong>,
            and the device will appear here. Devices ping the server every 60 seconds — status shows
            <em> Online</em> if seen in the last 2 minutes. Printers are configured on the POS terminal
            via <strong>Settings → Printers</strong>.
          </p>
        </div>
      </div>

      {/* Outlet tabs + Link Device button */}
      {outlets.length > 0 && (
        <div className="device-outlet-tabs-row">
          <div className="device-outlet-tabs">
            {isOwner && (
              <button
                className={`device-outlet-tab${activeOutlet === "all" ? " active" : ""}`}
                onClick={() => { setActiveOutlet("all"); setLinkCodeData(null); }}
              >
                All Outlets
                <span className="device-outlet-tab-count">{devices.length}</span>
              </button>
            )}
            {outlets.map(outlet => (
              <button
                key={outlet.id}
                className={`device-outlet-tab${activeOutlet === outlet.name ? " active" : ""}${outlet.isActive === false ? " inactive-outlet" : ""}`}
                onClick={() => { if (!isManager) { setActiveOutlet(outlet.name); setLinkCodeData(null); } }}
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

          <button
            className="primary-btn sm link-device-btn"
            onClick={generateLinkCode}
            disabled={activeOutlet === "all" || linkGenerating}
            title={activeOutlet === "all" ? "Select a branch first" : `Generate link code for ${activeOutlet}`}
          >
            {linkGenerating ? "Generating…" : "+ Link Device"}
          </button>
        </div>
      )}

      {/* Link code result card */}
      {linkCodeData && (
        <LinkCodeCard data={linkCodeData} onDismiss={() => setLinkCodeData(null)} />
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
      {loading ? (
        <div className="panel devices-empty">
          <p className="muted-hint">Loading devices…</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="panel devices-empty">
          <span className="devices-empty-icon">📱</span>
          <p>No devices registered yet.</p>
          <p className="muted-hint">
            Open the POS or Captain app and enter a branch link code — the device will appear here
            once it connects.
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
