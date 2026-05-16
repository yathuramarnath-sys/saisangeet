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

// ── ESC/POS direct TCP printing (for Network IP thermal printers) ─────────────
// Extracts receipt data from HTML and sends formatted ESC/POS text directly
// to the printer via TCP port 9100 — no Windows printer driver needed.
async function printViaEscPosTcp(html, ip, port = 9100) {
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
            // Read info-grid rows (date, table, cashier, bill no)
            const infoRows = qa2('.info-grid tr');
            function getInfoVal(label) {
              for (const row of infoRows) {
                const cells = row.querySelectorAll('td');
                for (let i = 0; i < cells.length; i++) {
                  if (cells[i].classList.contains('lbl') && cells[i].innerText.includes(label)) {
                    const valCell = cells[i + 2];
                    return valCell?.innerText?.trim() || '';
                  }
                }
              }
              return '';
            }
            return {
              type:          'BILL',
              outlet:        q2('.outlet-name')?.innerText?.trim() || '',
              invoiceHeader: q2('.invoice-header')?.innerText?.trim() || '',
              addr:          q2('.outlet-addr')?.innerText?.trim() || '',
              phone:         q2('.outlet-sub')?.innerText?.trim() || '',
              gstin:         q2('.outlet-gstin')?.innerText?.trim() || '',
              fssai:         q2('.outlet-fssai')?.innerText?.trim() || '',
              seatLabel:     q2('.seat-tag')?.innerText?.trim() || '',
              date:          getInfoVal('Date'),
              time:          getInfoVal('Time'),
              table:         getInfoVal('Table'),
              orderType:     getInfoVal('Type'),
              cashier:       getInfoVal('Cashier'),
              billNo:        getInfoVal('Bill No'),
              items: qa2('.items-tbl tbody tr').map(el => ({
                name: el.querySelector('.col-item')?.childNodes[0]?.textContent?.trim() || '',
                note: el.querySelector('.item-note')?.innerText?.trim() || '',
                qty:  el.querySelector('.col-qty')?.innerText?.trim() || '',
                rate: el.querySelector('.col-rate')?.innerText?.trim() || '',
                amt:  el.querySelector('.col-amt')?.innerText?.trim() || '',
              })),
              summary: qa2('.sum-row').map(el => {
                const spans = el.querySelectorAll('span');
                return { label: spans[0]?.innerText?.trim() || '', value: spans[1]?.innerText?.trim() || '' };
              }),
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
          // Header
          if (data.invoiceHeader) cmd += CENTER + data.invoiceHeader + LF;
          cmd += CENTER + BOLD1 + BIG + (data.outlet || 'RESTAURANT') + NORMAL + BOLD0 + LF;
          if (data.addr)  cmd += CENTER + data.addr + LF;
          if (data.phone) cmd += CENTER + data.phone + LF;
          if (data.gstin) cmd += CENTER + data.gstin + LF;
          if (data.fssai) cmd += CENTER + data.fssai + LF;
          if (data.seatLabel) cmd += CENTER + BOLD1 + '[ ' + data.seatLabel + ' ]' + BOLD0 + LF;
          cmd += DASH48 + LF;
          // Info rows
          if (data.date)      cmd += LEFT + 'Date    : ' + data.date + '   ' + (data.time || '') + LF;
          if (data.table)     cmd += LEFT + 'Table   : ' + data.table + (data.orderType ? '   (' + data.orderType + ')' : '') + LF;
          if (data.cashier)   cmd += LEFT + 'Cashier : ' + data.cashier + LF;
          if (data.billNo)    cmd += LEFT + 'Bill No : ' + data.billNo + LF;
          cmd += DASH48 + LF;
          // Column header  (18 + 3 + 7 + 8 = 36 chars — fits 80mm)
          cmd += BOLD1 + 'Item              Qty    Rate      Amt' + BOLD0 + LF;
          cmd += DASH48 + LF;
          // Items — strip ₹/Rs. from rate/amt (latin1 can't encode ₹, renders as garbage)
          for (const item of (data.items || [])) {
            const name  = (item.name || '').substring(0, 18).padEnd(18);
            const qty   = (item.qty  || '').padStart(3);
            const rate  = (item.rate || '').replace(/[₹Rs\s]/g, '').trim().padStart(7);
            const amt   = (item.amt  || '').replace(/[₹Rs\s]/g, '').trim().padStart(8);
            cmd += name + qty + rate + amt + LF;
            if (item.note) cmd += '     >> ' + item.note + LF;
          }
          cmd += DASH48 + LF;
          // Summary rows (subtotal, discount, CGST, SGST etc.)
          for (const row of (data.summary || [])) {
            if (!row.label || !row.value) continue;
            const lbl = row.label.padEnd(22);
            const val = row.value.padStart(10);
            cmd += lbl + val + LF;
          }
          cmd += DASH48 + LF;
          // Grand total — big
          cmd += CENTER + BOLD1 + BIG + 'TOTAL  ' + (data.total || '') + NORMAL + BOLD0 + LF;
          cmd += DASH48 + LF;
          cmd += CENTER + 'Please pay at the counter' + LF;
          cmd += CENTER + (data.footer || 'Thank you for dining with us!') + LF;
        }

        cmd += LF + LF + LF + LF + CUT;

        // ── Send via TCP ───────────────────────────────────────────────────
        // Guard against double-resolve: timeout + write-callback could both fire
        let tcpDone = false;
        function tcpResolve(result) { if (!tcpDone) { tcpDone = true; resolve(result); } }

        const sock = new net.Socket();
        sock.setTimeout(12000);
        sock.once('connect', () => {
          // latin1 (= binary, 1:1 byte mapping) is correct for ESC/POS byte sequences
          sock.write(Buffer.from(cmd, 'latin1'), () => {
            sock.destroy();
            tcpResolve({ ok: true });
          });
        });
        sock.once('timeout', () => { sock.destroy(); tcpResolve({ ok: false, error: 'TCP timeout — check printer IP and network connection' }); });
        sock.once('error',   (err) => { sock.destroy(); tcpResolve({ ok: false, error: err.message }); });
        sock.connect(port, ip.trim());

      } catch (err) {
        try { win.destroy(); } catch {}
        if (!tcpDone) { tcpDone = true; resolve({ ok: false, error: err.message }); }
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

// ── print-html IPC ────────────────────────────────────────────────────────────
// Silent thermal printing path for the Windows Electron POS.
//
// Payload: { html, printerName, printerIp, paperWidthMm }
//   printerIp set   → direct ESC/POS over TCP to port 9100 (no Windows driver needed)
//   printerIp unset → webContents.print() via Windows printer spooler
//
// Returns: { ok: boolean, error?: string }
ipcMain.handle("print-html", async (event, { html, printerName, printerIp, paperWidthMm = 80 }) => {
  // ── Network IP printer → direct ESC/POS over TCP (no Windows driver needed) ─
  if (printerIp && printerIp.trim()) {
    console.log(`[print-html] Network printer at ${printerIp} — using direct TCP ESC/POS`);
    return printViaEscPosTcp(html, printerIp.trim(), 9100);
  }

  // ── Resolve the exact Windows printer name ───────────────────────────────
  // webContents.print() requires deviceName to match Windows exactly.
  // We do a 3-step lookup: exact → case-insensitive → partial match.
  // If nothing matches we omit deviceName so Windows uses the default printer.
  let resolvedName = null;
  if (printerName && typeof printerName === "string" && printerName.trim()) {
    const wanted = printerName.trim();
    try {
      const installedPrinters = await mainWindow.webContents.getPrintersAsync();
      const names = installedPrinters.map(p => p.name);

      // 1. Exact match
      let match = names.find(n => n === wanted);

      // 2. Case-insensitive match
      if (!match) match = names.find(n => n.toLowerCase() === wanted.toLowerCase());

      // 3. Partial match — either side contains the other
      if (!match) match = names.find(n =>
        n.toLowerCase().includes(wanted.toLowerCase()) ||
        wanted.toLowerCase().includes(n.toLowerCase())
      );

      if (match) {
        resolvedName = match;
        if (match !== wanted) {
          console.log(`[print-html] Printer name resolved: "${wanted}" → "${match}"`);
        }
      } else {
        console.warn(
          `[print-html] Printer "${wanted}" not found. Available: ${names.join(", ")}. ` +
          `Falling back to Windows default printer.`
        );
      }
    } catch (err) {
      console.warn("[print-html] Could not resolve printer name:", err.message);
      resolvedName = wanted; // try as-is
    }
  }

  return new Promise((resolve) => {
    // Hidden window — never shown on screen
    const win = new BrowserWindow({
      show:            false,
      skipTaskbar:     true,
      webPreferences: {
        nodeIntegration:  false,
        contextIsolation: true,
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
        };

        // Only set deviceName when we have a resolved name.
        // Omitting it makes Electron use the Windows default printer.
        if (resolvedName) {
          printOptions.deviceName = resolvedName;
        }

        win.webContents.print(printOptions, (success, failureReason) => {
          try { win.destroy(); } catch {}
          if (success) {
            resolve({ ok: true });
          } else {
            console.error(
              `[print-html] webContents.print failed` +
              `${resolvedName ? ` (printer: "${resolvedName}")` : " (default printer)"}` +
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
