import { useState, useEffect, useRef } from "react";
import { tapImpact } from "../lib/haptics";
import { avatarBg } from "./LoginScreen";

// Calculates "25 min" or "1h 10m" from a timestamp
function elapsedLabel(ts) {
  if (!ts) return null;
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1)       return "< 1m";
  if (mins < 60)      return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

function elapsedMinutes(ts) {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
}

function waiterInitials(name) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function tableStatusOf(orders, tableId) {
  const o = orders[tableId];
  const activeItems = o?.items?.filter(i => !i.isVoided && !i.isComp);
  if (!activeItems?.length) return "open";
  if (o.isOnHold)           return "hold";
  if (o.billRequested)      return "bill";
  return "running";
}

// Long-press hook — fires onLongPress after 500ms hold, cancels on release/move
function useLongPress(onLongPress, onPress, ms = 500) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);

  function start(e) {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      tapImpact();
      onLongPress(e);
    }, ms);
  }

  function cancel() {
    clearTimeout(timerRef.current);
  }

  function end(e) {
    clearTimeout(timerRef.current);
    if (!firedRef.current) {
      tapImpact();
      onPress(e);
    }
  }

  return {
    onTouchStart: start,
    onTouchEnd:   end,
    onTouchMove:  cancel,
    onMouseDown:  start,
    onMouseUp:    end,
    onMouseLeave: cancel,
  };
}

const TF2_LABEL = {
  open:     "Free",
  hold:     "Hold",
  bill:     "Bill ready",
  running:  "Dining",
  ordering: "Ordering",
};
const TF2_COLOR = {
  open:     "#16A34A",
  hold:     "#6B7280",
  bill:     "#0891B2",
  running:  "#2563EB",
  ordering: "#D97706",
};
const TF2_BADGE_BG = {
  open:     "#16A34A",
  hold:     "#6B7280",
  bill:     "#0891B2",
  running:  "#2563EB",
  ordering: "#D97706",
};

// Each table card is its own component so useLongPress (which calls useRef)
// is always called at the top level — never inside a .map() loop.
function TableCard({ table, area, orders, onSelectTable, onLongPressTable }) {
  const st          = tableStatusOf(orders, table.id);
  const order       = orders[table.id];
  const _items      = (order?.items || []).filter(i => !i.isVoided && !i.isComp);
  const _sub        = _items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
  const _tax        = _items.reduce((s, i) => {
    const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    return s + Math.round((i.price || 0) * (i.quantity || 0) * rate / 100);
  }, 0);
  const amount      = _sub + _tax;
  const unsentCount = (order?.items || []).filter(i => !i.sentToKot && !i.isVoided).length;
  const seatedTs    = order?.seatedAt || order?.createdAt || order?.openedAt;
  const timer       = (st !== "open") ? elapsedLabel(seatedTs) : null;
  const isOccupied  = st !== "open";
  const displaySt   = (st === "running" && unsentCount > 0) ? "ordering" : st;
  const guests      = order?.covers || order?.guests || null;

  // "No order Xm" alert: table open > 20 min but no KOT sent
  const seatedMins  = isOccupied ? elapsedMinutes(seatedTs) : 0;
  const hasSentItems = (order?.items || []).some(i => i.sentToKot && !i.isVoided);
  const isNoOrderAlert = isOccupied && !hasSentItems && seatedMins > 20;

  // Waiter avatar
  const waiterName = order?.assignedWaiter || null;
  const waiterInitialsStr = waiterName ? waiterInitials(waiterName) : null;

  const pressHandlers = useLongPress(
    () => isOccupied && onLongPressTable?.(table.id, area),
    () => onSelectTable(table.id, area)
  );

  const badgeBg    = TF2_BADGE_BG[displaySt];
  const statusColor = TF2_COLOR[displaySt];

  // Build the info line
  let infoText, infoDanger;
  if (isNoOrderAlert) {
    infoText = `No order ${timer || ""}`;
    infoDanger = true;
  } else if (st === "open") {
    infoText = table.seats > 0 ? `${table.seats} seats` : "";
    infoDanger = false;
  } else {
    infoText = [guests ? `${guests} guests` : null, timer].filter(Boolean).join(" · ");
    infoDanger = false;
  }

  // Info row: text + optional waiter avatar chip
  const infoRow = isOccupied ? (
    <div className="tf2-info-row">
      <span className={`tf2-info-line${infoDanger ? " tf2-info-danger" : ""}`}>
        {infoText}
      </span>
      {waiterInitialsStr && (
        <span
          className="tf2-avatar-chip"
          style={{ background: avatarBg(waiterName) }}
          title={waiterName}
        >
          {waiterInitialsStr}
        </span>
      )}
    </div>
  ) : (
    <span className="tf2-info-line">{infoText}</span>
  );

  return (
    <button className="tf2-card" {...pressHandlers}>
      {/* Top row: badge + status */}
      <div className="tf2-card-top">
        <span className="tf2-badge" style={{ background: badgeBg }}>
          {table.number}
        </span>
        {displaySt === "bill" ? (
          <span className="tf2-bill-tag">Bill ready</span>
        ) : (
          <span className="tf2-status-text" style={{ color: statusColor }}>
            {TF2_LABEL[displaySt]}
          </span>
        )}
      </div>

      {/* Info row: guests·time (or seats for free), optional waiter chip */}
      {infoRow}

      {/* Bottom row: amount + chevron */}
      <div className="tf2-card-bottom">
        {amount > 0 ? (
          <span className="tf2-amount">₹{amount.toLocaleString("en-IN")}</span>
        ) : (
          <span />
        )}
        <svg className="tf2-chevron" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </button>
  );
}

function getHeaderTime() {
  const now  = new Date();
  const day  = now.toLocaleDateString("en-US", { weekday: "long" });
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day} · ${time}`;
}

export function TableFloor({ areas, orders, onSelectTable, onLongPressTable, loggedInStaff, isOffline }) {
  const [activeArea, setActiveArea] = useState(null);
  const [tick, setTick] = useState(0); // triggers re-render every minute for timers
  const visible = activeArea ? areas.filter((a) => a.id === activeArea) : areas;

  // Refresh timers every 60 seconds
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const allTables    = areas.flatMap(a => a.tables);
  const totalTables  = allTables.length;
  const freeTables   = allTables.filter(t => tableStatusOf(orders, t.id) === "open").length;
  const activeTables = totalTables - freeTables;
  const billTables   = allTables.filter(t => tableStatusOf(orders, t.id) === "bill").length;
  const pct          = totalTables ? Math.round((activeTables / totalTables) * 100) : 0;

  return (
    <div className="floor-page tf2-page">
      {/* Header */}
      <div className="tf2-header">
        <div className="tf2-header-left">
          <span className="tf2-header-datetime">{getHeaderTime()}</span>
          <h1 className="tf2-title">Floor</h1>
        </div>
        <div className="tf2-header-right">
          {isOffline ? (
            <div className="tf2-offline-pill">
              <span className="tf2-offline-dot" />
              <span className="tf2-offline-label">Offline</span>
            </div>
          ) : (
            <div className="tf2-synced-pill">
              <span className="tf2-synced-dot" />
              <span className="tf2-synced-label">Synced</span>
            </div>
          )}
          {loggedInStaff && (
            <div className="tf2-user-avatar" style={{ background: avatarBg(loggedInStaff.name) }}>
              {loggedInStaff.name?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Offline banner */}
      {isOffline && (
        <div className="tf2-offline-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
          <span>Working offline · KOTs will queue and send on reconnect</span>
        </div>
      )}

      {/* Occupancy card */}
      <div className="tf2-occ-card">
        <div className="tf2-occ-top">
          <span className="tf2-occ-label">Floor occupancy</span>
          <span className="tf2-occ-count">{activeTables} of {totalTables} seated</span>
        </div>
        <div className="tf2-occ-bar-track">
          <div className="tf2-occ-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        {billTables > 0 && (
          <div className="tf2-occ-alert">
            <span className="tf2-occ-alert-dot" />
            <span className="tf2-occ-alert-text">
              {billTables} table{billTables > 1 ? "s" : ""} need attention
            </span>
          </div>
        )}
      </div>

      {/* Area tabs — pill style */}
      {areas.length > 1 && (
        <div className="tf2-area-tabs">
          <button
            className={`tf2-area-tab${!activeArea ? " tf2-area-tab-active" : ""}`}
            onClick={() => { setActiveArea(null); tapImpact(); }}
          >All</button>
          {areas.map((a) => (
            <button
              key={a.id}
              className={`tf2-area-tab${activeArea === a.id ? " tf2-area-tab-active" : ""}`}
              onClick={() => { setActiveArea(a.id); tapImpact(); }}
            >{a.name}</button>
          ))}
        </div>
      )}

      {/* Tables */}
      <div className="tf2-scroll">
        {visible.map((area) => (
          <div key={area.id} className="tf2-area-section">
            <div className="tf2-area-heading">
              <span className="tf2-area-name">{area.name.toUpperCase()}</span>
              <span className="tf2-area-count">{area.tables.length} tables</span>
            </div>
            <div className="tf2-tables-grid">
              {area.tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  area={area}
                  orders={orders}
                  onSelectTable={onSelectTable}
                  onLongPressTable={onLongPressTable}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
