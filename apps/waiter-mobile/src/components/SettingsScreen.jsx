import { useState } from "react";

const PAPER_OPTIONS = ["80mm", "76mm", "58mm"];

function loadPrinters() {
  try {
    const saved = JSON.parse(localStorage.getItem("captain_printers") || "[]");
    if (saved.length) return saved;
    // Migrate legacy single-IP config to new multi-printer format
    const ip    = localStorage.getItem("captain_printer_ip") || "";
    const paper = localStorage.getItem("captain_paper_size") || "80mm";
    return [{ name: "Thermal Printer", type: "Both (KOT + Bill)", ip, paper, isDefault: true, station: "" }];
  } catch {
    return [{ name: "Thermal Printer", type: "Both (KOT + Bill)", ip: "", paper: "80mm", isDefault: true, station: "" }];
  }
}

function persistPrinters(printers) {
  // type auto-assigned: station="" → waiter/bill printer, station set → KOT-only
  const updated = printers.map((p, i) => ({
    ...p,
    type:      p.station.trim() ? "KOT Printer" : "Both (KOT + Bill)",
    isDefault: i === 0,
  }));
  localStorage.setItem("captain_printers", JSON.stringify(updated));
  // Keep legacy keys pointing to first printer for any old code paths
  if (updated.length > 0) {
    localStorage.setItem("captain_printer_ip",  updated[0].ip);
    localStorage.setItem("captain_paper_size", updated[0].paper);
  }
}

const APP_VERSION = "1.30";

export function SettingsScreen({ outletName, serverUrl, localPosIp, onClose }) {
  const [printers,   setPrinters]   = useState(loadPrinters);
  const [saved,      setSaved]      = useState(false);
  const [testStatus, setTestStatus] = useState({}); // { [index]: "testing"|"ok"|"fail" }
  const [posIp,      setPosIp]      = useState(() => localStorage.getItem("captain_local_server_ip") || "");
  const [posIpSaved, setPosIpSaved] = useState(false);
  const [posTestSt,  setPosTestSt]  = useState(""); // "testing"|"ok"|"fail"

  async function testPosConnection() {
    const ip = posIp.trim();
    if (!ip) { setPosTestSt("fail"); return; }
    setPosTestSt("testing");
    try {
      const res = await fetch(`http://${ip}:4001/health`, { signal: AbortSignal.timeout(3000) });
      setPosTestSt(res.ok ? "ok" : "fail");
    } catch {
      setPosTestSt("fail");
    }
    setTimeout(() => setPosTestSt(""), 3000);
  }

  function savePosIp() {
    const ip = posIp.trim();
    if (ip) localStorage.setItem("captain_local_server_ip", ip);
    else    localStorage.removeItem("captain_local_server_ip");
    // Signal App.jsx to reconnect the local socket to the new IP immediately
    window.dispatchEvent(new CustomEvent("dinex:pos-ip-changed", { detail: { ip: ip || null } }));
    setPosIpSaved(true);
    setTimeout(() => setPosIpSaved(false), 2000);
  }

  function update(idx, field, value) {
    setPrinters(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  function addPrinter() {
    setPrinters(prev => [...prev, { name: "", type: "KOT Printer", ip: "", paper: "80mm", isDefault: false, station: "" }]);
  }

  function removePrinter(idx) {
    setPrinters(prev => prev.filter((_, i) => i !== idx));
  }

  async function testPrinter(idx) {
    const ip = printers[idx].ip.trim();
    if (!ip) { setTestStatus(s => ({ ...s, [idx]: "fail" })); return; }
    setTestStatus(s => ({ ...s, [idx]: "testing" }));
    try {
      const { pingPrinter } = await import("../lib/thermalPrint.js");
      const result = await pingPrinter(ip);
      setTestStatus(s => ({ ...s, [idx]: result.ok ? "ok" : "fail" }));
    } catch {
      setTestStatus(s => ({ ...s, [idx]: "fail" }));
    }
    setTimeout(() => setTestStatus(s => { const n = { ...s }; delete n[idx]; return n; }), 3000);
  }

  function handleSave() {
    persistPrinters(printers);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button className="settings-back" onClick={onClose}>←</button>
        <span className="settings-title">Settings</span>
      </div>

      <div className="settings-body" style={{ padding: "12px 16px 32px" }}>

        {/* ── Printer list ── */}
        <div className="drawer-section">
          <div className="drawer-section-title" style={{ marginBottom: 12 }}>Printer Settings</div>

          {printers.map((printer, idx) => (
            <div
              key={idx}
              style={{
                border: "1px solid #e5e7eb", borderRadius: 10,
                padding: "12px 12px 8px", marginBottom: 12,
                background: idx === 0 ? "#fffbeb" : "#fafafa",
              }}
            >
              {/* Card header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: idx === 0 ? "#b45309" : "#6366f1", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {idx === 0 ? "Waiter / Default Printer" : `Kitchen Printer ${idx}`}
                </span>
                <button
                  onClick={() => removePrinter(idx)}
                  style={{ background: "none", border: "none", color: "#e53e3e", fontSize: 18, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
                >✕</button>
              </div>

              {/* Name */}
              <div className="drawer-printer-row">
                <label className="drawer-printer-label">Name</label>
                <input
                  className="drawer-printer-input"
                  type="text"
                  placeholder={idx === 0 ? "e.g. Waiter Printer" : "e.g. South Indian"}
                  value={printer.name}
                  onChange={e => update(idx, "name", e.target.value)}
                />
              </div>

              {/* IP */}
              <div className="drawer-printer-row">
                <label className="drawer-printer-label">Printer IP</label>
                <input
                  className="drawer-printer-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="192.168.1.200"
                  value={printer.ip}
                  onChange={e => update(idx, "ip", e.target.value)}
                />
              </div>

              {/* Station — only for kitchen printers (idx > 0) */}
              {idx > 0 && (
                <div className="drawer-printer-row">
                  <label className="drawer-printer-label">Station</label>
                  <input
                    className="drawer-printer-input"
                    type="text"
                    placeholder="e.g. SOUTH INDIAN"
                    value={printer.station}
                    onChange={e => update(idx, "station", e.target.value)}
                    autoCapitalize="characters"
                  />
                </div>
              )}

              {/* Paper size */}
              <div className="drawer-printer-row">
                <label className="drawer-printer-label">Paper</label>
                <select
                  className="drawer-printer-select"
                  value={printer.paper}
                  onChange={e => update(idx, "paper", e.target.value)}
                >
                  {PAPER_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Test button */}
              <div className="drawer-printer-btns">
                <button
                  className="drawer-printer-test-btn"
                  onClick={() => testPrinter(idx)}
                  disabled={testStatus[idx] === "testing"}
                >
                  {testStatus[idx] === "testing" ? "Testing…"
                    : testStatus[idx] === "ok"   ? "✅ Connected"
                    : testStatus[idx] === "fail" ? "❌ Not found"
                    : "Test Connection"}
                </button>
              </div>
            </div>
          ))}

          {/* Add kitchen printer */}
          <button
            onClick={addPrinter}
            style={{
              width: "100%", padding: "10px", borderRadius: 8,
              border: "1px dashed #6366f1", background: "#f0f0ff",
              color: "#6366f1", fontWeight: 700, fontSize: 14,
              cursor: "pointer", marginBottom: 12,
            }}
          >
            + Add Kitchen Printer
          </button>

          {/* Save */}
          <button
            className={`drawer-printer-save-btn${saved ? " saved" : ""}`}
            onClick={handleSave}
            style={{ width: "100%", padding: "12px" }}
          >
            {saved ? "✅ Saved" : "Save All Printers"}
          </button>

          {/* Helper note */}
          <p style={{ fontSize: 11, color: "#888", marginTop: 10, lineHeight: 1.5 }}>
            The first printer (yellow) receives the full KOT copy for the waiter and all bills.
            Kitchen printers receive only their station's items — enter the station name exactly as
            configured in your menu (e.g. SOUTH INDIAN, NORTH INDIAN).
          </p>
        </div>

        {/* ── POS Server IP ── */}
        <div className="drawer-section">
          <div className="drawer-section-title" style={{ marginBottom: 12 }}>POS Server IP</div>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 10, lineHeight: 1.5 }}>
            Enter the Windows POS machine's local IP. All printing is handled by the POS.
          </p>
          <div className="drawer-printer-row">
            <label className="drawer-printer-label">POS IP</label>
            <input
              className="drawer-printer-input"
              type="text"
              inputMode="decimal"
              placeholder="192.168.1.100"
              value={posIp}
              onChange={e => setPosIp(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              className="drawer-printer-test-btn"
              onClick={testPosConnection}
              disabled={posTestSt === "testing"}
              style={{ flex: 1 }}
            >
              {posTestSt === "testing" ? "Testing…"
                : posTestSt === "ok"   ? "✅ Connected"
                : posTestSt === "fail" ? "❌ Not reached"
                : "Test"}
            </button>
            <button
              className={`drawer-printer-save-btn${posIpSaved ? " saved" : ""}`}
              onClick={savePosIp}
              style={{ flex: 2, padding: "10px" }}
            >
              {posIpSaved ? "✅ Saved" : "Save POS IP"}
            </button>
          </div>
        </div>

        {/* ── Device info ── */}
        <div className="drawer-section drawer-device-section">
          <div className="drawer-section-title">Device Info</div>
          <div className="drawer-device-grid">
            <DevRow label="App Version" value={`v${APP_VERSION}`} />
            <DevRow label="Outlet"      value={outletName || "—"} />
            <DevRow label="Server"      value={serverUrl  || "—"} mono />
            <DevRow label="Local POS"   value={posIp ? `${posIp}:4001` : "Not set"} mono />
          </div>
        </div>

      </div>
    </div>
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
