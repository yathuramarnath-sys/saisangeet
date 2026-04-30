/**
 * sentry.js — Sentry error monitoring for Owner Web (React).
 *
 * Initialised once in main.jsx before ReactDOM.render.
 * Activated only when VITE_SENTRY_DSN is set in environment.
 * Safe no-op if DSN is missing.
 */

import * as Sentry from "@sentry/react";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:      import.meta.env.MODE || "production",
    release:          import.meta.env.VITE_APP_VERSION || "1.0.0",
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Only capture replays on errors, not every session
        maskAllText:   true,
        blockAllMedia: true,
      }),
    ],
    // 10% of page loads get performance tracing
    tracesSampleRate: 0.1,
    // 100% of error sessions get replays
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,

    beforeSend(event) {
      // Don't send events in local dev
      if (window.location.hostname === "localhost") return null;
      return event;
    },
  });
}

// Helper to manually capture an error with extra context
export function captureError(err, context = {}) {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(err, { extra: context });
  }
  console.error("[error]", err, context);
}

export { Sentry };
