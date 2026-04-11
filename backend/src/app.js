const cors = require("cors");
const express = require("express");
const helmet = require("helmet");

const { apiRouter } = require("./routes");
const { errorHandler } = require("./middleware/error-handler");
const { notFoundHandler } = require("./middleware/not-found");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

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
