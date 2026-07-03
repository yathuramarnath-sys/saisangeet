import { useState } from "react";
import { tapImpact } from "../lib/haptics";

function loadPrinterIp()   { return localStorage.getItem("captain_printer_ip")   || ""; }
function loadPaperSize()   { return localStorage.getItem("captain_paper_size")   || "80mm"; }

function savePrinterConfig(ip, paper) {
  const ip2 = ip.trim();
  localStorage.setItem("captain_printer_ip",  ip2);
  localStorage.setItem("captain_paper_size",  paper);
  localStorage.setItem("captain_printers", JSON.stringify([{
    name: "Thermal Printer", type: "Both", ip: ip2, paper, isDefault: true, station: "",
  }]));
}

const APP_VERSION = "1.26";

export function SettingsScreen({ outletName, serverUrl, localPosIp, onClose }) {
  const [printerIp,  setPrinterIp]  = useState(loadPrinterIp);
  const [paperSize,  setPaperSize]  = useState(loadPaperSize);
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'ok' | 'fail'
  const [ipSaved,    setIpSaved]    = useState(false);

  async function handleTest() {
    const ip = printerIp.trim();
    if (!ip) { setTestStatus("fail"); return; }
    tapImpact();
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

  function handleSave() {
    tapImpact();
    savePrinterConfig(printerIp, paperSize);
    setIpSaved(true);
    setTimeout(() => setIpSaved(false), 2000);
  }

  return (
    <div className="set2-page">
      <div className="set2-header">
        <button className="set2-back-btn" onClick={onClose} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 className="set2-title">Settings</h2>
      </div>

      <div className="set2-scroll">
        {/* Printer settings */}
        <div className="set2-section-head">PRINTER SETTINGS</div>
        <div className="set2-card">
          <div className="set2-field">
            <label className="set2-field-label">Printer IP address</label>
            <input
              className="set2-field-input"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 192.168.1.200"
              value={printerIp}
              onChange={(e) => setPrinterIp(e.target.value)}
            />
          </div>
          <div className="set2-divider" />
          <div className="set2-field">
            <label className="set2-field-label">Paper size</label>
            <select
              className="set2-field-select"
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value)}
            >
              <option value="80mm">80 mm</option>
              <option value="76mm">76 mm</option>
              <option value="58mm">58 mm</option>
            </select>
          </div>
        </div>
        <div className="set2-printer-btns">
          <button
            className={`set2-test-btn${testStatus === "ok" ? " set2-test-ok" : testStatus === "fail" ? " set2-test-fail" : ""}`}
            onClick={handleTest}
            disabled={testStatus === "testing"}
          >
            {testStatus === "testing" ? "Testing…"
              : testStatus === "ok"   ? "Connected ✓"
              : testStatus === "fail" ? "Not found ✗"
              : "Test connection"}
          </button>
          <button
            className={`set2-save-btn${ipSaved ? " set2-save-ok" : ""}`}
            onClick={handleSave}
          >
            {ipSaved ? "Saved ✓" : "Save"}
          </button>
        </div>

        {/* Device info */}
        <div className="set2-section-head">DEVICE INFO</div>
        <div className="set2-card">
          <Set2Row label="App version" value={`v${APP_VERSION}`} />
          <div className="set2-divider" />
          <Set2Row label="Outlet"    value={outletName || "—"} />
          <div className="set2-divider" />
          <Set2Row label="Server"    value={serverUrl  || "—"} mono />
          <div className="set2-divider" />
          <div className="set2-row">
            <span className="set2-row-label">Local POS</span>
            <span className="set2-row-value">
              {localPosIp ? (
                <>
                  <span className="set2-status-dot set2-status-dot-on" />
                  {localPosIp}:4001
                </>
              ) : (
                <>
                  <span className="set2-status-dot" />
                  Not connected
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Set2Row({ label, value, mono }) {
  return (
    <div className="set2-row">
      <span className="set2-row-label">{label}</span>
      <span className={`set2-row-value${mono ? " set2-mono" : ""}`}>{value}</span>
    </div>
  );
}
