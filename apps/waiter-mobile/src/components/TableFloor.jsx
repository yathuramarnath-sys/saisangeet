import { useState } from "react";
import { tapImpact } from "../lib/haptics";

const STATUS_LABEL = { open: "Free", hold: "Hold", bill: "Bill Due", running: "Occupied" };
const STATUS_CLASS = { open: "status-free", hold: "status-hold", bill: "status-bill", running: "status-running" };

export function tableStatusOf(orders, tableId) {
  const o = orders[tableId];
  if (!o?.items?.length) return "open";
  if (o.isOnHold)        return "hold";
  if (o.billRequested)   return "bill";
  return "running";
}

export function TableFloor({ areas, orders, onSelectTable }) {
  const [activeArea, setActiveArea] = useState(null);
  const visible = activeArea ? areas.filter((a) => a.id === activeArea) : areas;

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
                const count  = order?.items?.length || 0;
                const _items  = (order?.items || []).filter(i => !i.isVoided && !i.isComp);
                const _sub    = _items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
                const _tax    = _items.reduce((s, i) => {
                  const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
                  return s + Math.round((i.price || 0) * (i.quantity || 0) * rate / 100);
                }, 0);
                const amount  = _sub + _tax;
                return (
                  <button
                    key={table.id}
                    className={`table-card ${STATUS_CLASS[st]}`}
                    onClick={() => { tapImpact(); onSelectTable(table.id, area); }}
                  >
                    <span className="table-number">{table.number}</span>
                    <span className={`table-status-dot dot-${st}`} />
                    <span className="table-status-text">{STATUS_LABEL[st]}</span>
                    {count > 0 && (
                      <span className="table-items-count">{count} items</span>
                    )}
                    {amount > 0 && (
                      <span className="table-amount">₹{amount}</span>
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
