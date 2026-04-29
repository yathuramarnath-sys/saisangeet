import { tapImpact } from "../lib/haptics";
import { tableStatusOf } from "./TableFloor";

const STATUS_LABEL = { open: "Free", hold: "Hold", bill: "Bill", running: "Busy" };

export function TransferModal({ currentTableId, areas, orders, onTransfer, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <span className="sheet-handle" />
        <div className="sheet-header">
          <h3 className="sheet-title">Transfer Table</h3>
          <p className="sheet-subtitle">Move order to an empty table</p>
        </div>
        <div className="sheet-body">
          {areas.map(area => {
            const others = area.tables.filter(t => t.id !== currentTableId);
            if (!others.length) return null;
            return (
              <div key={area.id} className="transfer-area">
                <p className="transfer-area-name">{area.name}</p>
                <div className="transfer-grid">
                  {others.map(t => {
                    const st     = tableStatusOf(orders, t.id);
                    const isOpen = st === "open";
                    return (
                      <button
                        key={t.id}
                        className={`transfer-chip${isOpen ? " transfer-chip-free" : " transfer-chip-busy"}`}
                        onClick={() => { if (isOpen) { tapImpact(); onTransfer(currentTableId, t.id); } }}
                        disabled={!isOpen}
                      >
                        <span className="tc-number">{t.number}</span>
                        <span className="tc-status">{STATUS_LABEL[st]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
