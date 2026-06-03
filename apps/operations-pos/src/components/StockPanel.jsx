import { useState } from "react";
import { api } from "../lib/api";

export function StockPanel({ outlet, menuItems, stockSnapshot, onClose, onStockUpdated }) {
  const [qty,     setQty]     = useState({}); // { itemId: inputValue }
  const [saving,  setSaving]  = useState({}); // { itemId: true }
  const [error,   setError]   = useState({});

  const outletId = outlet?.id;

  // Only show tracked items for this outlet
  const trackedItems = menuItems.filter(m => stockSnapshot[m.id] !== undefined);

  async function handleAdd(item) {
    const val = Number(qty[item.id]);
    if (!val || val <= 0) { setError(e => ({ ...e, [item.id]: "Enter a qty > 0" })); return; }
    setError(e => ({ ...e, [item.id]: "" }));
    setSaving(s => ({ ...s, [item.id]: true }));
    try {
      const entry = await api.post("/inventory/stock/add", {
        outletId,
        itemId:    item.id,
        qty:       val,
        updatedBy: "cashier",
      });
      onStockUpdated?.(item.id, entry.currentStock);
      setQty(q => ({ ...q, [item.id]: "" }));
    } catch (err) {
      setError(e => ({ ...e, [item.id]: err.message || "Failed" }));
    } finally {
      setSaving(s => ({ ...s, [item.id]: false }));
    }
  }

  return (
    <div className="sp-overlay" onClick={onClose}>
      <div className="sp-panel" onClick={e => e.stopPropagation()}>

        <div className="sp-header">
          <div>
            <p className="sp-eyebrow">Stock Management</p>
            <h3 className="sp-title">
              {trackedItems.length === 0
                ? "No items tracked"
                : `${trackedItems.length} item${trackedItems.length !== 1 ? "s" : ""} tracked`}
            </h3>
          </div>
          <button className="sp-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="sp-list">
          {trackedItems.length === 0 && (
            <div className="sp-empty">
              <span>📦</span>
              <p>No items are being tracked for this outlet.<br />Enable tracking in the Owner Console.</p>
            </div>
          )}
          {trackedItems.map(item => {
            const snap   = stockSnapshot[item.id] || {};
            const stock  = snap.currentStock ?? 0;
            const low    = snap.lowStockLevel ?? 0;
            const isOut  = stock <= 0 && snap.allowNegative === false;
            const isLow  = !isOut && low > 0 && stock <= low;

            return (
              <div key={item.id} className={`sp-row${isOut ? " sp-row--out" : isLow ? " sp-row--low" : ""}`}>
                <div className="sp-item-info">
                  <span className="sp-item-name">{item.name}</span>
                  <div className="sp-item-meta">
                    <span className={`sp-stock-val${isOut ? " out" : isLow ? " low" : ""}`}>
                      {stock} {item.unit || "units"}
                    </span>
                    {isOut  && <span className="sp-badge sp-badge--out">OUT</span>}
                    {isLow  && <span className="sp-badge sp-badge--low">LOW</span>}
                    {low > 0 && <span className="sp-threshold">threshold: {low}</span>}
                  </div>
                </div>
                <div className="sp-add-row">
                  <input
                    className="sp-qty-input"
                    type="number"
                    min="1"
                    placeholder="+Qty"
                    value={qty[item.id] || ""}
                    onChange={e => {
                      setQty(q => ({ ...q, [item.id]: e.target.value }));
                      setError(er => ({ ...er, [item.id]: "" }));
                    }}
                    onKeyDown={e => { if (e.key === "Enter") handleAdd(item); }}
                  />
                  <button
                    className="sp-add-btn"
                    onClick={() => handleAdd(item)}
                    disabled={saving[item.id]}
                  >
                    {saving[item.id] ? "…" : "Add"}
                  </button>
                </div>
                {error[item.id] && <p className="sp-row-error">{error[item.id]}</p>}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
