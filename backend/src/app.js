const cors = require("cors");
const express = require("express");
const helmet = require("helmet");

const { apiRouter } = require("./routes");
const { errorHandler } = require("./middleware/error-handler");
const { notFoundHandler } = require("./middleware/not-found");

const ALLOWED_ORIGINS = [
  // Local dev
  "http://localhost:4173",
  "http://localhost:4174",
  "http://localhost:4175",
  "http://localhost:4176",
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
      // Allow requests with no origin (mobile apps, curl, Postman)
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

  app.use("/api/v1", apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp
};
