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

        {/* ── Printers ── */}
        <div className="set2-section-head">PRINTER SETTINGS</div>

        {printers.map((printer, idx) => (
          <div key={idx} className={`set2-card set2-printer-card${idx === 0 ? " set2-printer-default" : ""}`}>
            <div className="set2-printer-card-header">
              <span className="set2-printer-card-label">
                {idx === 0 ? "Waiter / Default Printer" : `Kitchen Printer ${idx}`}
              </span>
              {idx > 0 && (
                <button className="set2-printer-remove" onClick={() => removePrinter(idx)}>✕</button>
              )}
            </div>

            <div className="set2-field">
              <label className="set2-field-label">Name</label>
              <input
                className="set2-field-input"
                type="text"
                placeholder={idx === 0 ? "e.g. Waiter Printer" : "e.g. South Indian"}
                value={printer.name}
                onChange={e => update(idx, "name", e.target.value)}
              />
            </div>

            <div className="set2-divider" />

            <div className="set2-field">
              <label className="set2-field-label">Printer IP</label>
              <input
                className="set2-field-input"
                type="text"
                inputMode="decimal"
                placeholder="192.168.1.200"
                value={printer.ip}
                onChange={e => update(idx, "ip", e.target.value)}
              />
            </div>

            {idx > 0 && (
              <>
                <div className="set2-divider" />
                <div className="set2-field">
                  <label className="set2-field-label">Station</label>
                  <input
                    className="set2-field-input"
                    type="text"
                    placeholder="e.g. SOUTH INDIAN"
                    value={printer.station}
                    onChange={e => update(idx, "station", e.target.value)}
                    autoCapitalize="characters"
                  />
                </div>
              </>
            )}

            <div className="set2-divider" />

            <div className="set2-field">
              <label className="set2-field-label">Paper size</label>
              <select
                className="set2-field-select"
                value={printer.paper}
                onChange={e => update(idx, "paper", e.target.value)}
              >
                {PAPER_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="set2-printer-btns">
              <button
                className={`set2-test-btn${
                  testStatus[idx] === "ok"   ? " set2-test-ok"   :
                  testStatus[idx] === "fail" ? " set2-test-fail" : ""}`}
                onClick={() => testPrinter(idx)}
                disabled={testStatus[idx] === "testing"}
              >
                {testStatus[idx] === "testing" ? "Testing…"
                  : testStatus[idx] === "ok"   ? "Connected ✓"
                  : testStatus[idx] === "fail" ? "Not found ✗"
                  : "Test connection"}
              </button>
            </div>
          </div>
        ))}

        <button className="set2-add-printer-btn" onClick={addPrinter}>
          + Add Kitchen Printer
        </button>

        <button
          className={`set2-save-btn${saved ? " set2-save-ok" : ""}`}
          onClick={handleSave}
        >
          {saved ? "Saved ✓" : "Save All Printers"}
        </button>

        <p className="set2-printer-note">
          The first printer receives the full KOT copy for the waiter and all bills.
          Kitchen printers receive only their station's items — enter the station name
          exactly as configured in your menu (e.g. SOUTH INDIAN, NORTH INDIAN).
        </p>

        {/* ── POS Server IP ── */}
        <div className="set2-section-head">POS SERVER</div>
        <div className="set2-card">
          <div className="set2-field">
            <label className="set2-field-label">POS IP address</label>
            <input
              className="set2-field-input"
              type="text"
              inputMode="decimal"
              placeholder="192.168.1.100"
              value={posIp}
              onChange={e => setPosIp(e.target.value)}
            />
          </div>
          <div className="set2-printer-btns">
            <button
              className={`set2-test-btn${
                posTestSt === "ok"   ? " set2-test-ok"   :
                posTestSt === "fail" ? " set2-test-fail" : ""}`}
              onClick={testPosConnection}
              disabled={posTestSt === "testing"}
            >
              {posTestSt === "testing" ? "Testing…"
                : posTestSt === "ok"   ? "Connected ✓"
                : posTestSt === "fail" ? "Not reached ✗"
                : "Test"}
            </button>
            <button
              className={`set2-save-btn${posIpSaved ? " set2-save-ok" : ""}`}
              onClick={savePosIp}
            >
              {posIpSaved ? "Saved ✓" : "Save POS IP"}
            </button>
          </div>
        </div>

        {/* ── Device info ── */}
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
              {posIp ? (
                <>
                  <span className="set2-status-dot set2-status-dot-on" />
                  {posIp}:4001
                </>
              ) : (
                <>
                  <span className="set2-status-dot" />
                  Not set
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
