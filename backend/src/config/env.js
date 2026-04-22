const dotenv = require("dotenv");

dotenv.config();

if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET environment variable must be set in production");
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production-a8f3k2m9",
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/restaurant_pos",

  // Set ENABLE_DATABASE=true in Railway to persist data across restarts
  enableDatabase: process.env.ENABLE_DATABASE === "true",

  // Email (Resend)
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom:    process.env.EMAIL_FROM || "DineXPOS <hello@dinexpos.in>",
  appUrl:       process.env.APP_URL    || "https://app.dinexpos.in",

  // Daily backup — set this to the owner's email in Railway variables
  backupEmail:  process.env.BACKUP_EMAIL || ""
};

module.exports = {
  env
};
