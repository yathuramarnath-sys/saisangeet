import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";
import { UNITS } from "./inventory.seed";

const WASTAGE_SIDES_KEY = "pos_wastage_sides";
const SESSIONS = ["Breakfast", "Lunch", "Dinner"];

function loadSides() {
  try { return JSON.parse(localStorage.getItem(WASTAGE_SIDES_KEY) || "null") || []; }
  catch { return []; }
}
function saveSides(list) { localStorage.setItem(WASTAGE_SIDES_KEY, JSON.stringify(list)); }

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

function StockBadge({ stock, lowStockLevel }) {
  if (stock === undefined || stock === null) return null;
  if (stock <= 0)                            return <span className="inv-badge out">Out</span>;
  if (lowStockLevel > 0 && stock <= lowStockLevel) return <span className="inv-badge low">Low · {stock}</span>;
  return <span className="inv-badge ok">{stock}</span>;
}

export function InventoryPage() {
  const [outlets,       setOutlets]       = useState([]);
  const [menuCatalog,   setMenuCatalog]   = useState([]);
  const [loading,       setLoading]       = useState(true);

  // Per-outlet stock config from backend: { allowNegative, trackedItems }
  const [stockConfig,   setStockConfig]   = useState({ allowNegative: false, trackedItems: [] });
  // Per-outlet live stock snapshot: { [itemId]: { currentStock, lowStockLevel } }
  const [stockSnapshot, setStockSnapshot] = useState({});
  const [configSaving,  setConfigSaving]  = useState(false);

  const [wastage,       setWastage]       = useState([]);
  const [sides,         setSides]         = useState(loadSides);
  // { [itemId]: { posVisible: bool, online: bool } } — loaded from server
  const [visibility,    setVisibility]    = useState({});
  const [activeBranch,  setActiveBranch]  = useState(null);
  const [activeCat,     setActiveCat]     = useState("All");
  const [searchQ,       setSearchQ]       = useState("");
  const [invPage,       setInvPage]       = useState(1);
  const [msg,           setMsg]           = useState("");
  const [newSide,       setNewSide]       = useState("");
  const INV_PER_PAGE = 20;

  const [form, setForm] = useState({
    item: "", unit: "Pcs", qty: "", pricePerUnit: "",
    session: "Lunch", branch: ""
  });

  function flash(t) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  // ── Load outlets on mount ──────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/outlets").catch(() => []),
      api.get("/inventory/item-visibility").catch(() => ({})),
    ]).then(([outletList, serverVis]) => {
      const active = (outletList || []).filter(o => o.isActive !== false);
      setOutlets(active);
      if (active.length > 0) {
        setForm(f => ({ ...f, branch: f.branch || active[0].name }));
        setActiveBranch(prev => prev ?? active[0].id);
      }
      // Build visibility map from server — default posVisible/online to true if not in response
      if (serverVis && typeof serverVis === "object") {
        const map = {};
        for (const [itemId, state] of Object.entries(serverVis)) {
          map[itemId] = {
            posVisible: state.posVisible !== false,
            online:     state.online     !== false,
          };
        }
        setVisibility(map);
      }
      setLoading(false);
    });
  }, []);

  // ── Reload menu items whenever active branch changes ───────────────────────
  useEffect(() => {
    if (loading || !activeBranch) return;
    const url = activeBranch !== "all"
      ? `/menu/items?outletId=${activeBranch}`
      : "/menu/items";
    api.get(url).catch(() => []).then(itemList => {
      setMenuCatalog((itemList || []).map(item => ({
        id:       item.id,
        name:     item.name,
        category: item.categoryName || item.category || "General",
      })));
      setActiveCat("All");
      setInvPage(1);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch]);

  // ── Load stock config + snapshot when outlet changes ──────────────────────
  const loadBranchStock = useCallback(async (outletId) => {
    if (!outletId || outletId === "all") return;
    try {
      const [cfg, snap] = await Promise.all([
        api.get(`/inventory/stock/config?outletId=${outletId}`).catch(() => null),
        api.get(`/inventory/stock/snapshot?outletId=${outletId}`).catch(() => null),
      ]);
      if (cfg)  setStockConfig(cfg);
      if (snap) setStockSnapshot(snap);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (activeBranch && activeBranch !== "all") loadBranchStock(activeBranch);
  }, [activeBranch, loadBranchStock]);

  // Reset page when filters change
  useEffect(() => { setInvPage(1); }, [searchQ, activeCat, activeBranch]);

  // ── Save stock config to backend ───────────────────────────────────────────
  async function saveStockConfig(patch) {
    if (!activeBranch || activeBranch === "all") return;
    const next = { ...stockConfig, ...patch };
    setStockConfig(next);
    setConfigSaving(true);
    try {
      await api.put("/inventory/stock/config", {
        outletId:      activeBranch,
        allowNegative: next.allowNegative,
        trackedItems:  next.trackedItems,
      });
    } catch (_) { flash("Failed to save — check connection"); }
    finally { setConfigSaving(false); }
  }

  function toggleTracking(itemId, on) {
    const current = stockConfig.trackedItems || [];
    const next = on
      ? [...new Set([...current, itemId])]
      : current.filter(id => id !== itemId);
    saveStockConfig({ trackedItems: next });
  }

  // POS Visible + Online toggles go to item-visibility endpoint + update local state
  function togglePosVisible(itemId, on) {
    setVisibility(v => ({ ...v, [itemId]: { ...(v[itemId] || {}), posVisible: on } }));
    api.post("/inventory/item-visibility", { itemId, posVisible: on }).catch(() => {});
  }
  function toggleOnline(itemId, on) {
    setVisibility(v => ({ ...v, [itemId]: { ...(v[itemId] || {}), online: on } }));
    api.post("/inventory/item-visibility", { itemId, online: on }).catch(() => {});
  }

  // ── Search + category filter ───────────────────────────────────────────────
  const categories = ["All", ...new Set(menuCatalog.map(m => m.category))];
  const filteredCatalog = menuCatalog.filter(m => {
    const matchesCat    = activeCat === "All" || m.category === activeCat;
    const q             = searchQ.trim().toLowerCase();
    const matchesSearch = !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });
  const totalInvPages = Math.max(1, Math.ceil(filteredCatalog.length / INV_PER_PAGE));
  const pagedCatalog  = filteredCatalog.slice((invPage - 1) * INV_PER_PAGE, invPage * INV_PER_PAGE);

  const trackedSet = new Set(stockConfig.trackedItems || []);
  const trackedCount = (stockConfig.trackedItems || []).filter(id =>
    menuCatalog.some(m => m.id === id)
  ).length;

  // ── Load today's wastage from API on mount ────────────────────────────────
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    api.get(`/operations/wastage?dateFrom=${today}&dateTo=${today}`)
      .then(entries => {
        if (Array.isArray(entries)) {
          setWastage(entries.map(e => ({
            id: e.id, item: e.itemName, qty: e.quantity,
            unit: e.unit, value: 0,
            pricePerUnit: "", session: "", branch: e.outletId || "",
            time: new Date(e.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
          })));
        }
      })
      .catch(() => {});
  }, []);

  // ── Wastage form ───────────────────────────────────────────────────────────
  const autoValue = form.qty && form.pricePerUnit
    ? (Number(form.qty) * Number(form.pricePerUnit)).toFixed(2)
    : "";
  const totalWastageVal = wastage.reduce((s, w) => s + (w.value || 0), 0);
  const wastageItemNames = [...menuCatalog.map(m => m.name), ...sides];

  async function handleWastageSubmit(e) {
    e.preventDefault();
    if (!form.item || !form.qty) return;
    const outletObj = outlets.find(o => o.name === form.branch);
    try {
      const saved = await api.post("/operations/wastage", {
        itemName:     form.item,
        unit:         form.unit,
        quantity:     Number(form.qty),
        pricePerUnit: Number(form.pricePerUnit) || 0,
        value:        Number(autoValue) || 0,
        reason:       "Production Waste",
        note:         `Session: ${form.session}`,
        outletId:     outletObj?.id || "",
        cashierName:  "Owner",
      });
      const entry = {
        id: saved.id, item: saved.itemName, qty: saved.quantity,
        pricePerUnit: Number(form.pricePerUnit) || 0,
        value: Number(autoValue) || 0,
        unit: saved.unit, session: form.session, branch: form.branch,
        time: new Date(saved.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
      };
      setWastage(prev => [entry, ...prev]);
      setForm(f => ({ ...f, item: "", qty: "", pricePerUnit: "" }));
      flash(`Wastage logged — ${entry.item}, ${entry.qty} ${entry.unit}`);
    } catch (err) {
      flash(`Failed to log wastage: ${err?.message || "check connection"}`);
    }
  }

  function handleAddSide(e) {
    e.preventDefault();
    const name = newSide.trim();
    if (!name || sides.includes(name)) return;
    const next = [...sides, name];
    setSides(next); saveSides(next);
    setNewSide("");
  }

  const selectedOutlet = outlets.find(o => o.id === activeBranch);

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">Owner Setup</p><h2>Inventory</h2></div>
        <div className="topbar-actions">
          <span className="status online">{trackedCount} items tracked</span>
        </div>
      </header>

      {/* Stats */}
      <div className="devices-stats" style={{ marginBottom: 20 }}>
        <div className="dev-stat"><strong>{trackedCount}</strong><span>Tracked</span></div>
        <div className="dev-stat">
          <strong>
            {Object.entries(stockSnapshot).filter(([, s]) => s.currentStock <= 0 && !stockConfig.allowNegative).length}
          </strong>
          <span>Out of stock</span>
        </div>
        <div className="dev-stat warn">
          <strong>
            {Object.entries(stockSnapshot).filter(([, s]) => s.currentStock > 0 && s.lowStockLevel > 0 && s.currentStock <= s.lowStockLevel).length}
          </strong>
          <span>Low stock</span>
        </div>
        <div className="dev-stat"><strong>₹{totalWastageVal.toLocaleString()}</strong><span>Wastage value</span></div>
      </div>

      {msg && <div className="mobile-banner">{msg}</div>}

      {/* ── Section 1: Track Items ─────────────────────────────────────────── */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <p className="eyebrow">Menu Items</p>
            <h3>Enable Inventory Tracking</h3>
          </div>
          <span className="inv-count-badge">
            {filteredCatalog.length} of {menuCatalog.length} items
            {filteredCatalog.length > INV_PER_PAGE && (
              <span style={{ marginLeft: 6, color: "#6b7280" }}>· page {invPage}/{totalInvPages}</span>
            )}
          </span>
        </div>

        {/* Branch tabs */}
        {outlets.length > 1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {outlets.map(o => (
              <button key={o.id} className="shift-filter-tab"
                onClick={() => setActiveBranch(o.id)}
                style={{
                  fontWeight:  activeBranch === o.id ? 700 : 500,
                  background:  activeBranch === o.id ? "#059669" : undefined,
                  color:       activeBranch === o.id ? "#fff" : undefined,
                  borderColor: activeBranch === o.id ? "#059669" : undefined,
                }}>
                🏪 {o.name}
              </button>
            ))}
          </div>
        )}

        {/* allowNegative setting for this outlet */}
        {activeBranch && activeBranch !== "all" && (
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16,
            padding:"10px 14px", background:"#f0fdf4", borderRadius:8, border:"1px solid #bbf7d0" }}>
            <Toggle
              on={stockConfig.allowNegative === true}
              onChange={v => saveStockConfig({ allowNegative: v })}
              size={34}
            />
            <div>
              <strong style={{ fontSize:"0.88rem", color:"#111827" }}>Allow negative stock</strong>
              <p style={{ margin:0, fontSize:"0.78rem", color:"#6b7280" }}>
                OFF = POS blocks adding to cart when stock hits 0 &nbsp;|&nbsp; ON = allows selling even when stock runs out
              </p>
            </div>
            {configSaving && <span style={{ fontSize:"0.75rem", color:"#6b7280" }}>Saving…</span>}
          </div>
        )}

        {/* Search + Category filter */}
        <div className="inv-filter-bar">
          <div className="inv-search-wrap">
            <svg className="inv-search-icon" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="inv-search-input" type="text" placeholder="Search items…"
              value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            {searchQ && (
              <button type="button" className="inv-search-clear" onClick={() => setSearchQ("")}>✕</button>
            )}
          </div>
          <div className="inv-cat-pills" style={{ overflowX:"auto", flexWrap:"nowrap", paddingBottom:4 }}>
            {categories.map(c => (
              <button key={c} className={`inv-cat-pill${activeCat === c ? " active" : ""}`}
                onClick={() => setActiveCat(c)} style={{ flexShrink:0 }}>
                {c}
                {c !== "All" && (
                  <span className="inv-cat-pill-count">
                    {menuCatalog.filter(m => m.category === c).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="inv-hint" style={{ padding:"20px 0" }}>Loading menu items…</p>
        ) : menuCatalog.length === 0 ? (
          <div className="inv-empty-state">
            <span>🍽️</span>
            <p>No menu items found. Go to <strong>Menu</strong> and add items first.</p>
          </div>
        ) : filteredCatalog.length === 0 ? (
          <div className="inv-empty-state">
            <span>🔍</span>
            <p>No items match <strong>"{searchQ}"</strong>{activeCat !== "All" ? ` in ${activeCat}` : ""}.</p>
            <button className="ghost-chip" onClick={() => { setSearchQ(""); setActiveCat("All"); }}>Clear filters</button>
          </div>
        ) : (
          <>
            <div className="inv-toggle-head">
              <span>Item</span>
              <span>Track Stock</span>
              <span>Show in POS</span>
              <span>Online</span>
              <span>Live Stock</span>
            </div>
            <div className="inv-catalog">
              {pagedCatalog.map(item => {
                const tracked = trackedSet.has(item.id);
                const snap    = stockSnapshot[item.id];
                return (
                  <div key={item.id} className={`inv-catalog-row${tracked ? " enabled" : ""}`}>
                    <div className="inv-catalog-info">
                      <strong>{item.name}</strong>
                      <span>{item.category}</span>
                    </div>
                    <div className="inv-three-toggles">
                      <label className="inv-toggle-col">
                        <Toggle on={tracked} onChange={v => toggleTracking(item.id, v)} />
                        <span>{tracked ? "On" : "Off"}</span>
                      </label>
                      <label className="inv-toggle-col">
                        {(() => { const posVis = visibility[item.id]?.posVisible !== false; return <>
                          <Toggle on={posVis} onChange={v => togglePosVisible(item.id, v)} />
                          <span>{posVis ? "Yes" : "No"}</span>
                        </>; })()}
                      </label>
                      <label className="inv-toggle-col">
                        {(() => { const online = visibility[item.id]?.online !== false; return <>
                          <Toggle on={online} onChange={v => toggleOnline(item.id, v)} />
                          <span>{online ? "Live" : "Off"}</span>
                        </>; })()}
                      </label>
                      <div className="inv-toggle-col" style={{ alignItems:"center" }}>
                        {tracked && snap != null ? (
                          <StockBadge stock={snap.currentStock} lowStockLevel={snap.lowStockLevel} />
                        ) : tracked ? (
                          <span className="inv-badge neutral">—</span>
                        ) : (
                          <span style={{ color:"#9ca3af", fontSize:"0.78rem" }}>—</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalInvPages > 1 && (
              <div className="pg-bar" style={{ marginTop: 16 }}>
                <button className="pg-btn" disabled={invPage === 1}
                  onClick={() => setInvPage(p => p - 1)}>‹ Prev</button>
                {Array.from({ length: totalInvPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalInvPages || Math.abs(p - invPage) <= 1)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) => p === "…"
                    ? <span key={`e${i}`} className="pg-ellipsis">…</span>
                    : <button key={p} className={`pg-btn${invPage === p ? " active" : ""}`}
                        onClick={() => setInvPage(p)}>{p}</button>
                  )}
                <button className="pg-btn" disabled={invPage === totalInvPages}
                  onClick={() => setInvPage(p => p + 1)}>Next ›</button>
                <span className="pg-info">
                  {(invPage - 1) * INV_PER_PAGE + 1}–{Math.min(invPage * INV_PER_PAGE, filteredCatalog.length)} of {filteredCatalog.length}
                </span>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Section 2: Live stock levels (read-only for owner) ──────────────── */}
      {trackedCount > 0 && activeBranch && activeBranch !== "all" && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <p className="eyebrow">Live Stock — {selectedOutlet?.name}</p>
              <h3>Current Stock Levels</h3>
            </div>
            <button className="ghost-chip" onClick={() => loadBranchStock(activeBranch)}>↻ Refresh</button>
          </div>
          <p className="inv-hint" style={{ marginBottom: 12 }}>
            Cashiers update stock from the <strong>POS → 📦 Stock</strong> panel. Stock deducts automatically when KOT is sent.
          </p>
          <div className="inv-stock-table">
            <div className="inv-stock-head">
              <span>Item</span>
              <span>Current Stock</span>
              <span>Low Stock Threshold</span>
              <span>Status</span>
            </div>
            {(stockConfig.trackedItems || []).map(itemId => {
              const meta = menuCatalog.find(m => m.id === itemId);
              if (!meta) return null;
              const snap = stockSnapshot[itemId];
              return (
                <div key={itemId} className="inv-stock-row">
                  <span className="inv-item-name">{meta.name}</span>
                  <span style={{ fontWeight: 600 }}>{snap?.currentStock ?? "—"}</span>
                  <span style={{ color: "#6b7280" }}>
                    {snap?.lowStockLevel > 0 ? snap.lowStockLevel : "—"}
                  </span>
                  <span>
                    {snap != null
                      ? <StockBadge stock={snap.currentStock} lowStockLevel={snap.lowStockLevel} />
                      : <span className="inv-badge neutral">—</span>
                    }
                  </span>
                </div>
              );
            })}
          </div>
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
              <select disabled><option>No branches found</option></select>
            ) : (
              <select value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}>
                {outlets.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
              </select>
            )}
          </label>

          <div className="inv-wastage-submit" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="primary-btn" disabled={outlets.length === 0}>Log Wastage</button>
          </div>
        </form>

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
