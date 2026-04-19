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

  // Email (nodemailer)
  smtpHost:    process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort:    Number(process.env.SMTP_PORT || 587),
  smtpUser:    process.env.SMTP_USER || "",
  smtpPass:    process.env.SMTP_PASS || "",
  emailFrom:   process.env.EMAIL_FROM || "DineXPOS <hello@dinexpos.in>",
  appUrl:      process.env.APP_URL   || "https://app.dinexpos.in"
};

module.exports = {
  env
};
