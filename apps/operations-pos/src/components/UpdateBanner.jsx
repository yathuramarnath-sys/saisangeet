/**
 * UpdateBanner — shows at the top of the POS when a new version is available.
 *
 * Two modes:
 *  1. Electron path: listens to electron-updater IPC events (update:available / update:ready)
 *  2. Web / API path: polls GET /api/v1/app-versions and compares with APP_VERSION
 */

import { useEffect, useState } from "react";

const APP_VERSION = "1.3.3";          // updated by release script
const APP_KEY     = "pos";             // key in app-versions.json
const API_BASE    = import.meta.env.VITE_API_BASE_URL || "https://api.dinexpos.in/api/v1";

export function UpdateBanner() {
  const [state,    setState]    = useState(null);  // null | "available" | "downloading" | "ready"
  const [version,  setVersion]  = useState("");
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // ── Electron path ─────────────────────────────────────────────────────────
    if (window.electronAPI?.onUpdateAvailable) {
      // Each on* returns a cleanup fn — call them on unmount to prevent listener leak
      const unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
        setVersion(info.version);
        setState("available");
      });
      const unsubProgress = window.electronAPI.onUpdateProgress?.((info) => {
        setProgress(info.percent || 0);
        setState("downloading");
      });
      const unsubReady = window.electronAPI.onUpdateReady?.((info) => {
        setVersion(info.version);
        setState("ready");
        setDismissed(false); // re-show when download completes
      });
      return () => {
        unsubAvailable?.();
        unsubProgress?.();
        unsubReady?.();
      };
    }

    // ── Web / PWA path ────────────────────────────────────────────────────────
    // Check once on load, then every 30 minutes
    function checkVersion() {
      fetch(`${API_BASE}/app-versions`, { cache: "no-store" })
        .then(r => r.json())
        .then(data => {
          const latest = data?.[APP_KEY]?.version;
          if (latest && latest !== APP_VERSION && compareVersions(latest, APP_VERSION) > 0) {
            setVersion(latest);
            setState("available");
          }
        })
        .catch(() => {});
    }

    checkVersion();
    const timer = setInterval(checkVersion, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  if (!state || dismissed) return null;

  return (
    <div className="update-banner" data-state={state}>
      <div className="update-banner-inner">
        <span className="update-banner-icon">
          {state === "ready" ? "🚀" : state === "downloading" ? "⬇️" : "🎉"}
        </span>
        <div className="update-banner-text">
          {state === "ready" && (
            <>
              <strong>Update ready!</strong>
              {" "}Version {version} downloaded — restart to apply.
            </>
          )}
          {state === "downloading" && (
            <>
              <strong>Downloading update…</strong>
              {" "}{progress}% — will install on next restart.
            </>
          )}
          {state === "available" && (
            <>
              <strong>New version {version} available!</strong>
              {" "}Downloading in the background…
            </>
          )}
        </div>
        <div className="update-banner-actions">
          {state === "ready" && window.electronAPI?.installUpdate && (
            <button
              className="update-banner-btn primary"
              onClick={() => window.electronAPI.installUpdate()}
            >
              Restart &amp; Install
            </button>
          )}
          {state === "available" && !window.electronAPI && (
            <button
              className="update-banner-btn primary"
              onClick={() => window.location.reload()}
            >
              Refresh Now
            </button>
          )}
          <button
            className="update-banner-btn dismiss"
            onClick={() => setDismissed(true)}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
      {state === "downloading" && (
        <div className="update-banner-progress">
          <div className="update-banner-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

// Simple semver comparison: returns 1 if a > b, -1 if a < b, 0 if equal
function compareVersions(a, b) {
  const pa = (a || "0").split(".").map(Number);
  const pb = (b || "0").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
