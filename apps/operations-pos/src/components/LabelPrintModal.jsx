/**
 * LabelPrintModal — Print barcode stickers for bakery / cafe products
 *
 * Features:
 *  - Search and select any menu item
 *  - MFD (Manufacturing Date) — defaults to today
 *  - EXP (Expiry Date) — user enters
 *  - Qty  (1–200 stickers)
 *  - Label size: 35×30mm (3/row) or 50×30mm (2/row)
 *  - Live mini-preview
 *  - Label printer IP / Windows printer name (stored in localStorage)
 */

import { useState, useMemo, useEffect } from "react";
import {
  printLabels,
  generateBarcodeDataUrl,
  generateQRDataUrl,
  getLabelPrinter,
} from "../lib/printLabel";

function extractPrice(val) {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  return Number(String(val || "").replace(/[^\d.]/g, "")) || 0;
}

// Today in DD/MM/YYYY
function todayStr() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

// Format a date string to DD/MM/YYYY if entered as YYYY-MM-DD (HTML date input)
function normaliseDate(val) {
  if (!val) return "";
  if (val.includes("-")) {
    const [y, m, d] = val.split("-");
    return `${d}/${m}/${y}`;
  }
  return val;
}

// Convert DD/MM/YYYY → YYYY-MM-DD for <input type="date">
function toInputDate(val) {
  if (!val) return "";
  const parts = val.split("/");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function LabelPrintModal({ menuItems = [], onClose }) {
  const stored = getLabelPrinter();

  const [search,      setSearch]      = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [mfdDate,     setMfdDate]     = useState(todayStr());
  const [expDate,     setExpDate]     = useState("");
  const [qty,         setQty]         = useState(1);
  const [labelSize,   setLabelSize]   = useState(stored.paper || "35x30");
  const [barcodeType, setBarcodeType] = useState(stored.barcodeType || "code128");
  const [printing,    setPrinting]    = useState(false);
  const [barcodeUrl,  setBarcodeUrl]  = useState(null);

  // Filtered item list
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return menuItems.slice(0, 40);
    return menuItems.filter(i => i.name?.toLowerCase().includes(q)).slice(0, 40);
  }, [menuItems, search]);

  // Generate barcode/QR preview whenever item or type changes
  useEffect(() => {
    if (!selectedItem) { setBarcodeUrl(null); return; }
    const raw = (selectedItem.sku || selectedItem.id || selectedItem.name || "ITEM")
      .replace(/[^\x20-\x7E]/g, "") || "ITEM";
    try {
      if (barcodeType === "qrcode") {
        setBarcodeUrl(generateQRDataUrl(raw.slice(0, 200)));
      } else {
        setBarcodeUrl(generateBarcodeDataUrl(raw.slice(0, 48)));
      }
    } catch { setBarcodeUrl(null); }
  }, [selectedItem, barcodeType]);

  async function handlePrint() {
    if (!selectedItem) return;
    setPrinting(true);
    try {
      await printLabels(selectedItem, { mfdDate, expDate, qty, labelSize, barcodeType });
    } finally {
      setPrinting(false);
    }
  }

  const itemPriceNum = selectedItem
    ? extractPrice(selectedItem.pricing?.[0]?.dineIn ?? selectedItem.takeawayPrice ?? selectedItem.price)
    : 0;
  const priceStr = itemPriceNum > 0 ? `Rs.${itemPriceNum.toFixed(2)}` : "";
  const is35   = labelSize === "35x30";
  const isQR   = barcodeType === "qrcode";
  const previewPx = is35 ? 96 : 130;   // approximate px width for preview div

  return (
    <div className="lpm-overlay" role="dialog" aria-modal="true">
      <div className="lpm-modal">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="lpm-head">
          <div>
            <h3>Print Labels</h3>
            <p className="lpm-sub">Barcode stickers for bakery &amp; packaged items</p>
          </div>
          <button type="button" className="lpm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="lpm-body">

          {/* ── Left: configuration ─────────────────────────────────── */}
          <div className="lpm-left">

            {/* Item search */}
            <div className="lpm-section">
              <label className="lpm-label">Item</label>
              <input
                type="search"
                className="lpm-search"
                placeholder="Search menu item…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              <div className="lpm-item-list">
                {filtered.length === 0 && (
                  <p className="lpm-empty">No items found</p>
                )}
                {filtered.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={`lpm-item-row${selectedItem?.id === item.id ? " selected" : ""}`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <span className="lpm-item-name">{item.name}</span>
                    {extractPrice(item.pricing?.[0]?.dineIn ?? item.takeawayPrice ?? item.price) > 0 &&
                      <span className="lpm-item-price">
                        Rs.{extractPrice(item.pricing?.[0]?.dineIn ?? item.takeawayPrice ?? item.price).toFixed(0)}
                      </span>
                    }
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="lpm-row-2">
              <div className="lpm-field">
                <label className="lpm-label">MFD Date</label>
                <input
                  type="date"
                  className="lpm-input"
                  value={toInputDate(mfdDate)}
                  onChange={e => setMfdDate(normaliseDate(e.target.value))}
                />
              </div>
              <div className="lpm-field">
                <label className="lpm-label">EXP Date <span className="lpm-req">*</span></label>
                <input
                  type="date"
                  className="lpm-input"
                  value={toInputDate(expDate)}
                  onChange={e => setExpDate(normaliseDate(e.target.value))}
                />
              </div>
            </div>

            {/* Qty + Size */}
            <div className="lpm-row-2">
              <div className="lpm-field">
                <label className="lpm-label">Quantity</label>
                <input
                  type="number"
                  className="lpm-input"
                  min="1"
                  max="200"
                  value={qty}
                  onChange={e => setQty(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                />
              </div>
              <div className="lpm-field">
                <label className="lpm-label">Label Size</label>
                <select
                  className="lpm-input"
                  value={labelSize}
                  onChange={e => setLabelSize(e.target.value)}
                >
                  <option value="35x30">35 × 30 mm (3 per row)</option>
                  <option value="50x30">50 × 30 mm (2 per row)</option>
                </select>
              </div>
            </div>

            {/* Barcode Type */}
            <div className="lpm-field">
              <label className="lpm-label">Barcode Type</label>
              <div className="lpm-toggle-group">
                <button
                  type="button"
                  className={`lpm-toggle-btn${!isQR ? " active" : ""}`}
                  onClick={() => setBarcodeType("code128")}
                >
                  ▐▌▐▌ Code 128
                </button>
                <button
                  type="button"
                  className={`lpm-toggle-btn${isQR ? " active" : ""}`}
                  onClick={() => setBarcodeType("qrcode")}
                >
                  ⬛ QR Code
                </button>
              </div>
            </div>

            <p className="lpm-printer-hint" style={{ marginTop: 4 }}>
              ⚙️ Label printer configured in <strong>Settings → Printers</strong>
            </p>
          </div>

          {/* ── Right: preview ──────────────────────────────────────── */}
          <div className="lpm-right">
            <p className="lpm-label" style={{ marginBottom: 10 }}>Preview</p>

            {!selectedItem ? (
              <div className="lpm-preview-empty">
                <div className="lpm-preview-icon">🏷️</div>
                <p>Select an item to preview</p>
              </div>
            ) : (
              <>
                {/* Single label preview */}
                {isQR ? (
                  /* QR layout: side-by-side */
                  <div className="lpm-preview-label lpm-preview-qr" style={{ width: previewPx }}>
                    {barcodeUrl && (
                      <img src={barcodeUrl} alt="qr" className="lpm-prev-qr-img" />
                    )}
                    <div className="lpm-prev-qr-text">
                      <div className="lpm-prev-name">{selectedItem.name}</div>
                      {priceStr && <div className="lpm-prev-price">MRP: {priceStr}</div>}
                      {mfdDate && <div className="lpm-prev-date">Pkd: {mfdDate}</div>}
                      {expDate  && <div className="lpm-prev-date">Exp: {expDate}</div>}
                    </div>
                  </div>
                ) : (
                  /* Code 128 layout: column */
                  <div className="lpm-preview-label" style={{ width: previewPx }}>
                    <div className="lpm-prev-name">{selectedItem.name}</div>
                    {priceStr && <div className="lpm-prev-price">{priceStr}</div>}
                    <div className="lpm-prev-dates">
                      {mfdDate && `MFD: ${mfdDate}`}{mfdDate && expDate && "   "}{expDate && `EXP: ${expDate}`}
                    </div>
                    {barcodeUrl && (
                      <img
                        src={barcodeUrl}
                        alt="barcode"
                        className="lpm-prev-barcode"
                        style={{ width: previewPx - 12 }}
                      />
                    )}
                  </div>
                )}

                <p className="lpm-preview-info">
                  {qty} sticker{qty > 1 ? "s" : ""} ·{" "}
                  {is35 ? "35×30mm · 3 per row" : "50×30mm · 2 per row"} ·{" "}
                  {Math.ceil(qty / (is35 ? 3 : 2))} row{Math.ceil(qty / (is35 ? 3 : 2)) > 1 ? "s" : ""}
                </p>

                <button
                  type="button"
                  className="lpm-print-btn"
                  disabled={printing || !selectedItem}
                  onClick={handlePrint}
                >
                  {printing
                    ? <span className="pos-spinner" />
                    : `🖨 Print ${qty} Label${qty > 1 ? "s" : ""}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
