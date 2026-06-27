// Sentry MUST be the very first require so it can instrument everything
const { initSentry, Sentry } = require("./config/sentry");
initSentry();

// ── Process-level crash guards ────────────────────────────────────────────────
// These ensure the server NEVER exits due to an unhandled error.
// Billing and POS operations must keep working even if a non-critical code path
// throws. Errors are reported to Sentry so we can fix them without downtime.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] Non-fatal error caught — server staying up:", err);
  try { Sentry.captureException(err); } catch (_) {}
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] Non-fatal rejection caught — server staying up:", reason);
  try { Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason))); } catch (_) {}
});

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
const { getAllCachedTenants,
        getOwnerSetupData }           = require("./data/owner-setup-store");
const { runWithTenant }               = require("./data/tenant-context");
const { toggleItemAvailability,
        toggleCategoryAvailability }   = require("./modules/online-orders/urbanpiper.service");
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
    } catch (err) {
      // Invalid or expired token — notify the dashboard so it can prompt re-login
      const reason = err?.name === "TokenExpiredError" ? "expired" : "invalid";
      socket.emit("auth:expired", { reason });
      console.log(`[socket] dashboard auth rejected | id=${socket.id} | reason=${reason}`);
      socket.disconnect(true);
    }
    return; // Dashboard clients don't need any other room logic
  }

  const clientType = kdsStation !== undefined ? "KDS" : "POS/Captain";

  // Resolve which tenant owns this outlet.
  // Primary: scan in-memory cache (fast, works for all tenants seen since boot).
  // Fallback: decode the device JWT — the token carries tenantId + outletId and was
  // issued by the server, so it is authoritative even for brand-new tenants whose
  // data hasn't been loaded into the cache yet (first connection after signup).
  let tenantId = resolveTenantByOutlet(outletId);
  if (tenantId === "default" && outletId) {
    const devToken = socket.handshake.auth?.token
      || socket.handshake.headers?.authorization?.replace("Bearer ", "")
      || socket.handshake.query?.deviceToken;
    if (devToken) {
      try {
        const decoded = jwt.verify(devToken, env.jwtSecret);
        if (decoded?.tenantId && decoded.tenantId !== "default") {
          tenantId = decoded.tenantId;
          console.log(`[socket] tenant resolved via device token | tenant=${tenantId} | outlet=${outletId}`);
        }
      } catch (_) { /* expired/invalid token — keep "default" */ }
    }
  }

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
    try {
      const tid = resolveTenantByOutlet(id);
      socket.join(`outlet:${tid}:${id}`);
      socket.to(`outlet:${tid}:${id}`).emit("request:order-sync");
    } catch (err) { console.error("[socket] join-outlet error:", err.message); }
  });

  // ── KDS station room subscription ────────────────────────────────────────
  socket.on("kds:join-station", ({ outletId: oid, stationName }) => {
    try {
      if (!oid) return;
      const tid = resolveTenantByOutlet(oid);
      const prefix = `kds:${tid}:${oid}:`;
      [...socket.rooms].filter(r => r.startsWith(prefix)).forEach(r => socket.leave(r));
      const room = stationName
        ? `kds:${tid}:${oid}:${String(stationName).trim().toLowerCase()}`
        : `kds:${tid}:${oid}:__all__`;
      socket.join(room);
    } catch (err) { console.error("[socket] kds:join-station error:", err.message); }
  });

  // ── Relay order updates between POS ↔ Captain App ────────────────────────
  socket.on("order:update", (data) => {
    try {
      if (data.outletId && data.order) {
        const tid = resolveTenantByOutlet(data.outletId);
        socket.to(`outlet:${tid}:${data.outletId}`).emit("order:updated", data.order);
      }
    } catch (err) { console.error("[socket] order:update error:", err.message); }
  });

  // ── Relay KOT status changes from KDS back to POS/Captain ────────────────
  socket.on("kot:status", (data) => {
    try {
      if (data.outletId) {
        const tid = resolveTenantByOutlet(data.outletId);
        socket.to(`outlet:${tid}:${data.outletId}`).emit("kot:status", data);
      }
    } catch (err) { console.error("[socket] kot:status error:", err.message); }
  });

  socket.on("kot:bumped", (data) => {
    try {
      if (data.outletId) {
        const tid = resolveTenantByOutlet(data.outletId);
        socket.to(`outlet:${tid}:${data.outletId}`).emit("kot:bumped", data);
      }
    } catch (err) { console.error("[socket] kot:bumped error:", err.message); }
  });

  // ── Item availability toggle (POS → Captain + KDS) ───────────────────────
  socket.on("item:availability", (data) => {
    try {
      if (!data.outletId || !data.itemId) return;
      const tid = resolveTenantByOutlet(data.outletId);
      if (!outletAvailability[data.outletId]) outletAvailability[data.outletId] = {};
      if (data.available) {
        delete outletAvailability[data.outletId][data.itemId];
      } else {
        outletAvailability[data.outletId][data.itemId] = false;
      }
      socket.to(`outlet:${tid}:${data.outletId}`).emit("item:availability", data);
      if (tid !== "default") {
        runWithTenant(tid, async () => {
          const tenantData = getOwnerSetupData();
          await toggleItemAvailability(data.itemId, data.available !== false, tenantData);
        }).catch(() => {});
      }
    } catch (err) { console.error("[socket] item:availability error:", err.message); }
  });

  // On connect, send the current availability state so new devices are in sync
  try {
    if (outletId && outletAvailability[outletId]) {
      socket.emit("item:availability:state", outletAvailability[outletId]);
    }
  } catch (err) { console.error("[socket] availability:state emit error:", err.message); }

  // ── Online orders on/off toggle (POS → all) ──────────────────────────────
  socket.on("online:orders:toggle", (data) => {
    try {
      if (!data.outletId) return;
      const tid = resolveTenantByOutlet(data.outletId);
      outletOnlineEnabled[data.outletId] = data.enabled;
      socket.to(`outlet:${tid}:${data.outletId}`).emit("online:orders:toggle", data);
    } catch (err) { console.error("[socket] online:orders:toggle error:", err.message); }
  });

  // ── Category availability toggle (POS → Captain + KDS + online orders) ───
  // Independent of item-level salesAvailability — a category can be disabled
  // (e.g. "Beverages" out of CO2) without touching each item's own state.
  // `availableAt` (ISO string, optional) is when the cashier expects to
  // re-stock — the server auto re-enables the category at that time.
  socket.on("category:availability", (data) => {
    try {
      if (!data.outletId || !data.categoryId) return;
      const tid = resolveTenantByOutlet(data.outletId);
      if (!outletCategoryAvailability[data.outletId]) outletCategoryAvailability[data.outletId] = {};
      if (data.available) {
        delete outletCategoryAvailability[data.outletId][data.categoryId];
      } else {
        outletCategoryAvailability[data.outletId][data.categoryId] = {
          available: false,
          availableAt: data.availableAt || null,
        };
      }
      socket.to(`outlet:${tid}:${data.outletId}`).emit("category:availability", data);
      if (tid !== "default") {
        runWithTenant(tid, async () => {
          const tenantData = getOwnerSetupData();
          await toggleCategoryAvailability(data.categoryId, data.available !== false, tenantData);
        }).catch(() => {});
      }
    } catch (err) { console.error("[socket] category:availability error:", err.message); }
  });

  // On connect, send the current category availability state so new devices are in sync
  try {
    if (outletId && outletCategoryAvailability[outletId]) {
      socket.emit("category:availability:state", outletCategoryAvailability[outletId]);
    }
  } catch (err) { console.error("[socket] category-availability:state emit error:", err.message); }
});

// ── Per-outlet item availability cache ──────────────────────────────────────
// Keyed by outletId. Value: { [itemId]: false } — only stores sold-out items.
// Lost on server restart (devices re-broadcast their state on reconnect).
const outletAvailability = {};

// ── Per-outlet category availability cache ───────────────────────────────────
// Keyed by outletId, then categoryId. Value: { available: false, availableAt }
// — only stores disabled categories. Lost on server restart (same caveat as
// outletAvailability above; devices re-broadcast their state on reconnect).
const outletCategoryAvailability = {};

// ── Online-orders enabled state per outlet ───────────────────────────────────
const outletOnlineEnabled = {};

// Expose caches to REST route handlers (inventory routes need to update + read these)
app.locals.outletAvailability         = outletAvailability;
app.locals.outletCategoryAvailability = outletCategoryAvailability;
app.locals.outletOnlineEnabled        = outletOnlineEnabled;

// Every minute, auto re-enable any category whose cashier-chosen "next
// availability" time has passed — e.g. "out of CO2, back in 1 hour".
setInterval(() => {
  const now = Date.now();
  for (const [outletId, categories] of Object.entries(outletCategoryAvailability)) {
    for (const [categoryId, state] of Object.entries(categories)) {
      if (!state.availableAt || new Date(state.availableAt).getTime() > now) continue;
      delete categories[categoryId];
      const tid = resolveTenantByOutlet(outletId);
      const data = { outletId, categoryId, available: true };
      io.to(`outlet:${tid}:${outletId}`).emit("category:availability", data);
      if (tid !== "default") {
        runWithTenant(tid, async () => {
          const tenantData = getOwnerSetupData();
          await toggleCategoryAvailability(categoryId, true, tenantData);
        }).catch(() => {});
      }
      console.log(`[category-availability] auto re-enabled | outlet=${outletId} | category=${categoryId}`);
    }
  }
}, 60_000);

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
