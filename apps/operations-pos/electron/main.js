const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const net  = require("net");
const os   = require("os");

function createWindow() {
  const win = new BrowserWindow({
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

  win.maximize();

  // Load built web app
  win.loadFile(path.join(__dirname, "../dist/index.html"));
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

// ── Printer Scan IPC ──────────────────────────────────────────────────────────
// Probes port 9100 (ESC/POS thermal) across local subnets
ipcMain.handle("scan-printers", async () => {
  const found = [];

  // Get all local IPv4 addresses to determine subnet(s)
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

  // Probe IPs 1–254 on each subnet, port 9100 (ESC/POS)
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
            found.push({ ip, name: `Printer @ ${ip}`, conn: "Network (IP)" });
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

  // Also check for USB printers via system info (macOS/Windows)
  // On macOS, lpstat lists printers including USB
  try {
    const { execSync } = require("child_process");
    const lpstat = execSync("lpstat -p 2>/dev/null", { timeout: 2000 }).toString();
    const lines = lpstat.split("\n").filter((l) => l.startsWith("printer"));
    for (const line of lines) {
      const name = line.split(" ")[1] || "USB Printer";
      found.push({ name, ip: "", conn: "USB", usb: true });
    }
  } catch { /* no lpstat / Windows */ }

  return found;
});
