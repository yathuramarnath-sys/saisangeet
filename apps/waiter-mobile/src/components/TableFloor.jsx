import { useState, useEffect } from "react";
import { tapImpact } from "../lib/haptics";

// Calculates "25 min" or "1h 10m" from a timestamp
function elapsedLabel(ts) {
  if (!ts) return null;
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1)       return "< 1m";
  if (mins < 60)      return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

const STATUS_LABEL = { open: "Free", hold: "Hold", bill: "Bill Due", running: "Occupied" };
const STATUS_CLASS = { open: "status-free", hold: "status-hold", bill: "status-bill", running: "status-running" };

export function tableStatusOf(orders, tableId) {
  const o = orders[tableId];
  const activeItems = o?.items?.filter(i => !i.isVoided && !i.isComp);
  if (!activeItems?.length) return "open";
  if (o.isOnHold)           return "hold";
  if (o.billRequested)      return "bill";
  return "running";
}

export function TableFloor({ areas, orders, onSelectTable }) {
  const [activeArea, setActiveArea] = useState(null);
  const [tick, setTick] = useState(0); // triggers re-render every minute for timers
  const visible = activeArea ? areas.filter((a) => a.id === activeArea) : areas;

  // Refresh timers every 60 seconds
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // Count tables by status for summary bar
  const totalTables  = areas.flatMap(a => a.tables).length;
  const freeTables   = areas.flatMap(a => a.tables).filter(t => tableStatusOf(orders, t.id) === "open").length;
  const activeTables = totalTables - freeTables;

  return (
    <div className="floor-page">
      {/* Summary bar */}
      <div className="floor-summary">
        <div className="summary-stat">
          <span className="summary-num">{freeTables}</span>
          <span className="summary-label">Free</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <span className="summary-num active-num">{activeTables}</span>
          <span className="summary-label">Occupied</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <span className="summary-num">{totalTables}</span>
          <span className="summary-label">Total</span>
        </div>
      </div>

      {/* Area tabs */}
      {areas.length > 1 && (
        <div className="area-tabs">
          <button
            className={`area-tab${!activeArea ? " area-tab-active" : ""}`}
            onClick={() => { setActiveArea(null); tapImpact(); }}
          >
            All
          </button>
          {areas.map((a) => (
            <button
              key={a.id}
              className={`area-tab${activeArea === a.id ? " area-tab-active" : ""}`}
              onClick={() => { setActiveArea(a.id); tapImpact(); }}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {/* Tables grid */}
      <div className="tables-scroll">
        {visible.map((area) => (
          <div key={area.id} className="area-section">
            {areas.length > 1 && !activeArea && (
              <h3 className="area-heading">{area.name}</h3>
            )}
            {activeArea && (
              <h3 className="area-heading">{area.name}</h3>
            )}
            <div className="tables-grid">
              {area.tables.map((table) => {
                const st     = tableStatusOf(orders, table.id);
                const order  = orders[table.id];
                const _items  = (order?.items || []).filter(i => !i.isVoided && !i.isComp);
                const count  = _items.length;
                const _sub    = _items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
                const _tax    = _items.reduce((s, i) => {
                  const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
                  return s + Math.round((i.price || 0) * (i.quantity || 0) * rate / 100);
                }, 0);
                const amount  = _sub + _tax;
                const unsentCount = (order?.items || []).filter(i => !i.sentToKot && !i.isVoided).length;
                const seatedTs = order?.seatedAt || order?.createdAt || order?.openedAt;
                const timer   = (st !== "open") ? elapsedLabel(seatedTs) : null;

                return (
                  <button
                    key={table.id}
                    className={`table-card ${STATUS_CLASS[st]}`}
                    onClick={() => { tapImpact(); onSelectTable(table.id, area); }}
                  >
                    {/* Timer badge — top left */}
                    {timer && (
                      <span className="tc-timer">{timer}</span>
                    )}
                    {/* Unsent KOT badge — top right */}
                    {unsentCount > 0 && (
                      <span className="tc-unsent">{unsentCount}</span>
                    )}
                    <span className="table-number">{table.number}</span>
                    <span className={`table-status-dot dot-${st}`} />
                    <span className="table-status-text">{STATUS_LABEL[st]}</span>
                    {count > 0 && (
                      <span className="table-items-count">{count} items</span>
                    )}
                    {amount > 0 && (
                      <span className="table-amount">₹{amount.toLocaleString("en-IN")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
