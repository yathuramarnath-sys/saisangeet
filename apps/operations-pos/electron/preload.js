const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Detect Electron in renderer
  isElectron: true,

  // ── Printer scan ─────────────────────────────────────────────────────────
  // Probes port 9100 across local subnets + reads USB printers from OS.
  // Returns: Array<{ name, ip, conn, usb?, source }>
  scanPrinters: () => ipcRenderer.invoke("scan-printers"),

  // ── System printer list ───────────────────────────────────────────────────
  // Returns the printers installed in Windows (Devices and Printers).
  // Each entry: { name: string, isDefault: boolean, status: number }
  // Used by Settings → Printers to let staff pick the exact Windows printer name.
  getPrinters: () => ipcRenderer.invoke("get-printers"),

  // ── Silent HTML printing ──────────────────────────────────────────────────
  // Main production print path for the Windows Electron POS.
  // Renders the given HTML in a hidden BrowserWindow and sends it to the
  // specified Windows printer without showing a print dialog.
  //
  // payload: {
  //   html:         string   — full HTML document
  //   printerName:  string   — exact Windows printer name; null → system default
  //   paperWidthMm: number   — 80 or 58 (informational; @page size is in the HTML)
  // }
  // Returns: Promise<{ ok: boolean, error?: string }>
  printHTML: (payload) => ipcRenderer.invoke("print-html", payload),

  // ── Cash drawer trigger ───────────────────────────────────────────────────
  // Sends ESC/POS cash drawer open pulse to the configured printer.
  // Works via network IP (TCP port 9100) or Windows USB printer queue.
  //
  // payload: {
  //   printerIp:   string|null  — IP address of network printer
  //   printerPort: number       — default 9100
  //   printerName: string|null  — Windows printer device name (USB path)
  // }
  // Returns: Promise<{ ok: boolean, error?: string }>
  triggerCashDrawer: (payload) => ipcRenderer.invoke("trigger-cash-drawer", payload),
});
