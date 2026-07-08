import { useState } from "react";
import { tapImpact } from "../lib/haptics";

const PAPER_OPTIONS = ["80mm", "76mm", "58mm"];

function loadPrinters() {
  try {
    const saved = JSON.parse(localStorage.getItem("captain_printers") || "[]");
    if (saved.length) return saved;
    const ip    = localStorage.getItem("captain_printer_ip") || "";
    const paper = localStorage.getItem("captain_paper_size") || "80mm";
    return [{ name: "Thermal Printer", type: "Both (KOT + Bill)", ip, paper, isDefault: true, station: "" }];
  } catch {
    return [{ name: "Thermal Printer", type: "Both (KOT + Bill)", ip: "", paper: "80mm", isDefault: true, station: "" }];
  }
}

function persistPrinters(printers) {
  const updated = printers.map((p, i) => ({
    ...p,
    type:      p.station.trim() ? "KOT Printer" : "Both (KOT + Bill)",
    isDefault: i === 0,
  }));
  localStorage.setItem("captain_printers", JSON.stringify(updated));
  if (updated.length > 0) {
    localStorage.setItem("captain_printer_ip",  updated[0].ip);
    localStorage.setItem("captain_paper_size", updated[0].paper);
  }
}

const APP_VERSION = "1.30";

export function SettingsScreen({ outletName, serverUrl, localPosIp, onClose }) {
  const [printers,   setPrinters]   = useState(loadPrinters);
  const [saved,      setSaved]      = useState(false);
  const [testStatus, setTestStatus] = useState({});

  const posIp = localPosIp || localStorage.getItem("captain_local_server_ip") || "";

  async function testPrinter(idx) {
    const ip = printers[idx].ip.trim();
    if (!ip) { setTestStatus(s => ({ ...s, [idx]: "fail" })); return; }
    tapImpact();
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
    tapImpact();
    persistPrinters(printers);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updatePrinter(field, value) {
    setPrinters(prev => prev.map((p, i) => i === 0 ? { ...p, [field]: value } : p));
  }

  const printer = printers[0] || { ip: "", paper: "80mm" };
  const tst     = testStatus[0] || "";

  return (
    <div className="ss3-page">
      <div className="ss3-header">
        <button className="ss3-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 className="ss3-title">Settings</h2>
      </div>

      <div className="ss3-scroll">

        <div className="ss3-section-head">PRINTER SETTINGS</div>
        <div className="ss3-card">
          <div className="ss3-field-row">
            <label className="ss3-field-label">Printer IP</label>
            <input
              className="ss3-field-input"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 192.168.1.200"
              value={printer.ip}
              onChange={e => updatePrinter("ip", e.target.value)}
            />
          </div>
          <div className="ss3-divider" />
          <div className="ss3-field-row">
            <label className="ss3-field-label">Paper size</label>
            <select
              className="ss3-field-select"
              value={printer.paper}
              onChange={e => updatePrinter("paper", e.target.value)}
            >
              {PAPER_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="ss3-divider" />
          <div className="ss3-btn-row">
            <button
              className={`ss3-test-btn${
                tst === "ok"   ? " ss3-test-ok"   :
                tst === "fail" ? " ss3-test-fail" : ""}`}
              onClick={() => testPrinter(0)}
              disabled={tst === "testing"}
            >
              {tst === "testing" ? "Testing…"
                : tst === "ok"  ? "Connected ✓"
                : tst === "fail" ? "Not found ✗"
                : "Test connection"}
            </button>
            <button
              className={`ss3-save-btn${saved ? " ss3-save-ok" : ""}`}
              onClick={handleSave}
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </div>

        <div className="ss3-section-head">DEVICE INFO</div>
        <div className="ss3-card">
          <div className="ss3-info-row">
            <span className="ss3-info-label">App version</span>
            <span className="ss3-info-value">v{APP_VERSION}</span>
          </div>
          <div className="ss3-divider" />
          <div className="ss3-info-row">
            <span className="ss3-info-label">Outlet</span>
            <span className="ss3-info-value">{outletName || "—"}</span>
          </div>
          <div className="ss3-divider" />
          <div className="ss3-info-row">
            <span className="ss3-info-label">Server</span>
            <span className="ss3-info-value ss3-mono">{serverUrl || "—"}</span>
          </div>
          <div className="ss3-divider" />
          <div className="ss3-info-row">
            <span className="ss3-info-label">Local POS</span>
            {posIp ? (
              <span className="ss3-info-connected">
                <span className="ss3-connected-dot" />
                Connected
              </span>
            ) : (
              <span className="ss3-info-value ss3-info-muted">Not set</span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
