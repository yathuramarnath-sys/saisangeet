/**
 * LabelPrintModal (Owner Web) — batch barcode sticker printing
 *
 * Opened from the Menu Items table: each item row gets a "🏷️ Labels" button.
 * Uses browser print dialog (popup window) — no Electron dependency.
 */

import { useState, useEffect } from "react";
import { printLabels, generateBarcodeDataUrl } from "../../lib/printLabel";

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

export function LabelPrintModal({ item, onClose }) {
  const [mfdDate,   setMfdDate]   = useState(todayStr());
  const [expDate,   setExpDate]   = useState("");
  const [qty,       setQty]       = useState(1);
  const [labelSize, setLabelSize] = useState("35x30");
  const [printing,  setPrinting]  = useState(false);
  const [barcodeUrl, setBarcodeUrl] = useState(null);

  useEffect(() => {
    if (!item) return;
    const val = (item.sku || item.id || item.name || "ITEM")
      .replace(/[^\x20-\x7E]/g, "").slice(0, 48) || "ITEM";
    try { setBarcodeUrl(generateBarcodeDataUrl(val)); } catch { setBarcodeUrl(null); }
  }, [item]);

  if (!item) return null;

  const rawPrice  = item.pricing?.[0]?.dineIn ?? item.takeawayPrice ?? item.price ?? "";
  const priceStr  = rawPrice !== "" ? `Rs.${Number(rawPrice).toFixed(2)}` : "";
  const is35      = labelSize === "35x30";
  const previewPx = is35 ? 96 : 130;

  async function handlePrint() {
    setPrinting(true);
    try {
      await printLabels(item, { mfdDate, expDate, qty, labelSize });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="lpm-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="lpm-modal lpm-modal-sm">

        {/* Header */}
        <div className="lpm-head">
          <div>
            <h3>Print Labels — {item.name}</h3>
            <p className="lpm-sub">Barcode stickers for packaged products</p>
          </div>
          <button type="button" className="lpm-close" onClick={onClose}>✕</button>
        </div>

        <div className="lpm-body lpm-body-col">

          {/* Preview */}
          <div className="lpm-preview-center">
            <div className="lpm-preview-label" style={{ width: previewPx }}>
              <div className="lpm-prev-name">{item.name}</div>
              {priceStr && <div className="lpm-prev-price">{priceStr}</div>}
              <div className="lpm-prev-dates">
                {mfdDate && `MFD: ${mfdDate}`}{mfdDate && expDate && "   "}{expDate && `EXP: ${expDate}`}
              </div>
              {barcodeUrl && (
                <img src={barcodeUrl} alt="barcode" className="lpm-prev-barcode" style={{ width: previewPx - 12 }} />
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="lpm-controls">
            <div className="lpm-row-2">
              <div className="lpm-field">
                <label className="lpm-label">MFD Date</label>
                <input type="date" className="lpm-input" value={toInputDate(mfdDate)}
                  onChange={e => setMfdDate(normaliseDate(e.target.value))} />
              </div>
              <div className="lpm-field">
                <label className="lpm-label">EXP Date <span className="lpm-req">*</span></label>
                <input type="date" className="lpm-input" value={toInputDate(expDate)}
                  onChange={e => setExpDate(normaliseDate(e.target.value))} />
              </div>
            </div>

            <div className="lpm-row-2">
              <div className="lpm-field">
                <label className="lpm-label">Quantity</label>
                <input type="number" className="lpm-input" min="1" max="200" value={qty}
                  onChange={e => setQty(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} />
              </div>
              <div className="lpm-field">
                <label className="lpm-label">Label Size</label>
                <select className="lpm-input" value={labelSize} onChange={e => setLabelSize(e.target.value)}>
                  <option value="35x30">35×30mm (3 per row)</option>
                  <option value="50x30">50×30mm (2 per row)</option>
                </select>
              </div>
            </div>

            <p className="lpm-preview-info">
              {qty} sticker{qty > 1 ? "s" : ""} · {is35 ? "35×30mm · 3/row" : "50×30mm · 2/row"} ·{" "}
              {Math.ceil(qty / (is35 ? 3 : 2))} row{Math.ceil(qty / (is35 ? 3 : 2)) > 1 ? "s" : ""}
            </p>

            <button
              type="button"
              className="lpm-print-btn"
              disabled={printing}
              onClick={handlePrint}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {printing ? <span className="spinner-sm" /> : `🖨 Print ${qty} Label${qty > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
