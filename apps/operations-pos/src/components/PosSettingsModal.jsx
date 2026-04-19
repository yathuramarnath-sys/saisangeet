import { useState } from "react";
import { printKOT } from "../lib/kotPrint";

/* ══════════════════════════════════════════════════════════════════════════════
   POS Settings Modal
   Tabs: Printers · Tables · Cashier · Display
   ══════════════════════════════════════════════════════════════════════════════ */

const PRINTER_TYPES  = ["Bill Printer", "KOT Printer", "Both"];
const PRINTER_CONNS  = ["USB", "Network (IP)", "Bluetooth"];
const PAPER_SIZES    = ["80mm", "58mm"];

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
  catch { return fallback; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

/* ─── Printer Tab ──────────────────────────────────────────────────────────── */
function PrinterTab() {
  const [printers, setPrinters] = useState(() =>
    load("pos_printers", [
      { id: "p1", name: "Bill Counter", type: "Bill Printer", conn: "USB",         ip: "",              paper: "80mm", isDefault: true  },
      { id: "p2", name: "Kitchen KOT",  type: "KOT Printer",  conn: "Network (IP)", ip: "192.168.1.101", paper: "80mm", isDefault: false }
    ])
  );
  const [adding, setAdding] = useState(false);
  const [form,   setForm]   = useState({ name: "", type: "Bill Printer", conn: "USB", ip: "", paper: "80mm" });

  function addPrinter() {
    if (!form.name.trim()) return;
    const updated = [...printers, { ...form, id: `p${Date.now()}`, isDefault: printers.length === 0 }];
    setPrinters(updated);
    save("pos_printers", updated);
    setAdding(false);
    setForm({ name: "", type: "Bill Printer", conn: "USB", ip: "", paper: "80mm" });
  }

  function removePrinter(id) {
    const updated = printers.filter(p => p.id !== id);
    setPrinters(updated);
    save("pos_printers", updated);
  }

  function setDefault(id) {
    const updated = printers.map(p => ({ ...p, isDefault: p.id === id }));
    setPrinters(updated);
    save("pos_printers", updated);
  }

  return (
    <div className="pset-section">
      <div className="pset-section-head">
        <div>
          <h4>Printer Setup</h4>
          <p>Configure bill and KOT printers for this terminal</p>
        </div>
        <button type="button" className="pset-add-btn" onClick={() => setAdding(true)}>
          + Add Printer
        </button>
      </div>

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
                {p.type} · {p.conn} {p.ip ? `· ${p.ip}` : ""} · {p.paper}
              </div>
            </div>
            <div className="pset-printer-actions">
              <button type="button" className="pset-txt-btn"
                title="Print a test KOT to verify this printer"
                onClick={() => printKOT(
                  { outletName: "Test Print", tableNumber: "T1", areaName: "Main Hall", kotNumber: "KOT-0001", guests: 2, isCounter: false },
                  [{ name: "Paneer Tikka", quantity: 2, note: "Less spicy" }, { name: "Butter Naan", quantity: 3, note: "" }],
                  p, 1
                )}>
                🖨 Test
              </button>
              {!p.isDefault && (
                <button type="button" className="pset-txt-btn" onClick={() => setDefault(p.id)}>
                  Set Default
                </button>
              )}
              <button type="button" className="pset-icon-btn danger" onClick={() => removePrinter(p.id)}>
                🗑
              </button>
            </div>
          </div>
        ))}
        {printers.length === 0 && (
          <div className="pset-empty">No printers configured. Add one to enable printing.</div>
        )}
      </div>

      {/* Add printer form */}
      {adding && (
        <div className="pset-add-form">
          <div className="pset-form-row">
            <div className="pset-form-field">
              <label>Printer Name</label>
              <input className="pset-input" placeholder="e.g. Bill Counter"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="pset-form-field">
              <label>Type</label>
              <select className="pset-select"
                value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {PRINTER_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="pset-form-row">
            <div className="pset-form-field">
              <label>Connection</label>
              <select className="pset-select"
                value={form.conn} onChange={e => setForm(f => ({ ...f, conn: e.target.value }))}>
                {PRINTER_CONNS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {form.conn === "Network (IP)" && (
              <div className="pset-form-field">
                <label>IP Address</label>
                <input className="pset-input" placeholder="192.168.1.100"
                  value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} />
              </div>
            )}
            <div className="pset-form-field">
              <label>Paper Size</label>
              <select className="pset-select"
                value={form.paper} onChange={e => setForm(f => ({ ...f, paper: e.target.value }))}>
                {PAPER_SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="pset-form-actions">
            <button type="button" className="pset-cancel-btn" onClick={() => setAdding(false)}>Cancel</button>
            <button type="button" className="pset-save-btn" onClick={addPrinter}>Add Printer</button>
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

  const currentArea = areas.find(a => a.id === activeArea);

  function persist(updated) { setAreas(updated); save("pos_table_config", updated); }

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
          <p>Create areas and manage tables</p>
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
