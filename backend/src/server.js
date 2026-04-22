const http = require("http");
const { Server: SocketServer } = require("socket.io");

const { createApp }       = require("./app");
const { env }             = require("./config/env");
const { runMigrations }   = require("./db/migrate");

const app    = createApp();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Make io available to route handlers via app.locals
app.locals.io = io;

io.on("connection", (socket) => {
  const { outletId } = socket.handshake.query;
  if (outletId) socket.join(`outlet:${outletId}`);
  socket.on("join-outlet", (id) => socket.join(`outlet:${id}`));

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

// Run DB migrations + cache warm-up BEFORE accepting requests
runMigrations()
  .then(() => {
    server.listen(env.port, () => {
      console.log(`API server listening on port ${env.port}`);
    });
  })
  .catch((err) => {
    // Migration errors are non-fatal — server still starts with JSON-file fallback
    console.error("[startup] Migration error (non-fatal):", err.message);
    server.listen(env.port, () => {
      console.log(`API server listening on port ${env.port} (fallback mode)`);
    });
  });
