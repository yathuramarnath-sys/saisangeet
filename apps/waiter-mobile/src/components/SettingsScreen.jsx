import { useState } from "react";

function loadPrinterIp() { return localStorage.getItem("captain_printer_ip") || ""; }
function loadPaperSize() { return localStorage.getItem("captain_paper_size") || "80mm"; }

function savePrinterConfig(ip, paper) {
  const ip2 = ip.trim();
  localStorage.setItem("captain_printer_ip", ip2);
  localStorage.setItem("captain_paper_size", paper);
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

const APP_VERSION = "1.26";

/**
 * SettingsScreen — local device printer config + diagnostics.
 * Only relevant to outlets where the Captain device prints bills/KOTs
 * directly via its own attached/networked thermal printer.
 *
 * Props:
 *   outletName   string
 *   serverUrl    string
 *   localPosIp   string | null
 *   onClose      ()
 */
export function SettingsScreen({ outletName, serverUrl, localPosIp, onClose }) {
  const [printerIp,  setPrinterIp]  = useState(loadPrinterIp);
  const [paperSize,  setPaperSize]  = useState(loadPaperSize);
  const [testStatus, setTestStatus] = useState(null); // null | "testing" | "ok" | "fail"
  const [ipSaved,    setIpSaved]    = useState(false);

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

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button className="settings-back" onClick={onClose}>←</button>
        <span className="settings-title">Settings</span>
      </div>

      <div className="settings-body">
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

        <div className="drawer-section drawer-device-section">
          <div className="drawer-section-title">Device Info</div>
          <div className="drawer-device-grid">
            <DevRow label="App Version" value={`v${APP_VERSION}`} />
            <DevRow label="Outlet"      value={outletName || "—"} />
            <DevRow label="Server"      value={serverUrl  || "—"} mono />
            <DevRow label="Local POS"   value={localPosIp ? `${localPosIp}:4001` : "Not connected"} mono />
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
