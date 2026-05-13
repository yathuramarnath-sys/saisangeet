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
const { getAllCachedTenants }         = require("./data/owner-setup-store");
const jwt                             = require("jsonwebtoken");

// Resolve which tenant owns an outletId by searching the in-memory cache.
// Returns the tenantId string, or "default" if not found.
function resolveTenantByOutlet(outletId) {
  if (!outletId) return "default";
  try {
    for (const [tid, data] of getAllCachedTenants()) {
      if ((data.outlets || []).some(o => o.id === outletId)) return tid;
    }
  } catch (_) {}
  return "default";
}

const app    = createApp();
const server = http.createServer(app);

const SOCKET_ALLOWED_ORIGINS = [
  // Local dev
  "http://localhost:5173", "http://localhost:4173", "http://localhost:4174",
  "http://localhost:4175", "http://localhost:4176",
  // Capacitor mobile WebViews
  "capacitor://localhost", "https://localhost", "http://localhost", "ionic://localhost",
  // Production
  "https://dinexpos.in", "https://www.dinexpos.in",
  "https://app.dinexpos.in", "https://pos.dinexpos.in",
  "https://captain.dinexpos.in", "https://kds.dinexpos.in",
];

const io = new SocketServer(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);                          // server-to-server / curl
      if (SOCKET_ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin))
        return cb(null, true);
      cb(new Error(`Socket CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST"],
  },
});

// Make io available to route handlers via app.locals
app.locals.io = io;

io.on("connection", (socket) => {
  const { outletId, kdsStation, token: dashToken } = socket.handshake.query;

  // ── Owner dashboard connections ──────────────────────────────────────────
  // Owner-web connects without an outletId but passes a JWT in ?token=
  // so we can verify identity and join the correct tenant room for push events.
  if (!outletId && dashToken) {
    try {
      const decoded = jwt.verify(dashToken, env.jwtSecret);
      if (decoded?.tenantId) {
        socket.join(`tenant:${decoded.tenantId}`);
        console.log(`[socket] dashboard | id=${socket.id} | tenant=${decoded.tenantId}`);
      }
    } catch (_) {
      // Invalid/expired token — silently ignore; dashboard will still poll
    }
    return; // Dashboard clients don't need any other room logic
  }

  const clientType = kdsStation !== undefined ? "KDS" : "POS/Captain";
  // Resolve which tenant owns this outlet so socket rooms are tenant-isolated.
  // Prevents one restaurant's devices from receiving events from another restaurant.
  const tenantId = resolveTenantByOutlet(outletId);
  console.log(`[socket] connect | id=${socket.id} | type=${clientType} | tenant=${tenantId} | outletId=${outletId || "(none)"} | kdsStation="${kdsStation ?? "(n/a)"}"`);

  if (outletId) {
    socket.join(`outlet:${tenantId}:${outletId}`);
    // Also join the tenant-level room — used for sync:config broadcasts so only
    // this tenant's devices receive config-change notifications (not all tenants).
    socket.join(`tenant:${tenantId}`);
    // Ask other connected devices (POS) to broadcast current order state so
    // this new device (Captain App / KDS) gets accurate table occupancy immediately
    socket.to(`outlet:${tenantId}:${outletId}`).emit("request:order-sync");
  }
  // KDS screens pass kdsStation in the handshake query.
  // Join the station-specific room immediately on connect so KOTs are routed
  // correctly from the very first emission — no race with a separate join event.
  if (outletId && kdsStation !== undefined) {
    const kdsRoom = kdsStation
      ? `kds:${tenantId}:${outletId}:${String(kdsStation).trim().toLowerCase()}`
      : `kds:${tenantId}:${outletId}:__all__`;
    socket.join(kdsRoom);
    console.log(`[socket] KDS joined station room: ${kdsRoom}`);
  }

  socket.on("disconnect", () => {
    console.log(`[socket] disconnect | id=${socket.id} | type=${clientType} | tenant=${tenantId} | outletId=${outletId || "(none)"}`);
  });
  socket.on("join-outlet", (id) => {
    const tid = resolveTenantByOutlet(id);
    socket.join(`outlet:${tid}:${id}`);
    socket.to(`outlet:${tid}:${id}`).emit("request:order-sync");
  });

  // ── KDS station room subscription ────────────────────────────────────────
  // A KDS screen calls this when it loads or when its assignedStation changes.
  // stationName = "" → unassigned screen (show all) → joins kds:<tenantId>:<outletId>:__all__
  // stationName = "South Indian" → dedicated screen → joins kds:<tenantId>:<outletId>:south indian
  socket.on("kds:join-station", ({ outletId: oid, stationName }) => {
    if (!oid) return;
    const tid = resolveTenantByOutlet(oid);
    // Leave any existing KDS station rooms for this outlet
    const prefix = `kds:${tid}:${oid}:`;
    [...socket.rooms]
      .filter(r => r.startsWith(prefix))
      .forEach(r => socket.leave(r));
    // Join the correct room
    const room = stationName
      ? `kds:${tid}:${oid}:${String(stationName).trim().toLowerCase()}`
      : `kds:${tid}:${oid}:__all__`;
    socket.join(room);
  });

  // ── Relay order updates between POS ↔ Captain App ────────────────────────
  // POS/Captain emit "order:update"; relay to all other devices in the same outlet
  socket.on("order:update", (data) => {
    if (data.outletId && data.order) {
      const tid = resolveTenantByOutlet(data.outletId);
      socket.to(`outlet:${tid}:${data.outletId}`).emit("order:updated", data.order);
    }
  });

  // ── Relay KOT status changes from KDS back to POS/Captain ────────────────
  socket.on("kot:status", (data) => {
    // data: { id, status, outletId? }
    if (data.outletId) {
      const tid = resolveTenantByOutlet(data.outletId);
      socket.to(`outlet:${tid}:${data.outletId}`).emit("kot:status", data);
    }
    // no broadcast fallback — without outletId we can't target safely
  });

  // Relay KOT bumped
  socket.on("kot:bumped", (data) => {
    if (data.outletId) {
      const tid = resolveTenantByOutlet(data.outletId);
      socket.to(`outlet:${tid}:${data.outletId}`).emit("kot:bumped", data);
    }
  });

  // ── Item availability toggle (POS → Captain + KDS) ───────────────────────
  // data: { outletId, itemId, available: bool }
  socket.on("item:availability", (data) => {
    if (!data.outletId || !data.itemId) return;
    const tid = resolveTenantByOutlet(data.outletId);
    // Update server-side cache
    if (!outletAvailability[data.outletId]) outletAvailability[data.outletId] = {};
    if (data.available) {
      delete outletAvailability[data.outletId][data.itemId];
    } else {
      outletAvailability[data.outletId][data.itemId] = false;
    }
    // Relay to all other devices in the outlet
    socket.to(`outlet:${tid}:${data.outletId}`).emit("item:availability", data);
  });

  // On connect, send the current availability state so new devices are in sync
  if (outletId && outletAvailability[outletId]) {
    socket.emit("item:availability:state", outletAvailability[outletId]);
  }

  // ── Online orders on/off toggle (POS → all) ──────────────────────────────
  // data: { outletId, enabled: bool }
  socket.on("online:orders:toggle", (data) => {
    if (!data.outletId) return;
    const tid = resolveTenantByOutlet(data.outletId);
    outletOnlineEnabled[data.outletId] = data.enabled;
    socket.to(`outlet:${tid}:${data.outletId}`).emit("online:orders:toggle", data);
  });
});

// ── Per-outlet item availability cache ──────────────────────────────────────
// Keyed by outletId. Value: { [itemId]: false } — only stores sold-out items.
// Lost on server restart (devices re-broadcast their state on reconnect).
const outletAvailability = {};

// ── Online-orders enabled state per outlet ───────────────────────────────────
const outletOnlineEnabled = {};

// Expose caches to REST route handlers (inventory routes need to update + read these)
app.locals.outletAvailability  = outletAvailability;
app.locals.outletOnlineEnabled = outletOnlineEnabled;

// Bind the port FIRST so Railway's healthcheck passes immediately,
// then run migrations + hydration in the background.
// This avoids healthcheck timeouts when Postgres migrations are slow.
server.listen(env.port, () => {
  console.log(`API server listening on port ${env.port}`);

  // Run DB migrations + hydrate in-memory stores after port is open
  runMigrations()
    .then(async () => {
      // Reload persisted data into memory stores so a restart doesn't lose data
      await Promise.all([
        syncOperationsState(),   // active table orders
        hydrateClosedOrders(),   // today's settled bills
        hydrateShifts(),         // open/closed shifts + cash movements
      ]).catch(err => console.error("[startup] Hydration error (non-fatal):", err.message));

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
      // Migration errors are non-fatal — server stays up on JSON file fallback
      console.error("[startup] Migration error (non-fatal):", err.message);

      // Still schedule background jobs even if DB is unavailable
      scheduleBackup();
      scheduleDailySalesReport();
    });
});
