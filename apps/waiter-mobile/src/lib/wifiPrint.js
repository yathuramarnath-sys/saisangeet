/**
 * wifiPrint.js — Network printing for Android tablet
 *
 * How it works:
 *   The tablet and the thermal printer are on the same WiFi network.
 *   The printer has a static IP (e.g. 192.168.1.200) and listens on TCP port 9100.
 *   We POST the HTML to a tiny HTTP-to-TCP bridge running on the same network.
 *
 * Bridge options (user configures printer IP in Settings):
 *   Option A — Direct mode: tablet POSTs to http://[printerIp]:9100 if printer supports HTTP
 *   Option B — Proxy mode:  tablet POSTs to http://[posLocalIp]:4001/print
 *                           (if Windows POS is on same network — it forwards to printer)
 *   Option C — Fallback:    Android system print dialog (PDF / network print)
 *
 * In practice, most ESC/POS network printers respond to raw TCP on port 9100.
 * We send the ESC/POS bytes via a WebSocket-style raw connection.
 * Since WebSockets can't open raw TCP in a browser context, we use the proxy approach.
 */

/** Load printer config from localStorage */
export function loadTabletPrinters() {
  try {
    return JSON.parse(localStorage.getItem("captain_printers") || "[]");
  } catch {
    return [];
  }
}

export function saveTabletPrinters(printers) {
  try {
    localStorage.setItem("captain_printers", JSON.stringify(printers));
  } catch (_) {}
}

function getBillPrinter() {
  const printers = loadTabletPrinters();
  const bill = printers.find(p => p.type === "Bill Printer" || p.type === "Both");
  return bill || printers[0] || null;
}

function getKotPrinterForStation(stationName) {
  const printers = loadTabletPrinters();
  if (stationName) {
    const match = printers.find(
      p => p.station?.toLowerCase() === stationName.toLowerCase() &&
           (p.type === "KOT Printer" || p.type === "Both")
    );
    if (match) return match;
  }
  return printers.find(p => p.type === "KOT Printer" || p.type === "Both") || printers[0] || null;
}

/**
 * Send an HTML print job to the printer via the local proxy.
 *
 * The proxy endpoint is: http://[proxyIp]:4001/print
 * It accepts: { html, paperWidthMm }
 * It responds: { ok: true } or { ok: false, error: "..." }
 *
 * The proxy (running on the Windows POS or a Raspberry Pi) converts HTML → ESC/POS
 * and forwards the bytes to the printer via TCP port 9100.
 */
async function sendViaPosProxy(html, printerIp, paperWidthMm = 80) {
  const proxyIp = localStorage.getItem("captain_local_server_ip")?.trim();
  if (!proxyIp) throw new Error("No proxy IP configured. Set POS IP in Settings.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`http://${proxyIp}:4001/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, printerIp, paperWidthMm }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Proxy responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Main print function — tries proxy, falls back to system print dialog.
 */
async function wifiPrint(html, printerIp, paperWidthMm = 80) {
  // Try proxy (Windows POS or print server on same network)
  try {
    const result = await sendViaPosProxy(html, printerIp, paperWidthMm);
    if (result?.ok) return { ok: true };
    throw new Error(result?.error || "Proxy print failed");
  } catch (err) {
    console.warn("[wifiPrint] Proxy failed, falling back to system print:", err.message);
  }

  // Fallback: Android system print dialog
  const w = window.open("", "_blank", "width=420,height=700");
  if (!w) {
    window.dispatchEvent(new CustomEvent("dinex:print-error", {
      detail: { source: "Print", error: "Pop-up blocked. Allow pop-ups or set proxy IP in Settings." },
    }));
    return { ok: false, error: "popup blocked" };
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.onafterprint = () => w.close();
    setTimeout(() => { try { w.close(); } catch {} }, 3500);
  }, 500);

  return { ok: true, fallback: true };
}

// ─── Public API — same signature as Electron printHTML calls ─────────────────

export async function tabletPrintBill(html, paperWidthMm = 80) {
  const printer = getBillPrinter();
  const ip = printer?.ip?.trim() || "";
  return wifiPrint(html, ip, paperWidthMm);
}

export async function tabletPrintKOT(html, stationName, paperWidthMm = 80) {
  const printer = getKotPrinterForStation(stationName);
  const ip = printer?.ip?.trim() || "";
  return wifiPrint(html, ip, paperWidthMm);
}

export { getBillPrinter, getKotPrinterForStation };
