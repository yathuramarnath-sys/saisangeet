import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { printKOT, loadPrinters } from "../lib/kotPrint";

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

const PRINTER_TYPES  = ["KOT Printer", "Bill Printer", "Both (KOT + Bill)"];
const PRINTER_CONNS  = ["Network (IP)", "USB", "Bluetooth"];
const PAPER_SIZES    = ["80mm", "58mm"];
const PRINTER_MODELS = ["Epson TM-T82", "Epson TM-T88", "TVS RP 3160 Gold", "TVS RP 45 Shoppe", "Other"];

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
const BLANK_FORM = { name: "", type: "KOT Printer", conn: "Network (IP)", ip: "", paper: "80mm", model: "Epson TM-T82", station: "", winName: "" };

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
  // Kitchen stations — fetch fresh from API on mount; fall back to localStorage cache
  const [kitchenStations, setKitchenStations] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pos_kitchen_stations") || "[]"); }
    catch { return []; }
  });

  useEffect(() => {
    api.get("/kitchen-stations")
      .then((stations) => {
        if (Array.isArray(stations) && stations.length > 0) {
          setKitchenStations(stations);
          localStorage.setItem("pos_kitchen_stations", JSON.stringify(stations));
        }
      })
      .catch(() => { /* keep cached value */ });
  }, []);

  function persist(updated) {
    setPrinters(updated);
    save("pos_printers", updated);
    syncToSharedKey(updated);
  }

  function syncToSharedKey(list) {
    try {
      const existing = JSON.parse(localStorage.getItem("pos_devices_assignments") || "{}");
      const stationMap = {};
      list.filter(p => p.station).forEach(p => {
        stationMap[p.station] = { id: p.id, name: p.name, model: p.model || "", ip: p.ip || "", status: "online" };
      });
      const devices = list.map(p => ({
        id: p.id, name: p.name, type: "printer", model: p.model || "",
        ip: p.ip || "", station: p.station || "", status: "online",
        lastSeen: new Date().toISOString()
      }));
      localStorage.setItem("pos_devices_assignments", JSON.stringify({ ...existing, devices, stationMap }));
    } catch { /* ignore */ }
  }

  function openAdd() { setForm(BLANK_FORM); setEditId(null); setScanResults(null); setAdding(true); }
  function openEdit(p) {
    setForm({ name: p.name, type: p.type, conn: p.conn, ip: p.ip || "", paper: p.paper, model: p.model || "Epson TM-T82", station: p.station || "", winName: p.winName || "" });
    setEditId(p.id); setScanResults(null); setAdding(true);
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
      // USB printer from Windows/lpstat scan:
      // name goes into the display label AND winName (the exact Windows device name)
      setForm(f => ({ ...f, name: f.name || p.name, conn: "USB", winName: p.name }));
    } else {
      // Network printer found via port-9100 scan: fill IP and display name
      setForm(f => ({ ...f, ip: p.ip || f.ip, name: f.name || p.name, conn: "Network (IP)" }));
    }
    setScanResults(null);
  }

  function pickWindowsPrinter(p) {
    // Fills winName with the exact Windows printer name required by webContents.print()
    setForm(f => ({ ...f, winName: p.name, name: f.name || p.name, conn: "USB" }));
    setWinPrinterList(null);
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
        {printers.map(p => (
          <div key={p.id} className={`pset-printer-card${p.isDefault ? " default" : ""}`}>
            <div className="pset-printer-icon">🖨️</div>
            <div className="pset-printer-info">
              <div className="pset-printer-name">
                {p.name}
                {p.isDefault && <span className="pset-default-badge">Default</span>}
              </div>
              <div className="pset-printer-meta">
                {p.type} · {p.conn === "Network (IP)" ? (p.ip || "IP not set") : p.conn}
                {p.ip && p.conn !== "Network (IP)" && (
                  <span style={{ marginLeft: 4 }}>· IP: {p.ip}</span>
                )}
                {' · '}{p.paper}
              </div>
              {/* Warn if printer is labelled USB but has no IP — may need to be changed to Network */}
              {p.conn !== "Network (IP)" && !p.ip && (
                <div style={{ fontSize: 11, color: "#d97706", fontWeight: 700, marginTop: 2 }}>
                  ⚠️ If this is a network printer, click Edit → set Connection to "Network (IP)" and enter IP
                </div>
              )}
              {p.station && <div className="pset-printer-station">📍 {p.station}</div>}
            </div>
            <div className="pset-printer-actions">
              <button type="button" className="pset-txt-btn"
                onClick={() => printKOT(
                  { outletName: "Test", tableNumber: "T1", areaName: "Main Hall", kotNumber: "KOT-TEST", guests: 0, isCounter: false },
                  [{ name: "Test Item 1", quantity: 1, note: "" }, { name: "Test Item 2", quantity: 2 }], p, 1
                )}>🖨 Test</button>
              <button type="button" className="pset-txt-btn" onClick={() => openEdit(p)}>Edit</button>
              {!p.isDefault && (
                <button type="button" className="pset-txt-btn" onClick={() => setDefault(p.id)}>Set Default</button>
              )}
              <button type="button" className="pset-icon-btn danger" onClick={() => removePrinter(p.id)}>🗑</button>
            </div>
          </div>
        ))}
        {printers.length === 0 && !adding && (
          <div className="pset-empty">No printers configured yet.<br />Tap <strong>+ Add Printer</strong> to begin.</div>
        )}
      </div>

      {/* Add / Edit form */}
      {adding && (
        <div className="pset-add-form">
          <h5 className="pset-form-title">{editId ? "Edit Printer" : "Add Printer"}</h5>

          {/* ── Printer discovery row ── */}
          {IS_ELECTRON ? (
            <div className="pset-scan-row">
              {/* Network / USB scan via port-9100 + wmic/lpstat */}
              <button type="button" className="pset-scan-btn" onClick={handleScan} disabled={scanning}>
                {scanning ? "Scanning…" : "🔍 Scan Network & USB"}
              </button>
              {/* List Windows-installed printers for winName selection */}
              <button type="button" className="pset-scan-btn" onClick={handleListWindowsPrinters} disabled={loadingWinPrinters}
                style={{ marginLeft: 8 }}>
                {loadingWinPrinters ? "Loading…" : "📋 List Windows Printers"}
              </button>
            </div>
          ) : (
            // Browser / web mode — printer auto-detect is not supported.
            // Explain the correct setup path to the staff member.
            <div className="pset-scan-note">
              <strong>Windows Electron app required for auto-detect.</strong><br />
              For network printers: enter the IP address manually below.<br />
              For USB printers: install the Epson / TVS driver on Windows, then enter
              the exact printer name shown in <em>Windows → Devices and Printers</em>.
            </div>
          )}

          {/* Network scan results */}
          {scanResults !== null && (
            scanResults.length === 0 ? (
              <div className="pset-scan-empty">No printers found on port 9100. Enter IP manually for network printers, or use "List Windows Printers" for USB.</div>
            ) : (
              <div className="pset-scan-results">
                <p className="pset-scan-results-label">Found {scanResults.length} printer{scanResults.length !== 1 ? "s" : ""} — tap to select:</p>
                {scanResults.map((p, i) => (
                  <button key={i} type="button" className="pset-scan-result-item" onClick={() => pickScannedPrinter(p)}>
                    <span className="pset-scan-result-icon">🖨️</span>
                    <span>
                      <strong>{p.name}</strong>
                      <span className="pset-scan-result-ip">{p.ip}{p.usb ? " (USB)" : ""}</span>
                    </span>
                  </button>
                ))}
              </div>
            )
          )}

          {/* Windows printer list (from getPrinters IPC) */}
          {winPrinterList !== null && (
            winPrinterList.length === 0 ? (
              <div className="pset-scan-empty">No printers found in Windows. Install the printer driver first.</div>
            ) : (
              <div className="pset-scan-results">
                <p className="pset-scan-results-label">
                  Windows printers — tap to set as the print target:
                </p>
                {winPrinterList.map((p, i) => (
                  <button key={i} type="button" className="pset-scan-result-item" onClick={() => pickWindowsPrinter(p)}>
                    <span className="pset-scan-result-icon">🖨️</span>
                    <span>
                      <strong>{p.name}</strong>
                      {p.isDefault && <span className="pset-default-badge" style={{ marginLeft: 6 }}>Default</span>}
                    </span>
                  </button>
                ))}
              </div>
            )
          )}

          <div className="pset-form-row">
            <div className="pset-form-field">
              <label>Printer name</label>
              <input className="pset-input" placeholder="e.g. Hot Kitchen Printer"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="pset-form-field">
              <label>Type</label>
              <select className="pset-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {PRINTER_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Kitchen station — dropdown from Owner Web stations */}
          <div className="pset-form-row">
            <div className="pset-form-field">
              <label>Kitchen station</label>
              <select className="pset-select" value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))}>
                <option value="">— select station —</option>
                {kitchenStations.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
                <option value="Bills & KOTs">Bills &amp; KOTs</option>
              </select>
              <span className="pset-field-hint">
                {kitchenStations.length === 0
                  ? "No stations found — create them in Owner Web → Kitchen Stations first"
                  : "KOTs for this station's categories route to this printer"}
              </span>
            </div>
          </div>

          <div className="pset-form-row">
            <div className="pset-form-field">
              <label>Connection</label>
              <select className="pset-select" value={form.conn} onChange={e => setForm(f => ({ ...f, conn: e.target.value }))}>
                {PRINTER_CONNS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="pset-form-field">
              <label>
                Network IP address
                {form.conn !== "Network (IP)" && (
                  <span style={{ fontWeight: 400, color: "#999", marginLeft: 4 }}>(optional)</span>
                )}
              </label>
              <input className="pset-input" placeholder="192.168.1.xxx"
                value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} />
              {form.conn !== "Network (IP)" && (
                <span className="pset-field-hint">
                  If this is a network/WiFi printer, enter its IP here for direct printing (no Windows driver needed).
                </span>
              )}
            </div>
          </div>

          <div className="pset-form-row">
            <div className="pset-form-field">
              <label>Printer model</label>
              <select className="pset-select" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}>
                {PRINTER_MODELS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="pset-form-field">
              <label>Paper size</label>
              <select className="pset-select" value={form.paper} onChange={e => setForm(f => ({ ...f, paper: e.target.value }))}>
                {PAPER_SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Network IP entered → show Auto-Setup button */}
          {IS_ELECTRON && form.ip?.trim() && (
            <div className="pset-form-row">
              <div className="pset-form-field">
                <label>Quick Windows setup (network printers)</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="pset-save-btn"
                    onClick={handleAutoInstall} disabled={autoInstalling}>
                    {autoInstalling ? "Installing…" : "🖨️ Auto-Setup in Windows"}
                  </button>
                  {autoInstallMsg && (
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: autoInstallMsg.ok ? "#16a34a" : "#dc2626"
                    }}>
                      {autoInstallMsg.msg}
                    </span>
                  )}
                </div>
                <span className="pset-field-hint">
                  Auto-registers this printer in Windows (for USB-port apps). For network printing,
                  just saving the IP address above is enough — no Windows driver needed.
                  {form.winName && <> Installed as: <strong>{form.winName}</strong></>}
                </span>
              </div>
            </div>
          )}

          {/* USB / Bluetooth → manual Windows printer name field */}
          {IS_ELECTRON && (
            <div className="pset-form-row">
              <div className="pset-form-field">
                <label>Windows printer name <span style={{ fontWeight: 400, color: "#999" }}>(USB only, optional)</span></label>
                <input
                  className="pset-input"
                  placeholder="e.g. EPSON TM-T82 Receipt"
                  value={form.winName}
                  onChange={e => setForm(f => ({ ...f, winName: e.target.value }))}
                />
                <span className="pset-field-hint">
                  For USB printers only — must match Windows → Devices and Printers exactly.
                  Use "List Windows Printers" above to auto-fill.
                  Leave blank if using network (IP) printing.
                </span>
              </div>
            </div>
          )}

          <div className="pset-form-actions">
            <button type="button" className="pset-cancel-btn"
              onClick={() => { setAdding(false); setEditId(null); setScanResults(null); setWinPrinterList(null); }}>Cancel</button>
            <button type="button" className="pset-save-btn" onClick={savePrinter}>
              {editId ? "Save Changes" : "Add Printer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tables Tab ────────────────────────────────────────────────────────────── */
function TablesTab() {
  const [areas, setAreas] = useState(() =>
    load("pos_table_config", [
      { id: "a1", name: "Main Hall",  tables: [
        { id: "t1", number: "T1", seats: 4 },
        { id: "t2", number: "T2", seats: 4 },
        { id: "t3", number: "T3", seats: 6 },
        { id: "t4", number: "T4", seats: 2 },
      ]},
      { id: "a2", name: "Terrace", tables: [
        { id: "t5", number: "T5", seats: 4 },
        { id: "t6", number: "T6", seats: 4 },
      ]}
    ])
  );
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
    save("pos_table_config", updated);
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

  const movements = load("pos_cash_movements", [])
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
              </p>
            ) : <p style={{ color: "#ef4444", fontSize: 13 }}>No branch linked</p>;
          } catch { return null; }
        })()}
        <button
          className="pset-forget-btn"
          onClick={() => {
            if (window.confirm("Unlink this device? You will need a new branch code on next launch.")) {
              localStorage.removeItem("pos_branch_config");
              window.location.reload();
            }
          }}
        >
          🔗 Forget this device &amp; re-link
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

/* ─── Main PosSettingsModal ─────────────────────────────────────────────────── */
export function PosSettingsModal({ cashierName, activeShift, onClose }) {
  const TABS = ["Printers", "Tables", "Cashier", "Display"];
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
          {tab === "Printers" && <PrinterTab />}
          {tab === "Tables"   && <TablesTab />}
          {tab === "Cashier"  && <CashierTab cashierName={cashierName} activeShift={activeShift} />}
          {tab === "Display"  && <DisplayTab />}
        </div>

        <div className="sm-footer">
          <button type="button" className="sm-btn-cancel" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
