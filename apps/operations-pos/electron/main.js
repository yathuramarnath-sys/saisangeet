const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const net  = require("net");
const os   = require("os");

// Keep a reference so IPC handlers that need a WebContents can use it.
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: "DineX POS",
    webPreferences: {
      preload:          path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  mainWindow.maximize();

  // Load built web app
  mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── get-printers IPC ──────────────────────────────────────────────────────────
// Returns the list of Windows-installed printers so the settings UI can let the
// cashier pick the exact device name that webContents.print() needs.
ipcMain.handle("get-printers", async () => {
  try {
    if (!mainWindow) return [];
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map((p) => ({
      name:      p.name,
      isDefault: p.isDefault,
      status:    p.status,
    }));
  } catch (err) {
    console.error("[get-printers] Failed:", err.message);
    return [];
  }
});

// ── print-html IPC ────────────────────────────────────────────────────────────
// Silent thermal printing path for the Windows Electron POS.
//
// Payload: { html: string, printerName: string|null, paperWidthMm: number }
//   html         — full HTML document string (from printBill.js / kotPrint.js)
//   printerName  — Windows printer device name (e.g. "EPSON TM-T82 Receipt")
//                  null/undefined → Electron uses the Windows default printer
//   paperWidthMm — 80 or 58 (passed through to @page size override)
//
// Returns: { ok: boolean, error?: string }
ipcMain.handle("print-html", async (event, { html, printerName, paperWidthMm = 80 }) => {
  return new Promise((resolve) => {
    // Hidden window — never shown on screen
    const win = new BrowserWindow({
      show:            false,
      skipTaskbar:     true,
      webPreferences: {
        nodeIntegration:  false,
        contextIsolation: true,
        // No preload needed — this window only renders HTML then prints
      },
    });

    // Safety net: destroy window if it never finishes loading (e.g. bad HTML)
    const timeoutHandle = setTimeout(() => {
      console.error("[print-html] Load timeout — destroying window");
      try { win.destroy(); } catch {}
      resolve({ ok: false, error: "load_timeout" });
    }, 8000);

    win.webContents.on("did-finish-load", () => {
      clearTimeout(timeoutHandle);

      // Allow a short settle time for CSS / inline font fallback to render.
      // Google Fonts may 404 in offline environments — Courier New fallback is fine.
      setTimeout(() => {
        const printOptions = {
          silent:          true,
          printBackground: true,
          margins:         { marginType: "none" },
          // pageRanges not needed — receipts are single-page
        };

        // Only set deviceName when we have an actual name.
        // Omitting it makes Electron use the Windows default printer.
        if (printerName && typeof printerName === "string" && printerName.trim()) {
          printOptions.deviceName = printerName.trim();
        }

        win.webContents.print(printOptions, (success, failureReason) => {
          try { win.destroy(); } catch {}
          if (success) {
            resolve({ ok: true });
          } else {
            console.error(
              `[print-html] webContents.print failed` +
              `${printerName ? ` (printer: "${printerName}")` : " (default printer)"}` +
              `: ${failureReason}`
            );
            resolve({ ok: false, error: failureReason });
          }
        });
      }, 400);
    });

    win.webContents.on("did-fail-load", (_e, errCode, errDesc) => {
      clearTimeout(timeoutHandle);
      try { win.destroy(); } catch {}
      console.error("[print-html] did-fail-load:", errCode, errDesc);
      resolve({ ok: false, error: errDesc });
    });

    // Load HTML as a base64 data URL — avoids temp-file I/O
    const encoded = Buffer.from(html, "utf8").toString("base64");
    win.loadURL(`data:text/html;base64,${encoded}`);
  });
});

// ── scan-printers IPC ─────────────────────────────────────────────────────────
// Probes port 9100 (ESC/POS thermal) across local subnets for network printers,
// and detects USB printers via OS-specific commands.
ipcMain.handle("scan-printers", async () => {
  const found = [];

  // ── 1. Network: probe port 9100 on all detected subnets ──────────────────
  const interfaces = os.networkInterfaces();
  const subnets = new Set();
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        const parts = addr.address.split(".");
        subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
    }
  }

  const TIMEOUT_MS = 400;
  const probes = [];

  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}.${i}`;
      probes.push(
        new Promise((resolve) => {
          const sock = new net.Socket();
          sock.setTimeout(TIMEOUT_MS);
          sock.once("connect", () => {
            found.push({ ip, name: `Printer @ ${ip}`, conn: "Network (IP)", source: "network" });
            sock.destroy();
            resolve();
          });
          sock.once("timeout", () => { sock.destroy(); resolve(); });
          sock.once("error",   () => { sock.destroy(); resolve(); });
          sock.connect(9100, ip);
        })
      );
    }
  }

  await Promise.all(probes);

  // ── 2. USB / system printers ─────────────────────────────────────────────
  const { execSync } = require("child_process");

  if (process.platform === "win32") {
    // Windows: use wmic to list installed printers
    try {
      const out = execSync("wmic printer get name /format:list", { timeout: 3000 }).toString();
      out.split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith("Name="))
        .map((l) => l.slice(5).trim())
        .filter(Boolean)
        .forEach((name) => {
          // Skip Microsoft virtual printers that ship with Windows
          if (/Microsoft|OneNote|PDF|XPS|Fax/i.test(name)) return;
          found.push({ name, ip: "", conn: "USB", usb: true, source: "windows" });
        });
    } catch (err) {
      console.warn("[scan-printers] wmic failed:", err.message);
    }
  } else {
    // macOS / Linux: use lpstat
    try {
      const lpstat = execSync("lpstat -p 2>/dev/null", { timeout: 2000 }).toString();
      lpstat
        .split("\n")
        .filter((l) => l.startsWith("printer"))
        .forEach((l) => {
          const name = l.split(" ")[1] || "USB Printer";
          found.push({ name, ip: "", conn: "USB", usb: true, source: "lpstat" });
        });
    } catch { /* no lpstat / unsupported */ }
  }

  return found;
});
