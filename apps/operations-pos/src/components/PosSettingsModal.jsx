import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { printKOT, loadPrinters } from "../lib/kotPrint";
import { getPrintLog, clearPrintLog } from "../lib/posPrintQueue";
import { lsGet, lsSet } from "../lib/ls";

// Convert POS local table format → flat API table array
function areasToApiTables(areas) {
  const result = [];
  for (const area of areas) {
    for (const t of area.tables) {
      result.push({ id: t.id, number: t.number, seats: t.seats, workArea: area.name, area_name: area.name });
    }
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════════════════════
   POS Settings Modal
   Tabs: Printers · Tables · Cashier · Display
   ══════════════════════════════════════════════════════════════════════════════ */

const PRINTER_TYPES  = ["KOT Printer", "Bill Printer", "Both (KOT + Bill)", "Bar Printer", "Dessert Printer"];
const PRINTER_CONNS  = ["Network (IP)", "USB", "Bluetooth"];
const PAPER_SIZES    = ["80mm", "76mm", "72mm", "58mm"];
const PRINTER_MODELS = [
  "Epson TM-T82", "Epson TM-T88",
  "Bixolon SRP-350", "Bixolon SRP-380",
  "TVS RP 3160 Gold", "TVS RP 45 Shoppe",
  "Other",
];

// Default paper width per model — auto-filled when model is selected
const MODEL_PAPER = {
  "Epson TM-T82":    "80mm",
  "Epson TM-T88":    "80mm",
  "Bixolon SRP-350": "80mm",
  "Bixolon SRP-380": "80mm",
  "TVS RP 3160 Gold":"80mm",
  "TVS RP 45 Shoppe":"58mm",
};

// Try to identify a known model from the ESC/POS banner text returned on connect
function guessModelFromBanner(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("t82") || n.includes("tm-t82"))        return "Epson TM-T82";
  if (n.includes("t88") || n.includes("tm-t88"))        return "Epson TM-T88";
  if (n.includes("srp-350") || n.includes("srp350"))    return "Bixolon SRP-350";
  if (n.includes("srp-380") || n.includes("srp380"))    return "Bixolon SRP-380";
  if (n.includes("rp 3160") || n.includes("rp3160"))    return "TVS RP 3160 Gold";
  if (n.includes("rp 45")   || n.includes("rp45"))      return "TVS RP 45 Shoppe";
  return null;
}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
  catch { return fallback; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

/* ─── Printer Tab ──────────────────────────────────────────────────────────── */
// winName: the exact Windows printer device name used by webContents.print({ deviceName }).
// Shown and editable only when running inside the Electron app.
const BLANK_FORM = { name: "", type: "KOT Printer", conn: "Network (IP)", ip: "", paper: "80mm", model: "Epson TM-T82", station: "", winName: "", marginAdjust: 0 };

// Detect if running inside Electron
const IS_ELECTRON = typeof window !== "undefined" && !!window.electronAPI;

function PrinterTab() {
  const [printers,      setPrinters]      = useState(() => load("pos_printers", []));
  const [adding,        setAdding]        = useState(false);
  const [editId,        setEditId]        = useState(null);
  const [form,          setForm]          = useState(BLANK_FORM);
  const [scanning,        setScanning]        = useState(false);
  const [scanResults,     setScanResults]     = useState(null);
  const [autoInstalling,  setAutoInstalling]  = useState(false);
  const [autoInstallMsg,  setAutoInstallMsg]  = useState(null);
  // Health status for saved network printers: { [printerId]: "checking"|"online"|"offline" }
  const [printerHealth,   setPrinterHealth]   = useState({});
  const [proStep,         setProStep]         = useState(1);
  const [showAdvanced,    setShowAdvanced]    = useState(false);
  // Kitchen stations — fetch fresh from API on mount; fall back to localStorage cache
  const [kitchenStations, setKitchenStations] = useState(() => lsGet("pos_kitchen_stations", []));

  useEffect(() => {
    api.get("/kitchen-stations")
      .then((stations) => {
        if (Array.isArray(stations) && stations.length > 0) {
          setKitchenStations(stations);
          lsSet("pos_kitchen_stations", stations);
        }
      })
      .catch(() => { /* keep cached value */ });
  }, []);

  // Ping all saved network printers when the tab opens to show health status
  function checkAllPrinters(list) {
    if (!IS_ELECTRON || !window.electronAPI?.checkPrinter) return;
    const network = list.filter(p => p.ip?.trim());
    if (!network.length) return;
    const init = {};
    network.forEach(p => { init[p.id] = "checking"; });
    setPrinterHealth(init);
    Promise.all(network.map(async p => {
      try {
        const res = await window.electronAPI.checkPrinter({ ip: p.ip.trim() });
        return { id: p.id, status: res.reachable ? "online" : "offline" };
      } catch {
        return { id: p.id, status: "offline" };
      }
    })).then(results => {
      setPrinterHealth(prev => {
        const next = { ...prev };
        results.forEach(r => { next[r.id] = r.status; });
        return next;
      });
    });
  }

  useEffect(() => { checkAllPrinters(printers); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function persist(updated) {
    setPrinters(updated);
    save("pos_printers", updated);
    syncToSharedKey(updated);
  }

  function syncToSharedKey(list) {
    try {
      const existing = lsGet("pos_devices_assignments", {});
      const stationMap = {};
      list.filter(p => p.station).forEach(p => {
        stationMap[p.station] = { id: p.id, name: p.name, model: p.model || "", ip: p.ip || "", status: "online" };
      });
      const devices = list.map(p => ({
        id: p.id, name: p.name, type: "printer", model: p.model || "",
        ip: p.ip || "", station: p.station || "", status: "online",
        lastSeen: new Date().toISOString()
      }));
      lsSet("pos_devices_assignments", { ...existing, devices, stationMap });
    } catch { /* ignore */ }
  }

  // ── Print log state ───────────────────────────────────────────────────────
  const [printLog,     setPrintLog]     = useState(() => getPrintLog());
  const [showPrintLog, setShowPrintLog] = useState(false);

  function refreshLog() { setPrintLog(getPrintLog()); }
  function handleClearLog() { clearPrintLog(); setPrintLog([]); }

  // ── Standardized test page ────────────────────────────────────────────────
  function printTestPage(p) {
    const now     = new Date();
    const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    const paperMm = parseInt(p.paper) || 80;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;width:${paperMm}mm;padding:12px 8px 16px;background:#fff;color:#000}
.c{text-align:center}.b{font-weight:900}.s{font-size:10px;color:#555;letter-spacing:1px;text-transform:uppercase}
.sep{border-top:2px dashed #000;margin:8px 0}.sep2{border-top:1px dashed #aaa;margin:6px 0}
.ok{font-size:18px;font-weight:900;margin-top:8px;letter-spacing:2px}
.row{display:flex;justify-content:space-between;font-size:11px;margin:2px 0}
</style></head><body>
<div class="c"><div class="b" style="font-size:16px">PLATO POS</div>
<div class="s" style="margin-top:2px">Printer Test</div></div>
<div class="sep"></div>
<div class="row"><span>Printer</span><span class="b">${p.name || "—"}</span></div>
<div class="row"><span>Model</span><span>${p.model || "—"}</span></div>
<div class="row"><span>Type</span><span>${p.type || "—"}</span></div>
<div class="row"><span>IP</span><span>${p.ip || "—"}</span></div>
<div class="row"><span>Paper</span><span>${p.paper || "—"}</span></div>
<div class="sep2"></div>
<div class="row"><span>Date</span><span>${dateStr}</span></div>
<div class="row"><span>Time</span><span>${timeStr}</span></div>
<div class="sep"></div>
<div class="c ok">✓ SUCCESS</div>
</body></html>`;

    if (window.electronAPI?.printHTML) {
      window.electronAPI.printHTML({
        html,
        printerName:  p.winName || p.name || null,
        printerIp:    p.ip?.trim() || null,
        paperWidthMm: paperMm,
      });
    } else {
      const w = window.open("", "_blank", `width=340,height=500,scrollbars=no`);
      if (!w) return;
      w.document.write(html);
      w.document.close();
      w.onload = () => { setTimeout(() => { w.focus(); w.print(); w.onafterprint = () => w.close(); }, 200); };
    }
  }

  function openAdd() { setForm(BLANK_FORM); setEditId(null); setScanResults(null); setProStep(1); setShowAdvanced(false); setAdding(true); }
  function openEdit(p) {
    setForm({ name: p.name, type: p.type, conn: p.conn, ip: p.ip || "", paper: p.paper, model: p.model || "Epson TM-T82", station: p.station || "", winName: p.winName || "", marginAdjust: p.marginAdjust || 0 });
    setEditId(p.id); setScanResults(null); setShowAdvanced(false); setAdding(true);
  }

  function savePrinter() {
    if (!form.name.trim()) return;
    if (editId) {
      persist(printers.map(p => p.id === editId ? { ...p, ...form } : p));
    } else {
      persist([...printers, { ...form, id: `p${Date.now()}`, isDefault: printers.length === 0 }]);
    }
    setAdding(false); setEditId(null); setScanResults(null);
  }

  function removePrinter(id) {
    if (!window.confirm("Remove this printer?")) return;
    persist(printers.filter(p => p.id !== id));
  }

  function setDefault(id) {
    persist(printers.map(p => ({ ...p, isDefault: p.id === id })));
  }

  // ── Scan / list printers ──────────────────────────────────────────────────
  // In Electron: probes port 9100 across the local subnet (network printers)
  // + reads USB printers from Windows (wmic) or macOS (lpstat).
  // In browser: not supported — shows a setup note instead.
  async function handleScan() {
    if (!IS_ELECTRON) return; // button is hidden in browser mode
    setScanning(true);
    setScanResults(null);
    try {
      const found = await window.electronAPI.scanPrinters();
      setScanResults(found || []);
    } catch {
      setScanResults([]);
    } finally {
      setScanning(false);
    }
  }

  // List Windows-installed printers (Electron only) — fills the winName field.
  const [winPrinterList, setWinPrinterList] = useState(null);
  const [loadingWinPrinters, setLoadingWinPrinters] = useState(false);

  async function handleListWindowsPrinters() {
    setLoadingWinPrinters(true);
    setWinPrinterList(null);
    try {
      const list = await window.electronAPI.getPrinters();
      setWinPrinterList(list || []);
    } catch {
      setWinPrinterList([]);
    } finally {
      setLoadingWinPrinters(false);
    }
  }

  // Auto-install network printer in Windows — no manual driver setup needed
  async function handleAutoInstall() {
    if (!form.ip?.trim()) { setAutoInstallMsg({ ok: false, msg: "Enter an IP address first." }); return; }
    setAutoInstalling(true);
    setAutoInstallMsg(null);
    try {
      const result = await window.electronAPI.autoInstallPrinter({
        ip:          form.ip.trim(),
        port:        9100,
        displayName: form.name?.trim() || `Plato Thermal ${form.ip.trim()}`,
      });
      if (result.ok) {
        setForm(f => ({ ...f, winName: result.printerName }));
        setAutoInstallMsg({ ok: true, msg: result.alreadyExists
          ? `✓ Already installed as "${result.printerName}"`
          : `✓ Installed as "${result.printerName}" — ready to print!` });
      } else {
        setAutoInstallMsg({ ok: false, msg: `Failed: ${result.error}` });
      }
    } catch (err) {
      setAutoInstallMsg({ ok: false, msg: err.message });
    } finally {
      setAutoInstalling(false);
    }
  }

  function pickScannedPrinter(p) {
    if (p.usb) {
      setForm(f => ({ ...f, name: f.name || p.name, conn: "USB", winName: p.name }));
    } else {
      const guessedModel = guessModelFromBanner(p.name);
      const paperHint    = guessedModel ? MODEL_PAPER[guessedModel] : null;
      const defaultName  = p.ip ? `Printer ${p.ip.split(".").pop()}` : p.name;
      setForm(f => ({
        ...f,
        ip:   p.ip || f.ip,
        name: f.name || defaultName,
        conn: "Network (IP)",
        ...(guessedModel ? { model: guessedModel } : {}),
        ...(paperHint    ? { paper: paperHint }    : {}),
      }));
    }
    setScanResults(null);
  }

  function pickWindowsPrinter(p) {
    // Fills winName with the exact Windows printer name required by webContents.print()
    // Don't overwrite conn — network printers installed via TCP/IP show in the OS spooler
    // but should keep their Network (IP) conn type, not be forced to USB.
    setForm(f => ({ ...f, winName: p.name, name: f.name || p.name }));
    setWinPrinterList(null);
  }

  // ── Web / browser mode — thermal printing not supported ─────────────────
  if (!IS_ELECTRON) {
    return (
      <div className="pset-section">
        <div className="pset-section-head">
          <div>
            <h4>Printer Setup</h4>
            <p>Thermal printer configuration</p>
          </div>
        </div>
        <div style={{
          margin: "12px 0", padding: "18px 20px",
          background: "#fffbeb", border: "1.5px solid #f59e0b",
          borderRadius: 12
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e", marginBottom: 6 }}>
            ⚠️ Thermal printer setup requires the Windows desktop app
          </div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
            The web browser cannot print directly to thermal printers.<br />
            KOTs and bills in web mode print via the <strong>browser print dialog</strong>.<br /><br />
            To use a thermal printer (Epson, TVS, etc.) for silent KOT and bill printing,
            install the <strong>Plato POS Windows app</strong> on your billing computer.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pset-section">
      <div className="pset-section-head">
        <div>
          <h4>Printer Setup</h4>
          <p>Configure printers at the outlet and assign them to kitchen stations</p>
        </div>
        {!adding && (
          <button type="button" className="pset-add-btn" onClick={openAdd}>+ Add Printer</button>
        )}
      </div>

      <div className="pset-routing-note">
        <strong>How routing works:</strong> Kitchen stations and their categories are set in
        Owner Web → Kitchen Stations. Assign each printer to a station here — KOTs route automatically.
      </div>

      {/* Printer list */}
      <div className="pset-printer-list">
        {printers.map(p => {
          const health = printerHealth[p.id];
          const healthDot = p.ip && health ? (
            <span
              title={health === "online" ? "Reachable" : health === "checking" ? "Checking…" : "Not reachable — check IP or power"}
              style={{
                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                marginRight: 5, verticalAlign: "middle", flexShrink: 0,
                background: health === "online" ? "#16a34a" : health === "checking" ? "#f59e0b" : "#dc2626",
              }}
            />
          ) : null;
          return (
          <div key={p.id} className={`pset-printer-card${p.isDefault ? " default" : ""}`}>
            <div className="pset-printer-icon">🖨️</div>
            <div className="pset-printer-info">
              <div className="pset-printer-name">
                {healthDot}{p.name}
                {p.isDefault && <span className="pset-default-badge">Default</span>}
                {health === "offline" && p.ip && (
                  <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginLeft: 6 }}>Offline</span>
                )}
              </div>
              <div className="pset-printer-meta">
                {p.type} · {p.conn === "Network (IP)" ? (p.ip || "IP not set") : p.conn}
                {p.ip && p.conn !== "Network (IP)" && (
                  <span style={{ marginLeft: 4 }}>· IP: {p.ip}</span>
                )}
                {' · '}{p.paper}
                {p.marginAdjust > 0 && <span> · +{p.marginAdjust}px margin</span>}
              </div>
              {p.conn !== "Network (IP)" && !p.ip && (
                <div style={{ fontSize: 11, color: "#d97706", fontWeight: 700, marginTop: 2 }}>
                  ⚠️ If this is a network printer, click Edit → set Connection to "Network (IP)" and enter IP
                </div>
              )}
              {p.station && <div className="pset-printer-station">📍 {p.station}</div>}
            </div>
            <div className="pset-printer-actions">
              <button type="button" className="pset-txt-btn"
                onClick={() => printTestPage(p)}>🖨 Test</button>
              <button type="button" className="pset-txt-btn" onClick={() => openEdit(p)}>Edit</button>
              {!p.isDefault && (
                <button type="button" className="pset-txt-btn" onClick={() => setDefault(p.id)}>Set Default</button>
              )}
              <button type="button" className="pset-icon-btn danger" onClick={() => removePrinter(p.id)}>🗑</button>
            </div>
          </div>
          );
        })}
        {printers.length === 0 && !adding && (
          <div className="pset-empty">No printers configured yet.<br />Tap <strong>+ Add Printer</strong> to begin.</div>
        )}
      </div>

      {/* Label printer section — always visible below thermal printers */}
      {!adding && (
        <div className="pset-label-printer-section">
          <div className="pset-label-divider">
            <span>🏷️ Label / Sticker Printer</span>
          </div>
          <p className="pset-label-hint">
            No setup needed. When you print a label, a printer picker will appear automatically.
            Your choice is remembered — next prints go directly to that printer.
            Use the <strong>▾</strong> button on any label print button to change printers anytime.
          </p>
        </div>
      )}

      {/* Print Log */}
      {!adding && (
        <div className="pset-label-printer-section">
          <div className="pset-label-divider" style={{ cursor: "pointer" }}
            onClick={() => { refreshLog(); setShowPrintLog(v => !v); }}>
            <span>📋 Print Log {printLog.length > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>({printLog.length})</span>}</span>
            <span style={{ fontSize: 12, marginLeft: "auto", opacity: 0.6 }}>{showPrintLog ? "▲ Hide" : "▼ Show"}</span>
          </div>
          {showPrintLog && (
            <div>
              {printLog.length === 0
                ? <p className="pset-label-hint">No print jobs recorded yet.</p>
                : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 6 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                          <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 700 }}>Time</th>
                          <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 700 }}>Type</th>
                          <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 700 }}>Label</th>
                          <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 700 }}>Status</th>
                          <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 700 }}>Printer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printLog.map(e => (
                          <tr key={e.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "3px 6px", whiteSpace: "nowrap", color: "#6b7280" }}>
                              {new Date(e.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                            </td>
                            <td style={{ padding: "3px 6px" }}>{e.type}</td>
                            <td style={{ padding: "3px 6px" }}>{e.label}</td>
                            <td style={{ padding: "3px 6px" }}>
                              <span style={{ fontWeight: 700, color: e.status === "ok" ? "#16a34a" : "#dc2626" }}>
                                {e.status === "ok" ? "✓ OK" : "✗ Fail"}
                              </span>
                              {e.error && <span style={{ color: "#9ca3af", marginLeft: 4, fontSize: 11 }}>({e.error})</span>}
                              {e.note && <span style={{ color: "#9ca3af", marginLeft: 4, fontSize: 11 }}>{e.note}</span>}
                            </td>
                            <td style={{ padding: "3px 6px", color: "#6b7280" }}>{e.printerName || e.printerIp || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button type="button" className="pset-txt-btn" style={{ marginTop: 8 }}
                      onClick={handleClearLog}>Clear log</button>
                  </div>
                )
              }
            </div>
          )}
        </div>
      )}

      {/* Add / Edit form */}
      {adding && (
        <div className="pset-add-form">
          <h5 className="pset-form-title">{editId ? "Edit Printer" : "Add Printer"}</h5>

          {editId ? (
            /* ═══ EDIT: full form ═══════════════════════════════════════════ */
            <>
              {/* IP / Connection */}
              <div className="pset-form-row">
                <div className="pset-form-field">
                  <label>Printer name</label>
                  <input className="pset-input" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                </div>
                <div className="pset-form-field">
                  <label>Network IP address</label>
                  <input className="pset-input" placeholder="192.168.1.xxx"
                    value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} />
                </div>
              </div>

              {/* Role cards */}
              <div className="pset-form-field" style={{ marginTop: 4 }}>
                <label>Role</label>
                <div className="pset-role-cards">
                  {[
                    { role: "Bill Printer",      icon: "🧾", label: "Bills",   sub: "Receipts" },
                    { role: "KOT Printer",       icon: "📋", label: "KOT",     sub: "Kitchen orders" },
                    { role: "Both (KOT + Bill)", icon: "🍽️", label: "Both",    sub: "Bills + KOT" },
                  ].map(({ role, icon, label, sub }) => (
                    <button key={role} type="button"
                      className={`pset-role-card${form.type === role ? " selected" : ""}`}
                      onClick={() => setForm(f => ({ ...f, type: role }))}>
                      <span className="pset-role-icon">{icon}</span>
                      <span className="pset-role-label">{label}</span>
                      <span className="pset-role-sub">{sub}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {["Bar Printer", "Dessert Printer"].map(t => (
                    <button key={t} type="button"
                      className={`pset-paper-chip${form.type === t ? " selected" : ""}`}
                      onClick={() => setForm(f => ({ ...f, type: t }))}>
                      {t === "Bar Printer" ? "🍺" : "🍰"} {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Station — only for KOT-type printers */}
              {(form.type === "KOT Printer" || form.type === "Both (KOT + Bill)" || form.type === "Bar Printer" || form.type === "Dessert Printer") && (
                <div className="pset-form-field">
                  <label>Kitchen station</label>
                  <select className="pset-select" value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))}>
                    <option value="">— select station —</option>
                    {kitchenStations.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    <option value="Bills & KOTs">Bills &amp; KOTs</option>
                  </select>
                  <span className="pset-field-hint">KOTs for this station route to this printer</span>
                </div>
              )}

              {/* Model + Paper */}
              <div className="pset-form-row">
                <div className="pset-form-field">
                  <label>Printer model</label>
                  <select className="pset-select" value={form.model}
                    onChange={e => {
                      const m = e.target.value;
                      const ph = MODEL_PAPER[m];
                      setForm(f => ({ ...f, model: m, ...(ph ? { paper: ph } : {}) }));
                    }}>
                    {PRINTER_MODELS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="pset-form-field">
                  <label>Paper size</label>
                  <div className="pset-paper-chips">
                    {["80mm", "58mm"].map(s => (
                      <button key={s} type="button"
                        className={`pset-paper-chip${form.paper === s ? " selected" : ""}`}
                        onClick={() => setForm(f => ({ ...f, paper: s }))}>{s}</button>
                    ))}
                    <button type="button"
                      className={`pset-paper-chip${!["80mm","58mm"].includes(form.paper) ? " selected" : ""}`}
                      onClick={() => setForm(f => ({ ...f, paper: "76mm" }))}>Other</button>
                  </div>
                  {!["80mm","58mm"].includes(form.paper) && (
                    <select className="pset-select" style={{ marginTop: 6 }} value={form.paper}
                      onChange={e => setForm(f => ({ ...f, paper: e.target.value }))}>
                      {PAPER_SIZES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Advanced toggle */}
              <button type="button" className="pset-advanced-toggle"
                onClick={() => setShowAdvanced(v => !v)}>
                {showAdvanced ? "▲ Hide advanced" : "▼ Advanced options"}
              </button>
              {showAdvanced && (
                <div className="pset-advanced-body">
                  <div className="pset-form-field">
                    <label>Right margin adjust (px)</label>
                    <div className="pset-margin-stepper">
                      <button type="button" className="pset-margin-btn"
                        onClick={() => setForm(f => ({ ...f, marginAdjust: Math.max(0, (f.marginAdjust||0) - 2) }))}>−</button>
                      <span className="pset-margin-val">{form.marginAdjust || 0} px</span>
                      <button type="button" className="pset-margin-btn"
                        onClick={() => setForm(f => ({ ...f, marginAdjust: Math.min(20, (f.marginAdjust||0) + 2) }))}>+</button>
                    </div>
                    <span className="pset-field-hint">If amounts cut off on right edge, increase this. Default 0 for Epson.</span>
                  </div>
                  {IS_ELECTRON && (
                    <>
                      <div className="pset-form-field">
                        <label>Windows printer name <span style={{ fontWeight: 400, color: "#999" }}>(USB only)</span></label>
                        <input className="pset-input" placeholder="e.g. EPSON TM-T82 Receipt"
                          value={form.winName} onChange={e => setForm(f => ({ ...f, winName: e.target.value }))} />
                        <span className="pset-field-hint">Must match Windows → Devices and Printers exactly.</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button type="button" className="pset-scan-btn" onClick={handleListWindowsPrinters} disabled={loadingWinPrinters}>
                          {loadingWinPrinters ? "Loading…" : "📋 List Windows Printers"}
                        </button>
                        {form.ip?.trim() && (
                          <button type="button" className="pset-scan-btn" onClick={handleAutoInstall} disabled={autoInstalling}>
                            {autoInstalling ? "Installing…" : "🖨️ Auto-Setup in Windows"}
                          </button>
                        )}
                        {autoInstallMsg && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: autoInstallMsg.ok ? "#16a34a" : "#dc2626" }}>
                            {autoInstallMsg.msg}
                          </span>
                        )}
                      </div>
                      {winPrinterList !== null && winPrinterList.length > 0 && (
                        <div className="pset-scan-results">
                          {winPrinterList.map((p, i) => (
                            <button key={i} type="button" className="pset-scan-result-item" onClick={() => pickWindowsPrinter(p)}>
                              <span className="pset-scan-result-icon">🖨️</span>
                              <span><strong>{p.name}</strong>{p.isDefault && <span className="pset-default-badge" style={{ marginLeft: 6 }}>Default</span>}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="pset-form-actions" style={{ marginTop: 14 }}>
                <button type="button" className="pset-cancel-btn"
                  onClick={() => { setAdding(false); setEditId(null); setScanResults(null); setWinPrinterList(null); }}>Cancel</button>
                {(form.ip?.trim() || form.winName?.trim()) && (
                  <button type="button" className="pset-scan-btn"
                    onClick={() => printTestPage({ ...form, id: "__test__" })}>
                    🖨 Test Print
                  </button>
                )}
                <button type="button" className="pset-save-btn" onClick={savePrinter}>Save Changes</button>
              </div>
            </>
          ) : (
            /* ═══ ADD: 3-step wizard ════════════════════════════════════════ */
            <>
              {/* Step indicator */}
              <div className="pset-wizard-steps">
                {[["Find", 1], ["Configure", 2], ["Role", 3]].map(([label, n]) => (
                  <div key={n} className={`pset-wstep${proStep === n ? " active" : proStep > n ? " done" : ""}`}>
                    <span className="pset-wstep-num">{proStep > n ? "✓" : n}</span>
                    <span className="pset-wstep-label">{label}</span>
                  </div>
                ))}
              </div>

              {/* ─ Step 1: Find printer ──────────────────────────────────── */}
              {proStep === 1 && (
                <>
                  <div className="pset-discover-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <button type="button" className="pset-discover-card" onClick={handleScan} disabled={scanning}>
                      <span className="pset-discover-icon">📡</span>
                      <span className="pset-discover-label">{scanning ? "Scanning…" : "Scan Network"}</span>
                      <span className="pset-discover-sub">Auto-find on Wi-Fi</span>
                    </button>
                    <button type="button" className="pset-discover-card" onClick={() => { setForm(f => ({ ...f, conn: "USB" })); setScanResults(null); handleListWindowsPrinters(); setProStep(2); }}>
                      <span className="pset-discover-icon">🖨️</span>
                      <span className="pset-discover-label">USB Printer</span>
                      <span className="pset-discover-sub">Connected by cable</span>
                    </button>
                  </div>

                  {scanning && (
                    <div className="pset-scan-empty">Scanning network… may take 15–30 seconds</div>
                  )}

                  {scanResults !== null && (
                    scanResults.length === 0 ? (
                      <div className="pset-scan-empty">No printers found on port 9100.</div>
                    ) : (
                      <div className="pset-scan-results">
                        {scanResults.filter(p => !p.usb).length > 0 && (
                          <>
                            <p className="pset-scan-results-label">Network printers found — tap to select:</p>
                            {scanResults.filter(p => !p.usb).map((p, i) => (
                              <button key={i} type="button" className="pset-scan-result-item"
                                onClick={() => { pickScannedPrinter(p); setProStep(2); }}>
                                <span className="pset-scan-result-icon">📡</span>
                                <span>
                                  <strong style={{ fontFamily: "monospace" }}>{p.ip}</strong>
                                  <span className="pset-scan-result-ip"> · Network · port 9100</span>
                                </span>
                                <span style={{ marginLeft: "auto", color: "#16a34a", fontWeight: 700, fontSize: 12 }}>Use this →</span>
                              </button>
                            ))}
                          </>
                        )}
                        {scanResults.filter(p => p.usb).length > 0 && (
                          <>
                            <p className="pset-scan-results-label" style={{ marginTop: 8 }}>USB printers found:</p>
                            {scanResults.filter(p => p.usb).map((p, i) => (
                              <button key={`usb${i}`} type="button" className="pset-scan-result-item"
                                onClick={() => { pickScannedPrinter(p); setProStep(2); }}>
                                <span className="pset-scan-result-icon">🖨️</span>
                                <span>
                                  <strong>{p.name}</strong>
                                  <span className="pset-scan-result-ip"> · USB</span>
                                </span>
                                <span style={{ marginLeft: "auto", color: "#16a34a", fontWeight: 700, fontSize: 12 }}>Use this →</span>
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )
                  )}

                  {/* Manual IP fallback — always shown below scan results */}
                  <div className="pset-manual-ip-row">
                    <span className="pset-manual-ip-label">Know the IP?</span>
                    <input className="pset-input pset-manual-ip-input" placeholder="192.168.1.xxx"
                      value={form.ip}
                      onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} />
                    <button type="button" className="pset-save-btn"
                      style={{ padding: "6px 14px", fontSize: 13 }}
                      disabled={!form.ip.trim()}
                      onClick={() => { setForm(f => ({ ...f, conn: "Network (IP)" })); setProStep(2); }}>
                      Next →
                    </button>
                  </div>

                  <div className="pset-form-actions" style={{ marginTop: 8 }}>
                    <button type="button" className="pset-cancel-btn"
                      onClick={() => { setAdding(false); setScanResults(null); }}>Cancel</button>
                  </div>
                </>
              )}

              {/* ─ Step 2: Configure ─────────────────────────────────────── */}
              {proStep === 2 && (
                <>
                  {form.conn === "Network (IP)" ? (
                    form.ip ? (
                      <div className="pset-ip-chip">
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
                        {form.ip}
                        <button type="button" style={{ marginLeft: 8, fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => { setForm(f => ({ ...f, ip: "" })); setScanResults(null); setProStep(1); }}>change</button>
                      </div>
                    ) : (
                      <div className="pset-form-field" style={{ marginBottom: 12 }}>
                        <label>IP Address</label>
                        <input className="pset-input" placeholder="192.168.1.xxx" value={form.ip}
                          onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} autoFocus />
                        <span className="pset-field-hint">Enter the printer's network IP address</span>
                      </div>
                    )
                  ) : (
                    /* USB — show Windows printer list */
                    <>
                      {loadingWinPrinters && <div className="pset-scan-empty">Loading Windows printers…</div>}
                      {winPrinterList !== null && (
                        winPrinterList.length === 0 ? (
                          <div className="pset-scan-empty">No printers found in Windows. Install the printer driver first.</div>
                        ) : (
                          <div className="pset-scan-results" style={{ marginBottom: 10 }}>
                            <p className="pset-scan-results-label">Select your USB printer:</p>
                            {winPrinterList.map((p, i) => (
                              <button key={i} type="button" className="pset-scan-result-item" onClick={() => pickWindowsPrinter(p)}>
                                <span className="pset-scan-result-icon">🖨️</span>
                                <span><strong>{p.name}</strong>{p.isDefault && <span className="pset-default-badge" style={{ marginLeft: 6 }}>Default</span>}</span>
                                <span style={{ marginLeft: "auto", color: "#16a34a", fontWeight: 700, fontSize: 12 }}>Select →</span>
                              </button>
                            ))}
                          </div>
                        )
                      )}
                    </>
                  )}

                  {/* Printer name */}
                  <div className="pset-form-field" style={{ marginBottom: 12 }}>
                    <label>Printer name</label>
                    <input className="pset-input" placeholder="e.g. Hot Kitchen Printer" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      autoFocus={!!form.ip} />
                  </div>

                  {/* Model → paper auto-fill */}
                  <div className="pset-form-row">
                    <div className="pset-form-field">
                      <label>Printer model</label>
                      <select className="pset-select" value={form.model}
                        onChange={e => {
                          const m = e.target.value;
                          const ph = MODEL_PAPER[m];
                          setForm(f => ({ ...f, model: m, ...(ph ? { paper: ph } : {}) }));
                        }}>
                        {PRINTER_MODELS.map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="pset-form-field">
                      <label>Paper size</label>
                      <div className="pset-paper-chips">
                        {["80mm", "58mm"].map(s => (
                          <button key={s} type="button"
                            className={`pset-paper-chip${form.paper === s ? " selected" : ""}`}
                            onClick={() => setForm(f => ({ ...f, paper: s }))}>{s}</button>
                        ))}
                        <button type="button"
                          className={`pset-paper-chip${!["80mm","58mm"].includes(form.paper) ? " selected" : ""}`}
                          onClick={() => setForm(f => ({ ...f, paper: "76mm" }))}>Other</button>
                      </div>
                      {!["80mm","58mm"].includes(form.paper) && (
                        <select className="pset-select" style={{ marginTop: 6 }} value={form.paper}
                          onChange={e => setForm(f => ({ ...f, paper: e.target.value }))}>
                          {PAPER_SIZES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="pset-form-actions" style={{ marginTop: 14 }}>
                    <button type="button" className="pset-cancel-btn" onClick={() => setProStep(1)}>← Back</button>
                    {(form.ip?.trim() || form.winName?.trim()) && (
                      <button type="button" className="pset-scan-btn"
                        onClick={() => printTestPage({ ...form, id: "__test__" })}>
                        🖨 Test Print
                      </button>
                    )}
                    <button type="button" className="pset-save-btn"
                      onClick={() => { if (form.name.trim()) setProStep(3); }}
                      disabled={!form.name.trim()}>
                      Next →
                    </button>
                  </div>
                </>
              )}

              {/* ─ Step 3: Role ──────────────────────────────────────────── */}
              {proStep === 3 && (
                <>
                  <p style={{ fontSize: 13, color: "var(--sq-muted)", marginBottom: 12 }}>
                    What should <strong style={{ color: "var(--sq-text)" }}>{form.name}</strong> print?
                  </p>

                  <div className="pset-role-cards">
                    {[
                      { role: "Bill Printer",      icon: "🧾", label: "Bills",          sub: "Receipts & settlements" },
                      { role: "KOT Printer",       icon: "📋", label: "Kitchen Orders", sub: "KOTs to kitchen" },
                      { role: "Both (KOT + Bill)", icon: "🍽️", label: "Both",           sub: "Bills + KOTs" },
                    ].map(({ role, icon, label, sub }) => (
                      <button key={role} type="button"
                        className={`pset-role-card${form.type === role ? " selected" : ""}`}
                        onClick={() => setForm(f => ({ ...f, type: role }))}>
                        <span className="pset-role-icon">{icon}</span>
                        <span className="pset-role-label">{label}</span>
                        <span className="pset-role-sub">{sub}</span>
                      </button>
                    ))}
                  </div>

                  {/* Bar / Dessert specialty options */}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {["Bar Printer", "Dessert Printer"].map(t => (
                      <button key={t} type="button"
                        className={`pset-paper-chip${form.type === t ? " selected" : ""}`}
                        onClick={() => setForm(f => ({ ...f, type: t }))}>
                        {t === "Bar Printer" ? "🍺" : "🍰"} {t}
                      </button>
                    ))}
                  </div>

                  {/* Kitchen station — only for KOT-type */}
                  {(form.type === "KOT Printer" || form.type === "Both (KOT + Bill)" || form.type === "Bar Printer" || form.type === "Dessert Printer") && (
                    <div className="pset-form-field" style={{ marginTop: 14 }}>
                      <label>Kitchen station</label>
                      <select className="pset-select" value={form.station}
                        onChange={e => setForm(f => ({ ...f, station: e.target.value }))}>
                        <option value="">— select station (optional) —</option>
                        {kitchenStations.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        <option value="Bills & KOTs">Bills &amp; KOTs</option>
                      </select>
                      <span className="pset-field-hint">
                        {kitchenStations.length === 0
                          ? "No stations yet — create them in Owner Web → Kitchen Stations"
                          : "KOTs for this station's items route to this printer"}
                      </span>
                    </div>
                  )}

                  <div className="pset-form-actions" style={{ marginTop: 14 }}>
                    <button type="button" className="pset-cancel-btn" onClick={() => setProStep(2)}>← Back</button>
                    <button type="button" className="pset-save-btn" onClick={savePrinter}
                      disabled={!form.type}>
                      Save Printer
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}


/* ─── Tables Tab ────────────────────────────────────────────────────────────── */
function TablesTab() {
  const [areas, setAreas] = useState(() => lsGet("pos_table_config", []));
  const [activeArea,  setActiveArea]  = useState(areas[0]?.id || null);
  const [newAreaName, setNewAreaName] = useState("");
  const [newTable,    setNewTable]    = useState({ number: "", seats: "4" });
  const [addingArea,  setAddingArea]  = useState(false);
  const [syncMsg,     setSyncMsg]     = useState(null);

  const currentArea = areas.find(a => a.id === activeArea);

  // Get outlet ID from branch config
  const outletId = (() => {
    try { return JSON.parse(localStorage.getItem("pos_branch_config") || "null")?.outletId || null; }
    catch { return null; }
  })();

  function persist(updated) {
    setAreas(updated);
    lsSet("pos_table_config", updated);
    // Sync to API so owner-web stays in sync
    if (outletId) {
      const apiTables = areasToApiTables(updated);
      api.patch(`/outlets/${outletId}/tables`, { tables: apiTables })
        .then(() => { setSyncMsg("✓ Saved & synced"); setTimeout(() => setSyncMsg(null), 2500); })
        .catch(() => { setSyncMsg("Saved locally (sync failed)"); setTimeout(() => setSyncMsg(null), 3000); });
    }
  }

  function addArea() {
    if (!newAreaName.trim()) return;
    const updated = [...areas, { id: `a${Date.now()}`, name: newAreaName.trim(), tables: [] }];
    persist(updated);
    setActiveArea(updated[updated.length - 1].id);
    setNewAreaName("");
    setAddingArea(false);
  }

  function removeArea(id) {
    const updated = areas.filter(a => a.id !== id);
    persist(updated);
    if (activeArea === id) setActiveArea(updated[0]?.id || null);
  }

  function addTable() {
    if (!newTable.number.trim() || !currentArea) return;
    const updated = areas.map(a => {
      if (a.id !== activeArea) return a;
      return { ...a, tables: [...a.tables, {
        id:     `t${Date.now()}`,
        number: newTable.number.trim(),
        seats:  Number(newTable.seats) || 4
      }]};
    });
    persist(updated);
    setNewTable({ number: "", seats: "4" });
  }

  function removeTable(tableId) {
    const updated = areas.map(a => {
      if (a.id !== activeArea) return a;
      return { ...a, tables: a.tables.filter(t => t.id !== tableId) };
    });
    persist(updated);
  }

  return (
    <div className="pset-section">
      <div className="pset-section-head">
        <div>
          <h4>Table Management</h4>
          <p>Create areas and manage tables{syncMsg && <span style={{ marginLeft: 8, color: "#16a34a", fontWeight: 700 }}>{syncMsg}</span>}</p>
        </div>
        <button type="button" className="pset-add-btn" onClick={() => setAddingArea(true)}>
          + Add Area
        </button>
      </div>

      {/* Area tabs */}
      <div className="pset-area-tabs">
        {areas.map(a => (
          <button key={a.id} type="button"
            className={`pset-area-tab${activeArea === a.id ? " active" : ""}`}
            onClick={() => setActiveArea(a.id)}>
            {a.name}
            <span className="pset-area-count">{a.tables.length}</span>
            {areas.length > 1 && (
              <span className="pset-area-del"
                onClick={ev => { ev.stopPropagation(); removeArea(a.id); }}>×</span>
            )}
          </button>
        ))}
        {addingArea && (
          <div className="pset-area-add-inline">
            <input className="pset-input sm" placeholder="Area name"
              value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addArea()} />
            <button type="button" className="pset-save-btn sm" onClick={addArea}>Add</button>
            <button type="button" className="pset-cancel-btn sm" onClick={() => setAddingArea(false)}>✕</button>
          </div>
        )}
      </div>

      {/* Table grid */}
      {currentArea && (
        <>
          <div className="pset-table-grid">
            {currentArea.tables.map(t => (
              <div key={t.id} className="pset-table-card">
                <span className="pset-table-num">{t.number}</span>
                <span className="pset-table-seats">{t.seats} seats</span>
                <button type="button" className="pset-icon-btn danger sm"
                  onClick={() => removeTable(t.id)}>🗑</button>
              </div>
            ))}
            {currentArea.tables.length === 0 && (
              <div className="pset-empty">No tables yet. Add one below.</div>
            )}
          </div>

          {/* Add table row */}
          <div className="pset-add-table-row">
            <input className="pset-input sm" placeholder="Table no. (e.g. T7)"
              value={newTable.number}
              onChange={e => setNewTable(f => ({ ...f, number: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addTable()} />
            <select className="pset-select sm"
              value={newTable.seats}
              onChange={e => setNewTable(f => ({ ...f, seats: e.target.value }))}>
              {[2,4,6,8,10,12].map(n => <option key={n} value={n}>{n} seats</option>)}
            </select>
            <button type="button" className="pset-save-btn sm" onClick={addTable}>
              + Add Table
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Cashier Tab ───────────────────────────────────────────────────────────── */
function CashierTab({ cashierName, activeShift }) {
  const CASHIER_PERMISSIONS = [
    { icon: "✅", label: "Take dine-in, takeaway, delivery orders"      },
    { icon: "✅", label: "Add / remove items from open orders"           },
    { icon: "✅", label: "Apply discounts up to 10% (manager PIN > 10%)" },
    { icon: "✅", label: "Send KOT to kitchen"                           },
    { icon: "✅", label: "Process bill & accept payments"                },
    { icon: "✅", label: "Split bill"                                    },
    { icon: "✅", label: "Hold orders & transfer tables"                 },
    { icon: "✅", label: "Cash In / Cash Out (manager PIN required)"     },
    { icon: "✅", label: "Book advance orders"                            },
    { icon: "✅", label: "Open & close daily shift"                      },
    { icon: "🔒", label: "Menu / item management — Owner-web only"       },
    { icon: "🔒", label: "Tax & receipt settings — Owner-web only"       },
    { icon: "🔒", label: "Staff management & roles — Owner-web only"     },
    { icon: "🔒", label: "Discount rules — Owner-web only"               },
    { icon: "🔒", label: "Reports & analytics — Owner-web only"          },
  ];

  const movements = lsGet("pos_cash_movements", [])
    .filter(m => m.shiftId === activeShift?.id);

  return (
    <div className="pset-section">
      <div className="pset-cashier-header">
        <div className="pset-cashier-avatar">
          {cashierName?.[0] || "C"}
        </div>
        <div>
          <h4>{cashierName || "Cashier"}</h4>
          <p className="pset-cashier-role">Cashier · {activeShift?.session || "—"} session</p>
        </div>
      </div>

      {activeShift && (
        <div className="pset-shift-info-grid">
          <div className="pset-sinfo-card">
            <span className="pset-sinfo-label">Opening Cash</span>
            <span className="pset-sinfo-val">₹{(activeShift.openingCash || 0).toLocaleString("en-IN")}</span>
          </div>
          <div className="pset-sinfo-card green">
            <span className="pset-sinfo-label">Cash In</span>
            <span className="pset-sinfo-val">+₹{(activeShift.cashIn || 0).toLocaleString("en-IN")}</span>
          </div>
          <div className="pset-sinfo-card red">
            <span className="pset-sinfo-label">Cash Out</span>
            <span className="pset-sinfo-val">−₹{(activeShift.cashOut || 0).toLocaleString("en-IN")}</span>
          </div>
          <div className="pset-sinfo-card">
            <span className="pset-sinfo-label">Started</span>
            <span className="pset-sinfo-val sm">
              {new Date(activeShift.startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
            </span>
          </div>
        </div>
      )}

      <div className="pset-section-head" style={{ marginTop: 20 }}>
        <div><h4>Cashier Permissions</h4><p>What this role can and cannot do</p></div>
      </div>

      <div className="pset-perms-list">
        {CASHIER_PERMISSIONS.map((p, i) => (
          <div key={i} className={`pset-perm-row${p.icon === "🔒" ? " locked" : ""}`}>
            <span className="pset-perm-icon">{p.icon}</span>
            <span className="pset-perm-label">{p.label}</span>
          </div>
        ))}
      </div>

      {/* ── Forget device ────────────────────────────────────────────────── */}
      <div className="pset-section-head" style={{ marginTop: 28 }}>
        <div><h4>Device Setup</h4><p>Branch link code and device registration</p></div>
      </div>
      <div className="pset-device-info">
        {(() => {
          try {
            const cfg = JSON.parse(localStorage.getItem("pos_branch_config") || "null");
            return cfg ? (
              <p className="pset-device-branch">
                <span>Connected:</span> <strong>{cfg.outletName}</strong>
                <span className="pset-device-code"> · {cfg.outletCode}</span>
                <span className="pset-device-code"> · {cfg.workArea ? `${cfg.workArea} terminal` : "Full Access"}</span>
              </p>
            ) : <p style={{ color: "#ef4444", fontSize: 13 }}>No branch linked</p>;
          } catch { return null; }
        })()}
        <button
          className="pset-forget-btn"
          onClick={async () => {
            if (window.confirm("Unlink this device? You will need a new branch code on next launch.\n\nAll cached orders, shifts, menus and settings on this device will be cleared.")) {
              // Wipe every pos_* and outlet_*_pos_* key
              Object.keys(localStorage)
                .filter(k => k.startsWith("pos_") || k.startsWith("outlet_"))
                .forEach(k => { try { localStorage.removeItem(k); } catch {} });
              // Clear service worker caches
              if ("caches" in window) {
                const names = await caches.keys();
                await Promise.all(names.map(n => caches.delete(n)));
              }
              window.location.reload();
            }
          }}
        >
          🔗 Forget this device &amp; re-link
        </button>
      </div>

      {/* ── Clear order cache ─────────────────────────────────────────────── */}
      <div className="pset-section-head" style={{ marginTop: 24 }}>
        <div>
          <h4>Clear Device Cache</h4>
          <p>Wipes ghost orders and stale items from this device's local storage. Use when ghost items keep reappearing on tables.</p>
        </div>
      </div>
      <div className="pset-device-info">
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
          ⚠️ Clears orders, menus, KOT queues and app cache. Branch link, printers, and display settings are <strong>kept</strong>.
        </p>
        <button
          className="pset-forget-btn"
          style={{ background: "#fef2f2", color: "#dc2626", borderColor: "#fca5a5" }}
          onClick={async () => {
            if (window.confirm("Clear all cached data on this device?\n\nThis removes ghost orders, stale menus, KOT queues and browser cache. Branch link, printers, and display settings are kept.")) {
              const KEEP = new Set([
                "pos_branch_config",
                "pos_token",
                "pos_device_id",
                "pos_printers",
                "pos_display_settings",
                "pos_dark_mode",
                "pos_devices_assignments",
                "pos_label_printer",
                "pos_last_label_printer",
              ]);
              const cfg = (() => { try { return JSON.parse(localStorage.getItem("pos_branch_config") || "null"); } catch { return null; } })();
              if (cfg?.outletId) {
                const prefix = `outlet_${cfg.outletId}_`;
                Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => { try { localStorage.removeItem(k); } catch {} });
              }
              Object.keys(localStorage)
                .filter(k => k.startsWith("pos_") && !KEEP.has(k))
                .forEach(k => { try { localStorage.removeItem(k); } catch {} });
              // Clear service worker caches so stale assets are re-fetched
              if ("caches" in window) {
                const names = await caches.keys();
                await Promise.all(names.map(n => caches.delete(n)));
              }
              window.location.reload();
            }
          }}
        >
          🗑️ Clear Cache &amp; Reload
        </button>
      </div>
    </div>
  );
}

/* ─── Display Tab ───────────────────────────────────────────────────────────── */
function DisplayTab() {
  const [settings, setSettings] = useState(() =>
    load("pos_display_settings", {
      fontSize:     "medium",
      showItemCode: false,
      soundOnAdd:   true,
      colorTheme:   "default",
      showVegIcon:  true,
      confirmVoid:  true,
      kotAutoSend:  false,
    })
  );

  function toggle(key) {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    save("pos_display_settings", updated);
  }

  function setVal(key, val) {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    save("pos_display_settings", updated);
  }

  const toggles = [
    { key: "showItemCode", label: "Show item code on menu",        desc: "Displays SKU code under item name" },
    { key: "soundOnAdd",   label: "Sound on item add",             desc: "Play a beep when item is added"    },
    { key: "showVegIcon",  label: "Show Veg / Non-Veg indicator",  desc: "Green/red dot on menu items"       },
    { key: "confirmVoid",  label: "Confirm before void",           desc: "Ask confirmation before voiding"  },
    { key: "kotAutoSend",  label: "Auto-send KOT on add",          desc: "Sends KOT immediately when item is added (no manual send)" },
  ];

  return (
    <div className="pset-section">
      <div className="pset-section-head">
        <div><h4>Display & Behaviour</h4><p>Customise POS terminal appearance</p></div>
      </div>

      <div className="pset-form-field" style={{ marginBottom: 16 }}>
        <label>Font Size</label>
        <div className="pset-radio-row">
          {["small","medium","large"].map(s => (
            <button key={s} type="button"
              className={`pset-radio-btn${settings.fontSize === s ? " active" : ""}`}
              onClick={() => setVal("fontSize", s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="pset-toggles-list">
        {toggles.map(t => (
          <div key={t.key} className="pset-toggle-row">
            <div>
              <div className="pset-toggle-label">{t.label}</div>
              <div className="pset-toggle-desc">{t.desc}</div>
            </div>
            <button type="button"
              className={`pset-toggle-sw${settings[t.key] ? " on" : ""}`}
              onClick={() => toggle(t.key)}>
              <span className="pset-toggle-thumb" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Security Tab ──────────────────────────────────────────────────────────── */
function SecurityTab() {
  const [sec,        setSec]        = useState(() => lsGet("pos_security", { managerPin: "1234" }));
  const [pinInput,   setPinInput]   = useState("");
  const [pinInput2,  setPinInput2]  = useState("");
  const [saved,      setSaved]      = useState(false);
  const [pinError,   setPinError]   = useState("");

  function handleSave() {
    setPinError("");
    if (!/^\d{4,6}$/.test(pinInput)) { setPinError("PIN must be 4–6 digits."); return; }
    if (pinInput !== pinInput2)       { setPinError("PINs do not match."); return; }
    const updated = { ...sec, managerPin: pinInput };
    lsSet("pos_security", updated);
    setSec(updated);
    setPinInput("");
    setPinInput2("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    // Sync PIN to backend so server-side void/discount validation uses it
    api.put("/settings/security", { managerPin: pinInput })
      .catch(err => console.warn("[POS] PIN sync to server failed:", err.message));
  }

  return (
    <div className="pset-section">
      <div className="pset-section-head">
        <div><h4>Security</h4><p>Manager PIN is required to approve Cash In / Cash Out</p></div>
      </div>

      <div className="pset-form-field">
        <label>Current Manager PIN</label>
        <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
          PIN is configured. Enter a new one below to change it.
        </div>
      </div>

      <div className="pset-form-field">
        <label>New PIN (4–6 digits)</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter new PIN"
          value={pinInput}
          onChange={e => { setPinInput(e.target.value.replace(/\D/g,"")); setSaved(false); }}
          style={{ width: 160, letterSpacing: "0.25em" }}
        />
      </div>
      <div className="pset-form-field">
        <label>Confirm New PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="Repeat new PIN"
          value={pinInput2}
          onChange={e => { setPinInput2(e.target.value.replace(/\D/g,"")); setSaved(false); }}
          style={{ width: 160, letterSpacing: "0.25em" }}
        />
      </div>

      {pinError && <div style={{ color: "#e53e3e", fontSize: 12, marginBottom: 8 }}>{pinError}</div>}

      <button type="button" className="pset-save-btn" onClick={handleSave}>
        {saved ? "✓ PIN Updated" : "Update PIN"}
      </button>

      <div style={{ marginTop: 16, padding: "10px 12px", background: "#fffbeb", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
        ⚠️ Change the default PIN (1234) before going live. Share the new PIN only with managers.
      </div>
    </div>
  );
}

/* ─── Devices Tab ────────────────────────────────────────────────────────────── */
function DevicesTab() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!window.electronAPI?.getLocalServerInfo) return;
    window.electronAPI.getLocalServerInfo().then(setInfo).catch(() => {});
  }, []);

  return (
    <div className="pset-section">
      <div className="pset-section-head">
        <div><h4>Local WiFi Server</h4><p>Captain and KDS tablets connect to this POS machine directly over WiFi — no internet needed.</p></div>
      </div>

      {info ? (
        <div className="pset-local-server-info">
          <div className="pset-lsi-row">
            <span className="pset-lsi-label">POS Machine IP</span>
            <span className="pset-lsi-value">{info.ip}</span>
          </div>
          <div className="pset-lsi-row">
            <span className="pset-lsi-label">Local Server Port</span>
            <span className="pset-lsi-value">{info.port}</span>
          </div>
          <p className="pset-lsi-hint">
            Enter <strong>{info.ip}</strong> as the POS Local IP in the <strong>Plato Captain</strong> and <strong>Plato KDS</strong> setup screens.
            Tablets will connect directly to this machine and receive KOTs even if internet is down.
          </p>
        </div>
      ) : (
        <p className="pset-lsi-hint">Local server info not available (only shown in Electron mode).</p>
      )}

      {/* Static IP setup instruction */}
      <div className="pset-static-ip-box">
        <div className="pset-sib-title">⚠ Important — Set a Fixed IP on this PC</div>
        <p className="pset-sib-body">
          Your WiFi router assigns a new IP to this PC every time it restarts. If the IP changes, Captain and KDS
          tablets may take a few seconds to reconnect automatically. To avoid this, set a <strong>Static (Fixed) IP</strong>
          on this Windows machine once — it never changes after that.
        </p>
        <div className="pset-sib-steps">
          <div className="pset-sib-step"><span className="pset-sib-num">1</span> Open <strong>Windows Settings → Network &amp; Internet → Wi-Fi</strong> (or Ethernet) → click your connection → <strong>Edit</strong> under IP assignment</div>
          <div className="pset-sib-step"><span className="pset-sib-num">2</span> Set <strong>Manual</strong> → turn on IPv4</div>
          <div className="pset-sib-step"><span className="pset-sib-num">3</span> <span>Enter <strong>IP:</strong> <code>192.168.1.100</code> &nbsp; <strong>Subnet:</strong> <code>255.255.255.0</code><br/><strong>Gateway:</strong> <code>192.168.1.1</code> &nbsp;(your router's IP — usually this)</span></div>
          <div className="pset-sib-step"><span className="pset-sib-num">4</span> Save → come back here and confirm the IP above shows <code>192.168.1.100</code></div>
          <div className="pset-sib-step"><span className="pset-sib-num">5</span> Enter <code>192.168.1.100</code> as the POS Local IP in Captain and KDS setup screens</div>
        </div>
        <p className="pset-sib-note">
          Even without a static IP the system auto-discovers the POS on the network — but a fixed IP gives instant, zero-delay reconnection after every power cut.
        </p>
      </div>
    </div>
  );
}

/* ─── Main PosSettingsModal ─────────────────────────────────────────────────── */
export function PosSettingsModal({ cashierName, activeShift, onClose }) {
  const TABS = ["Printers", "Tables", "Cashier", "Display", "Devices", "Security"];
  const [tab, setTab] = useState("Printers");

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pset-modal sm-modal wide">

        <div className="sm-head">
          <div>
            <h3>⚙️ POS Settings</h3>
            <p className="sm-sub">Terminal configuration</p>
          </div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="pset-tabs">
          {TABS.map(t => (
            <button key={t} type="button"
              className={`pset-tab${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="pset-body">
          {tab === "Printers"  && <PrinterTab />}
          {tab === "Tables"    && <TablesTab />}
          {tab === "Cashier"   && <CashierTab cashierName={cashierName} activeShift={activeShift} />}
          {tab === "Display"   && <DisplayTab />}
          {tab === "Devices"   && <DevicesTab />}
          {tab === "Security"  && <SecurityTab />}
        </div>

        <div className="sm-footer">
          <button type="button" className="sm-btn-cancel" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
