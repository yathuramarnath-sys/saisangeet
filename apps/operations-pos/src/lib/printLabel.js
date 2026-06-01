/**
 * printLabel.js — barcode label printing for POS
 *
 * Generates HTML labels with Code 128 barcodes via bwip-js.
 * Prints using the existing printHTML Electron pipeline (same as bills/KOTs).
 *
 * Label sizes:
 *   "35x30" → 3 labels per row on 105mm wide paper
 *   "50x30" → 2 labels per row on 100mm wide paper
 *
 * Label printer configured separately from receipt printer.
 * Stored in localStorage as JSON under "pos_label_printer":
 *   { winName: "TSC TTP-244 Pro", ip: "", paper: "35x30" }
 */

import bwipjs from "bwip-js";

export const LABEL_PRINTER_KEY = "pos_label_printer";

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

  const pad = 1.5;
  const inner = labelWidthMm - pad * 2;

  return `
<div style="
  width:${labelWidthMm}mm;
  height:30mm;
  display:inline-flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-start;
  padding:${pad}mm ${pad}mm 1mm;
  box-sizing:border-box;
  overflow:hidden;
  vertical-align:top;
  border-right:1px dashed #ccc;
">
  <div style="font-size:7pt;font-weight:800;text-align:center;line-height:1.25;width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${name}</div>
  ${priceStr ? `<div style="font-size:8pt;font-weight:800;text-align:center;margin:0.5mm 0;color:#000;">${priceStr}</div>` : ""}
  <div style="font-size:5.5pt;text-align:center;color:#444;line-height:1.5;">
    ${mfdDate ? `MFD: ${mfdDate}` : ""}${mfdDate && expDate ? "&nbsp;&nbsp;" : ""}${expDate ? `EXP: ${expDate}` : ""}
  </div>
  <img src="${barcodeDataUrl}" style="width:${inner}mm;height:auto;margin-top:1mm;display:block;" />
</div>`;
}

/**
 * Build a single QR Code label HTML block (side-by-side layout: QR left, text right).
 * Mirrors Zoho's "QR Code food" template: ~13mm QR, remaining width for text.
 */
function buildQRLabelDiv(item, mfdDate, expDate, qrDataUrl, labelWidthMm) {
  const name = (item.name || "Item").slice(0, 40);
  const raw  = item.pricing?.[0]?.dineIn ?? item.takeawayPrice ?? item.price ?? "";
  const mrpStr = raw !== "" && raw !== null ? `Rs.${Number(raw).toFixed(2)}` : "";

  const pad   = 1.5;
  const qrMm  = 13;   // QR code square size
  const gap   = 1.5;  // gap between QR and text

  return `
<div style="
  width:${labelWidthMm}mm;
  height:30mm;
  display:inline-flex;
  flex-direction:row;
  align-items:center;
  padding:${pad}mm;
  box-sizing:border-box;
  overflow:hidden;
  vertical-align:top;
  border-right:1px dashed #ccc;
">
  <img src="${qrDataUrl}" style="width:${qrMm}mm;height:${qrMm}mm;flex-shrink:0;display:block;" />
  <div style="margin-left:${gap}mm;flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:center;gap:1mm;">
    <div style="font-size:6.5pt;font-weight:800;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${name}</div>
    ${mrpStr ? `<div style="font-size:7pt;font-weight:800;color:#000;">MRP: ${mrpStr}</div>` : ""}
    ${mfdDate ? `<div style="font-size:5.5pt;color:#444;">Pkd Dt: ${mfdDate}</div>` : ""}
    ${expDate ? `<div style="font-size:5.5pt;color:#444;">Exp Dt: ${expDate}</div>` : ""}
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
