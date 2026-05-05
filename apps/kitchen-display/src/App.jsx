import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "./lib/api";
import {
  getStockState,
  setItemAvailability,
  subscribeStock,
  resetAllToAvailable,
} from "../../../packages/shared-types/src/stockAvailability.js";
import {
  sharedCategories,
  sharedMenuItems,
} from "../../../packages/shared-types/src/restaurantFlow.js";

// ─── Audio ────────────────────────────────────────────────────────────────────

function playNewKotAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36].forEach((delay) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.16);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.18);
    });
  } catch (_) {}
}

// ─── Ticket persistence ───────────────────────────────────────────────────────

const KDS_TICKETS_KEY = "kds_active_tickets";

function loadSavedTickets() {
  try { return JSON.parse(localStorage.getItem(KDS_TICKETS_KEY) || "null") || []; }
  catch { return []; }
}

function saveTickets(tickets) {
  try { localStorage.setItem(KDS_TICKETS_KEY, JSON.stringify(tickets)); } catch (_) {}
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

const SETTINGS_VERSION = 2; // bump this whenever defaults change significantly

const DEFAULT_SETTINGS = {
  _version:        SETTINGS_VERSION,
  columns:         2,           // 2 columns: New + Preparing only
  cardSize:        "normal",   // compact | normal | large
  showSource:      true,
  showArea:        true,
  soundEnabled:    true,
  flashOnNew:      true,
  warnMinutes:     5,
  urgentMinutes:   10,
  autoBumpSeconds: 0,          // 0 = off | 30 | 60 | 120
  stations:        [],          // loaded from Owner Console via /kitchen-stations API
  assignedStation: "",          // "" = show all | "South Indian" = only that station's KOTs
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("kds_settings") || "{}");
    // If saved settings are from old version (hardcoded stations, 3 columns),
    // reset to defaults so new API-loaded stations take over
    if (!saved._version || saved._version < SETTINGS_VERSION) {
      localStorage.removeItem("kds_settings");
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
  try { localStorage.setItem("kds_settings", JSON.stringify(s)); } catch (_) {}
}

// ─── KDS Branch Config (localStorage) ────────────────────────────────────────

const KDS_LS_KEY = "kds_branch_config";

function loadKdsBranchConfig() {
  try { return JSON.parse(localStorage.getItem(KDS_LS_KEY) || "null"); }
  catch { return null; }
}
function saveKdsBranchConfig(cfg) {
  localStorage.setItem(KDS_LS_KEY, JSON.stringify(cfg));
}
function clearKdsBranchConfig() {
  localStorage.removeItem(KDS_LS_KEY);
}

// ─── KDS Branch Setup Screen ──────────────────────────────────────────────────

function KdsBranchSetupScreen({ onComplete }) {
  const [code,     setCode]     = useState("");
  const [status,   setStatus]   = useState("idle");
  const [result,   setResult]   = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleVerify(e) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const data = await api.post("/devices/resolve-link-code", {
        linkCode:   trimmed,
        deviceType: "Plato KDS",
      });
      setResult(data);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message || "Invalid link code — check with your manager.");
    }
  }

  function handleConfirm() {
    const config = {
      outletId:     result.outletId,
      outletCode:   result.outletCode,
      outletName:   result.outletName,
      configuredAt: new Date().toISOString(),
    };
    saveKdsBranchConfig(config);
    // Save device token so all API calls use the correct tenant
    if (result.deviceToken) {
      localStorage.setItem("kds_token", result.deviceToken);
    }
    onComplete(config);
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0a0c10 0%, #111827 100%)",
      fontFamily: "'Manrope', sans-serif", padding: 24,
    }}>
      <div style={{
        background: "#111827", border: "1px solid #1f2937", borderRadius: 20,
        padding: "48px 40px", width: "100%", maxWidth: 420,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "rgba(255,255,255,0.1)",
          color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4,
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9"/>
            <path d="M8 12h8" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f9fafb", margin: 0 }}>Plato KDS</h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Station Setup
        </p>

        {status !== "success" ? (
          <>
            <p style={{ fontSize: 14, color: "#9ca3af", textAlign: "center", margin: "0 0 20px", lineHeight: 1.6 }}>
              Enter the branch link code from<br />
              <strong style={{ color: "#e5e7eb" }}>Owner Web → Outlets → Link Device</strong>
            </p>
            <form style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }} onSubmit={handleVerify}>
              <input
                style={{
                  width: "100%", padding: "16px 18px", fontSize: 22, fontWeight: 700,
                  letterSpacing: "0.12em", textAlign: "center",
                  background: "#0a0c10", border: `2px solid ${status === "error" ? "#ef4444" : "#1f2937"}`,
                  borderRadius: 12, color: "#f9fafb", outline: "none",
                  fontFamily: "monospace", boxSizing: "border-box",
                }}
                type="text" value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setStatus("idle"); }}
                placeholder="e.g. VNB2-92345678" maxLength={20}
                autoFocus autoComplete="off" spellCheck={false}
              />
              {status === "error" && (
                <p style={{ color: "#f87171", fontSize: 13, textAlign: "center", margin: 0 }}>⚠ {errorMsg}</p>
              )}
              <button
                style={{
                  width: "100%", padding: 15,
                  background: status === "loading" ? "#374151" : "linear-gradient(135deg, #059669, #047857)",
                  color: "#fff", border: "none", borderRadius: 12,
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  opacity: (status === "loading" || !code.trim()) ? 0.5 : 1,
                  fontFamily: "'Manrope', sans-serif",
                }}
                type="submit" disabled={status === "loading" || !code.trim()}
              >
                {status === "loading" ? "Verifying…" : "Connect Station →"}
              </button>
            </form>
            <p style={{ fontSize: 12, color: "#4b5563", textAlign: "center", margin: "4px 0 0" }}>
              Code looks like <code style={{ background: "#0a0c10", padding: "1px 6px", borderRadius: 4, color: "#9ca3af" }}>VNB2-92345678</code>
            </p>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff", fontSize: 28, display: "flex", alignItems: "center",
              justifyContent: "center", fontWeight: 700, marginBottom: 4,
            }}>✓</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f9fafb", margin: 0 }}>{result.outletName}</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
              {result.tables?.length || 0} tables · KDS ready
            </p>
            <button
              style={{
                width: "100%", padding: 15,
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#fff", border: "none", borderRadius: 12,
                fontSize: 15, fontWeight: 700, cursor: "pointer",
                fontFamily: "'Manrope', sans-serif",
              }}
              onClick={handleConfirm}
            >
              Start Kitchen Display →
            </button>
            <button
              style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, cursor: "pointer", padding: 8, textDecoration: "underline" }}
              onClick={() => { setStatus("idle"); setResult(null); setCode(""); }}
            >
              ← Wrong outlet?
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsedLabel(createdAt) {
  if (!createdAt) return "0:00";
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function urgencyLevel(createdAt, warnMin, urgentMin) {
  if (!createdAt) return 0;
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (secs > urgentMin * 60) return 2;
  if (secs > warnMin   * 60) return 1;
  return 0;
}

const SOURCE = {
  pos:     { label: "POS",     color: "#60a5fa", bg: "rgba(96,165,250,0.14)"  },
  captain: { label: "Captain", color: "#fbbf24", bg: "rgba(251,191,36,0.14)"  },
  online:  { label: "Online",  color: "#a78bfa", bg: "rgba(167,139,250,0.14)" },
};

// ─── Demo data ────────────────────────────────────────────────────────────────

function makeDemoTickets() {
  const n = Date.now();
  return [
    { id:"d1", kotNumber:"001", tableNumber:"3",  areaName:"AC Hall 1",   station:"Hot",       source:"pos",     status:"new",      createdAt:new Date(n-95000).toISOString(),  doneItems:[], items:[{id:"d1-1",name:"Paneer Butter Masala",quantity:2,note:"Less spicy"},{id:"d1-2",name:"Butter Naan",quantity:3}] },
    { id:"d2", kotNumber:"002", tableNumber:"7",  areaName:"Family Hall", station:"Beverages", source:"captain", status:"preparing", createdAt:new Date(n-245000).toISOString(), doneItems:["d2-1"], items:[{id:"d2-1",name:"Masala Chai",quantity:2},{id:"d2-2",name:"Cold Coffee",quantity:1,note:"No sugar"}] },
    { id:"d3", kotNumber:"003", tableNumber:"—",  areaName:"Swiggy",      station:"Hot",       source:"online",  status:"new",      createdAt:new Date(n-425000).toISOString(), doneItems:[], items:[{id:"d3-1",name:"Dal Makhani",quantity:1},{id:"d3-2",name:"Jeera Rice",quantity:2},{id:"d3-3",name:"Raita",quantity:1,note:"No onion"}] },
    { id:"d4", kotNumber:"004", tableNumber:"5",  areaName:"AC Hall 1",   station:"Hot",       source:"captain", status:"preparing", createdAt:new Date(n-610000).toISOString(), doneItems:["d4-1","d4-2"], items:[{id:"d4-1",name:"Chicken Tikka",quantity:1},{id:"d4-2",name:"Roomali Roti",quantity:2}] },
    { id:"d5", kotNumber:"005", tableNumber:"2",  areaName:"Family Hall", station:"Grill",     source:"pos",     status:"preparing", createdAt:new Date(n-185000).toISOString(), doneItems:[], items:[{id:"d5-1",name:"Veg Seekh Kebab",quantity:2,note:"Extra mint chutney"},{id:"d5-2",name:"Tandoori Roti",quantity:4}] },
    { id:"d6", kotNumber:"006", tableNumber:"—",  areaName:"Zomato",      station:"Beverages", source:"online",  status:"new",      createdAt:new Date(n-60000).toISOString(),  doneItems:[], items:[{id:"d6-1",name:"Mango Lassi",quantity:2},{id:"d6-2",name:"Sweet Lassi",quantity:1}] },
  ];
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

const SETTING_TABS = [
  { id: "display",  label: "Display",       icon: "⊞" },
  { id: "alerts",   label: "Timers & Alerts", icon: "⏱" },
  { id: "actions",  label: "Auto Actions",  icon: "⚡" },
  { id: "stations", label: "Stations",      icon: "🍳" },
  { id: "stock",    label: "Stock",         icon: "📦" },
];

function Toggle({ value, onChange }) {
  return (
    <button
      className={`kds-toggle${value ? " on" : ""}`}
      onClick={() => onChange(!value)}
    >
      <span className="kds-toggle-thumb" />
    </button>
  );
}

function SettingRow({ label, sub, children }) {
  return (
    <div className="kds-setting-row">
      <div className="kds-setting-label">
        <span>{label}</span>
        {sub && <p>{sub}</p>}
      </div>
      <div className="kds-setting-control">{children}</div>
    </div>
  );
}

function KdsSettingsPanel({ settings, onUpdate, onClose, onForgetDevice, outletName, menuData }) {
  const [tab,        setTab]        = useState("display");
  const [newStation, setNewStation] = useState("");
  const [stockState, setStockState] = useState(() => getStockState());

  // Keep in sync with POS / Captain App changes in other tabs
  useEffect(() => {
    const unsub = subscribeStock(s => setStockState({ ...s }));
    return unsub;
  }, []);

  function toggleStock(itemId, available) {
    setItemAvailability(itemId, available);
    setStockState(getStockState());
  }

  function resetAllStock() {
    resetAllToAvailable();
    setStockState({});
  }

  function set(key, val) { onUpdate({ ...settings, [key]: val }); }

  // ── Display ────────────────────────────────────────────────────────────────
  const DisplayTab = () => (
    <div className="kds-settings-section">

      <SettingRow
        label="This Screen's Station"
        sub="Lock this screen to one kitchen station. Only orders for that station appear here. Leave blank to show all."
      >
        <select
          style={{
            background: "#0a0c10", border: "1px solid #374151", borderRadius: 8,
            color: "#f9fafb", padding: "6px 10px", fontSize: 13, fontFamily: "'Manrope', sans-serif",
            fontWeight: 700, cursor: "pointer", minWidth: 140,
          }}
          value={settings.assignedStation || ""}
          onChange={e => set("assignedStation", e.target.value)}
        >
          <option value="">— All Stations —</option>
          {(settings.stations || []).map(s => (
            <option key={s.id || s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </SettingRow>

      <SettingRow label="Columns" sub="Number of status columns on screen">
        <div className="kds-seg">
          {[2,3,4].map(n => (
            <button key={n} className={`kds-seg-btn${settings.columns === n ? " active" : ""}`}
              onClick={() => set("columns", n)}>{n}</button>
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Card Size" sub="Size of each KOT ticket card">
        <div className="kds-seg">
          {["compact","normal","large"].map(s => (
            <button key={s} className={`kds-seg-btn${settings.cardSize === s ? " active" : ""}`}
              onClick={() => set("cardSize", s)}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Show Source Badge" sub="Display POS / Captain / Online on each card">
        <Toggle value={settings.showSource} onChange={v => set("showSource", v)} />
      </SettingRow>

      <SettingRow label="Show Area Name" sub="Show seating area below table number">
        <Toggle value={settings.showArea} onChange={v => set("showArea", v)} />
      </SettingRow>
    </div>
  );

  // ── Alerts ─────────────────────────────────────────────────────────────────
  const AlertsTab = () => (
    <div className="kds-settings-section">
      <SettingRow label="Sound Alert" sub="Triple beep when a new KOT arrives">
        <Toggle value={settings.soundEnabled} onChange={v => set("soundEnabled", v)} />
      </SettingRow>

      <SettingRow label="Flash on New Order" sub="Card briefly flashes when it appears">
        <Toggle value={settings.flashOnNew} onChange={v => set("flashOnNew", v)} />
      </SettingRow>

      <SettingRow label="Warning Timer" sub="Card turns amber after this many minutes">
        <div className="kds-seg">
          {[3,5,7,10].map(n => (
            <button key={n} className={`kds-seg-btn${settings.warnMinutes === n ? " active" : ""}`}
              onClick={() => set("warnMinutes", n)}>{n}m</button>
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Urgent Timer" sub="Card turns red and pulses after this many minutes">
        <div className="kds-seg">
          {[7,10,15,20].map(n => (
            <button key={n} className={`kds-seg-btn${settings.urgentMinutes === n ? " active" : ""}`}
              onClick={() => set("urgentMinutes", n)}>{n}m</button>
          ))}
        </div>
      </SettingRow>
    </div>
  );

  // ── Auto Actions ───────────────────────────────────────────────────────────
  const ActionsTab = () => (
    <div className="kds-settings-section">
      <SettingRow label="Auto-Bump" sub="Automatically remove Ready tickets after this time (0 = off)">
        <div className="kds-seg">
          {[0,30,60,120].map(n => (
            <button key={n} className={`kds-seg-btn${settings.autoBumpSeconds === n ? " active" : ""}`}
              onClick={() => set("autoBumpSeconds", n)}>
              {n === 0 ? "Off" : n < 60 ? `${n}s` : `${n/60}m`}
            </button>
          ))}
        </div>
      </SettingRow>

      <div className="kds-setting-note">
        {settings.autoBumpSeconds === 0
          ? "Auto-bump is OFF. Staff must manually press BUMP."
          : `Ready tickets will be bumped automatically after ${settings.autoBumpSeconds < 60 ? settings.autoBumpSeconds+"s" : settings.autoBumpSeconds/60+"min"}.`}
      </div>
    </div>
  );

  // ── Stations ───────────────────────────────────────────────────────────────
  const STATION_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899"];

  const StationsTab = () => (
    <div className="kds-settings-section">
      <p className="kds-section-label">Kitchen Stations</p>
      <p className="kds-section-sub">Orders are routed to stations based on menu category. Each station can have its own printer.</p>

      <div className="kds-station-list">
        {(settings.stations || []).map((st, idx) => (
          <div key={st.id} className="kds-station-item">
            <div className="kds-station-color-row">
              {STATION_COLORS.map(c => (
                <button key={c} className={`kds-color-dot${st.color === c ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => {
                    const next = [...settings.stations];
                    next[idx] = { ...st, color: c };
                    set("stations", next);
                  }} />
              ))}
            </div>
            <div className="kds-station-name-row">
              <span className="kds-station-dot" style={{ background: st.color }} />
              <input
                className="kds-station-input"
                value={st.name}
                onChange={e => {
                  const next = [...settings.stations];
                  next[idx] = { ...st, name: e.target.value };
                  set("stations", next);
                }}
              />
              <button className="kds-station-del"
                onClick={() => set("stations", settings.stations.filter((_, i) => i !== idx))}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="kds-add-station-row">
        <input
          className="kds-station-input"
          placeholder="New station name…"
          value={newStation}
          onChange={e => setNewStation(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && newStation.trim()) {
              set("stations", [...(settings.stations||[]), {
                id: newStation.toLowerCase().replace(/\s+/g,"-"),
                name: newStation.trim(),
                color: STATION_COLORS[(settings.stations||[]).length % STATION_COLORS.length],
              }]);
              setNewStation("");
            }
          }}
        />
        <button className="kds-add-station-btn"
          onClick={() => {
            if (!newStation.trim()) return;
            set("stations", [...(settings.stations||[]), {
              id: newStation.toLowerCase().replace(/\s+/g,"-"),
              name: newStation.trim(),
              color: STATION_COLORS[(settings.stations||[]).length % STATION_COLORS.length],
            }]);
            setNewStation("");
          }}>
          + Add
        </button>
      </div>
    </div>
  );

  // ── Stock ──────────────────────────────────────────────────────────────────
  const allItems     = menuData?.items?.length      ? menuData.items      : sharedMenuItems;
  const allCats      = menuData?.categories?.length ? menuData.categories : sharedCategories;
  const soldOutCount = Object.values(stockState).filter(s => s.available === false).length;

  // Group real (or fallback) menu items by category
  const stockCategories = allCats.map(cat => ({
    ...cat,
    items: allItems.filter(i =>
      i.categoryId === cat.id ||
      i.categoryId === String(cat.id) ||
      i.category   === cat.name ||
      i.categoryName === cat.name
    ),
  })).filter(cat => cat.items.length > 0);

  const StockTab = () => (
    <div className="kds-settings-section kds-stock-section">

      {/* Summary bar */}
      <div className="kds-stock-summary">
        <div className="kds-stock-stat">
          <span className="kds-stock-stat-num">{allItems.length}</span>
          <span className="kds-stock-stat-lbl">Total</span>
        </div>
        <div className="kds-stock-stat available">
          <span className="kds-stock-stat-num">{allItems.length - soldOutCount}</span>
          <span className="kds-stock-stat-lbl">Available</span>
        </div>
        <div className={`kds-stock-stat${soldOutCount > 0 ? " soldout" : ""}`}>
          <span className="kds-stock-stat-num">{soldOutCount}</span>
          <span className="kds-stock-stat-lbl">Sold Out</span>
        </div>
        {soldOutCount > 0 && (
          <button className="kds-stock-reset-btn" onClick={resetAllStock}>
            Reset all
          </button>
        )}
      </div>

      <p className="kds-section-sub" style={{ marginBottom: 12 }}>
        Turn items OFF when they run out — POS, Captain &amp; Online will block them instantly.
        Items auto-reset <strong>next day</strong>.
      </p>

      {/* Category-wise item list */}
      {stockCategories.map(cat => (
        <div key={cat.id} className="kds-stock-cat">

          {/* Category header */}
          <div className="kds-stock-cat-head">
            <span className="kds-stock-cat-name">{cat.name}</span>
            <span className="kds-stock-cat-count">
              {cat.items.filter(i => stockState[i.id]?.available === false).length > 0
                ? `${cat.items.filter(i => stockState[i.id]?.available === false).length} sold out`
                : `${cat.items.length} items`}
            </span>
          </div>

          {/* Item rows */}
          {cat.items.map(item => {
            const avail = stockState[item.id]?.available !== false;
            const soldAt = stockState[item.id]?.soldOutAt;
            return (
              <div key={item.id} className={`kds-stock-row${!avail ? " soldout" : ""}`}>
                <div className="kds-stock-item-info">
                  <span className="kds-stock-item-name">{item.name}</span>
                  {!avail && soldAt && (
                    <span className="kds-stock-soldout-time">
                      ⏱ {new Date(soldAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} · auto-resets tomorrow
                    </span>
                  )}
                </div>
                {/* Toggle pill */}
                <button
                  className={`kds-stock-pill${avail ? " on" : " off"}`}
                  onClick={() => toggleStock(item.id, !avail)}
                >
                  <span className="kds-stock-pill-dot" />
                  <span>{avail ? "Available" : "Sold Out"}</span>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className="kds-settings-overlay" onClick={onClose}>
      <div className="kds-settings-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="kds-settings-head">
          <div>
            <h2 className="kds-settings-title">KDS Settings</h2>
            <p className="kds-settings-sub">Customize your kitchen display</p>
          </div>
          <button className="kds-settings-close" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="kds-settings-body">
          {/* Sidebar nav */}
          <nav className="kds-settings-nav">
            {SETTING_TABS.map(t => (
              <button key={t.id}
                className={`kds-stab${tab === t.id ? " active" : ""}${t.id === "stock" && soldOutCount > 0 ? " has-badge" : ""}`}
                onClick={() => setTab(t.id)}>
                <span className="kds-stab-icon">{t.icon}</span>
                <span>{t.label}</span>
                {t.id === "stock" && soldOutCount > 0 && (
                  <span className="kds-stab-badge">{soldOutCount}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="kds-settings-content">
            {tab === "display"  && <DisplayTab />}
            {tab === "alerts"   && <AlertsTab />}
            {tab === "actions"  && <ActionsTab />}
            {tab === "stations" && <StationsTab />}
            {tab === "stock"    && <StockTab />}
          </div>
        </div>

        {/* Device info */}
        {outletName && (
          <div style={{ padding: "12px 24px 0", borderTop: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              🔗 Connected to <strong style={{ color: "#9ca3af" }}>{outletName}</strong>
            </span>
            {onForgetDevice && (
              <button
                style={{ background: "none", border: "none", color: "#ef4444", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 }}
                onClick={onForgetDevice}
              >
                Forget device
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="kds-settings-foot">
          <button className="kds-settings-reset"
            onClick={() => { onUpdate({ ...DEFAULT_SETTINGS }); }}>
            Reset to defaults
          </button>
          <button className="kds-settings-save" onClick={onClose}>
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KOT Card ─────────────────────────────────────────────────────────────────

function KotCard({ ticket, settings, onAdvance, onBump, onToggleItem, flash }) {
  const [elapsed, setElapsed] = useState(() => elapsedLabel(ticket.createdAt));
  const [urgency, setUrgency] = useState(() => urgencyLevel(ticket.createdAt, settings.warnMinutes, settings.urgentMinutes));

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(elapsedLabel(ticket.createdAt));
      setUrgency(urgencyLevel(ticket.createdAt, settings.warnMinutes, settings.urgentMinutes));
    }, 1000);
    return () => clearInterval(id);
  }, [ticket.createdAt, settings.warnMinutes, settings.urgentMinutes]);

  const src       = SOURCE[ticket.source] || SOURCE.pos;
  const doneItems = ticket.doneItems || [];
  const allDone   = ticket.items.length > 0 && doneItems.length >= ticket.items.length;
  const urgClass  = urgency === 2 ? " urgent" : urgency === 1 ? " warning" : "";
  const sizeClass = ` size-${settings.cardSize || "normal"}`;

  return (
    <div className={`kot-card status-${ticket.status}${urgClass}${sizeClass}${flash ? " flash-in" : ""}`}>

      {/* Header */}
      <div className="kot-card-head">
        <div className="kot-head-left">
          <div className="kot-head-row">
            <span className="kot-number">#{ticket.kotNumber || ticket.id?.slice(-4)}</span>
            {settings.showSource && (
              <span className="kot-src-badge" style={{ color: src.color, background: src.bg }}>
                {src.label}
              </span>
            )}
          </div>
          {ticket.station && <span className="kot-station">{ticket.station}</span>}
        </div>
        <div className="kot-head-right">
          <span className={`kot-timer${urgency === 2 ? " urgent" : urgency === 1 ? " warning" : ""}`}>
            ⏱ {elapsed}
          </span>
          <div className="kot-table-row">
            <span className="kot-table">T{ticket.tableNumber}</span>
            {settings.showArea && ticket.areaName && (
              <span className="kot-area">{ticket.areaName}</span>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="kot-items">
        {(ticket.items || []).map((item) => {
          const done = doneItems.includes(item.id);
          return (
            <button key={item.id}
              className={`kot-item${done ? " done" : ""} tappable`}
              onClick={() => onToggleItem(ticket.id, item.id)}
            >
              <span className={`kot-check${done ? " checked" : ""}`}>{done ? "✓" : "○"}</span>
              <span className="kot-item-qty">{item.quantity}×</span>
              <div className="kot-item-body">
                <span className="kot-item-name">{item.name}</span>
                {item.note && <span className="kot-item-note">⚠ {item.note}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Action */}
      <div className="kot-foot">
        {ticket.status === "new" && (
          <button className="kot-action start" onClick={() => onAdvance(ticket.id, "new")}>
            Start Cooking
          </button>
        )}
        {ticket.status === "preparing" && (
          <button className={`kot-action bump${allDone ? " all-done" : ""}`}
            onClick={() => onAdvance(ticket.id, "preparing")}>
            {allDone ? "✓ All Done — BUMP" : "⚡ BUMP"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KdsColumn({ label, colorKey, emptyMsg, tickets, settings, onAdvance, onBump, onToggleItem, newIds }) {
  return (
    <div className="kds-column">
      <div className={`kds-col-head col-${colorKey}`}>
        <span>{label}</span>
        <span className="kds-col-badge">{tickets.length}</span>
      </div>
      <div className="kds-col-body">
        {tickets.length === 0 && <div className="kds-empty">{emptyMsg}</div>}
        {tickets.map((t) => (
          <KotCard key={t.id} ticket={t} settings={settings}
            onAdvance={onAdvance} onBump={onBump} onToggleItem={onToggleItem}
            flash={settings.flashOnNew && newIds.has(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

export function App() {
  const [branchConfig,  setBranchConfig]  = useState(() => loadKdsBranchConfig());
  const [settings,     setSettings]     = useState(loadSettings);
  const [tickets,      setTickets]      = useState(() => loadSavedTickets());
  const [outlet,       setOutlet]       = useState(null);
  const [menuData,     setMenuData]     = useState({ categories: [], items: [] });
  const [stationTab,   setStationTab]   = useState("");
  const [servedCount,  setServedCount]  = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [newIds,       setNewIds]       = useState(new Set());
  const [connState,    setConnState]    = useState("connecting"); // connecting | live | offline
  const socketRef  = useRef(null);
  const audioReady = useRef(false);
  // Always-current ref so socket handlers (which close over stale state) can
  // read the latest assignedStation without depending on the closure.
  const assignedStationRef = useRef(settings.assignedStation);
  // Update the ref synchronously DURING RENDER so socket handlers always see
  // the latest value — a useEffect would only run after the browser paints,
  // leaving a window where an arriving KOT could be mis-routed.
  assignedStationRef.current = settings.assignedStation;

  // Persist settings on change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // When the assigned station changes at runtime (user picks a station in Settings):
  // 1. Re-subscribe so the server moves this socket to the correct station room
  // 2. Purge any tickets that belong to a different station
  useEffect(() => {
    if (socketRef.current?.connected && branchConfig?.outletId) {
      socketRef.current.emit("kds:join-station", {
        outletId:    branchConfig.outletId,
        stationName: settings.assignedStation || "",
      });
    }
    if (settings.assignedStation) {
      const assigned = settings.assignedStation.trim().toLowerCase();
      setTickets(prev => prev.filter(t =>
        (t.station || "").trim().toLowerCase() === assigned
      ));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.assignedStation]);

  // Persist active tickets on every change — KDS survives refresh / internet drop
  useEffect(() => { saveTickets(tickets); }, [tickets]);

  function updateSettings(next) { setSettings(next); }

  function unlockAudio() { audioReady.current = true; }

  // Used for bootstrap API fetch filtering (only fetch this screen's KOTs on load).
  // Socket routing is now server-side — the backend emits kot:new only to the
  // matching kds:<outletId>:<station> room, so no filtering is needed in the handler.
  function kotBelongsHere(kot) {
    const assigned = (assignedStationRef.current || "").trim().toLowerCase();
    if (!assigned) return true;
    return (kot.station || "").trim().toLowerCase() === assigned;
  }

  // Bootstrap
  useEffect(() => {
    if (!branchConfig) return;

    // Clear any stale tickets (demos / previous session) so we always start fresh
    // Real tickets will be fetched from the API immediately after connecting
    setTickets([]);
    localStorage.removeItem(KDS_TICKETS_KEY);

    const socketUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1")
      .replace("/api/v1", "");
    // Include assignedStation in the handshake query so the server joins the
    // correct KDS station room immediately on connect — no async event needed.
    const socket = io(socketUrl, {
      query: {
        outletId:   branchConfig.outletId,
        kdsStation: settings.assignedStation || "",   // current assigned station
      },
      reconnectionDelay:    1000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = socket;

    // ── Connection lifecycle ──────────────────────────────────────────────
    socket.on("connect", async () => {
      setConnState("live");
      // Subscribe to this screen's station room so the server routes KOTs correctly
      socket.emit("kds:join-station", {
        outletId:    branchConfig.outletId,
        stationName: assignedStationRef.current || "",
      });
      // Re-fetch any KOTs we missed while offline — filter to this screen's station
      try {
        const kots = await api.get(`/operations/kots?outletId=${branchConfig.outletId}`);
        if (kots?.length) {
          setTickets(prev => {
            const existingIds = new Set(prev.map(t => t.id));
            const missed = kots
              .filter(k => !existingIds.has(k.id) && k.status !== "bumped" && kotBelongsHere(k))
              .map(k => ({
                ...k,
                status: k.status === "ready" ? "preparing" : k.status,
                doneItems: k.doneItems || [],
              }));
            return missed.length ? [...missed, ...prev] : prev;
          });
        }
      } catch (_) {}
    });

    socket.on("disconnect", () => setConnState("offline"));
    socket.on("connect_error", () => setConnState("offline"));

    // ── Incoming KOTs ─────────────────────────────────────────────────────
    // No client-side station filter here — the server emits kot:new only to the
    // correct station room (kds:<outletId>:<station>), so this screen only receives
    // KOTs that belong to it. The kotBelongsHere check below is a safety net.
    socket.on("kot:new", (kot) => {
      if (!kotBelongsHere(kot)) return; // safety net
      setTickets(prev => {
        if (prev.find(t => t.id === kot.id)) return prev;
        // Always show new incoming KOTs as "new" — never let backend push "ready"
        // into the 2-step flow (New → Preparing → BUMP)
        const status = (kot.status === "bumped") ? null : "new";
        if (!status) return prev;
        return [{ ...kot, status, createdAt: kot.createdAt || new Date().toISOString(), doneItems: [] }, ...prev];
      });
      if (audioReady.current && settings.soundEnabled) playNewKotAlert();
      setNewIds(prev => new Set([...prev, kot.id]));
      setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(kot.id); return n; }), 1200);
    });

    socket.on("kot:status", ({ id, status }) => {
      if (status === "bumped") {
        // Backend removes bumped KOTs from the store. Mirror that here so all
        // KDS screens in the outlet stay in sync when any one of them bumps a ticket.
        setTickets(prev => prev.filter(t => t.id !== id));
        setServedCount(n => n + 1);
      } else if (status === "ready") {
        // "ready" is no longer used in 2-step flow — map it to "preparing"
        setTickets(prev => prev.map(t => t.id === id ? { ...t, status: "preparing" } : t));
      } else {
        setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
      }
    });

    // ── Owner Web changed menu/stations — refresh station list + menu ────
    socket.on("sync:config", async () => {
      try {
        const stations = await api.get("/kitchen-stations").catch(() => null);
        if (stations?.length) {
          localStorage.setItem("kds_kitchen_stations", JSON.stringify(stations));
          setSettings(prev => ({ ...prev, stations }));
        }
      } catch (_) { /* non-critical */ }
    });

    // Initial load
    async function bootstrap() {
      try {
        const outlets = await api.get("/outlets");
        const target  = outlets.find((o) => o.id === branchConfig.outletId) || outlets[0];
        if (target) setOutlet(target);
      } catch (_) {
        // No outlet list — offline; continue anyway
      }

      // ── Kitchen stations from Owner Console ───────────────────────────
      try {
        const stations = await api.get("/kitchen-stations").catch(() => null);
        if (stations?.length) {
          localStorage.setItem("kds_kitchen_stations", JSON.stringify(stations));
          setSettings(prev => ({ ...prev, stations }));
        } else {
          // Try last cached fetch
          try {
            const cached = JSON.parse(localStorage.getItem("kds_kitchen_stations") || "null");
            if (cached?.length) setSettings(prev => ({ ...prev, stations: cached }));
          } catch (_) {}
        }
      } catch (_) {}

      // ── Real menu items for Stock tab ─────────────────────────────────
      try {
        const [cats, items] = await Promise.all([
          api.get(`/menu/categories?outletId=${branchConfig.outletId}`).catch(() => null),
          api.get(`/menu/items?outletId=${branchConfig.outletId}`).catch(() => null),
        ]);
        if (cats?.length && items?.length) {
          setMenuData({ categories: cats, items });
        }
      } catch (_) {}

      // ── Active KOTs ───────────────────────────────────────────────────
      try {
        const kots = await api.get(`/operations/kots?outletId=${branchConfig.outletId}`).catch(() => null);
        if (kots !== null) {
          // API responded — replace with real data (or empty; never show demo tickets)
          // Filter by this screen's station AND drop bumped/ready tickets.
          const live = kots.filter(k =>
            k.status !== "bumped" &&
            k.status !== "ready" &&
            kotBelongsHere(k)
          );
          setTickets(live.length ? live.map(k => ({ ...k, doneItems: k.doneItems || [] })) : []);
        }
      } catch (_) {
        // KOTs fetch failed — keep empty state; offline banner shows
      }
    }

    bootstrap();
    return () => { socket.disconnect(); };
  }, [branchConfig]);

  // Auto-bump effect
  useEffect(() => {
    if (!settings.autoBumpSeconds) return;
    const id = setInterval(() => {
      const cutoff = Date.now() - settings.autoBumpSeconds * 1000;
      setTickets(prev => {
        const toBump = prev.filter(t => t.status === "ready" && new Date(t.createdAt).getTime() < cutoff - (settings.autoBumpSeconds * 1000));
        if (!toBump.length) return prev;
        setServedCount(n => n + toBump.length);
        return prev.filter(t => !toBump.find(b => b.id === t.id));
      });
    }, 5000);
    return () => clearInterval(id);
  }, [settings.autoBumpSeconds]);

  async function handleAdvance(id, cur) {
    if (cur === "preparing") {
      // 2-step flow: New → Preparing → BUMP (no "ready" state)
      handleBump(id);
      return;
    }
    // new → preparing
    const next = "preparing";
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: next } : t));
    socketRef.current?.emit("kot:status", { id, status: next });
    try {
      await api.patch(
        `/operations/kots/${id}/status?outletId=${branchConfig?.outletId}`,
        { status: next }
      );
    } catch (_) {}
  }

  function handleBump(id) {
    // Remove locally immediately — UI is instant.
    setTickets(prev => prev.filter(t => t.id !== id));
    setServedCount(n => n + 1);
    // Persist the bump to the backend so the KOT is removed from the in-memory
    // kot-store. Without this, reconnecting KDS screens and other connected KDS
    // devices would see all bumped tickets reappear.
    // The backend broadcasts kot:status { id, status: "bumped" } to all outlet
    // room members — the kot:status handler below (which now handles "bumped" as
    // a filter-out) ensures other KDS screens also remove the ticket.
    api.patch(
      `/operations/kots/${id}/status?outletId=${branchConfig?.outletId}`,
      { status: "bumped" }
    ).catch(() => {});
    // Note: the previous socket.emit("kot:bumped") was removed — the backend has
    // no listener for that event. Other screens are now notified via the backend's
    // kot:status broadcast triggered by the PATCH call above.
  }

  function handleToggleItem(ticketId, itemId) {
    setTickets(prev => prev.map(t => {
      if (t.id !== ticketId) return t;
      const done = t.doneItems || [];
      return { ...t, doneItems: done.includes(itemId) ? done.filter(x => x !== itemId) : [...done, itemId] };
    }));
  }

  // Build station tabs from live tickets + settings
  const stationNames = (settings.stations || []).map(s => s.name);

  // assignedStation (set in Settings → Display) locks the screen to one station permanently.
  // stationTab (header tab click) is a manual override when assignedStation is not set.
  // Case-insensitive compare handles any casing mismatch between Owner Console name and KOT.
  const effectiveStation = (settings.assignedStation || stationTab).toLowerCase();
  const base  = !effectiveStation
    ? tickets
    : tickets.filter(t => (t.station || "").toLowerCase() === effectiveStation);
  const newT  = base.filter(t => t.status === "new");
  const prepT = base.filter(t => t.status === "preparing");
  // Note: "ready" state is no longer used — flow is New → Preparing → BUMP

  const colProps = { settings, onAdvance: handleAdvance, onBump: handleBump, onToggleItem: handleToggleItem, newIds };

  // Branch setup gate (all hooks above — safe)
  if (!branchConfig) {
    return <KdsBranchSetupScreen onComplete={(cfg) => setBranchConfig(cfg)} />;
  }

  return (
    <div className="kds-shell" onClick={unlockAudio} style={{ "--kds-cols": settings.columns }}>

      {/* ── Offline banner ──────────────────────────────────────── */}
      {connState === "offline" && (
        <div className="kds-offline-banner">
          <span>📡 Cloud disconnected — showing last known tickets. New KOTs will appear when reconnected.</span>
          <button
            className="kds-reconnect-btn"
            onClick={() => {
              setConnState("connecting");
              socketRef.current?.disconnect();
              socketRef.current?.connect();
            }}
          >
            Reconnect
          </button>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="kds-header">
        <div className="kds-header-left">
          <div className="kds-brand-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9"/>
              <path d="M8 12h8" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <strong>Plato KDS</strong>
            <p>{outlet?.name || "Kitchen Display"}</p>
          </div>
        </div>

        {/* Source legend */}
        {settings.showSource && (
          <div className="kds-source-legend">
            {Object.entries(SOURCE).map(([k, c]) => (
              <span key={k} className="kds-src-pill"
                style={{ color: c.color, background: c.bg, border:`1px solid ${c.color}33` }}>
                {c.label}
              </span>
            ))}
          </div>
        )}

        {/* Station display: if screen is assigned to a station, show fixed label.
            Otherwise show clickable tabs for manual filtering. */}
        <div className="kds-stations">
          {settings.assignedStation ? (
            /* Dedicated screen — show assigned station as a fixed active badge */
            <span className="kds-station-btn active" style={{ cursor: "default" }}>
              {settings.assignedStation}
            </span>
          ) : (
            /* Shared screen — tab buttons for manual filtering */
            stationNames.map(s => (
              <button key={s}
                className={`kds-station-btn${stationTab === s ? " active" : ""}`}
                onClick={(e) => { e.stopPropagation(); setStationTab(st => st === s ? "" : s); }}>{s}</button>
            ))
          )}
        </div>

        <div className="kds-header-right">
          {servedCount > 0 && (
            <div className="kds-served-pill">{servedCount} bumped</div>
          )}
          <div className={`kds-live kds-live-${connState}`}>
            <span className="kds-live-dot" />
            <span>
              {connState === "live"       ? `${newT.length + prepT.length} active` :
               connState === "offline"    ? "Reconnecting…" :
                                            "Connecting…"}
            </span>
          </div>
          {/* Settings button */}
          <button className="kds-settings-btn" onClick={e => { e.stopPropagation(); setShowSettings(true); }}
            title="KDS Settings">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Columns ─────────────────────────────────────────────── */}
      <div className="kds-columns" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <KdsColumn label="New Orders" colorKey="new"      emptyMsg="Waiting for orders…"       tickets={newT}  {...colProps} />
        <KdsColumn label="Preparing"  colorKey="preparing" emptyMsg="Nothing cooking right now" tickets={prepT} {...colProps} />
      </div>

      {/* ── Settings Panel ──────────────────────────────────────── */}
      {showSettings && (
        <KdsSettingsPanel
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setShowSettings(false)}
          outletName={outlet?.name || branchConfig?.outletName}
          menuData={menuData}
          onForgetDevice={() => {
            clearKdsBranchConfig();
            setBranchConfig(null);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}
