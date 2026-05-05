// Sentry MUST be the very first require so it can instrument everything
const { initSentry } = require("./config/sentry");
initSentry();

const http = require("http");
const { Server: SocketServer } = require("socket.io");

const { createApp }              = require("./app");
const { env }                    = require("./config/env");
const { runMigrations }          = require("./db/migrate");
const { syncOperationsState,
        persistOperationsState } = require("./modules/operations/operations.state");
const { hydrateClosedOrders }    = require("./modules/operations/closed-orders-store");
const { hydrateShifts }          = require("./modules/operations/shifts-store");
const { scheduleBackup }             = require("./jobs/daily-backup");
const { scheduleDailySalesReport }   = require("./jobs/daily-sales-report");

const app    = createApp();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Make io available to route handlers via app.locals
app.locals.io = io;

io.on("connection", (socket) => {
  const { outletId, kdsStation } = socket.handshake.query;
  if (outletId) {
    socket.join(`outlet:${outletId}`);
    // Ask other connected devices (POS) to broadcast current order state so
    // this new device (Captain App / KDS) gets accurate table occupancy immediately
    socket.to(`outlet:${outletId}`).emit("request:order-sync");
  }
  // KDS screens pass kdsStation in the handshake query.
  // Join the station-specific room immediately on connect so KOTs are routed
  // correctly from the very first emission — no race with a separate join event.
  if (outletId && kdsStation !== undefined) {
    const kdsRoom = kdsStation
      ? `kds:${outletId}:${String(kdsStation).trim().toLowerCase()}`
      : `kds:${outletId}:__all__`;
    socket.join(kdsRoom);
  }
  socket.on("join-outlet", (id) => {
    socket.join(`outlet:${id}`);
    socket.to(`outlet:${id}`).emit("request:order-sync");
  });

  // ── KDS station room subscription ────────────────────────────────────────
  // A KDS screen calls this when it loads or when its assignedStation changes.
  // stationName = "" → unassigned screen (show all) → joins kds:<outletId>:__all__
  // stationName = "South Indian" → dedicated screen → joins kds:<outletId>:south indian
  // The backend emits kot:new to the matching room, so each KDS only receives
  // KOTs for its own station — no client-side filtering needed.
  socket.on("kds:join-station", ({ outletId: oid, stationName }) => {
    if (!oid) return;
    // Leave any existing KDS station rooms for this outlet
    const prefix = `kds:${oid}:`;
    [...socket.rooms]
      .filter(r => r.startsWith(prefix))
      .forEach(r => socket.leave(r));
    // Join the correct room
    const room = stationName
      ? `kds:${oid}:${String(stationName).trim().toLowerCase()}`
      : `kds:${oid}:__all__`;
    socket.join(room);
  });

  // ── Relay order updates between POS ↔ Captain App ────────────────────────
  // POS/Captain emit "order:update"; relay to all other devices in the same outlet
  socket.on("order:update", (data) => {
    const room = data.outletId ? `outlet:${data.outletId}` : null;
    if (room && data.order) {
      socket.to(room).emit("order:updated", data.order);
    }
  });

  // ── Relay KOT status changes from KDS back to POS/Captain ────────────────
  socket.on("kot:status", (data) => {
    // data: { id, status, outletId? }
    const room = data.outletId ? `outlet:${data.outletId}` : null;
    if (room) socket.to(room).emit("kot:status", data);
    else socket.broadcast.emit("kot:status", data); // fallback
  });

  // Relay KOT bumped
  socket.on("kot:bumped", (data) => {
    if (data.outletId) socket.to(`outlet:${data.outletId}`).emit("kot:bumped", data);
    else socket.broadcast.emit("kot:bumped", data);
  });
});

// Run DB migrations + hydrate in-memory stores BEFORE accepting requests
runMigrations()
  .then(async () => {
    // Reload persisted data into memory stores so a restart doesn't lose data
    await Promise.all([
      syncOperationsState(),   // active table orders
      hydrateClosedOrders(),   // today's settled bills
      hydrateShifts(),         // open/closed shifts + cash movements
    ]).catch(err => console.error("[startup] Hydration error (non-fatal):", err.message));

    server.listen(env.port, () => {
      console.log(`API server listening on port ${env.port}`);
    });

    // Auto-save active order state to DB every 60 seconds
    // so a crash in the middle of service loses at most 1 minute of data
    if (env.enableDatabase) {
      setInterval(() => {
        persistOperationsState().catch(err =>
          console.error("[auto-save] Error:", err.message)
        );
      }, 60_000);
      console.log("[auto-save] Active order state will be saved every 60 s");
    }

    // Schedule nightly backup email at midnight IST
    scheduleBackup();

    // Schedule daily sales report email at 11 PM IST
    scheduleDailySalesReport();
  })
  .catch((err) => {
    // Migration errors are non-fatal — server still starts
    console.error("[startup] Migration error (non-fatal):", err.message);
    server.listen(env.port, () => {
      console.log(`API server listening on port ${env.port} (fallback mode)`);
    });
  });
