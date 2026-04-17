const http = require("http");
const { Server: SocketServer } = require("socket.io");

const { createApp } = require("./app");
const { env } = require("./config/env");

const app = createApp();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Make io available to route handlers via app.locals
app.locals.io = io;

io.on("connection", (socket) => {
  const { outletId } = socket.handshake.query;

  if (outletId) {
    socket.join(`outlet:${outletId}`);
  }

  socket.on("join-outlet", (id) => {
    socket.join(`outlet:${id}`);
  });
});

server.listen(env.port, () => {
  console.log(`API server listening on port ${env.port}`);
});
