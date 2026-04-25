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
        && (p.type === "KOT Printer" || p.type === "Both")
    );
    if (match) return match;
  }
  return getKotPrinter();
}

/** Find the best KOT printer — prefers isDefault, falls back to first KOT/Both printer */
export function getKotPrinter() {
  const printers = loadPrinters();
  const kotPrinters = printers.filter(p => p.type === "KOT Printer" || p.type === "Both");
  if (!kotPrinters.length) return printers.find(p => p.isDefault) || null;
  return kotPrinters.find(p => p.isDefault) || kotPrinters[0];
}

/** Find the best Bill printer (Bills & KOTs station, or Bill Printer type) */
export function getBillPrinter() {
  const printers = loadPrinters();
  // Prefer printer on "Bills & KOTs" station
  const billingStation = printers.find(
    p => p.station && /bill|kot/i.test(p.station)
      && (p.type === "Bill Printer" || p.type === "Both")
  );
  if (billingStation) return billingStation;
  const billPrinters = printers.filter(p => p.type === "Bill Printer" || p.type === "Both");
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
export function printKOT(order, items, printer = null, kotSeq = null) {
  if (!items || !items.length) return;

  const resolvedPrinter = printer || getKotPrinter();
  const paper   = resolvedPrinter?.paper || "80mm";
  const width   = paper === "58mm" ? "200px" : "280px";
  const outletName = order.outletName || "Restaurant";
  const tableLabel = order.isCounter
    ? `${order.areaName || "Counter"} #${String(order.ticketNumber || "").padStart(3, "0")}`
    : `Table ${order.tableNumber}  ·  ${order.areaName || ""}`;

  const now     = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const kotNum  = kotSeq ? `KOT-${String(kotSeq).padStart(4, "0")}` : (order.kotNumber || `KOT-${order.orderNumber}`);
  const printerName = resolvedPrinter?.name || "Kitchen";

  const itemsHTML = items.map(item => `
    <div class="kot-item">
      <span class="kot-qty">${item.quantity}</span>
      <div class="kot-item-info">
        <span class="kot-item-name">${item.name}</span>
        ${item.note ? `<span class="kot-item-note">${item.note}</span>` : ""}
      </div>
    </div>
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
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px dashed #000;
    }
    .kot-outlet {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .kot-title {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 3px;
      color: #444;
      margin-top: 3px;
      text-transform: uppercase;
    }

    .kot-meta {
      margin: 8px 0;
      border-bottom: 1px dashed #aaa;
      padding-bottom: 8px;
    }
    .kot-meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin: 2px 0;
      font-weight: 700;
    }
    .kot-meta-row.large {
      font-size: 14px;
      font-weight: 900;
      margin: 5px 0 3px;
    }
    .kot-meta-row .label { color: #666; font-weight: 600; }

    .kot-items {
      margin: 10px 0;
      border-bottom: 2px dashed #000;
      padding-bottom: 10px;
    }
    .kot-items-header {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 800;
      color: #777;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #ddd;
    }
    .kot-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 5px 0;
      border-bottom: 1px dotted #e0e0e0;
    }
    .kot-item:last-child { border-bottom: none; }
    .kot-qty {
      font-size: 20px;
      font-weight: 900;
      min-width: 28px;
      text-align: center;
      line-height: 1.1;
      color: #000;
    }
    .kot-item-info {
      flex: 1;
      padding-top: 2px;
    }
    .kot-item-name {
      font-size: 13px;
      font-weight: 800;
      display: block;
      line-height: 1.3;
    }
    .kot-item-note {
      font-size: 10px;
      color: #777;
      font-style: italic;
      display: block;
      margin-top: 2px;
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
      body { padding: 6px 8px; }
    }
  </style>
</head>
<body>
  <div class="kot-header">
    <div class="kot-outlet">${outletName}</div>
    <div class="kot-title">★ Kitchen Order Ticket ★</div>
  </div>

  <div class="kot-meta">
    <div class="kot-meta-row large">
      <span>${tableLabel}</span>
      <span>${kotNum}</span>
    </div>
    <div class="kot-meta-row">
      <span class="label">Date</span>
      <span>${dateStr}</span>
    </div>
    <div class="kot-meta-row">
      <span class="label">Time</span>
      <span>${timeStr}</span>
    </div>
    ${order.guests > 0 ? `
    <div class="kot-meta-row">
      <span class="label">Guests</span>
      <span>${order.guests}</span>
    </div>` : ""}
  </div>

  <div class="kot-items">
    <div class="kot-items-header">
      <span>QTY</span>
      <span>ITEM</span>
    </div>
    ${itemsHTML}
  </div>

  <div class="kot-footer">
    <div class="kot-footer-row">
      <span>Total Items:</span>
      <span>${items.reduce((s, i) => s + i.quantity, 0)}</span>
    </div>
    <div class="kot-printer-tag">→ ${printerName}</div>
  </div>
</body>
</html>`;

  // ── Production path: Windows Electron silent printing ─────────────────────
  if (window.electronAPI?.printHTML) {
    // winName is the exact Windows printer name set in Settings → Printers.
    // Falls back to printer.name; null → Electron uses the Windows default printer.
    const printerName = resolvedPrinter?.winName || resolvedPrinter?.name || null;

    window.electronAPI
      .printHTML({ html, printerName, paperWidthMm: paper === "58mm" ? 58 : 80 })
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
