import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import {
  DEVICES_SHARED_KEY,
  PRINTER_MODELS,
  devicesSeedData
} from "./devices.seed";

const LOCAL_KEY = "pos_local_devices";

function loadDevices() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
    return saved || devicesSeedData;
  } catch {
    return devicesSeedData;
  }
}

// Sync to shared localStorage key so POS / Captain / KDS can read printer routing
function syncToPOS(list) {
  // Build station → printer map for fast lookup in POS
  const stationMap = {};
  list.filter(d => d.type === "printer" && d.station).forEach(d => {
    stationMap[d.station] = {
      id: d.id, name: d.name, model: d.model,
      ip: d.ip, status: d.status
    };
  });
  localStorage.setItem(DEVICES_SHARED_KEY, JSON.stringify({ devices: list, stationMap }));
}

function saveDevices(list) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  syncToPOS(list);
}

function timeAgo(iso) {
  if (!iso) return "Never";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
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

// ── Station Routing Panel ────────────────────────────────────────────────────
function StationRoutingPanel({ stations, devices, onAssign }) {
  if (stations.length === 0) {
    return (
      <div className="panel srt-empty-panel">
        <p className="srt-empty-msg">
          <span>🏗️</span>
          No kitchen stations yet. Go to <strong>Menu → Stations</strong> to create stations
          like <em>Hot Kitchen</em>, <em>Bar</em>, or <em>Bills &amp; KOTs</em> — then come
          back here to assign a printer to each one.
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
          Each station routes KOTs (and bills for Bills &amp; KOTs) to its assigned printer.
        </p>
      </div>

      <div className="srt-grid">
        {stations.map(station => {
          const printer = devices.find(
            d => d.type === "printer" && d.station === station.name
          );
          const isBilling = /bill|kot/i.test(station.name);
          const isOnline  = printer?.status === "online";
          const isOffline = printer?.status === "offline";

          return (
            <div
              key={station.id}
              className={`srt-row${!printer ? " srt-row-unassigned" : ""}${isOffline ? " srt-row-offline" : ""}`}
            >
              <div className="srt-station">
                <span className="srt-station-icon">{isBilling ? "🧾" : "🍳"}</span>
                <div>
                  <strong>{station.name}</strong>
                  {isBilling && (
                    <span className="srt-badge">KOTs &amp; Bills</span>
                  )}
                </div>
              </div>

              <div className="srt-arrow">→</div>

              <div className="srt-printer">
                {printer ? (
                  <>
                    <StatusDot status={printer.status} />
                    <div className="srt-printer-info">
                      <strong>{printer.name}</strong>
                      <span className="srt-printer-meta">
                        {printer.model} · {printer.ip || "IP pending"}
                        {isOffline && <span className="srt-offline-tag"> · Offline</span>}
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="srt-no-printer">No printer assigned</span>
                )}
              </div>

              <button
                className={`ghost-chip srt-assign-btn${!printer ? " srt-assign-btn-warn" : ""}`}
                onClick={() => onAssign(station.name)}
              >
                {printer ? "Change" : "Assign Printer"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="srt-hint">
        💡 To add a new station (e.g. <em>Bills &amp; KOTs</em>), go to{" "}
        <strong>Menu → Stations</strong>. Categories assigned to that station will
        automatically route to its printer.
      </p>
    </div>
  );
}

// ── Device Card ──────────────────────────────────────────────────────────────
function DeviceCard({ device, stations, onUpdate, onRemove, onTestPrint }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState({
    name: device.name, station: device.station || "", model: device.model
  });

  function saveEdit() {
    onUpdate(device.id, draft);
    setEditing(false);
  }

  const isOffline = device.status === "offline";

  return (
    <div className={`device-card${isOffline ? " device-offline" : ""}${device.paperLow && !isOffline ? " device-warning" : ""}`}>
      <div className="device-card-top">
        <div className="device-card-left">
          <span className="device-icon">{device.type === "printer" ? "🖨️" : "🖥️"}</span>
          <div className="device-card-info">
            {editing ? (
              <input className="device-name-input" value={draft.name} autoFocus
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            ) : (
              <strong>{device.name}</strong>
            )}
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

      {editing ? (
        <div className="device-edit-form">
          <label>
            Display name
            <input value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          </label>
          <label>
            Assigned to station
            <select value={draft.station}
              onChange={e => setDraft(d => ({ ...d, station: e.target.value }))}>
              <option value="">— Unassigned —</option>
              {stations.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </label>
          {device.type === "printer" && (
            <label>
              Printer model
              <select value={draft.model}
                onChange={e => setDraft(d => ({ ...d, model: e.target.value }))}>
                {PRINTER_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
          <div className="device-form-actions">
            <button className="primary-btn" onClick={saveEdit}>Save</button>
            <button className="ghost-chip" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
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
      )}

      {!editing && (
        <div className="device-actions">
          <button className="ghost-chip" onClick={() => setEditing(true)}>Edit</button>
          {device.type === "printer" && !isOffline && (
            <button className="ghost-chip" onClick={() => onTestPrint(device)}>Test Print</button>
          )}
          <button className="ghost-chip danger-chip" onClick={() => onRemove(device.id)}>Remove</button>
        </div>
      )}
    </div>
  );
}

// ── Quick Assign Modal ────────────────────────────────────────────────────────
// Shown when user clicks "Assign Printer" on a station row
function QuickAssignModal({ stationName, devices, onConfirm, onClose }) {
  const [selectedId, setSelectedId] = useState("");
  const printers = devices.filter(d => d.type === "printer");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Assign Printer → <em>{stationName}</em></h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {printers.length === 0 ? (
          <p className="muted-hint">No printers added yet. Use <strong>Add Device</strong> to add one first.</p>
        ) : (
          <div className="modal-body">
            <label>
              Choose printer
              <select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                <option value="">— select —</option>
                <option value="__none__">Remove assignment</option>
                {printers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model}{p.station && p.station !== stationName ? ` · currently → ${p.station}` : ""})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="device-form-actions">
          <button
            className="primary-btn"
            disabled={!selectedId}
            onClick={() => { onConfirm(stationName, selectedId); onClose(); }}
          >
            Confirm
          </button>
          <button className="ghost-chip" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function DevicesPage() {
  const { user } = useAuth();
  const [devices, setDevices]           = useState(loadDevices);
  const [stations, setStations]         = useState([]);
  const [outlets, setOutlets]           = useState([]);
  const [activeOutlet, setActiveOutlet] = useState("all");
  const [msg, setMsg]                   = useState("");
  const [scanning, setScanning]         = useState(false);
  const [addOpen, setAddOpen]           = useState(false);
  const [assignModal, setAssignModal]   = useState(null); // station name string
  const [newDev, setNewDev]             = useState({
    name: "", type: "printer", model: "Epson TM-T82",
    ip: "", station: "", outlet: ""
  });

  const isOwner   = (user?.roles || []).includes("Owner");
  const isManager = !isOwner && (user?.roles || []).includes("Manager");

  useEffect(() => {
    // Load outlets + stations in parallel
    Promise.all([
      api.get("/outlets").catch(() => []),
      api.get("/menu/stations").catch(() => [])
    ]).then(([outletList, stationList]) => {
      setOutlets(outletList || []);
      setStations(stationList || []);

      // Manager locked to their outlet
      if (isManager && user?.outletId) {
        const mine = (outletList || []).find(o => o.id === user.outletId);
        if (mine) setActiveOutlet(mine.name);
      }

      // Pre-fill outlet for new device
      if (outletList?.length) {
        setNewDev(d => ({ ...d, outlet: outletList[0].name }));
      }
    });
  }, [user, isManager]);

  function flash(text) { setMsg(text); setTimeout(() => setMsg(""), 3500); }

  function handleUpdate(id, changes) {
    const next = devices.map(d => d.id === id ? { ...d, ...changes } : d);
    setDevices(next); saveDevices(next); flash("Device updated.");
  }

  function handleRemove(id) {
    if (!window.confirm("Remove this device?")) return;
    const next = devices.filter(d => d.id !== id);
    setDevices(next); saveDevices(next); flash("Device removed.");
  }

  function handleTestPrint(device) { flash(`Test print sent to "${device.name}".`); }

  // Called from StationRoutingPanel "Assign Printer" button
  function handleQuickAssign(stationName, printerId) {
    if (!printerId) return;
    const next = devices.map(d => {
      if (printerId === "__none__") {
        // Remove assignment from whichever printer was on this station
        return d.station === stationName ? { ...d, station: "" } : d;
      }
      if (d.id === printerId) return { ...d, station: stationName };
      // If another printer had this station, clear it
      if (d.type === "printer" && d.station === stationName) return { ...d, station: "" };
      return d;
    });
    setDevices(next); saveDevices(next);
    flash(printerId === "__none__"
      ? `Printer unassigned from "${stationName}".`
      : `Printer assigned to "${stationName}".`
    );
  }

  async function handleScan() {
    setScanning(true);
    await new Promise(r => setTimeout(r, 2200));
    // Simulate discovery — in production this would call a network scan API
    const tempIp = "192.168.1.120";
    const exists = devices.find(d => d.ip === tempIp);
    if (!exists) {
      const found = {
        id: `disc-${Date.now()}`, name: "Discovered Printer", type: "printer",
        model: "Epson TM-T82", ip: tempIp, mac: "00:26:B9:AA:12:20",
        status: "online", station: "",
        outlet: outlets[0]?.name || "",
        paperLow: false, lastSeen: new Date().toISOString()
      };
      const next = [...devices, found];
      setDevices(next); saveDevices(next);
      flash("Found 1 new device on network — assign it to a station.");
    } else {
      flash("All devices up to date. No new devices found.");
    }
    setScanning(false);
  }

  function handleAddManual(e) {
    e.preventDefault();
    const device = {
      ...newDev, id: `manual-${Date.now()}`, mac: "",
      status: "online", paperLow: false, lastSeen: new Date().toISOString()
    };
    const next = [...devices, device];
    setDevices(next); saveDevices(next);
    setNewDev({ name: "", type: "printer", model: "Epson TM-T82", ip: "", station: "", outlet: outlets[0]?.name || "" });
    setAddOpen(false);
    flash(`"${device.name}" added — assign it to a station in the routing panel.`);
  }

  const visibleDevices = activeOutlet === "all"
    ? devices
    : devices.filter(d => d.outlet === activeOutlet);

  const total      = visibleDevices.length;
  const online     = visibleDevices.filter(d => d.status === "online").length;
  const offline    = visibleDevices.filter(d => d.status === "offline").length;
  const unassigned = visibleDevices.filter(d => !d.station).length;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Devices &amp; Printer Routing</h2>
        </div>
        <div className="topbar-actions">
          <button className="ghost-btn" onClick={() => setAddOpen(v => !v)}>+ Add Device</button>
          <button className="primary-btn" onClick={handleScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Scan Network"}
          </button>
        </div>
      </header>

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

      {/* Stats */}
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

      {msg && <div className="mobile-banner">{msg}</div>}

      {scanning && (
        <div className="scan-box">
          <div className="scan-ring" />
          <p>Scanning local network for printers and KDS screens…</p>
        </div>
      )}

      {/* ── Station Routing Panel ── */}
      <StationRoutingPanel
        stations={stations}
        devices={visibleDevices}
        onAssign={(stationName) => setAssignModal(stationName)}
      />

      {/* Quick Assign Modal */}
      {assignModal && (
        <QuickAssignModal
          stationName={assignModal}
          devices={visibleDevices}
          onConfirm={handleQuickAssign}
          onClose={() => setAssignModal(null)}
        />
      )}

      {/* ── Add Device Form ── */}
      {addOpen && (
        <form className="panel device-add-panel" onSubmit={handleAddManual}>
          <div className="panel-head"><h3>Add Device</h3></div>
          <div className="device-form-grid">
            <label>
              Device name
              <input required placeholder="e.g. Hot Kitchen Printer" value={newDev.name}
                onChange={e => setNewDev(d => ({ ...d, name: e.target.value }))} />
            </label>
            {outlets.length > 0 && (
              <label>
                Outlet
                <select value={newDev.outlet}
                  onChange={e => setNewDev(d => ({ ...d, outlet: e.target.value }))}>
                  {outlets.map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Type
              <select value={newDev.type}
                onChange={e => setNewDev(d => ({ ...d, type: e.target.value }))}>
                <option value="printer">Printer</option>
                <option value="kds">KDS Screen</option>
              </select>
            </label>
            {newDev.type === "printer" && (
              <label>
                Printer model
                <select value={newDev.model}
                  onChange={e => setNewDev(d => ({ ...d, model: e.target.value }))}>
                  {PRINTER_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            )}
            <label>
              IP Address
              <input placeholder="192.168.1.xxx" value={newDev.ip}
                onChange={e => setNewDev(d => ({ ...d, ip: e.target.value }))} />
            </label>
            <label>
              Assign to station
              <select value={newDev.station}
                onChange={e => setNewDev(d => ({ ...d, station: e.target.value }))}>
                <option value="">— Unassigned —</option>
                {stations.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="device-form-actions">
            <button type="submit" className="primary-btn">Add Device</button>
            <button type="button" className="ghost-chip" onClick={() => setAddOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* ── Device Cards ── */}
      {visibleDevices.length === 0 ? (
        <div className="panel devices-empty">
          <span className="devices-empty-icon">🖨️</span>
          <p>No devices yet. Add a printer manually or scan your network.</p>
        </div>
      ) : (
        <section className="devices-section">
          <div className="devices-section-head">
            <span className="section-icon">🖨️</span>
            <div>
              <h3>All Devices</h3>
              <p>{visibleDevices.length} device{visibleDevices.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="devices-grid">
            {visibleDevices.map(device => (
              <DeviceCard
                key={device.id}
                device={device}
                stations={stations}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
                onTestPrint={handleTestPrint}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
