import { tapImpact } from "../lib/haptics";

export function MergeModal({ currentTableId, currentOrder, areas, orders, onMerge, onClose }) {
  const occupied = [];
  areas.forEach(area => {
    area.tables.forEach(t => {
      if (t.id !== currentTableId && orders[t.id]?.items?.length > 0) {
        occupied.push({ table: t, area, order: orders[t.id] });
      }
    });
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <span className="sheet-handle" />
        <div className="sheet-header">
          <h3 className="sheet-title">Merge Tables</h3>
          <p className="sheet-subtitle">
            Combine another table into <strong>Table {currentOrder?.tableNumber}</strong>
          </p>
        </div>
        <div className="sheet-body">
          {occupied.length === 0 ? (
            <div className="sheet-empty">No other occupied tables</div>
          ) : (
            occupied.map(({ table, area, order: o }) => {
              const sub = (o.items || []).reduce((s, i) => s + i.price * i.quantity, 0);
              return (
                <button
                  key={table.id}
                  className="merge-row"
                  onClick={() => { tapImpact(); onMerge(currentTableId, table.id); }}
                >
                  <div className="merge-info">
                    <strong className="merge-table">Table {table.number}</strong>
                    <span className="merge-area">{area.name}</span>
                  </div>
                  <div className="merge-right">
                    <span className="merge-summary">{o.items?.length || 0} items · ₹{Math.round(sub * 1.05)}</span>
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
