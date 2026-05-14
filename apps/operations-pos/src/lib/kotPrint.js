/* ══════════════════════════════════════════════════════════════════════════════
   KOT PRINT UTILITY
   Generates a thermal-style KOT and prints it.

   Production path  (Windows Electron): silent via window.electronAPI.printHTML()
   Fallback         (browser / web):    popup window + window.print()

   Works for 80mm and 58mm paper widths.
   ══════════════════════════════════════════════════════════════════════════════ */

/** Load printers from localStorage */
export function loadPrinters() {
  try {
    return JSON.parse(localStorage.getItem("pos_printers") || "[]");
  } catch {
    return [];
  }
}

/** Load display settings */
function loadDisplaySettings() {
  try {
    return JSON.parse(localStorage.getItem("pos_display_settings") || "{}");
  } catch {
    return {};
  }
}

/**
 * Find the printer assigned to a specific kitchen station.
 * Falls back to default KOT printer if no station match found.
 */
export function getKotPrinterForStation(stationName) {
  const printers = loadPrinters();
  if (stationName) {
    const match = printers.find(
      p => p.station && p.station.toLowerCase() === stationName.toLowerCase()
        && isKotType(p.type)
    );
    if (match) return match;
  }
  return getKotPrinter();
}

/** Check if a printer type string includes KOT capability */
function isKotType(t) {
  return t === "KOT Printer" || t === "Both" || t === "Both (KOT + Bill)";
}

/** Check if a printer type string includes Bill capability */
function isBillType(t) {
  return t === "Bill Printer" || t === "Both" || t === "Both (KOT + Bill)";
}

/** Find the best KOT printer — prefers isDefault, falls back to first KOT/Both printer */
export function getKotPrinter() {
  const printers = loadPrinters();
  const kotPrinters = printers.filter(p => isKotType(p.type));
  if (!kotPrinters.length) return printers.find(p => p.isDefault) || null;
  return kotPrinters.find(p => p.isDefault) || kotPrinters[0];
}

/** Find the best Bill printer (Bills & KOTs station, or Bill Printer type) */
export function getBillPrinter() {
  const printers = loadPrinters();
  // Prefer printer on "Bills & KOTs" station
  const billingStation = printers.find(
    p => p.station && /bill|kot/i.test(p.station) && isBillType(p.type)
  );
  if (billingStation) return billingStation;
  const billPrinters = printers.filter(p => isBillType(p.type));
  if (!billPrinters.length) return printers.find(p => p.isDefault) || null;
  return billPrinters.find(p => p.isDefault) || billPrinters[0];
}

/**
 * Print a KOT window
 * @param {object} order  - full order object
 * @param {array}  items  - unsent items array (what to print)
 * @param {object} printer - printer config from pos_printers (or null = auto)
 * @param {number} kotSeq - KOT sequence number (optional)
 */
export function printKOT(order, items, printer = null, kotSeq = null, options = {}) {
  if (!items || !items.length) return;

  const resolvedPrinter = printer || getKotPrinter();
  const paper   = resolvedPrinter?.paper || "80mm";
  const width   = paper; // use mm to match actual paper width exactly
  const outletName = order.outletName || "Restaurant";
  const tableLabel = order.isCounter
    ? `${order.areaName || "Counter"} #${String(order.ticketNumber || "").padStart(3, "0")}`
    : `T${order.tableNumber}${order.areaName ? " - " + order.areaName : ""}`;

  const now     = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const kotNum      = kotSeq ? `KOT-${String(kotSeq).padStart(4, "0")}` : (order.kotNumber || `KOT-${order.orderNumber}`);
  const printerName = resolvedPrinter?.name || "Kitchen";
  const sentBy      = options.sentBy || order.cashierName || null;

  const itemsHTML = items.map(item => `
    <tr class="kot-item-row">
      <td class="kot-qty">${item.quantity}</td>
      <td class="kot-item-name">${item.name}${item.note ? `<div class="kot-item-note">${item.note}</div>` : ""}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${kotNum}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800;900&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Manrope', 'Courier New', monospace;
      font-size: 13px;
      width: ${width};
      margin: 0 auto;
      padding: 12px 10px 16px;
      background: #fff;
      color: #000;
    }

    .kot-header {
      text-align: center;
      margin-bottom: 6px;
      padding-bottom: 6px;
      border-bottom: 2px dashed #000;
    }
    .kot-outlet {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .kot-title {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #555;
      margin-top: 2px;
      text-transform: uppercase;
    }

    .kot-meta {
      margin: 6px 0;
      border-bottom: 1px dashed #aaa;
      padding-bottom: 6px;
    }
    /* KOT# + Table on same compact line */
    .kot-meta-id {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 13px;
      font-weight: 900;
      margin: 4px 0 2px;
    }
    .kot-meta-id .kot-num  { font-size: 15px; font-weight: 900; }
    .kot-meta-id .kot-tbl  { font-size: 13px; font-weight: 800; }
    /* Date + Time on same compact line */
    .kot-meta-dt {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 600;
      color: #555;
      margin: 1px 0;
    }
    .kot-meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin: 2px 0;
      font-weight: 700;
    }
    /* Keep .large for legacy compat — hidden via display:none below */
    .kot-meta-row.large { display: none; }
    .kot-meta-row .label { color: #666; font-weight: 600; }

    .kot-items {
      margin: 8px 0;
      border-bottom: 2px dashed #000;
      padding-bottom: 8px;
    }
    /* Table-based items layout — QTY narrow left, ITEM wide right */
    .kot-items-tbl {
      width: 100%;
      border-collapse: collapse;
    }
    .kot-items-tbl thead tr {
      border-bottom: 1px dashed #aaa;
    }
    .kot-items-tbl th {
      font-size: 10px; font-weight: 800; color: #777;
      letter-spacing: 1px; text-transform: uppercase;
      padding: 2px 0;
    }
    .kot-items-tbl th.kot-qty  { text-align: center; }
    .kot-items-tbl th.kot-item-name { text-align: left; padding-left: 6px; }
    .kot-item-row td { padding: 5px 0; vertical-align: top; border-bottom: 1px dotted #e0e0e0; }
    .kot-item-row:last-child td { border-bottom: none; }
    .kot-qty {
      font-size: 20px;
      font-weight: 900;
      width: 28px;
      text-align: center;
      line-height: 1.1;
      color: #000;
    }
    .kot-item-name {
      font-size: 13px;
      font-weight: 800;
      line-height: 1.3;
      padding-left: 6px;
    }
    .kot-item-note {
      font-size: 10px;
      color: #777;
      font-style: italic;
      display: block;
      margin-top: 2px;
      font-weight: 600;
    }

    .kot-footer {
      margin-top: 8px;
      text-align: center;
    }
    .kot-footer-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #555;
      font-weight: 700;
      margin: 2px 0;
    }
    .kot-printer-tag {
      text-align: center;
      font-size: 10px;
      color: #999;
      margin-top: 6px;
      font-style: italic;
    }

    @media print {
      @page {
        size: ${paper} auto;
        margin: 0;
      }
      body { padding: 6px 8px 32px; }
    }
  </style>
</head>
<body>
  <div class="kot-header">
    <div class="kot-outlet">${outletName}</div>
    <div class="kot-title">*** KITCHEN ORDER ***</div>
  </div>

  <div class="kot-meta">
    <!-- KOT# + Table on same compact row -->
    <div class="kot-meta-id">
      <span class="kot-num">${kotNum}</span>
      <span class="kot-tbl">${tableLabel}</span>
    </div>
    <!-- Date + Time on same compact row -->
    <div class="kot-meta-dt">
      <span>${dateStr}</span>
      <span>${timeStr}</span>
    </div>
    ${order.guests > 0 ? `
    <div class="kot-meta-row">
      <span class="label">Guests</span>
      <span>${order.guests}</span>
    </div>` : ""}
  </div>

  <div class="kot-items">
    <table class="kot-items-tbl">
      <thead>
        <tr><th class="kot-qty">QTY</th><th class="kot-item-name">ITEM</th></tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
  </div>

  <div class="kot-footer">
    <div class="kot-footer-row">
      <span>Total Items:</span>
      <span>${items.reduce((s, i) => s + i.quantity, 0)}</span>
    </div>
    ${sentBy ? `<div class="kot-footer-row"><span>Sent by:</span><span style="font-weight:900">${sentBy}</span></div>` : ""}
    <div class="kot-printer-tag">→ ${printerName}</div>
  </div>
</body>
</html>`;

  // ── Production path: Windows Electron silent printing ─────────────────────
  if (window.electronAPI?.printHTML) {
    // winName is the exact Windows printer name set in Settings → Printers.
    // Falls back to printer.name; null → Electron uses the Windows default printer.
    const printerName = resolvedPrinter?.winName || resolvedPrinter?.name || null;
    // Use IP for direct TCP printing regardless of connection type label —
    // this handles printers saved as "USB" that are actually on the network.
    const printerIp   = resolvedPrinter?.ip?.trim() || null;

    window.electronAPI
      .printHTML({ html, printerName, printerIp, paperWidthMm: paper === "58mm" ? 58 : 80 })
      .then((result) => {
        if (!result?.ok) {
          console.warn("[printKOT] Electron print failed:", result?.error);
          window.dispatchEvent(new CustomEvent("dinex:print-error", {
            detail: { source: "KOT", printerName, error: result?.error },
          }));
        }
      })
      .catch((err) => {
        console.error("[printKOT] Electron printHTML error:", err);
        window.dispatchEvent(new CustomEvent("dinex:print-error", {
          detail: { source: "KOT", printerName, error: err?.message || "unknown" },
        }));
      });

    return; // do NOT open a popup in Electron mode
  }

  // ── Fallback: browser popup + window.print() (plain browser / web mode) ──
  const w = window.open("", "_blank", `width=340,height=500,scrollbars=no`);
  if (!w) {
    console.warn("KOT print: popup blocked. Please allow popups for this site.");
    return;
  }
  w.document.write(html);
  w.document.close();

  // Auto-print after fonts load
  w.onload = () => {
    setTimeout(() => {
      w.focus();
      w.print();
      // Close after print dialog dismissed (most browsers)
      w.onafterprint = () => w.close();
      // Fallback close if onafterprint isn't fired
      setTimeout(() => { try { w.close(); } catch {} }, 3000);
    }, 350);
  };
}

/**
 * Should KOT auto-print? Reads the kotAutoSend display setting.
 */
export function kotAutoSendEnabled() {
  return loadDisplaySettings().kotAutoSend !== false; // default true
}
