import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import {
  DEVICE_ROLES,
  DEVICES_SHARED_KEY,
  PRINTER_MODELS,
  STATION_SUGGESTIONS,
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

// Write to shared key so POS/Captain app can read printer assignments
function syncToPOS(list) {
  const assignments = list.map(d => ({
    id: d.id, name: d.name, type: d.type, model: d.model,
    ip: d.ip, role: d.role, station: d.station, status: d.status
  }));
  localStorage.setItem(DEVICES_SHARED_KEY, JSON.stringify(assignments));
}

function saveDevices(list) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  syncToPOS(list);
}

function timeAgo(iso) {
  if (!iso) return "Unknown";
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
      background: c, flexShrink: 0, boxShadow: `0 0 0 3px ${glows[status] || glows.offline}`
    }} />
  );
}

function DeviceCard({ device, onUpdate, onRemove, onTestPrint }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: device.name, role: device.role,
    station: device.station, model: device.model
  });

  function saveEdit() {
    onUpdate(device.id, draft);
    setEditing(false);
  }

  const roleLabel    = DEVICE_ROLES.find(r => r.value === device.role)?.label || "Unassigned";
  const stationLabel = device.station || "";
  const isOffline    = device.status === "offline";

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
            <span className="device-meta">{device.model} · {device.ip}</span>
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
            Assign to
            <select value={draft.role}
              onChange={e => setDraft(d => ({ ...d, role: e.target.value, station: "" }))}>
              {DEVICE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          {draft.role !== "unassigned" && (
            <label>
              Station / Location name
              <input
                list="station-suggestions"
                placeholder="e.g. Grill Station, AC Hall 1, Billing Counter 2…"
                value={draft.station || ""}
                onChange={e => setDraft(d => ({ ...d, station: e.target.value }))}
              />
              <datalist id="station-suggestions">
                {STATION_SUGGESTIONS.map(s => <option key={s} value={s} />)}
              </datalist>
              <span className="combo-hint">Choose a suggestion or type your own</span>
            </label>
          )}
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
          <span className="device-role-chip">
            {roleLabel}{stationLabel ? ` · ${stationLabel}` : ""}
          </span>
          {device.outlet && (
            <span className="device-outlet-badge">📍 {device.outlet}</span>
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

export function DevicesPage() {
  const { user } = useAuth();
  const [devices, setDevices]     = useState(loadDevices);
  const [outlets, setOutlets]     = useState([]);
  const [activeOutlet, setActiveOutlet] = useState("all");
  const [msg, setMsg]             = useState("");
  const [scanning, setScanning]   = useState(false);
  const [addOpen, setAddOpen]     = useState(false);
  const [newDev, setNewDev]       = useState({
    name: "", type: "printer", model: "Epson TM-T82",
    ip: "", role: "unassigned", station: null, outlet: ""
  });

  // Fetch outlet list from backend
  useEffect(() => {
    api.get("/outlets")
      .then((list) => {
        setOutlets(list || []);
        // Manager is locked to their own outlet
        const isManager = (user?.roles || []).includes("Manager") && !((user?.roles || []).includes("Owner"));
        if (isManager && user?.outletId) {
          const myOutlet = (list || []).find(o => o.id === user.outletId);
          if (myOutlet) setActiveOutlet(myOutlet.name);
        }
        // Pre-fill new device outlet with first outlet
        if (list?.length) setNewDev(d => ({ ...d, outlet: list[0].name }));
      })
      .catch(() => {});
  }, [user]);

  const isOwner   = (user?.roles || []).includes("Owner");
  const isManager = !isOwner && (user?.roles || []).includes("Manager");

  function flash(text) { setMsg(text); setTimeout(() => setMsg(""), 3000); }

  function handleUpdate(id, changes) {
    const next = devices.map(d => d.id === id ? { ...d, ...changes } : d);
    setDevices(next); saveDevices(next); flash("Device updated.");
  }

  function handleRemove(id) {
    const next = devices.filter(d => d.id !== id);
    setDevices(next); saveDevices(next); flash("Device removed.");
  }

  function handleTestPrint(device) { flash(`Test print sent to "${device.name}".`); }

  async function handleScan() {
    setScanning(true);
    await new Promise(r => setTimeout(r, 2200));
    const exists = devices.find(d => d.ip === "192.168.1.120");
    if (!exists) {
      const found = {
        id: `disc-${Date.now()}`, name: "Discovered Printer", type: "printer",
        model: "Epson TM-T82", ip: "192.168.1.120", mac: "00:26:B9:AA:12:20",
        status: "online", role: "unassigned", station: null,
        outlet: "Indiranagar", paperLow: false, lastSeen: new Date().toISOString()
      };
      const next = [...devices, found];
      setDevices(next); saveDevices(next);
      flash("Found 1 new device on network — assign it below.");
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
    setNewDev({ name: "", type: "printer", model: "Epson TM-T82", ip: "", role: "unassigned", station: null });
    setAddOpen(false);
    flash(`"${device.name}" added.`);
  }

  // Filter by selected outlet tab
  const visibleDevices = activeOutlet === "all"
    ? devices
    : devices.filter(d => d.outlet === activeOutlet);

  const total      = visibleDevices.length;
  const online     = visibleDevices.filter(d => d.status === "online").length;
  const offline    = visibleDevices.filter(d => d.status === "offline").length;
  const unassigned = visibleDevices.filter(d => d.role === "unassigned").length;

  const sections = [
    { key: "billing",    label: "Billing Counter",               icon: "🧾", list: visibleDevices.filter(d => d.role === "billing") },
    { key: "kitchen",    label: "Kitchen Stations",              icon: "👨‍🍳", list: visibleDevices.filter(d => d.role === "kitchen") },
    { key: "dining",     label: "Dining Halls",                  icon: "🍽️", list: visibleDevices.filter(d => d.role === "dining") },
    { key: "bar",        label: "Bar / Beverages",               icon: "🍹", list: visibleDevices.filter(d => d.role === "bar") },
    { key: "unassigned", label: "Unassigned — assign these now", icon: "📦", list: visibleDevices.filter(d => d.role === "unassigned"), warn: true }
  ];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>Devices</h2>
        </div>
        <div className="topbar-actions">
          <button className="ghost-btn" onClick={() => setAddOpen(v => !v)}>+ Add Manually</button>
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
              title={isManager ? "You can only view your assigned outlet" : outlet.name}
            >
              {outlet.name}
              {outlet.isActive === false && <span className="device-outlet-tab-off"> (off)</span>}
              <span className="device-outlet-tab-count">
                {devices.filter(d => d.outlet === outlet.name).length}
              </span>
            </button>
          ))}
          {isManager && (
            <span className="device-outlet-tab-locked">🔒 Showing your outlet only</span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="devices-stats">
        <div className="dev-stat"><strong>{total}</strong><span>Total</span></div>
        <div className="dev-stat ok"><strong>{online}</strong><span>Online</span></div>
        <div className={`dev-stat ${offline > 0 ? "bad" : ""}`}><strong>{offline}</strong><span>Offline</span></div>
        <div className={`dev-stat ${unassigned > 0 ? "warn" : ""}`}><strong>{unassigned}</strong><span>Unassigned</span></div>
      </div>

      {/* Offline banner */}
      {offline > 0 && (
        <div className="devices-offline-banner">
          <strong>⚠️ {offline} device{offline > 1 ? "s" : ""} offline{activeOutlet !== "all" ? ` at ${activeOutlet}` : ""}</strong>
          <span>
            {visibleDevices.filter(d => d.status === "offline").map(d => d.name).join(", ")}
            {" "}— POS and Captain app have been alerted
          </span>
        </div>
      )}

      {msg && <div className="mobile-banner">{msg}</div>}

      {/* Scan animation */}
      {scanning && (
        <div className="scan-box">
          <div className="scan-ring" />
          <p>Scanning local network for printers and KDS screens…</p>
        </div>
      )}

      {/* Manual add form */}
      {addOpen && (
        <form className="panel device-add-panel" onSubmit={handleAddManual}>
          <div className="panel-head"><h3>Add Device Manually</h3></div>
          <div className="device-form-grid">
            <label>
              Device name
              <input required placeholder="e.g. Bar Printer" value={newDev.name}
                onChange={e => setNewDev(d => ({ ...d, name: e.target.value }))} />
            </label>
            <label>
              Outlet
              <select value={newDev.outlet}
                onChange={e => setNewDev(d => ({ ...d, outlet: e.target.value }))}>
                {outlets.map(o => (
                  <option key={o.id} value={o.name}>{o.name}</option>
                ))}
                {outlets.length === 0 && (
                  <option value="">No outlets configured</option>
                )}
              </select>
            </label>
            <label>
              Type
              <select value={newDev.type} onChange={e => setNewDev(d => ({ ...d, type: e.target.value }))}>
                <option value="printer">Printer</option>
                <option value="kds">KDS Screen</option>
              </select>
            </label>
            {newDev.type === "printer" && (
              <label>
                Model
                <select value={newDev.model} onChange={e => setNewDev(d => ({ ...d, model: e.target.value }))}>
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
              Assign to
              <select value={newDev.role}
                onChange={e => setNewDev(d => ({ ...d, role: e.target.value, station: null }))}>
                {DEVICE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            {newDev.role !== "unassigned" && (
              <label>
                Station / Location name
                <input
                  list="station-suggestions-add"
                  placeholder="e.g. Grill Station, AC Hall 1…"
                  value={newDev.station || ""}
                  onChange={e => setNewDev(d => ({ ...d, station: e.target.value }))}
                />
                <datalist id="station-suggestions-add">
                  {STATION_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                </datalist>
                <span className="combo-hint">Choose a suggestion or type your own</span>
              </label>
            )}
          </div>
          <div className="device-form-actions">
            <button type="submit" className="primary-btn">Add Device</button>
            <button type="button" className="ghost-chip" onClick={() => setAddOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Device sections */}
      {sections.map(({ key, label, icon, list, warn }) =>
        list.length > 0 && (
          <section key={key} className="devices-section">
            <div className={`devices-section-head${warn ? " warn-head" : ""}`}>
              <span className="section-icon">{icon}</span>
              <div>
                <h3>{label}</h3>
                <p>{list.length} device{list.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="devices-grid">
              {list.map(device => (
                <DeviceCard key={device.id} device={device}
                  onUpdate={handleUpdate} onRemove={handleRemove} onTestPrint={handleTestPrint} />
              ))}
            </div>
          </section>
        )
      )}
    </>
  );
}
