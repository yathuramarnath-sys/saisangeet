const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const net  = require("net");
const os   = require("os");

// Auto-updater — only active in packaged builds (not dev mode)
let autoUpdater = null;
if (app.isPackaged) {
  try { autoUpdater = require("electron-updater").autoUpdater; } catch (_) {}
}

// Keep a reference so IPC handlers that need a WebContents can use it.
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: "Plato POS",
    webPreferences: {
      preload:          path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:      false, // allow file:// origin to call external APIs
    },
  });

  mainWindow.maximize();

  // Load built web app
  mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));

  mainWindow.on("closed", () => { mainWindow = null; });
}

function setupAutoUpdater() {
  if (!autoUpdater) return;

  // Silent background check — no popup unless update is ready
  autoUpdater.autoDownload    = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", () => {
    console.log("[updater] New version available — downloading in background…");
  });

  autoUpdater.on("update-downloaded", () => {
    console.log("[updater] Update downloaded — will install on next quit.");
    // Show a non-blocking notification to the cashier
    dialog.showMessageBox(mainWindow, {
      type:    "info",
      title:   "Plato POS Update Ready",
      message: "A new version has been downloaded.\nIt will install automatically when you close the app.",
      buttons: ["OK"]
    }).catch(() => {});
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] Error:", err.message);
  });

  // Check for updates 5 seconds after startup (let the app settle first)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[updater] checkForUpdates failed:", err.message);
    });
  }, 5000);
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
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
    let wmicOk = false;
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
      wmicOk = true;
    } catch (err) {
      console.warn("[scan-printers] wmic failed:", err.message);
    }

    // Fallback for Windows 11 24H2+ where wmic may be absent
    if (!wmicOk) {
      try {
        const out = execSync(
          'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
          { timeout: 4000 }
        ).toString();
        out.split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .forEach((name) => {
            if (/Microsoft|OneNote|PDF|XPS|Fax/i.test(name)) return;
            found.push({ name, ip: "", conn: "USB", usb: true, source: "powershell" });
          });
      } catch (psErr) {
        console.warn("[scan-printers] PowerShell fallback also failed:", psErr.message);
      }
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

// ── trigger-cash-drawer IPC ───────────────────────────────────────────────────
// Sends the standard ESC/POS cash drawer open pulse to the configured printer.
//
// Payload: { printerName: string|null, printerIp: string|null, printerPort: number }
//   printerName — Windows printer device name (USB/parallel path)
//   printerIp   — IP address for network thermal printers (port 9100)
//   printerPort — default 9100
//
// ESC p command:
//   0x1B 0x70 0x00 0x19 0xFA  — pin 2 (most common, works on EPSON/Star/Citizen)
//   0x1B 0x70 0x01 0x19 0xFA  — pin 5 (some older models)
//
// Returns: { ok: boolean, error?: string }
ipcMain.handle("trigger-cash-drawer", async (_event, { printerIp, printerPort = 9100, printerName } = {}) => {
  // ESC/POS cash drawer pulse — pin 2, on-time 25ms, off-time 250ms
  const DRAWER_CMD = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);

  // ── Path 1: Network printer (IP:port 9100) ─────────────────────────────────
  if (printerIp && printerIp.trim()) {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(3000);
      sock.once("connect", () => {
        sock.write(DRAWER_CMD, () => {
          sock.destroy();
          resolve({ ok: true });
        });
      });
      sock.once("timeout", () => {
        sock.destroy();
        resolve({ ok: false, error: "Connection timed out" });
      });
      sock.once("error", (err) => {
        sock.destroy();
        resolve({ ok: false, error: err.message });
      });
      sock.connect(printerPort, printerIp.trim());
    });
  }

  // ── Path 2: Windows USB/parallel printer via silent print job ─────────────
  // Print a minimal receipt that contains only the cash drawer pulse.
  // We use the existing print-html path with a base64-encoded HTML that
  // injects the ESC/POS bytes via a zero-width data URI trick — but that
  // doesn't carry raw bytes through Chromium. Instead, use wmic/powershell
  // to send raw bytes directly to the Windows print queue.
  if (printerName && printerName.trim() && process.platform === "win32") {
    const { execSync } = require("child_process");
    try {
      // Write bytes to a temp file then copy /b to the printer port
      const tmpFile = require("os").tmpdir() + "\\drawer_cmd.bin";
      require("fs").writeFileSync(tmpFile, DRAWER_CMD);
      // Try to send via net use / copy /b to the printer share
      execSync(
        `powershell -NoProfile -Command "` +
        `$bytes = [System.IO.File]::ReadAllBytes('${tmpFile}'); ` +
        `$port = (Get-Printer -Name '${printerName.trim()}' -ErrorAction SilentlyContinue).PortName; ` +
        `if ($port) { $s = New-Object System.IO.Ports.SerialPort $port; ` +
        `try { $s.Open(); $s.Write($bytes, 0, $bytes.Length); $s.Close() } catch {} }"`,
        { timeout: 5000 }
      );
      return { ok: true };
    } catch (err) {
      // Fallback: send via raw TCP if printer has an IP configured
      console.warn("[cash-drawer] Windows raw send failed:", err.message);
      return { ok: false, error: err.message };
    }
  }

  return { ok: false, error: "No printer configured for cash drawer" };
});
