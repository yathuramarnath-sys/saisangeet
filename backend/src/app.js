// build: 2026-04-30
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const { Sentry } = require("./config/sentry");

const { apiRouter } = require("./routes");
const { errorHandler } = require("./middleware/error-handler");
const { notFoundHandler } = require("./middleware/not-found");
const { generalLimiter } = require("./middleware/rate-limit");

const ALLOWED_ORIGINS = [
  // Local dev — Vite default ports
  "http://localhost:5173",   // waiter-mobile (vite dev)
  "http://localhost:4173",   // vite preview
  "http://localhost:4174",
  "http://localhost:4175",
  "http://localhost:4176",
  // Capacitor / Ionic mobile WebView origins
  // Android and iOS Capacitor WebView always sends one of these as the Origin header.
  // Without them every fetch from the installed APK/IPA is rejected with a CORS error
  // even though the phone can reach the server — the browser-level check blocks it first.
  "capacitor://localhost",   // Capacitor Android & iOS WebView (primary)
  "https://localhost",       // Capacitor Android WebView on newer devices (confirmed via DevTools)
  "http://localhost",        // Capacitor live-reload / some Android WebView builds
  "ionic://localhost",       // Ionic-legacy / future-proofing
  // Production — dinexpos.in subdomains
  "https://dinexpos.in",
  "https://www.dinexpos.in",
  "https://app.dinexpos.in",
  "https://pos.dinexpos.in",
  "https://captain.dinexpos.in",
  "https://kds.dinexpos.in",
  // Allow any *.vercel.app preview deployments
];

function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({
    origin: (origin, cb) => {
      // Allow requests with no Origin header (curl, Postman, server-to-server calls).
      // Note: Capacitor mobile apps DO send an Origin header — handled via ALLOWED_ORIGINS above.
      if (!origin) return cb(null, true);
      if (
        ALLOWED_ORIGINS.includes(origin) ||
        /\.vercel\.app$/.test(origin)
      ) {
        return cb(null, true);
      }
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // ── Health endpoint — used by UptimeRobot + Railway health checks ────────
  app.get("/health", async (_req, res) => {
    const start = Date.now();
    let dbStatus = "ok";
    let dbLatencyMs = null;

    try {
      const { query } = require("./db/pool");
      await query("SELECT 1");
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = "error";
    }

    const status = dbStatus === "ok" ? "ok" : "degraded";
    res.status(status === "ok" ? 200 : 503).json({
      status,
      service:     "plato-pos-backend",
      version:     process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "production",
      db:          { status: dbStatus, latencyMs: dbLatencyMs },
      uptime:      Math.floor(process.uptime()),
      timestamp:   new Date().toISOString(),
    });
  });

  // Sentry request handler — must be before routes
  app.use(Sentry.setupExpressErrorHandler
    ? (...args) => { try { Sentry.setupExpressErrorHandler(...args); } catch {} }
    : (_req, _res, next) => next()
  );

  app.use("/api/v1", generalLimiter, apiRouter);
  app.use(notFoundHandler);

  // Sentry error handler — must be before custom error handler
  if (process.env.SENTRY_DSN) {
    app.use(Sentry.expressErrorHandler?.() || ((_err, _req, _res, next) => next(_err)));
  }

  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp
};
// redeploy Thu Apr 30 11:04:50 IST 2026
