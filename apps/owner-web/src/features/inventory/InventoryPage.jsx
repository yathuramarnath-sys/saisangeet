import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  INVENTORY_TRACKING_KEY,
  INVENTORY_WASTAGE_KEY,
  SESSIONS,
  UNITS,
} from "./inventory.seed";

/* ─────────────────────────────────────────────────────────────────────────────
   INVENTORY PAGE
   Outlets and menu items are loaded live from the API.
   Tracking config and wastage log are persisted in localStorage (POS reads them).
───────────────────────────────────────────────────────────────────────────── */

// ── localStorage helpers ──────────────────────────────────────────────────────

const WASTAGE_SIDES_KEY = "pos_wastage_sides";

function loadTracking() {
  try { return JSON.parse(localStorage.getItem(INVENTORY_TRACKING_KEY) || "null") || []; }
  catch { return []; }
}
function saveTracking(list) { localStorage.setItem(INVENTORY_TRACKING_KEY, JSON.stringify(list)); }

function loadWastage() {
  try { return JSON.parse(localStorage.getItem(INVENTORY_WASTAGE_KEY) || "null") || []; }
  catch { return []; }
}
function saveWastage(list) { localStorage.setItem(INVENTORY_WASTAGE_KEY, JSON.stringify(list)); }

function loadSides() {
  try { return JSON.parse(localStorage.getItem(WASTAGE_SIDES_KEY) || "null") || []; }
  catch { return []; }
}
function saveSides(list) { localStorage.setItem(WASTAGE_SIDES_KEY, JSON.stringify(list)); }

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ on, onChange, size = 36 }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      style={{
        width: size, height: size * 0.6, borderRadius: size * 0.3,
        border: "none", cursor: "pointer", background: on ? "#1a7a3a" : "#ccc",
        position: "relative", flexShrink: 0, transition: "background 0.2s"
      }}>
      <span style={{
        position: "absolute", top: size * 0.08,
        left: on ? size * 0.42 : size * 0.07,
        width: size * 0.44, height: size * 0.44,
        borderRadius: "50%", background: "#fff", transition: "left 0.2s"
      }} />
    </button>
  );
}

// ── Stock badge ───────────────────────────────────────────────────────────────

function StockBadge({ current, opening }) {
  if (!opening) return <span className="inv-badge neutral">—</span>;
  const pct = current / opening;
  if (current === 0)  return <span className="inv-badge out">Out</span>;
  if (pct < 0.25)     return <span className="inv-badge low">Low · {current}</span>;
  return <span className="inv-badge ok">{current}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function InventoryPage() {
  // Live data from API
  const [outlets,       setOutlets]       = useState([]);
  const [menuCatalog,   setMenuCatalog]   = useState([]);
  const [loading,       setLoading]       = useState(true);

  // localStorage-persisted state
  const [tracking,      setTracking]      = useState(loadTracking);
  const [wastage,       setWastage]       = useState(loadWastage);
  const [sides,         setSides]         = useState(loadSides);

  // UI state
  const [activeSession, setActiveSession] = useState("Lunch");
  const [activeCat,     setActiveCat]     = useState("All");
  const [msg,           setMsg]           = useState("");
  const [newSide,       setNewSide]       = useState("");

  // Wastage form — branch filled from first outlet once loaded
  const [form, setForm] = useState({
    item: "", unit: "Pcs", qty: "", pricePerUnit: "",
    session: "Lunch", branch: ""
  });

  // ── Load outlets + menu items from API ──────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/outlets").catch(() => []),
      api.get("/menu/items").catch(() => [])
    ]).then(([outletList, itemList]) => {
      const activeOutlets = (outletList || []).filter(o => o.isActive !== false);
      setOutlets(activeOutlets);

      // Normalise menu items: keep id, name, category
      const catalog = (itemList || []).map(item => ({
        id:       item.id,
        name:     item.name,
        category: item.categoryName || item.category || "General"
      }));
      setMenuCatalog(catalog);

      // Pre-select first outlet in wastage form
      if (activeOutlets.length > 0) {
        setForm(f => ({ ...f, branch: f.branch || activeOutlets[0].name }));
      }

      setLoading(false);
    });
  }, []);

  function flash(t) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  // ── Category filter ──────────────────────────────────────────────────────────

  const categories = ["All", ...new Set(menuCatalog.map(m => m.category))];
  const filteredCatalog = activeCat === "All"
    ? menuCatalog
    : menuCatalog.filter(m => m.category === activeCat);

  // ── Tracking toggle helpers ──────────────────────────────────────────────────

  function getT(id) {
    return tracking.find(t => t.id === id) || {
      id, trackingEnabled: false, posVisible: false, online: true, unit: "Pcs",
      sessions: {
        Breakfast: { opening: 0, current: 0 },
        Lunch:     { opening: 0, current: 0 },
        Dinner:    { opening: 0, current: 0 }
      }
    };
  }

  function updateT(id, changes) {
    const exists = tracking.find(t => t.id === id);
    const next = exists
      ? tracking.map(t => t.id === id ? { ...t, ...changes } : t)
      : [...tracking, { ...getT(id), ...changes }];
    setTracking(next);
    saveTracking(next);
  }

  function updateStock(id, session, field, val) {
    const t = getT(id);
    const next = tracking.find(x => x.id === id)
      ? tracking.map(x => x.id !== id ? x : {
          ...x,
          sessions: {
            ...x.sessions,
            [session]: { ...x.sessions[session], [field]: Math.max(0, Number(val) || 0) }
          }
        })
      : [...tracking, {
          ...t,
          sessions: {
            ...t.sessions,
            [session]: { ...t.sessions[session], [field]: Math.max(0, Number(val) || 0) }
          }
        }];
    setTracking(next);
    saveTracking(next);
  }

  // ── Wastage entry ─────────────────────────────────────────────────────────────

  const autoValue = form.qty && form.pricePerUnit
    ? (Number(form.qty) * Number(form.pricePerUnit)).toFixed(2)
    : "";

  function handleWastageSubmit(e) {
    e.preventDefault();
    if (!form.item || !form.qty) return;
    const entry = {
      id: `w-${Date.now()}`,
      item: form.item, qty: Number(form.qty),
      pricePerUnit: Number(form.pricePerUnit) || 0,
      value: Number(autoValue) || 0,
      unit: form.unit, session: form.session, branch: form.branch,
      enteredBy: "Manager",
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    };
    const next = [entry, ...wastage];
    setWastage(next); saveWastage(next);
    setForm(f => ({ ...f, item: "", qty: "", pricePerUnit: "" }));
    flash(`Wastage logged — ${entry.item}, ${entry.qty} ${entry.unit}, ₹${entry.value}`);
  }

  function handleAddSide(e) {
    e.preventDefault();
    const name = newSide.trim();
    if (!name || sides.includes(name)) return;
    const next = [...sides, name];
    setSides(next); saveSides(next);
    setNewSide("");
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const trackedItems    = tracking.filter(t => t.trackingEnabled);
  const totalWastageVal = wastage.reduce((s, w) => s + (w.value || 0), 0);
  const lowCount = trackedItems.filter(t => {
    const s = t.sessions[activeSession];
    return s?.opening > 0 && s.current / s.opening < 0.25;
  }).length;

  // All item names for wastage dropdown: menu items + custom sides
  const wastageItemNames = [...menuCatalog.map(m => m.name), ...sides];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">Owner Setup</p><h2>Inventory</h2></div>
        <div className="topbar-actions">
          <span className="status online">{trackedItems.length} items tracked</span>
        </div>
      </header>

      {/* Stats */}
      <div className="devices-stats" style={{ marginBottom: 20 }}>
        <div className="dev-stat"><strong>{trackedItems.length}</strong><span>Tracked</span></div>
        <div className={`dev-stat ${lowCount > 0 ? "warn" : ""}`}><strong>{lowCount}</strong><span>Low stock</span></div>
        <div className="dev-stat bad"><strong>{trackedItems.filter(t => !t.online).length}</strong><span>Offline items</span></div>
        <div className="dev-stat"><strong>₹{totalWastageVal.toLocaleString()}</strong><span>Wastage value</span></div>
      </div>

      {msg && <div className="mobile-banner">{msg}</div>}

      {/* ── Section 1: Enable Tracking ──────────────────────────────────────── */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <p className="eyebrow">Menu Items</p>
            <h3>Enable Inventory Tracking</h3>
          </div>
          <div className="inv-session-tabs">
            {categories.map(c => (
              <button key={c} className={`inv-session-tab${activeCat === c ? " active" : ""}`}
                onClick={() => setActiveCat(c)}>{c}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="inv-hint" style={{ padding: "20px 0" }}>Loading menu items…</p>
        ) : menuCatalog.length === 0 ? (
          <div className="inv-empty-state">
            <span>🍽️</span>
            <p>No menu items found. Go to <strong>Menu</strong> and add items first — they'll appear here for tracking.</p>
          </div>
        ) : (
          <>
            <div className="inv-toggle-head">
              <span>Item</span>
              <span>Tracking</span>
              <span>Show in POS</span>
              <span>Online</span>
            </div>
            <div className="inv-catalog">
              {filteredCatalog.map(item => {
                const t = getT(item.id);
                return (
                  <div key={item.id} className={`inv-catalog-row${t.trackingEnabled ? " enabled" : ""}`}>
                    <div className="inv-catalog-info">
                      <strong>{item.name}</strong>
                      <span>{item.category}</span>
                    </div>
                    <div className="inv-three-toggles">
                      <label className="inv-toggle-col">
                        <Toggle on={t.trackingEnabled} onChange={v => updateT(item.id, { trackingEnabled: v })} />
                        <span>{t.trackingEnabled ? "On" : "Off"}</span>
                      </label>
                      <label className="inv-toggle-col">
                        <Toggle on={t.posVisible} onChange={v => updateT(item.id, { posVisible: v })} />
                        <span>{t.posVisible ? "Yes" : "No"}</span>
                      </label>
                      <label className="inv-toggle-col">
                        <Toggle on={t.online !== false} onChange={v => updateT(item.id, { online: v })} />
                        <span>{t.online !== false ? "Live" : "Off"}</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── Section 2: Session stock ─────────────────────────────────────────── */}
      {trackedItems.length > 0 && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div><p className="eyebrow">Session Stock</p><h3>Update Stock by Session</h3></div>
            <div className="inv-session-tabs">
              {SESSIONS.map(s => (
                <button key={s} className={`inv-session-tab${activeSession === s ? " active" : ""}`}
                  onClick={() => setActiveSession(s)}>{s}</button>
              ))}
            </div>
          </div>
          <div className="inv-stock-table">
            <div className="inv-stock-head">
              <span>Item</span><span>Unit</span>
              <span>Opening qty</span><span>Current qty</span>
              <span>Status</span><span>POS</span>
            </div>
            {trackedItems.map(t => {
              const meta = menuCatalog.find(m => m.id === t.id);
              const sess = t.sessions?.[activeSession] || { opening: 0, current: 0 };
              return (
                <div key={t.id} className="inv-stock-row">
                  <span className="inv-item-name">{meta?.name || t.id}</span>
                  <span>
                    <select className="inv-unit-select" value={t.unit}
                      onChange={e => updateT(t.id, { unit: e.target.value })}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </span>
                  <span>
                    <input className="inv-qty-input" type="number" min="0" value={sess.opening}
                      onChange={e => updateStock(t.id, activeSession, "opening", e.target.value)} />
                  </span>
                  <span>
                    <input className="inv-qty-input" type="number" min="0" value={sess.current}
                      onChange={e => updateStock(t.id, activeSession, "current", e.target.value)} />
                  </span>
                  <span><StockBadge current={sess.current} opening={sess.opening} /></span>
                  <span><Toggle on={t.posVisible} onChange={v => updateT(t.id, { posVisible: v })} size={32} /></span>
                </div>
              );
            })}
          </div>
          <p className="inv-hint">Cashier or Manager updates at shift start and mid-service</p>
        </section>
      )}

      {/* ── Section 3: Wastage entry ─────────────────────────────────────────── */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <div><p className="eyebrow">Waste Control</p><h3>Production Wastage Entry</h3></div>
        </div>

        <form className="inv-wastage-form" onSubmit={handleWastageSubmit}>
          <label>
            Item
            <input list="wastage-items" placeholder="Select or type item name…"
              value={form.item} required
              onChange={e => setForm(f => ({ ...f, item: e.target.value }))} />
            <datalist id="wastage-items">
              {wastageItemNames.map(n => <option key={n} value={n} />)}
            </datalist>
          </label>

          <label>
            Pcs / Ltr / Kg
            <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>

          <label>
            Quantity
            <input type="number" min="0" placeholder="e.g. 3" value={form.qty} required
              onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
          </label>

          <label>
            Price per {form.unit} (₹)
            <input type="number" min="0" placeholder="Cost of one unit" value={form.pricePerUnit}
              onChange={e => setForm(f => ({ ...f, pricePerUnit: e.target.value }))} />
          </label>

          <label>
            Total wastage value
            <div className="inv-auto-value">
              {autoValue ? `₹${Number(autoValue).toLocaleString()}` : "—"}
            </div>
          </label>

          <label>
            Session
            <select value={form.session} onChange={e => setForm(f => ({ ...f, session: e.target.value }))}>
              {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label>
            Branch
            {loading ? (
              <select disabled><option>Loading…</option></select>
            ) : outlets.length === 0 ? (
              <select disabled><option>No branches found — create one in Outlets</option></select>
            ) : (
              <select value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}>
                {outlets.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
              </select>
            )}
          </label>

          <div className="inv-wastage-submit" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="primary-btn"
              disabled={outlets.length === 0}>Log Wastage</button>
          </div>
        </form>

        {/* Add custom sides / extras to wastage dropdown */}
        <div className="inv-sides-strip">
          <span>Sides / extras in wastage list:</span>
          <div className="inv-sides-chips">
            {sides.map(s => (
              <span key={s} className="inv-side-chip">
                {s}
                <button onClick={() => { const n = sides.filter(x => x !== s); setSides(n); saveSides(n); }}>✕</button>
              </span>
            ))}
          </div>
          <form onSubmit={handleAddSide} className="inv-sides-add">
            <input placeholder="Add side…" value={newSide}
              onChange={e => setNewSide(e.target.value)} />
            <button type="submit" className="ghost-chip" disabled={!newSide.trim()}>+ Add</button>
          </form>
        </div>
      </section>

      {/* ── Section 4: Wastage log ───────────────────────────────────────────── */}
      {wastage.length > 0 && (
        <section className="panel">
          <div className="panel-head" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div><p className="eyebrow">Wastage History</p><h3>All Wastage Entries</h3></div>
            <strong style={{ color:"#d32f2f", fontSize:"0.9rem" }}>₹{totalWastageVal.toLocaleString()} total</strong>
          </div>
          <div className="inv-log-table">
            <div className="inv-log-head">
              <span>Item</span><span>Qty</span><span>Unit</span>
              <span>₹/unit</span><span>Value (₹)</span>
              <span>Session</span><span>Branch</span><span>Time</span>
            </div>
            {wastage.map(w => (
              <div key={w.id} className="inv-log-row">
                <span>{w.item}</span>
                <span>{w.qty ?? w.amount}</span>
                <span>{w.unit}</span>
                <span>₹{w.pricePerUnit ?? "—"}</span>
                <span style={{ fontWeight: 700, color: "#d32f2f" }}>₹{(w.value || 0).toLocaleString()}</span>
                <span>{w.session}</span>
                <span>{w.branch}</span>
                <span>{w.time}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
