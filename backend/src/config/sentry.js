/**
 * sentry.js — Sentry error monitoring for the Node.js backend.
 *
 * Must be required FIRST in server.js before any other imports
 * so Sentry can instrument all modules automatically.
 *
 * Set SENTRY_DSN in Railway environment variables to activate.
 * If SENTRY_DSN is not set, this is a safe no-op.
 */

const Sentry = require("@sentry/node");

function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN not set — error monitoring disabled.");
    return;
  }

  Sentry.init({
    dsn,
    environment:  process.env.NODE_ENV || "production",
    release:      process.env.npm_package_version || "1.0.0",
    integrations: [],
    tracesSampleRate: 1.0,

    // Don't send PII — strip user emails/IPs from events
    sendDefaultPii: false,

    beforeSend(event) {
      // Strip any Authorization headers that sneak into breadcrumbs
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      return event;
    },
  });

  console.log(`[sentry] Initialized — environment: ${process.env.NODE_ENV || "production"}`);
}

module.exports = { initSentry, Sentry };
