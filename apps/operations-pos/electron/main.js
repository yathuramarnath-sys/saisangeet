const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path   = require("path");
const net    = require("net");
const os     = require("os");
const http   = require("http");
const { Server: SocketIOServer } = require("socket.io");

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
    autoHideMenuBar: true,
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

  autoUpdater.autoDownload         = true;   // download silently in background
  autoUpdater.autoInstallOnAppQuit = true;   // install when cashier closes app

  autoUpdater.on("update-available", (info) => {
    console.log(`[updater] New version available: ${info.version}`);
    // Notify renderer — shows the in-app update banner
    mainWindow?.webContents.send("update:available", { version: info.version });
  });

  autoUpdater.on("download-progress", (progress) => {
    const pct = Math.round(progress.percent || 0);
    mainWindow?.webContents.send("update:progress", { percent: pct });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[updater] v${info.version} downloaded — installs on next quit`);
    // Notify renderer — shows "Ready to install" button
    mainWindow?.webContents.send("update:ready", { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] Error:", err.message);
  });

  // Check 5 s after startup so the UI is fully loaded first
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[updater] checkForUpdates failed:", err.message);
    });
  }, 5000);
}

// ── Updater IPC ───────────────────────────────────────────────────────────────
// Called by renderer when cashier clicks "Restart & Install"
ipcMain.on("update:install-now", () => {
  autoUpdater?.quitAndInstall();
});

// ── Local Network Server ──────────────────────────────────────────────────────
// Runs on port 4001, bound to all interfaces (0.0.0.0).
// Captain/KDS connect directly over local WiFi — no internet required.
// When internet is down, all floor operations (orders, KOTs, table status)
// continue uninterrupted through this server.

let localIo = null;
let localKotSeq = 9000;          // local KOT numbers (L-prefix avoids cloud collision)
const localOrderStore = {};       // tableId → latest order snapshot

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return "127.0.0.1";
}

function startLocalServer() {
  try {
    const httpServer = http.createServer((req, res) => {
      // Health check — Captain/KDS "Find POS" scan hits this
      if (req.url === "/health" || req.url === "/plato-pos") {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok: true, app: "plato-pos", port: 4001, ip: getLocalIp() }));
        return;
      }

      // WiFi print proxy — Android Tablet POS POSTs here to print via TCP port 9100
      // Accepts: POST /print { html, printerIp, paperWidthMm }
      // The POS machine forwards the job to the thermal printer on the same network.
      if (req.method === "POST" && req.url === "/print") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", async () => {
          try {
            const { html, printerIp, paperWidthMm = 80 } = JSON.parse(body);
            if (!html) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "Missing html" })); return; }
            const result = await printViaEscPosTcp(html, printerIp, 9100, paperWidthMm);
            res.writeHead(result.ok ? 200 : 500, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }

      // CORS preflight for /print
      if (req.method === "OPTIONS" && req.url === "/print") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }

      res.writeHead(404); res.end();
    });

    localIo = new SocketIOServer(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST"] },
      pingTimeout: 10000,
      pingInterval: 5000,
    });

    localIo.on("connection", (socket) => {
      console.log("[local] device connected:", socket.id, socket.handshake.query?.role || "");

      // ── New device joins — send current order snapshot ────────────────────
      socket.on("request:orders", () => {
        socket.emit("orders:snapshot", Object.values(localOrderStore));
      });

      // ── POS pushes its full order state (on POS start + after each settle) ─
      socket.on("pos:sync-orders", (orders) => {
        if (Array.isArray(orders)) {
          orders.forEach(o => { if (o?.tableId) localOrderStore[o.tableId] = o; });
        }
      });

      // ── Order update (from POS or Captain) → relay to all other devices ────
      socket.on("order:update", ({ order }) => {
        if (order?.tableId) localOrderStore[order.tableId] = order;
        socket.broadcast.emit("order:updated", order);
      });

      // ── Table cleared after settlement → remove from store + relay ─────────
      socket.on("order:clear", ({ tableId }) => {
        delete localOrderStore[tableId];
        socket.broadcast.emit("order:cleared", { tableId });
      });

      // ── KOT from Captain → assign local number → relay to KDS + POS ───────
      // The POS renderer receives kot:new and calls printKOT() directly.
      socket.on("kot:send", (kotData) => {
        localKotSeq++;
        const kot = { ...kotData, kotNumber: localKotSeq, localMode: true };
        // Mark items as sent in local store
        if (localOrderStore[kot.tableId]) {
          const kotItemIds = new Set((kot.items || []).map(i => i.id));
          localOrderStore[kot.tableId] = {
            ...localOrderStore[kot.tableId],
            items: (localOrderStore[kot.tableId].items || []).map(i =>
              kotItemIds.has(i.id) ? { ...i, sentToKot: true } : i
            ),
          };
        }
        localIo.emit("kot:new", kot);                                    // KDS + POS receive
        socket.emit("kot:confirmed", { kotNumber: localKotSeq });        // ack to Captain
      });

      // ── Bill request from Captain → relay to POS ───────────────────────────
      socket.on("bill:request", ({ tableId }) => {
        if (localOrderStore[tableId]) {
          localOrderStore[tableId] = { ...localOrderStore[tableId], billRequested: true };
        }
        socket.broadcast.emit("order:updated",
          localOrderStore[tableId] || { tableId, billRequested: true }
        );
      });

      socket.on("disconnect", () => {
        console.log("[local] device disconnected:", socket.id);
      });
    });

    httpServer.listen(4001, "0.0.0.0", () => {
      console.log(`[local] server running — http://${getLocalIp()}:4001`);
    });

    httpServer.on("error", (err) => {
      console.error("[local] server error:", err.message);
    });
  } catch (err) {
    console.error("[local] failed to start:", err.message);
  }
}

// ── Local server IPC ──────────────────────────────────────────────────────────

// Renderer calls this to get the machine's local IP + port for display in Settings
ipcMain.handle("get-local-server-info", () => ({
  ip:   getLocalIp(),
  port: 4001,
  url:  `http://${getLocalIp()}:4001`,
}));

// Renderer pushes orders to keep the local store in sync after each mutation
ipcMain.on("local:push-orders", (_event, orders) => {
  if (!Array.isArray(orders)) return;
  orders.forEach(o => { if (o?.tableId) localOrderStore[o.tableId] = o; });
});

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  startLocalServer();
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

// ── auto-install-printer IPC ──────────────────────────────────────────────────
// Automatically installs a TCP/IP network printer in Windows so the POS can
// print without requiring manual Windows printer setup.
//
// Payload: { ip, port?, displayName? }
// Returns: { ok: boolean, printerName?: string, error?: string }
ipcMain.handle("auto-install-printer", async (_event, { ip, port = 9100, displayName } = {}) => {
  if (process.platform !== "win32") return { ok: false, error: "Windows only" };
  if (!ip || !ip.trim()) return { ok: false, error: "No IP address provided" };

  const { execSync } = require("child_process");
  const cleanIp    = ip.trim();
  const portName   = `PlatoTCP_${cleanIp.replace(/\./g, "_")}`;
  const printerName = displayName?.trim() || `Plato Thermal ${cleanIp}`;

  try {
    // 1. Check if already installed — return immediately if so
    try {
      const existing = execSync(
        `powershell -NoProfile -Command "Get-Printer -Name '${printerName}' -ErrorAction Stop | Select-Object -ExpandProperty Name"`,
        { timeout: 6000 }
      ).toString().trim();
      if (existing === printerName) {
        console.log(`[auto-install-printer] Already installed: "${printerName}"`);
        return { ok: true, printerName, alreadyExists: true };
      }
    } catch { /* not installed yet — continue */ }

    // 2. Create TCP/IP port (silently skip if port already exists)
    execSync(
      `powershell -NoProfile -Command "` +
      `if (-not (Get-PrinterPort -Name '${portName}' -ErrorAction SilentlyContinue)) {` +
      ` Add-PrinterPort -Name '${portName}' -PrinterHostAddress '${cleanIp}' -PortNumber ${port}` +
      `}"`,
      { timeout: 10000 }
    );
    console.log(`[auto-install-printer] TCP port created: ${portName} → ${cleanIp}:${port}`);

    // 3. Try drivers in order — first match wins
    //    Microsoft IPP Class Driver: modern, handles rendered HTML/graphics
    //    Generic / Text Only: always present, plain text only
    const DRIVERS = [
      "Microsoft IPP Class Driver",
      "Generic / Text Only",
      "MS Publisher Imagesetter",
    ];

    let installed = false;
    for (const driver of DRIVERS) {
      try {
        execSync(
          `powershell -NoProfile -Command "Add-Printer -Name '${printerName}' -DriverName '${driver}' -PortName '${portName}' -ErrorAction Stop"`,
          { timeout: 12000 }
        );
        console.log(`[auto-install-printer] Installed "${printerName}" with driver "${driver}"`);
        installed = true;
        break;
      } catch { /* try next driver */ }
    }

    if (!installed) {
      return { ok: false, error: "Could not install — no compatible driver found on this Windows PC. Please install the Epson TM-T82 driver manually." };
    }

    return { ok: true, printerName };
  } catch (err) {
    console.error("[auto-install-printer] Error:", err.message);
    return { ok: false, error: err.message };
  }
});

// ── Shared: HTML → ESC/POS buffer ────────────────────────────────────────────
// Loads the receipt HTML in a hidden window, extracts structured data via JS,
// and builds the ESC/POS command string.  Returns { ok, buffer } or { ok:false, error }.
async function buildEscPosFromHtml(html) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false, skipTaskbar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    const timeoutHandle = setTimeout(() => {
      try { win.destroy(); } catch {}
      resolve({ ok: false, error: "load_timeout" });
    }, 8000);

    win.webContents.on("did-finish-load", async () => {
      clearTimeout(timeoutHandle);
      try {
        // Extract structured receipt data using CSS selectors
        const data = await win.webContents.executeJavaScript(`
          (function() {
            const q  = (s) => document.querySelector(s);
            const qa = (s) => Array.from(document.querySelectorAll(s));

            // ── Shift Closing Report ──────────────────────────────────────────
            if (q('.sr-outlet')) {
              return {
                type: 'SHIFT',
                outlet:  q('.sr-outlet')?.innerText?.trim() || '',
                title:   q('.sr-title')?.innerText?.trim() || 'SHIFT CLOSING REPORT',
                meta:    qa('.sr-meta').map(el => el.innerText?.trim()).join('  ') || '',
                rows:    qa('.sr-row').map(el => {
                  const spans = el.querySelectorAll('span');
                  return {
                    label:  spans[0]?.innerText?.trim() || '',
                    value:  spans[1]?.innerText?.trim() || '',
                    bold:   el.classList.contains('bold'),
                    ok:     el.classList.contains('ok'),
                    short:  el.classList.contains('short'),
                    over:   el.classList.contains('over'),
                  };
                }),
                sections: qa('.sr-section-title').map(el => el.innerText?.trim()),
                footer:  q('.sr-footer')?.innerText?.trim() || '',
              };
            }

            // ── KOT receipt ───────────────────────────────────────────────────
            if (q('.kot-outlet')) {
              const idRow    = q('.kot-meta-id');   // contains kot-tbl + kot-num
              const dtRow    = q('.kot-meta-dt');   // contains date + time spans
              const footRows = qa('.kot-footer-row');
              const guestRow = qa('.kot-meta-row');
              return {
                type:    'KOT',
                outlet:  q('.kot-outlet')?.innerText?.trim() || '',
                table:   q('.kot-tbl')?.innerText?.trim() || '',
                kotNum:  q('.kot-num')?.innerText?.trim() || '',
                date:    dtRow?.querySelector('span:first-child')?.innerText?.trim() || '',
                time:    dtRow?.querySelector('span:last-child')?.innerText?.trim()  || '',
                guests:  guestRow.find(r => r.innerText.includes('Guest'))?.querySelector(':last-child')?.innerText?.trim() || '',
                items:   qa('.kot-item-row').map(el => ({
                  qty:  el.querySelector('.kot-qty')?.innerText?.trim() || '',
                  name: el.querySelector('.kot-item-name')?.innerText?.trim() || '',
                  note: el.querySelector('.kot-item-note')?.innerText?.trim() || '',
                })),
                total:   footRows.find(r => r.innerText.includes('Total'))?.querySelector(':last-child')?.innerText?.trim() || '',
                sentBy:  footRows.find(r => r.innerText.includes('Sent'))?.querySelector(':last-child')?.innerText?.trim()  || '',
                printer: q('.kot-printer-tag')?.innerText || '',
              };
            }

            // ── Bill receipt ───────────────────────────────────────────────────
            const q2  = (s) => document.querySelector(s);
            const qa2 = (s) => Array.from(document.querySelectorAll(s));
            // Read .info-row divs — each row has .info-lbl + .info-val spans
            const infoRowEls = qa2('.info-row');
            function getInfoVal(label) {
              for (const row of infoRowEls) {
                const lbls = Array.from(row.querySelectorAll('.info-lbl'));
                for (const lbl of lbls) {
                  if (lbl.innerText.trim() === label) {
                    // .info-val is a sibling span in the same .left/.right div
                    const parent = lbl.parentElement;
                    return parent?.querySelector('.info-val')?.innerText?.trim() || '';
                  }
                }
              }
              return '';
            }
            // Parse phone and GSTIN from .outlet-meta divs (combined "Ph: xxx | GSTIN: yyy")
            let phone = '', gstin = '';
            for (const meta of qa2('.outlet-meta')) {
              const txt = meta.innerText || '';
              if (txt.includes('Ph:') && !phone) {
                const m = txt.match(/Ph:\s*([^|]+)/);
                if (m) phone = m[1].trim();
              }
              if (txt.includes('GSTIN:') && !gstin) {
                const m = txt.match(/GSTIN:\s*([^|]+)/);
                if (m) gstin = m[1].trim();
              }
            }
            // Items: only rows that have a non-empty .col-item cell (excludes summary table rows)
            const itemRows = qa2('.items-tbl tbody tr').filter(tr => {
              const itemCell = tr.querySelector('.col-item');
              return itemCell && itemCell.childNodes[0]?.textContent?.trim();
            });
            // Summary: rows with .sum-lbl + .sum-val (second .items-tbl)
            const summaryRows = qa2('.sum-lbl');
            // ── Credit / Bill To section ──────────────────────────────────
            const billToEl   = q2('.bill-to');
            const billToName = q2('.bill-to-name')?.innerText?.trim() || '';
            const billToMeta = billToEl
              ? Array.from(billToEl.querySelectorAll('.bill-to-meta'))
                  .map(el => el.innerText?.trim()).filter(Boolean)
              : [];
            const isTaxInvoice  = !!q2('.tax-invoice-badge');
            const isCreditBill  = !!q2('.credit-badge');

            return {
              type:          'BILL',
              outlet:        q2('.outlet-name')?.innerText?.trim() || '',
              invoiceHeader: q2('.invoice-header')?.innerText?.trim() || '',
              addr:          q2('.outlet-addr')?.innerText?.trim() || '',
              phone,
              gstin,
              fssai:         q2('.outlet-fssai')?.innerText?.trim() || '',
              seatLabel:     q2('.seat-tag')?.innerText?.trim() || '',
              isTaxInvoice,
              isCreditBill,
              billToName,
              billToMeta,
              date:          getInfoVal('Date'),
              time:          getInfoVal('Time'),
              table:         getInfoVal('Table'),
              orderType:     getInfoVal('Type'),
              cashier:       getInfoVal('Cashier'),
              billNo:        getInfoVal('Bill No'),
              captain:       getInfoVal('Captain'),
              waiter:        getInfoVal('Waiter'),
              items: itemRows.map(el => ({
                name: el.querySelector('.col-item')?.childNodes[0]?.textContent?.trim() || '',
                note: el.querySelector('.item-note')?.innerText?.trim() || '',
                qty:  el.querySelector('.col-qty')?.innerText?.trim() || '',
                rate: el.querySelector('.col-rate')?.innerText?.trim() || '',
                amt:  el.querySelector('.col-amt')?.innerText?.trim() || '',
              })),
              summary: summaryRows.map(el => ({
                label: el.innerText?.trim() || '',
                value: el.closest('tr')?.querySelector('.sum-val')?.innerText?.trim() || '',
              })),
              total:   q2('.total-row span:last-child')?.innerText?.trim() || '',
              footer:  q2('.footer p:last-child')?.innerText?.trim() || '',
            };
          })()
        `);
        try { win.destroy(); } catch {}

        // ── Build ESC/POS command buffer ───────────────────────────────────
        const ESC = '\x1B', GS = '\x1D';
        const INIT    = ESC + '@';
        const CUT     = GS  + 'V\x00';
        const LF      = '\n';
        const BOLD1   = ESC + 'E\x01';
        const BOLD0   = ESC + 'E\x00';
        const CENTER  = ESC + 'a\x01';
        const LEFT    = ESC + 'a\x00';
        const BIG     = ESC + '!\x30';   // double height + width
        const DBLH    = ESC + '!\x10';   // double height only (wider text, easier to read)
        const NORMAL  = ESC + '!\x00';
        const DASH48  = '-'.repeat(32);

        let cmd = INIT;

        if (data.type === 'SHIFT') {
          // ── Shift Closing Report ─────────────────────────────────────────
          cmd += CENTER + BOLD1 + BIG + (data.outlet || 'OUTLET') + NORMAL + BOLD0 + LF;
          cmd += CENTER + (data.title || 'SHIFT CLOSING REPORT') + LF;
          if (data.meta) cmd += CENTER + data.meta + LF;
          cmd += DASH48 + LF;
          for (const row of (data.rows || [])) {
            if (!row.label) continue;
            const lbl = row.label.padEnd(22);
            const val = (row.value || '').padStart(10);
            if (row.bold || row.ok || row.short || row.over) {
              cmd += BOLD1 + lbl + val + BOLD0 + LF;
            } else {
              cmd += lbl + val + LF;
            }
          }
          cmd += DASH48 + LF;
          if (data.footer) cmd += CENTER + data.footer + LF;

        } else if (data.type === 'KOT') {
          // Sanitise table label — replace · (U+00B7) which isn't latin1-safe
          const kotTable = (data.table || '').replace(/·/g, '-').replace(/⋅/g, '-');
          // Header — outlet name only (no subtitle to save paper)
          cmd += CENTER + BOLD1 + BIG + (data.outlet || 'KITCHEN') + NORMAL + BOLD0 + LF;
          cmd += CENTER + '*** KITCHEN ORDER ***' + LF;
          cmd += DASH48 + LF;
          // Table (left) + KOT number (right) — single bold line
          const tblStr = kotTable.substring(0, 18).padEnd(18);
          const kotStr = (data.kotNum || '').padStart(14);
          cmd += BOLD1 + tblStr + kotStr + BOLD0 + LF;
          // Date (left) + Time (right) — same line, normal size
          if (data.date || data.time) {
            const dateL = (data.date || '').padEnd(18);
            const timeR = (data.time || '').padStart(14);
            cmd += dateL + timeR + LF;
          }
          if (data.guests) cmd += LEFT + 'Guests: ' + data.guests + LF;
          cmd += DASH48 + LF;
          // Items header
          cmd += LEFT + BOLD1 + 'QTY  ITEM' + BOLD0 + LF;
          cmd += DASH48 + LF;
          // Items — double-height bold so kitchen can read quickly
          for (const item of data.items) {
            const qty  = String(item.qty).padEnd(3);
            const name = item.name || '';
            cmd += DBLH + BOLD1 + qty + '  ' + name + BOLD0 + NORMAL + LF;
            if (item.note) cmd += LEFT + '     >> ' + item.note + LF;
          }
          cmd += DASH48 + LF;
          // Footer
          if (data.total) cmd += 'Total Items : ' + data.total + LF;
          if (data.sentBy) cmd += BOLD1 + 'Sent by : ' + data.sentBy + BOLD0 + LF;
          if (data.printer) cmd += data.printer + LF;
        } else if (data.type === 'BILL') {
          // ── Bill receipt ─────────────────────────────────────────────────────
          // 80mm thermal = 40 chars wide. All columns sum to 40.
          const DASH_BILL = '-'.repeat(40);
          // Strip ₹/Rs prefix — latin1 printer renders ₹ as garbage
          const stripRs = (s) => String(s || '').replace(/[₹Rs\s]/g, '').trim();
          // Sanitise unicode → latin1-safe chars
          const safeB = (s) => String(s || '')
            .replace(/·/g, '-').replace(/•/g, '-').replace(/—/g, '-').replace(/–/g, '-')
            .replace(/'/g, "'").replace(/'/g, "'").replace(/"/g, '"').replace(/"/g, '"')
            .replace(/₹/g, 'Rs');

          // Header
          if (data.invoiceHeader) cmd += CENTER + safeB(data.invoiceHeader) + LF;
          cmd += CENTER + BOLD1 + BIG + safeB(data.outlet || 'RESTAURANT') + NORMAL + BOLD0 + LF;
          if (data.addr)  cmd += CENTER + safeB(data.addr)  + LF;
          if (data.phone) cmd += CENTER + safeB(data.phone) + LF;
          if (data.gstin) cmd += CENTER + 'GSTIN: ' + safeB(data.gstin) + LF;
          if (data.fssai) cmd += CENTER + 'FSSAI: ' + safeB(data.fssai) + LF;
          if (data.seatLabel) cmd += CENTER + BOLD1 + '[ ' + safeB(data.seatLabel) + ' ]' + BOLD0 + LF;
          // Tax Invoice / Credit Bill badge
          if (data.isTaxInvoice) {
            cmd += CENTER + BOLD1 + '** TAX INVOICE **' + BOLD0 + LF;
          } else if (data.isCreditBill) {
            cmd += CENTER + '-- CREDIT BILL --' + LF;
          }
          // Bill To section (credit / GST customer)
          if (data.billToName) {
            cmd += DASH_BILL + LF;
            cmd += LEFT + BOLD1 + 'BILL TO:' + BOLD0 + LF;
            cmd += LEFT + safeB(data.billToName) + LF;
            for (const meta of (data.billToMeta || [])) {
              cmd += LEFT + safeB(meta) + LF;
            }
          }
          cmd += DASH_BILL + LF;
          // Info rows — always printed (Date + Time on same line)
          cmd += LEFT + 'Date    : ' + safeB(data.date || '') + '   ' + safeB(data.time || '') + LF;
          const _tbl = safeB(data.table || '').substring(0, 20);
          cmd += LEFT + 'Table   : ' + _tbl + (data.orderType ? ' (' + safeB(data.orderType) + ')' : '') + LF;
          cmd += LEFT + 'Cashier : ' + safeB(data.cashier || '-') + LF;
          cmd += LEFT + 'Bill No : ' + safeB(String(data.billNo || '-')) + LF;
          if (data.captain) cmd += LEFT + 'Captain : ' + safeB(data.captain) + LF;
          if (data.waiter)  cmd += LEFT + 'Waiter  : ' + safeB(data.waiter)  + LF;
          cmd += DASH_BILL + LF;
          // Column header: name(20) + qty(4) + rate(8) + amt(8) = 40 chars
          cmd += BOLD1 + 'Item                 Qty    Rate     Amt' + BOLD0 + LF;
          cmd += DASH_BILL + LF;
          // Items
          for (const item of (data.items || [])) {
            const name = safeB(item.name || '').substring(0, 20).padEnd(20);
            const qty  = String(item.qty  || '').padStart(4);
            const rate = stripRs(item.rate).padStart(8);
            const amt  = stripRs(item.amt).padStart(8);
            cmd += name + qty + rate + amt + LF;
            if (item.note) cmd += '     >> ' + safeB(item.note) + LF;
          }
          cmd += DASH_BILL + LF;
          // Summary rows: label(32) + value(8) = 40 chars, aligned under Amt column
          for (const row of (data.summary || [])) {
            if (!row.label || !row.value) continue;
            const lbl = safeB(row.label).padEnd(32);
            const val = stripRs(row.value).padStart(8);
            cmd += lbl + val + LF;
          }
          cmd += DASH_BILL + LF;
          // Grand total — big centred
          cmd += CENTER + BOLD1 + BIG + 'TOTAL  ' + stripRs(data.total || '') + NORMAL + BOLD0 + LF;
          cmd += DASH_BILL + LF;
          cmd += CENTER + 'Please pay at the counter' + LF;
          cmd += CENTER + safeB(data.footer || 'Thank you for dining with us!') + LF;
        }

        cmd += LF + LF + LF + LF + CUT;

        try { win.destroy(); } catch {}
        resolve({ ok: true, buffer: Buffer.from(cmd, 'latin1') });

      } catch (err) {
        try { win.destroy(); } catch {}
        resolve({ ok: false, error: err.message });
      }
    });

    win.webContents.on('did-fail-load', (_e, code, desc) => {
      clearTimeout(timeoutHandle);
      try { win.destroy(); } catch {}
      resolve({ ok: false, error: desc });
    });

    const encoded = Buffer.from(html, 'utf8').toString('base64');
    win.loadURL(`data:text/html;base64,${encoded}`);
  });
}

// ── ESC/POS over TCP (Network/IP printers) ────────────────────────────────────
async function printViaEscPosTcp(html, ip, port = 9100) {
  const built = await buildEscPosFromHtml(html);
  if (!built.ok) return built;

  return new Promise((resolve) => {
    let done = false;
    function finish(result) { if (!done) { done = true; resolve(result); } }

    const sock = new net.Socket();
    sock.setTimeout(12000);
    sock.once('connect', () => {
      sock.write(built.buffer, () => { sock.destroy(); finish({ ok: true }); });
    });
    sock.once('timeout', () => { sock.destroy(); finish({ ok: false, error: 'TCP timeout — check printer IP and network connection' }); });
    sock.once('error',   (err) => { sock.destroy(); finish({ ok: false, error: err.message }); });
    sock.connect(port, ip.trim());
  });
}

// ── ESC/POS via Windows raw spooler (USB printers) ───────────────────────────
// Uses winspool.drv P/Invoke to send raw ESC/POS bytes directly to a USB
// thermal printer — bypasses Chromium HTML rendering and driver scaling entirely.
// This gives the same clean output as the network TCP path.
async function printViaEscPosUsb(html, printerName) {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows only' };

  const built = await buildEscPosFromHtml(html);
  if (!built.ok) return built;

  const fs_mod  = require('fs');
  const os_mod  = require('os');
  const { exec } = require('child_process');
  const ts       = Date.now();
  const tmpBin   = path.join(os_mod.tmpdir(), `plato_${ts}.bin`);
  const tmpPs1   = path.join(os_mod.tmpdir(), `plato_${ts}.ps1`);

  try {
    fs_mod.writeFileSync(tmpBin, built.buffer);

    // Escape double-quotes and backslashes for embedding inside the PS1 string
    const safeName = printerName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const safeBin  = tmpBin.replace(/\\/g, '\\\\');

    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.drv",EntryPoint="OpenPrinterA",SetLastError=true,CharSet=CharSet.Ansi,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv",EntryPoint="ClosePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv",EntryPoint="StartDocPrinterA",SetLastError=true,CharSet=CharSet.Ansi,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern Int32 StartDocPrinter(IntPtr hPrinter, Int32 level, [In,MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.drv",EntryPoint="EndDocPrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv",EntryPoint="StartPagePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv",EntryPoint="EndPagePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv",EntryPoint="WritePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
}
"@ -ErrorAction Stop
$n = "${safeName}"
$f = "${safeBin}"
$bytes = [System.IO.File]::ReadAllBytes($f)
$h = [IntPtr]::Zero
if (-not [RawPrint]::OpenPrinter($n, [ref]$h, [IntPtr]::Zero)) { Write-Output "ERR:open:$([Runtime.InteropServices.Marshal]::GetLastWin32Error())"; exit 1 }
$di = New-Object RawPrint+DOCINFOA; $di.pDocName = "PlatoReceipt"; $di.pDataType = "RAW"
$docId = [RawPrint]::StartDocPrinter($h, 1, $di)
if ($docId -le 0) { [RawPrint]::ClosePrinter($h); Write-Output "ERR:startdoc"; exit 1 }
[RawPrint]::StartPagePrinter($h) | Out-Null
$ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
[Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
$written = 0
$ok = [RawPrint]::WritePrinter($h, $ptr, $bytes.Length, [ref]$written)
[Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
[RawPrint]::EndPagePrinter($h) | Out-Null
[RawPrint]::EndDocPrinter($h) | Out-Null
[RawPrint]::ClosePrinter($h) | Out-Null
Remove-Item "$f" -ErrorAction SilentlyContinue
if ($ok) { Write-Output "OK" } else { Write-Output "ERR:write:$([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
`;

    fs_mod.writeFileSync(tmpPs1, psScript, 'utf8');
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs1}"`,
      { timeout: 15000 },
      (err, stdout, stderr) => {
        try { fs_mod.unlinkSync(tmpBin);  } catch {}
        try { fs_mod.unlinkSync(tmpPs1); } catch {}
        const out = (stdout || '').trim();
        if (err && !out) {
          resolve({ ok: false, error: err.message || stderr || 'USB print failed' });
        } else if (out === 'OK') {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: out || err?.message || 'USB print failed' });
        }
      }
    );
  });
}

// ── print-html IPC ────────────────────────────────────────────────────────────
// Silent thermal printing for the Windows Electron POS.
//
// Routing:
//   printerIp set   → ESC/POS raw bytes over TCP port 9100 (Network/IP printer)
//   printerName set → ESC/POS raw bytes via Windows winspool P/Invoke (USB printer)
//   neither set     → webContents.print() to Windows default printer (fallback)
//
// Both IP and USB printers now use the same ESC/POS text path — this gives
// consistent output regardless of the printer driver's DPI/scaling settings.
//
// Returns: { ok: boolean, error?: string }
ipcMain.handle("print-html", async (event, { html, printerName, printerIp, paperWidthMm = 80 }) => {
  // ── Network IP printer → ESC/POS over TCP ────────────────────────────────
  if (printerIp && printerIp.trim()) {
    console.log(`[print-html] Network printer at ${printerIp} — ESC/POS TCP`);
    return printViaEscPosTcp(html, printerIp.trim(), 9100);
  }

  // ── USB printer → ESC/POS via Windows raw spooler ────────────────────────
  if (printerName && typeof printerName === "string" && printerName.trim()) {
    // Resolve exact Windows printer name (exact → case-insensitive → partial)
    let resolvedName = printerName.trim();
    try {
      const installed = await mainWindow.webContents.getPrintersAsync();
      const names     = installed.map(p => p.name);
      const exact     = names.find(n => n === resolvedName);
      const ci        = names.find(n => n.toLowerCase() === resolvedName.toLowerCase());
      const partial   = names.find(n =>
        n.toLowerCase().includes(resolvedName.toLowerCase()) ||
        resolvedName.toLowerCase().includes(n.toLowerCase())
      );
      const matched   = exact || ci || partial;
      if (matched) {
        if (matched !== resolvedName) console.log(`[print-html] USB name resolved: "${resolvedName}" → "${matched}"`);
        resolvedName = matched;
      } else {
        console.warn(`[print-html] Printer "${resolvedName}" not found in Windows. Available: ${names.join(", ")}`);
      }
    } catch (err) {
      console.warn("[print-html] getPrintersAsync failed:", err.message);
    }

    console.log(`[print-html] USB printer "${resolvedName}" — ESC/POS raw`);
    const usbResult = await printViaEscPosUsb(html, resolvedName);
    if (usbResult.ok) return usbResult;

    // If raw P/Invoke fails (e.g. printer offline), log and return the error.
    // We do NOT silently fall back to webContents.print() because that would
    // produce the same garbled output that prompted this fix.
    console.error(`[print-html] USB ESC/POS failed for "${resolvedName}":`, usbResult.error);
    return usbResult;
  }

  // ── No printer configured — fall back to Windows default printer ─────────
  console.warn("[print-html] No printer configured — using Windows default via webContents.print()");
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false, skipTaskbar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    const timeoutHandle = setTimeout(() => {
      try { win.destroy(); } catch {}
      resolve({ ok: false, error: "load_timeout" });
    }, 8000);
    win.webContents.on("did-finish-load", () => {
      clearTimeout(timeoutHandle);
      setTimeout(() => {
        win.webContents.print({ silent: true, printBackground: true, margins: { marginType: "none" } }, (success, reason) => {
          try { win.destroy(); } catch {}
          resolve(success ? { ok: true } : { ok: false, error: reason });
        });
      }, 400);
    });
    win.webContents.on("did-fail-load", (_e, code, desc) => {
      clearTimeout(timeoutHandle);
      try { win.destroy(); } catch {}
      resolve({ ok: false, error: desc });
    });
    win.loadURL(`data:text/html;base64,${Buffer.from(html, "utf8").toString("base64")}`);
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
