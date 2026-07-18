import { useState } from "react";
import { tapImpact } from "../lib/haptics";
import { APP_VERSION } from "../lib/version";

const PAPER_OPTIONS = ["80mm", "76mm", "58mm"];

const BLANK_PRINTER = { name: "Thermal Printer", type: "Both (KOT + Bill)", ip: "", paper: "80mm", isDefault: false, station: "" };

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
    isDefault: i === 0,
  }));
  localStorage.setItem("captain_printers", JSON.stringify(updated));
  if (updated.length > 0) {
    localStorage.setItem("captain_printer_ip",  updated[0].ip);
    localStorage.setItem("captain_paper_size", updated[0].paper);
  }
}

export function SettingsScreen({ outletName, serverUrl, localPosIp, onClose }) {
  const [printers,   setPrinters]   = useState(loadPrinters);
  const [saved,      setSaved]      = useState(false);
  const [testStatus, setTestStatus] = useState({});
  const [editIdx,    setEditIdx]    = useState(null); // null = list view, number = editing that index

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

  function updatePrinter(idx, field, value) {
    setPrinters(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  function addPrinter() {
    setPrinters(prev => [...prev, { ...BLANK_PRINTER, name: `Printer ${prev.length + 1}` }]);
    setEditIdx(printers.length);
  }

  function removePrinter(idx) {
    setPrinters(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0) next[0] = { ...next[0], isDefault: true };
      return next;
    });
    if (editIdx === idx) setEditIdx(null);
  }

  // ── Edit form for one printer ────────────────────────────────────────────
  if (editIdx !== null && printers[editIdx]) {
    const p   = printers[editIdx];
    const tst = testStatus[editIdx] || "";

    return (
      <div className="ss3-page">
        <div className="ss3-header">
          <button className="ss3-back-btn" onClick={() => setEditIdx(null)} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h2 className="ss3-title">{editIdx === 0 ? "Default Printer" : `Printer ${editIdx + 1}`}</h2>
        </div>

        <div className="ss3-scroll">
          <div className="ss3-section-head">PRINTER SETTINGS</div>
          <div className="ss3-card">
            <div className="ss3-field-row">
              <label className="ss3-field-label">Name</label>
              <input
                className="ss3-field-input"
                type="text"
                placeholder="e.g. Bar Printer"
                value={p.name}
                onChange={e => updatePrinter(editIdx, "name", e.target.value)}
              />
            </div>
            <div className="ss3-divider" />
            <div className="ss3-field-row">
              <label className="ss3-field-label">Printer IP</label>
              <input
                className="ss3-field-input"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 192.168.1.200"
                value={p.ip}
                onChange={e => updatePrinter(editIdx, "ip", e.target.value)}
              />
            </div>
            <div className="ss3-divider" />
            <div className="ss3-field-row">
              <label className="ss3-field-label">Paper size</label>
              <select
                className="ss3-field-select"
                value={p.paper}
                onChange={e => updatePrinter(editIdx, "paper", e.target.value)}
              >
                {PAPER_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="ss3-divider" />
            <div className="ss3-field-row">
              <label className="ss3-field-label">Station</label>
              <input
                className="ss3-field-input"
                type="text"
                placeholder="e.g. Bar, Grill (optional)"
                value={p.station}
                onChange={e => updatePrinter(editIdx, "station", e.target.value)}
              />
            </div>
            <div className="ss3-divider" />
            <div className="ss3-btn-row">
              <button
                className={`ss3-test-btn${
                  tst === "ok"   ? " ss3-test-ok"   :
                  tst === "fail" ? " ss3-test-fail" : ""}`}
                onClick={() => testPrinter(editIdx)}
                disabled={tst === "testing"}
              >
                {tst === "testing" ? "Testing…"
                  : tst === "ok"  ? "Connected ✓"
                  : tst === "fail" ? "Not found ✗"
                  : "Test connection"}
              </button>
            </div>
          </div>

          {editIdx > 0 && (
            <>
              <div className="ss3-section-head" style={{ marginTop: 16 }}>DANGER ZONE</div>
              <div className="ss3-card">
                <button
                  className="ss3-test-btn ss3-test-fail"
                  style={{ width: "100%" }}
                  onClick={() => removePrinter(editIdx)}
                >
                  Remove this printer
                </button>
              </div>
            </>
          )}

          <div style={{ padding: "12px 16px" }}>
            <button
              className={`ss3-save-btn${saved ? " ss3-save-ok" : ""}`}
              style={{ width: "100%" }}
              onClick={() => { handleSave(); setEditIdx(null); }}
            >
              {saved ? "Saved ✓" : "Save & Back"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Printer list ─────────────────────────────────────────────────────────
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

        <div className="ss3-section-head">PRINTERS</div>
        {printers.map((p, idx) => {
          const tst = testStatus[idx] || "";
          return (
            <div className="ss3-card" key={idx} style={{ marginBottom: 10 }}>
              <div className="ss3-field-row">
                <span className="ss3-field-label">
                  {p.name || `Printer ${idx + 1}`}
                  {idx === 0 && <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 6 }}>DEFAULT</span>}
                </span>
                <button
                  className="ss3-save-btn"
                  style={{ padding: "4px 12px", fontSize: 13 }}
                  onClick={() => setEditIdx(idx)}
                >
                  Edit
                </button>
              </div>
              <div className="ss3-divider" />
              <div className="ss3-info-row">
                <span className="ss3-info-label">IP</span>
                <span className="ss3-info-value ss3-mono">{p.ip || "—"}</span>
              </div>
              <div className="ss3-divider" />
              <div className="ss3-info-row">
                <span className="ss3-info-label">Paper</span>
                <span className="ss3-info-value">{p.paper}</span>
              </div>
              {p.station && (
                <>
                  <div className="ss3-divider" />
                  <div className="ss3-info-row">
                    <span className="ss3-info-label">Station</span>
                    <span className="ss3-info-value">{p.station}</span>
                  </div>
                </>
              )}
              <div className="ss3-divider" />
              <div className="ss3-btn-row">
                <button
                  className={`ss3-test-btn${
                    tst === "ok"   ? " ss3-test-ok"   :
                    tst === "fail" ? " ss3-test-fail" : ""}`}
                  onClick={() => testPrinter(idx)}
                  disabled={tst === "testing"}
                >
                  {tst === "testing" ? "Testing…"
                    : tst === "ok"  ? "Connected ✓"
                    : tst === "fail" ? "Not found ✗"
                    : "Test"}
                </button>
              </div>
            </div>
          );
        })}

        <div style={{ padding: "0 0 12px" }}>
          <button
            className="ss3-save-btn"
            style={{ width: "100%", background: "#f3f4f6", color: "#374151", fontWeight: 700, border: "1.5px dashed #d1d5db" }}
            onClick={addPrinter}
          >
            + Add Printer
          </button>
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
