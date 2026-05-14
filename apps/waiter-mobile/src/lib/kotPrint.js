/* ══════════════════════════════════════════════════════════════════════════════
   KOT PRINT UTILITY  — Captain / Waiter app
   Generates a thermal-style KOT and prints it.

   Production path  (Windows Electron): silent via window.electronAPI.printHTML()
   Android / web:   NO-OP — KOT is already routed to kitchen via socket/API.
                    The POS Electron app is the only device that talks TCP
                    to the thermal printer (port 9100). Captain app must NOT
                    open a browser popup — it never reaches the network printer.

   Works for 80mm and 58mm paper widths.
   ══════════════════════════════════════════════════════════════════════════════ */

/** Load printers from localStorage — Captain uses captain_printers, falls back to pos_printers */
export function loadPrinters() {
  try {
    const captain = JSON.parse(localStorage.getItem("captain_printers") || "[]");
    if (captain.length) return captain;
    return JSON.parse(localStorage.getItem("pos_printers") || "[]");
  } catch {
    return [];
  }
}

/** Load display settings — Captain uses captain_display_settings, falls back to pos_display_settings */
function loadDisplaySettings() {
  try {
    const c = JSON.parse(localStorage.getItem("captain_display_settings") || "{}");
    if (Object.keys(c).length) return c;
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

/**
 * Get the waiter/full-copy KOT printer.
 * Prefers a printer with NO station assignment (dedicated waiter copy printer).
 * Falls back to getKotPrinter() if all printers have stations.
 * Falls back to getBillPrinter() if that has an IP (bill printer also prints KOTs).
 */
export function getWaiterKotPrinter() {
  const printers = loadPrinters();
  const kotPrinters = printers.filter(p => p.type === "KOT Printer" || p.type === "Both");
  // First choice: KOT printer with no station (pure default/waiter printer)
  const noStation = kotPrinters.filter(p => !p.station || p.station.trim() === "");
  if (noStation.length) return noStation.find(p => p.isDefault) || noStation[0];
  // Second choice: any printer with no station (e.g. type Both/Bill also prints KOTs)
  const anyNoStation = printers.filter(p => !p.station || p.station.trim() === "");
  if (anyNoStation.length) return anyNoStation.find(p => p.isDefault) || anyNoStation[0];
  // Last resort: first available printer
  return getKotPrinter();
}

/** Find the best Bill printer — falls back to KOT printer if no bill-type printer configured */
export function getBillPrinter() {
  const printers = loadPrinters();
  // Prefer printer on "Bills & KOTs" station
  const billingStation = printers.find(
    p => p.station && /bill|kot/i.test(p.station)
      && (p.type === "Bill Printer" || p.type === "Both")
  );
  if (billingStation) return billingStation;
  const billPrinters = printers.filter(p => p.type === "Bill Printer" || p.type === "Both");
  if (billPrinters.length) return billPrinters.find(p => p.isDefault) || billPrinters[0];
  // No dedicated bill printer — fall back to the waiter KOT printer (same physical printer)
  return getWaiterKotPrinter();
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

  const resolvedPrinter0 = printer || getKotPrinter();
  const printerIp0       = resolvedPrinter0?.ip?.trim() || "";

  // ── Android native: direct TCP → printer (no POS proxy needed) ────────────
  // Import lazily to avoid loading Capacitor on non-Android paths
  if (typeof window !== "undefined" && !window.electronAPI?.printHTML) {
    import("./thermalPrint").then(({ isNativeAndroid, sendToThermalPrinter }) => {
      if (!isNativeAndroid()) return; // web fallback — no KOT print on plain browser

      import("./escpos").then(({ buildKotEscPos }) => {
        if (!printerIp0) {
          window.dispatchEvent(new CustomEvent("dinex:print-error", {
            detail: { source: "KOT", error: "No printer IP set. Go to Settings → Printers." },
          }));
          return;
        }

        const now0     = new Date();
        const timeStr0 = now0.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        const dateStr0 = now0.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        const kotNum0  = kotSeq
          ? `KOT-${String(kotSeq).padStart(4, "0")}`
          : (order.kotNumber || `KOT-${order.orderNumber}`);
        const tableLabel0 = order.isCounter
          ? `${order.areaName || "Counter"} #${String(order.ticketNumber || "").padStart(3, "0")}`
          : `T${order.tableNumber}${order.areaName ? " - " + order.areaName : ""}`;

        const escPosData = buildKotEscPos({
          outlet:      order.outletName || "Restaurant",
          table:       tableLabel0,
          kotNum:      kotNum0,
          date:        dateStr0,
          time:        timeStr0,
          guests:      order.guests > 0 ? String(order.guests) : "",
          items:       items.map(i => ({ qty: i.quantity, name: i.name, note: i.note || "" })),
          totalItems:  items.reduce((s, i) => s + i.quantity, 0),
          sentBy:      options.sentBy || order.cashierName || "",
          waiter:      order.assignedWaiter || "",
          printerName: resolvedPrinter0?.name || "Kitchen",
        });

        sendToThermalPrinter(printerIp0, escPosData)
          .then(result => {
            if (!result?.ok) {
              window.dispatchEvent(new CustomEvent("dinex:print-error", {
                detail: { source: "KOT", error: result?.error || "KOT print failed" },
              }));
            }
          });
      });
    });
    return; // Android handled above
  }

  // ── Web / non-Android: no-op (KOT sent to kitchen via socket, POS prints it)
  if (!window.electronAPI?.printHTML) return;

  const resolvedPrinter = printer || getKotPrinter();
  const paper   = resolvedPrinter?.paper || "80mm";
  const width   = paper === "58mm" ? "200px" : "280px";
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
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 3px;
      color: #444;
      margin-top: 3px;
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
      body { padding: 6px 8px 32px; }
    }
  </style>
</head>
<body>
  <div class="kot-header">
    <div class="kot-outlet">${outletName}</div>
    <div class="kot-title">★ Kitchen Order Ticket ★</div>
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
    ${sentBy ? `<div class="kot-footer-row"><span>Sent by:</span><span style="font-weight:900">${sentBy}</span></div>` : ""}
    <div class="kot-printer-tag">→ ${printerName}</div>
  </div>
</body>
</html>`;

  // ── Electron silent printing (already guarded above — this path IS Electron) ──
  // winName is the exact Windows printer name; falls back to display name.
  const winPrinterName = resolvedPrinter?.winName || resolvedPrinter?.name || null;
  const printerIp      = resolvedPrinter?.ip?.trim() || null;

  window.electronAPI
    .printHTML({ html, printerName: winPrinterName, printerIp, paperWidthMm: paper === "58mm" ? 58 : 80 })
    .then((result) => {
      if (!result?.ok) {
        console.warn("[printKOT] Electron print failed:", result?.error);
        window.dispatchEvent(new CustomEvent("dinex:print-error", {
          detail: { source: "KOT", printerName: winPrinterName, error: result?.error },
        }));
      }
    })
    .catch((err) => {
      console.error("[printKOT] Electron printHTML error:", err);
      window.dispatchEvent(new CustomEvent("dinex:print-error", {
        detail: { source: "KOT", printerName: winPrinterName, error: err?.message || "unknown" },
      }));
    });
}

/**
 * Should KOT auto-print? Reads the kotAutoSend display setting.
 */
export function kotAutoSendEnabled() {
  return loadDisplaySettings().kotAutoSend !== false; // default true
}
