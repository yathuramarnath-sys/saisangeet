/**
 * printLabel.js — barcode label printing for POS
 *
 * Smart Print model:
 *   - No upfront configuration required.
 *   - On first print the UI shows an inline printer picker (SmartPrintButton).
 *   - Chosen printer is remembered in localStorage under LAST_LABEL_PRINTER_KEY.
 *   - Subsequent prints go directly to that printer — zero clicks.
 *   - Uses the new print-label Electron IPC which calls webContents.print({ deviceName })
 *     so ZPL drivers (Zebra ZD230) render the HTML correctly via their Windows driver.
 *
 * Label sizes:
 *   "35x30" → 3 labels per row on 105mm wide paper
 *   "50x30" → 2 labels per row on 100mm wide paper
 */

import bwipjs from "bwip-js";

// Legacy key — kept so old saved config isn't lost on upgrade
export const LABEL_PRINTER_KEY      = "pos_label_printer";
// Smart Print — stores only the Windows printer name (string)
export const LAST_LABEL_PRINTER_KEY = "pos_last_label_printer";

/**
 * Extract a numeric price from a value that may be:
 *   - a number  → returned as-is
 *   - a string  → "Rs 75", "Rs.75", "₹75", "75" → 75
 *   - null/undefined → 0
 */
function extractPrice(val) {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  return Number(String(val || "").replace(/[^\d.]/g, "")) || 0;
}

/** Last-used label printer name (Smart Print memory). */
export function getLastLabelPrinter() {
  return localStorage.getItem(LAST_LABEL_PRINTER_KEY) || null;
}
export function setLastLabelPrinter(name) {
  if (name) localStorage.setItem(LAST_LABEL_PRINTER_KEY, name);
  else localStorage.removeItem(LAST_LABEL_PRINTER_KEY);
}

/** Legacy config object — kept for backward compat. */
export function getLabelPrinter() {
  try {
    return JSON.parse(localStorage.getItem(LABEL_PRINTER_KEY) || "{}");
  } catch { return {}; }
}

export function saveLabelPrinter(config) {
  localStorage.setItem(LABEL_PRINTER_KEY, JSON.stringify(config));
}

/**
 * Generate a Code 128 barcode as a base64 PNG data URL.
 * Returns a data: URL string ready to embed in <img src>.
 */
export function generateBarcodeDataUrl(text) {
  const canvas = document.createElement("canvas");
  bwipjs.toCanvas(canvas, {
    bcid:        "code128",
    text:        String(text || "ITEM").slice(0, 48),
    scale:       2,
    height:      10,
    includetext: true,
    textxalign:  "center",
    textyoffset: 2,
  });
  return canvas.toDataURL("image/png");
}

/**
 * Generate a QR Code as a base64 PNG data URL.
 * Returns a data: URL string ready to embed in <img src>.
 */
export function generateQRDataUrl(text) {
  const canvas = document.createElement("canvas");
  bwipjs.toCanvas(canvas, {
    bcid:  "qrcode",
    text:  String(text || "ITEM").slice(0, 200),
    scale: 3,
  });
  return canvas.toDataURL("image/png");
}

/**
 * Build a single Code-128 label HTML block (column layout).
 * Width is set from labelWidthMm. Height is fixed 30mm.
 */
function buildLabelDiv(item, mfdDate, expDate, barcodeDataUrl, labelWidthMm) {
  const name = (item.name || "Item").slice(0, 40);
  const rawVal   = item.pricing?.[0]?.dineIn ?? item.takeawayPrice ?? item.price ?? "";
  const priceNum = rawVal !== "" && rawVal != null ? extractPrice(rawVal) : 0;
  const priceStr = priceNum > 0 ? `Rs.${priceNum.toFixed(2)}` : "";

  const pad   = 1;
  const inner = labelWidthMm - pad * 2;

  return `
<div style="
  width:${labelWidthMm}mm;
  height:30mm;
  display:inline-flex;
  flex-direction:column;
  align-items:flex-start;
  padding:${pad}mm;
  box-sizing:border-box;
  overflow:hidden;
  vertical-align:top;
  border-right:1px dashed #ccc;
  font-family:Arial,Helvetica,sans-serif;
">
  <img src="${barcodeDataUrl}" style="width:${inner}mm;height:10mm;display:block;" />
  <div style="font-size:6.5pt;font-weight:800;line-height:1.3;width:100%;">${name}</div>
  ${mfdDate ? `<div style="font-size:6pt;font-weight:700;line-height:1.3;">PKD: ${mfdDate}</div>` : ""}
  ${expDate  ? `<div style="font-size:6pt;font-weight:700;line-height:1.3;">EXP: ${expDate}</div>`  : ""}
  ${priceStr ? `<div style="font-size:8.5pt;font-weight:900;line-height:1.3;">${priceStr}</div>` : ""}
</div>`;
}

/**
 * Build a single QR Code label HTML block (side-by-side layout: QR left, text right).
 * Mirrors Zoho's "QR Code food" template: ~13mm QR, remaining width for text.
 */
function buildQRLabelDiv(item, mfdDate, expDate, qrDataUrl, labelWidthMm) {
  const name = (item.name || "Item").slice(0, 40);
  const rawVal2  = item.pricing?.[0]?.dineIn ?? item.takeawayPrice ?? item.price ?? "";
  const mrpNum   = rawVal2 !== "" && rawVal2 != null ? extractPrice(rawVal2) : 0;
  const mrpStr   = mrpNum > 0 ? `Rs.${mrpNum.toFixed(2)}` : "";

  const pad  = 1;
  const qrMm = 15;

  return `
<div style="
  width:${labelWidthMm}mm;
  height:30mm;
  display:inline-flex;
  flex-direction:column;
  padding:${pad}mm;
  box-sizing:border-box;
  overflow:hidden;
  vertical-align:top;
  border-right:1px dashed #ccc;
  font-family:Arial,Helvetica,sans-serif;
">
  <div style="font-size:6.5pt;font-weight:900;text-align:center;line-height:1.2;width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex-shrink:0;">${name}</div>
  <div style="display:flex;flex-direction:row;flex:1;align-items:center;margin-top:0.5mm;overflow:hidden;">
    <img src="${qrDataUrl}" style="width:${qrMm}mm;height:${qrMm}mm;flex-shrink:0;display:block;" />
    <div style="margin-left:1mm;flex:1;display:flex;flex-direction:column;justify-content:center;overflow:hidden;">
      ${mrpStr ? `<div style="font-size:8pt;font-weight:900;line-height:1.3;">${mrpStr}</div>` : ""}
      ${mfdDate ? `<div style="font-size:5.5pt;font-weight:700;line-height:1.3;white-space:nowrap;">MFD:${mfdDate}</div>` : ""}
      ${expDate  ? `<div style="font-size:5.5pt;font-weight:700;line-height:1.3;white-space:nowrap;">EXP:${expDate}</div>`  : ""}
    </div>
  </div>
</div>`;
}

/**
 * Build the full printable HTML page with rows of labels.
 */
function buildLabelPageHtml(rows, pageWidthMm) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @page { size: ${pageWidthMm}mm 30mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; width: ${pageWidthMm}mm; }
    .lbl-row {
      display: flex;
      flex-direction: row;
      width: ${pageWidthMm}mm;
      height: 30mm;
      overflow: hidden;
      page-break-after: always;
    }
    .lbl-row:last-child { page-break-after: auto; }
  </style>
</head>
<body>
${rows.map(row => `<div class="lbl-row">${row.join("")}</div>`).join("\n")}
</body>
</html>`;
}

/**
 * Batch entry point — print labels for multiple items in one print job.
 *
 * @param {Array}   batch     [{ item, qty }, ...] — each item with its own qty
 * @param {object}  opts
 * @param {string}  opts.mfdDate      "DD/MM/YYYY" (common MFD for all)
 * @param {string}  opts.expDate      "DD/MM/YYYY" (common EXP for all)
 * @param {string}  opts.labelSize    "35x30" | "50x30"
 * @param {string}  opts.barcodeType  "code128" | "qrcode"
 * @param {string}  [opts.printerName]
 * @param {string}  [opts.printerIp]
 */
export async function printBatchLabels(batch, opts = {}) {
  const { mfdDate = "", expDate = "", labelSize = "35x30", barcodeType = "code128" } = opts;

  const is35     = labelSize === "35x30";
  const labelW   = is35 ? 35 : 50;
  const colCount = is35 ? 3 : 2;
  const pageW    = labelW * colCount;
  const isQR     = barcodeType === "qrcode";

  // Build all label divs across all items
  const allDivs = [];
  for (const { item, qty } of batch) {
    if (!item || !qty || qty < 1) continue;
    const barcodeVal = (item.sku || item.id || item.name || "ITEM")
      .replace(/[^\x20-\x7E]/g, "")
      .slice(0, 200) || "ITEM";
    const imgDataUrl = isQR
      ? generateQRDataUrl(barcodeVal)
      : generateBarcodeDataUrl(barcodeVal.slice(0, 48));

    for (let i = 0; i < qty; i++) {
      allDivs.push(
        isQR
          ? buildQRLabelDiv(item, mfdDate, expDate, imgDataUrl, labelW)
          : buildLabelDiv(item, mfdDate, expDate, imgDataUrl, labelW)
      );
    }
  }

  if (allDivs.length === 0) return;

  // Group into rows
  const rows = [];
  for (let i = 0; i < allDivs.length; i += colCount) {
    rows.push(allDivs.slice(i, i + colCount));
  }

  const html = buildLabelPageHtml(rows, pageW);

  const stored      = getLabelPrinter();
  const printerName = opts.printerName ?? stored.winName ?? null;
  const printerIp   = opts.printerIp   ?? stored.ip?.trim() ?? null;

  if (window.electronAPI?.printHTML) {
    const result = await window.electronAPI.printHTML({
      html,
      printerName: printerName || null,
      printerIp:   printerIp   || null,
      paperWidthMm: pageW,
    });
    if (!result?.ok) {
      window.dispatchEvent(new CustomEvent("dinex:print-error", {
        detail: { source: "Batch Labels", printerName, error: result?.error },
      }));
    }
    return result;
  }

  // Browser popup fallback
  const w = window.open("", "_blank", "width=700,height=500");
  if (!w) { alert("Please allow pop-ups to print labels."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.onafterprint = () => w.close();
    setTimeout(() => w.close(), 3500);
  }, 400);
}

/**
 * Main entry point — call from React component.
 *
 * @param {object}  item      Menu item: { name, pricing, price, sku, id }
 * @param {object}  opts
 * @param {string}  opts.mfdDate   "DD/MM/YYYY" or ""
 * @param {string}  opts.expDate   "DD/MM/YYYY" or ""
 * @param {number}  opts.qty       Number of stickers to print (1–200)
 * @param {string}  opts.labelSize "35x30" | "50x30"
 * @param {string}  [opts.barcodeType]  "code128" (default) | "qrcode"
 * @param {string}  [opts.printerName]  Windows printer name override
 * @param {string}  [opts.printerIp]    Network IP override
 */
export async function printLabels(item, opts = {}) {
  const { mfdDate = "", expDate = "", qty = 1, labelSize = "35x30", barcodeType = "code128" } = opts;

  const is35     = labelSize === "35x30";
  const labelW   = is35 ? 35 : 50;
  const colCount = is35 ? 3 : 2;
  const pageW    = labelW * colCount;

  // Barcode/QR value: prefer sku, then id, then sanitised name
  const barcodeVal = (item.sku || item.id || item.name || "ITEM")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 200) || "ITEM";

  const isQR = barcodeType === "qrcode";
  const imgDataUrl = isQR
    ? generateQRDataUrl(barcodeVal)
    : generateBarcodeDataUrl(barcodeVal.slice(0, 48));

  // Build all label divs
  const divs = Array.from({ length: Math.max(1, qty) }, () =>
    isQR
      ? buildQRLabelDiv(item, mfdDate, expDate, imgDataUrl, labelW)
      : buildLabelDiv(item, mfdDate, expDate, imgDataUrl, labelW)
  );

  // Group into rows of colCount
  const rows = [];
  for (let i = 0; i < divs.length; i += colCount) {
    rows.push(divs.slice(i, i + colCount));
  }

  const html = buildLabelPageHtml(rows, pageW);

  // Printer config — from opts (override) or stored settings
  const stored      = getLabelPrinter();
  const printerName = opts.printerName ?? stored.winName ?? null;
  const printerIp   = opts.printerIp   ?? stored.ip?.trim() ?? null;

  // ── Electron path ──────────────────────────────────────────────────────────
  if (window.electronAPI?.printHTML) {
    const result = await window.electronAPI.printHTML({
      html,
      printerName: printerName || null,
      printerIp:   printerIp   || null,
      paperWidthMm: pageW,
    });
    if (!result?.ok) {
      console.warn("[printLabel] Electron print failed:", result?.error);
      window.dispatchEvent(new CustomEvent("dinex:print-error", {
        detail: { source: "Label", printerName, error: result?.error },
      }));
    }
    return result;
  }

  // ── Browser popup fallback ─────────────────────────────────────────────────
  const w = window.open("", "_blank", "width=600,height=400");
  if (!w) { alert("Please allow pop-ups to print labels."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.onafterprint = () => w.close();
    setTimeout(() => w.close(), 3500);
  }, 400);
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart Print API — used by SmartPrintButton.
// Uses print-label IPC (webContents.print + deviceName) so ZPL/label printer
// drivers render the HTML correctly. Falls back to browser popup on non-Electron.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a single-item label job to the given Windows printer.
 * Called by SmartPrintButton after the user has chosen (or remembered) a printer.
 */
export async function printLabelSmart(item, opts = {}, printerName = null) {
  const { mfdDate = "", expDate = "", qty = 1, labelSize = "35x30", barcodeType = "code128" } = opts;

  const is35     = labelSize === "35x30";
  const labelW   = is35 ? 35 : 50;
  const colCount = is35 ? 3 : 2;
  const pageW    = labelW * colCount;

  const barcodeVal = (item.sku || item.id || item.name || "ITEM")
    .replace(/[^\x20-\x7E]/g, "").slice(0, 200) || "ITEM";

  const isQR      = barcodeType === "qrcode";
  const imgUrl    = isQR ? generateQRDataUrl(barcodeVal) : generateBarcodeDataUrl(barcodeVal.slice(0, 48));
  const divs      = Array.from({ length: Math.max(1, qty) }, () =>
    isQR ? buildQRLabelDiv(item, mfdDate, expDate, imgUrl, labelW)
         : buildLabelDiv(item, mfdDate, expDate, imgUrl, labelW)
  );
  const rows = [];
  for (let i = 0; i < divs.length; i += colCount) rows.push(divs.slice(i, i + colCount));
  const html = buildLabelPageHtml(rows, pageW);

  return _sendLabelHtml(html, printerName, pageW, 30);
}

/**
 * Send a batch label job to the given Windows printer.
 * Called by SmartPrintButton in BatchLabelModal after picker selection.
 */
export async function printBatchLabelsSmart(batch, opts = {}, printerName = null) {
  const { mfdDate = "", expDate = "", labelSize = "35x30", barcodeType = "code128" } = opts;

  const is35     = labelSize === "35x30";
  const labelW   = is35 ? 35 : 50;
  const colCount = is35 ? 3 : 2;
  const pageW    = labelW * colCount;
  const isQR     = barcodeType === "qrcode";

  const allDivs = [];
  for (const { item, qty } of batch) {
    if (!item || !qty || qty < 1) continue;
    const barcodeVal = (item.sku || item.id || item.name || "ITEM")
      .replace(/[^\x20-\x7E]/g, "").slice(0, 200) || "ITEM";
    const imgUrl = isQR ? generateQRDataUrl(barcodeVal) : generateBarcodeDataUrl(barcodeVal.slice(0, 48));
    for (let i = 0; i < qty; i++) {
      allDivs.push(
        isQR ? buildQRLabelDiv(item, mfdDate, expDate, imgUrl, labelW)
             : buildLabelDiv(item, mfdDate, expDate, imgUrl, labelW)
      );
    }
  }
  if (allDivs.length === 0) return;

  const rows = [];
  for (let i = 0; i < allDivs.length; i += colCount) rows.push(allDivs.slice(i, i + colCount));
  const html = buildLabelPageHtml(rows, pageW);

  return _sendLabelHtml(html, printerName, pageW, 30);
}

/** Internal: send built HTML via print-label IPC or browser popup fallback. */
async function _sendLabelHtml(html, printerName, paperWidthMm, paperHeightMm) {
  // ── Electron: use print-label IPC (webContents.print + deviceName) ──────────
  if (window.electronAPI?.printLabel) {
    const result = await window.electronAPI.printLabel({
      html,
      printerName:   printerName || null,
      paperWidthMm,
      paperHeightMm,
    });
    if (!result?.ok) {
      console.warn("[printLabelSmart] print-label failed:", result?.error);
      window.dispatchEvent(new CustomEvent("dinex:print-error", {
        detail: { source: "Label", printerName, error: result?.error },
      }));
    }
    return result;
  }

  // ── Browser popup fallback (non-Electron / dev) ────────────────────────────
  const w = window.open("", "_blank", "width=700,height=500");
  if (!w) { alert("Please allow pop-ups to print labels."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.onafterprint = () => w.close();
    setTimeout(() => w.close(), 3500);
  }, 400);
}
