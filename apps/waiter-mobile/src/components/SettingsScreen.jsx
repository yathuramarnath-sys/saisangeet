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
  const [posIp] = useState(() => localStorage.getItem("captain_local_server_ip") || "");

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

  const ts0 = testStatus[0];

  return (
    <div className="ss4-page">
      <div className="ss4-header">
        <button className="ss4-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 className="ss4-title">Settings</h2>
      </div>

      <div className="ss4-scroll">

        {/* PRINTER SETTINGS */}
        <div className="ss4-section-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          PRINTER SETTINGS
        </div>

        {/* Default printer card — IP + Paper only */}
        <div className="ss4-card">
          <div className="ss4-field">
            <span className="ss4-field-label">Printer IP</span>
            <div className="ss4-field-box">
              <input
                className="ss4-field-input"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 192.168.1.200"
                value={printers[0]?.ip || ""}
                onChange={e => update(0, "ip", e.target.value)}
              />
            </div>
          </div>
          <div className="ss4-field">
            <span className="ss4-field-label">Paper size</span>
            <div className="ss4-field-select-box">
              <select
                className="ss4-field-select"
                value={printers[0]?.paper || "80mm"}
                onChange={e => update(0, "paper", e.target.value)}
              >
                {PAPER_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Additional kitchen printers */}
        {printers.slice(1).map((printer, i) => {
          const idx = i + 1;
          const ts  = testStatus[idx];
          return (
            <div key={idx} className="ss4-card">
              <div className="ss4-card-header">
                <span className="ss4-card-title">Kitchen Printer {idx}</span>
                <button className="ss4-card-remove" onClick={() => removePrinter(idx)}>✕</button>
              </div>
              <div className="ss4-field">
                <span className="ss4-field-label">Name</span>
                <div className="ss4-field-box">
                  <input className="ss4-field-input" type="text" placeholder="e.g. South Indian"
                    value={printer.name} onChange={e => update(idx, "name", e.target.value)} />
                </div>
              </div>
              <div className="ss4-field">
                <span className="ss4-field-label">Printer IP</span>
                <div className="ss4-field-box">
                  <input className="ss4-field-input" type="text" inputMode="decimal"
                    placeholder="192.168.1.200" value={printer.ip}
                    onChange={e => update(idx, "ip", e.target.value)} />
                </div>
              </div>
              <div className="ss4-field">
                <span className="ss4-field-label">Station</span>
                <div className="ss4-field-box">
                  <input className="ss4-field-input" type="text" placeholder="e.g. SOUTH INDIAN"
                    value={printer.station} onChange={e => update(idx, "station", e.target.value)}
                    autoCapitalize="characters" />
                </div>
              </div>
              <div className="ss4-field">
                <span className="ss4-field-label">Paper size</span>
                <div className="ss4-field-select-box">
                  <select className="ss4-field-select" value={printer.paper}
                    onChange={e => update(idx, "paper", e.target.value)}>
                    {PAPER_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>
              <div className="ss4-card-actions">
                <button
                  className={`ss4-test-btn-sm${ts === "ok" ? " ss4-test-ok" : ts === "fail" ? " ss4-test-fail" : ""}`}
                  onClick={() => testPrinter(idx)}
                  disabled={ts === "testing"}
                >
                  {ts === "testing" ? "Testing…" : ts === "ok" ? "Connected ✓" : ts === "fail" ? "Not found ✗" : "Test connection"}
                </button>
              </div>
            </div>
          );
        })}

        <button className="ss4-add-link" onClick={addPrinter}>
          + Add Kitchen Printer
        </button>

        {/* Test + Save action row */}
        <div className="ss4-action-row">
          <button
            className={`ss4-test-btn${ts0 === "ok" ? " ss4-test-ok" : ts0 === "fail" ? " ss4-test-fail" : ""}`}
            onClick={() => testPrinter(0)}
            disabled={ts0 === "testing"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2"/>
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
            </svg>
            {ts0 === "testing" ? "Testing…" : ts0 === "ok" ? "Connected ✓" : ts0 === "fail" ? "Not found ✗" : "Test connection"}
          </button>
          <button
            className={`ss4-save-btn${saved ? " ss4-save-ok" : ""}`}
            onClick={handleSave}
          >
            {saved ? "Saved ✓" : "Save"}
          </button>
        </div>

        {/* DEVICE INFO */}
        <div className="ss4-section-label">DEVICE INFO</div>
        <div className="ss4-info-card">
          <div className="ss4-info-row">
            <span className="ss4-info-label">App version</span>
            <span className="ss4-info-value">v{APP_VERSION}</span>
          </div>
          <div className="ss4-info-row">
            <span className="ss4-info-label">Outlet</span>
            <span className="ss4-info-value">{outletName || "—"}</span>
          </div>
          <div className="ss4-info-row">
            <span className="ss4-info-label">Server</span>
            <span className="ss4-info-value ss4-mono">{serverUrl || "—"}</span>
          </div>
          <div className="ss4-info-row">
            <span className="ss4-info-label">Local POS</span>
            {posIp ? (
              <span className="ss4-info-connected">
                <span className="ss4-info-dot" />
                Connected
              </span>
            ) : (
              <span className="ss4-info-notset">Not set</span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
