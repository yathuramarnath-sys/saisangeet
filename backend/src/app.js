// build: 2026-04-29c
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");

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

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "restaurant-pos-backend"
    });
  });

  app.use("/api/v1", generalLimiter, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp
};
