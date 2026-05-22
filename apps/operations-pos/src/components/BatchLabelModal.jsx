/**
 * BatchLabelModal — Morning batch label printing for POS
 *
 * Staff select multiple items with per-item quantities,
 * set a common EXP date, and print all stickers in one job.
 *
 * Features:
 *  - Search + checkbox select any menu items
 *  - Per-item quantity (default 1, editable inline)
 *  - Select All / Clear All
 *  - Common EXP date (MFD defaults to today)
 *  - Label size + barcode type (loaded from printer config defaults)
 *  - "Repeat Yesterday's Batch" memory — one tap restores last batch
 *  - All labels print as one combined HTML job (single print dialog)
 *  - Printer config link → opens Settings → Printers
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { printBatchLabels, generateBarcodeDataUrl, generateQRDataUrl, getLabelPrinter } from "../lib/printLabel";

const BATCH_MEMORY_KEY = "pos_last_label_batch";

function todayStr() {
  const d  = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function normaliseDate(val) {
  if (!val) return "";
  if (val.includes("-")) {
    const [y, m, d] = val.split("-");
    return `${d}/${m}/${y}`;
  }
  return val;
}

function toInputDate(val) {
  if (!val) return "";
  const p = val.split("/");
  if (p.length !== 3) return "";
  return `${p[2]}-${p[1]}-${p[0]}`;
}

function loadLastBatch() {
  try { return JSON.parse(localStorage.getItem(BATCH_MEMORY_KEY) || "null") || null; }
  catch { return null; }
}

function saveLastBatch(batch, expDate) {
  try {
    localStorage.setItem(BATCH_MEMORY_KEY, JSON.stringify({
      items:   batch.map(({ id, qty }) => ({ id, qty })),
      expDate,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* ignore */ }
}

export function BatchLabelModal({ menuItems = [], onClose, onOpenSettings }) {
  const printerCfg = getLabelPrinter();

  const [search,      setSearch]      = useState("");
  const [selected,    setSelected]    = useState({});   // { itemId: qty }
  const [mfdDate,     setMfdDate]     = useState(todayStr());
  const [expDate,     setExpDate]     = useState("");
  const [labelSize,   setLabelSize]   = useState(printerCfg.paper       || "35x30");
  const [barcodeType, setBarcodeType] = useState(printerCfg.barcodeType || "code128");
  const [printing,    setPrinting]    = useState(false);
  const [printDone,   setPrintDone]   = useState(false);
  const [lastBatch,   setLastBatch]   = useState(() => loadLastBatch());

  // Filtered item list
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return menuItems.slice(0, 60);
    return menuItems.filter(i => i.name?.toLowerCase().includes(q)).slice(0, 60);
  }, [menuItems, search]);

  // Build batch array from selected state
  const batch = useMemo(() => {
    return menuItems
      .filter(i => selected[i.id] != null)
      .map(i => ({ item: i, id: i.id, qty: selected[i.id] }));
  }, [menuItems, selected]);

  const totalStickers = batch.reduce((s, b) => s + b.qty, 0);
  const is35      = labelSize === "35x30";
  const colCount  = is35 ? 3 : 2;
  const totalRows = Math.ceil(totalStickers / colCount);
  const isQR      = barcodeType === "qrcode";

  function toggleItem(item) {
    setSelected(s => {
      if (s[item.id] != null) {
        const next = { ...s };
        delete next[item.id];
        return next;
      }
      return { ...s, [item.id]: 1 };
    });
  }

  function setQty(id, val) {
    const n = Math.max(1, Math.min(200, Number(val) || 1));
    setSelected(s => ({ ...s, [id]: n }));
  }

  function selectAll() {
    const next = {};
    filtered.forEach(i => { next[i.id] = selected[i.id] ?? 1; });
    setSelected(s => ({ ...s, ...next }));
  }

  function clearAll() {
    setSelected({});
  }

  // Restore yesterday's batch
  function restoreBatch() {
    if (!lastBatch) return;
    const idMap = {};
    menuItems.forEach(i => { idMap[i.id] = i; });
    const next = {};
    lastBatch.items.forEach(({ id, qty }) => {
      if (idMap[id]) next[id] = qty;
    });
    setSelected(next);
    if (lastBatch.expDate) setExpDate(lastBatch.expDate);
  }

  async function handlePrint() {
    if (batch.length === 0) return;
    saveLastBatch(batch, expDate);
    setPrinting(true);
    setPrintDone(false);
    try {
      await printBatchLabels(batch, { mfdDate, expDate, labelSize, barcodeType });
      setPrintDone(true);
      setTimeout(() => setPrintDone(false), 3000);
    } finally {
      setPrinting(false);
    }
  }

  const selectedCount = Object.keys(selected).length;

  return (
    <div className="blm-overlay" role="dialog" aria-modal="true"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="blm-modal">

        {/* Header */}
        <div className="blm-head">
          <div>
            <h3>🏷️ Batch Label Print</h3>
            <p className="blm-sub">Select items and quantities for today's batch</p>
          </div>
          <button type="button" className="blm-close" onClick={onClose}>✕</button>
        </div>

        <div className="blm-body">

          {/* ── Left: item selection ─────────────────────────────────────── */}
          <div className="blm-left">

            {/* Search + select all */}
            <div className="blm-search-row">
              <input
                type="search"
                className="blm-search"
                placeholder="Search items…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              <button type="button" className="blm-sel-btn" onClick={selectAll}
                title="Select all visible items">All</button>
              <button type="button" className="blm-sel-btn danger" onClick={clearAll}
                title="Deselect all">Clear</button>
            </div>

            {/* Restore yesterday banner */}
            {lastBatch && lastBatch.items?.length > 0 && selectedCount === 0 && (
              <div className="blm-restore-banner">
                <span className="blm-restore-icon">↺</span>
                <span className="blm-restore-text">
                  Yesterday: <strong>{lastBatch.items.length} items</strong>
                  {lastBatch.expDate ? ` · EXP ${lastBatch.expDate}` : ""}
                </span>
                <button type="button" className="blm-restore-btn" onClick={restoreBatch}>
                  Restore
                </button>
              </div>
            )}

            {/* Item list */}
            <div className="blm-item-list">
              {filtered.length === 0 && (
                <p className="blm-empty">No items found</p>
              )}
              {filtered.map(item => {
                const isChecked = selected[item.id] != null;
                const price = item.pricing?.[0]?.dineIn ?? item.takeawayPrice ?? item.price;
                return (
                  <div
                    key={item.id}
                    className={`blm-item-row${isChecked ? " checked" : ""}`}
                  >
                    <label className="blm-item-check-area" onClick={() => toggleItem(item)}>
                      <span className={`blm-checkbox${isChecked ? " on" : ""}`}>
                        {isChecked ? "✓" : ""}
                      </span>
                      <span className="blm-item-name">{item.name}</span>
                      {price != null && (
                        <span className="blm-item-price">
                          Rs.{Number(price).toFixed(0)}
                        </span>
                      )}
                    </label>
                    {isChecked && (
                      <input
                        type="number"
                        className="blm-qty-input"
                        min="1"
                        max="200"
                        value={selected[item.id]}
                        onChange={e => setQty(item.id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: settings + summary + print ───────────────────────── */}
          <div className="blm-right">

            {/* Dates */}
            <div className="blm-section-title">Dates</div>
            <div className="blm-field">
              <label className="blm-label">MFD Date</label>
              <input type="date" className="blm-input"
                value={toInputDate(mfdDate)}
                onChange={e => setMfdDate(normaliseDate(e.target.value))} />
            </div>
            <div className="blm-field">
              <label className="blm-label">EXP Date <span className="blm-req">*</span></label>
              <input type="date" className="blm-input"
                value={toInputDate(expDate)}
                onChange={e => setExpDate(normaliseDate(e.target.value))} />
            </div>

            {/* Label settings */}
            <div className="blm-section-title" style={{ marginTop: 16 }}>Label Settings</div>
            <div className="blm-field">
              <label className="blm-label">Label Size</label>
              <select className="blm-input" value={labelSize}
                onChange={e => setLabelSize(e.target.value)}>
                <option value="35x30">35×30mm · 3/row</option>
                <option value="50x30">50×30mm · 2/row</option>
              </select>
            </div>
            <div className="blm-field">
              <label className="blm-label">Barcode Type</label>
              <div className="lpm-toggle-group">
                <button type="button"
                  className={`lpm-toggle-btn${!isQR ? " active" : ""}`}
                  onClick={() => setBarcodeType("code128")}>
                  ▐▌ Code 128
                </button>
                <button type="button"
                  className={`lpm-toggle-btn${isQR ? " active" : ""}`}
                  onClick={() => setBarcodeType("qrcode")}>
                  ⬛ QR Code
                </button>
              </div>
            </div>

            {/* Summary */}
            <div className="blm-summary">
              {selectedCount === 0 ? (
                <p className="blm-summary-empty">No items selected</p>
              ) : (
                <>
                  <div className="blm-summary-row">
                    <span>Items selected</span>
                    <strong>{selectedCount}</strong>
                  </div>
                  <div className="blm-summary-row">
                    <span>Total stickers</span>
                    <strong>{totalStickers}</strong>
                  </div>
                  <div className="blm-summary-row">
                    <span>Print rows</span>
                    <strong>{totalRows}</strong>
                  </div>
                </>
              )}
            </div>

            {/* Print button */}
            <button
              type="button"
              className="blm-print-btn"
              disabled={printing || selectedCount === 0}
              onClick={handlePrint}
            >
              {printing ? (
                <><span className="pos-spinner" /> Printing…</>
              ) : printDone ? (
                "✓ Sent to printer"
              ) : (
                `🖨 Print ${totalStickers > 0 ? `${totalStickers} ` : ""}Label${totalStickers !== 1 ? "s" : ""}`
              )}
            </button>

            {/* Printer settings link */}
            <button
              type="button"
              className="blm-settings-link"
              onClick={() => { onClose(); onOpenSettings?.(); }}
            >
              ⚙️ Label Printer Settings
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
