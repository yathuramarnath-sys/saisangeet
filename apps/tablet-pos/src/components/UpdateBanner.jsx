/**
 * UpdateBanner — shows at the top of the POS when a new version is available.
 *
 * Two modes:
 *  1. Electron path: listens to electron-updater IPC events (update:available / update:ready)
 *  2. Web / API path: polls GET /api/v1/app-versions and compares with APP_VERSION
 *
 * Web update logic:
 *  - APP_VERSION must always match package.json "version" (updated on every release)
 *  - When user clicks "Refresh Now", we hard-reload with cache-bust so the browser
 *    fetches the latest JS/CSS bundles from Vercel, not a cached copy.
 *  - After reload, if APP_VERSION now matches the latest, banner stays gone.
 *  - If user dismisses, we remember the version they dismissed so we don't
 *    re-nag them on the next page load for the same version.
 */

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

// ⚠️  Keep this in sync with package.json "version" on every release.
const APP_VERSION = "1.1.0";
const APP_KEY     = "tabletPos";
const API_BASE    = import.meta.env.VITE_API_BASE_URL || "https://api.dinexpos.in/api/v1";
const DISMISS_KEY = "pos_update_dismissed_for";  // localStorage: stores version user dismissed

export function UpdateBanner() {
  const [state,     setState]     = useState(null);   // null | "available" | "downloading" | "ready"
  const [newVer,    setNewVer]    = useState("");
  const [progress,  setProgress]  = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // ── Electron path ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.electronAPI?.onUpdateAvailable) {
      const unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
        setNewVer(info.version);
        setState("available");
      });
      const unsubProgress = window.electronAPI.onUpdateProgress?.((info) => {
        setProgress(info.percent || 0);
        setState("downloading");
      });
      const unsubReady = window.electronAPI.onUpdateReady?.((info) => {
        setNewVer(info.version);
        setState("ready");
        setDismissed(false);
      });
      return () => {
        unsubAvailable?.();
        unsubProgress?.();
        unsubReady?.();
      };
    }

    // ── Web / PWA path ────────────────────────────────────────────────────────
    function checkVersion() {
      fetch(`${API_BASE}/app-versions`, { cache: "no-store" })
        .then(r => r.json())
        .then(data => {
          const latest = data?.[APP_KEY]?.version;
          if (!latest) return;

          // Already on latest — ensure no stale banner lingers
          if (compareVersions(latest, APP_VERSION) <= 0) {
            setState(null);
            return;
          }

          // User already dismissed this exact version in this session
          const dismissedFor = localStorage.getItem(DISMISS_KEY);
          if (dismissedFor === latest) return;

          setNewVer(latest);
          setState("available");
        })
        .catch(() => {});
    }

    checkVersion();
    const timer = setInterval(checkVersion, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Show brief "you're up to date" toast on first load if just updated ──────
  useEffect(() => {
    const justUpdated = sessionStorage.getItem("pos_just_updated");
    if (justUpdated) {
      sessionStorage.removeItem("pos_just_updated");
      // Small delay so toast shows after login screen settles
      setTimeout(() => {
        toast.success(`Running Plato POS v${APP_VERSION} — up to date ✓`, { duration: 4000 });
      }, 1500);
    }
  }, []);

  if (!state || dismissed) return null;

  function handleRefresh() {
    // Mark so that after reload we show the "up to date" confirmation
    sessionStorage.setItem("pos_just_updated", "1");
    // Hard cache-bust reload — forces browser to fetch new JS/CSS bundles from CDN
    window.location.href = window.location.pathname + "?v=" + Date.now();
  }

  function handleDismiss() {
    // Remember which version was dismissed so we don't re-show on next load
    if (newVer) localStorage.setItem(DISMISS_KEY, newVer);
    setDismissed(true);
  }

  return (
    <div className="update-banner" data-state={state}>
      <div className="update-banner-inner">
        <span className="update-banner-icon">
          {state === "ready" ? "🚀" : state === "downloading" ? "⬇️" : "✨"}
        </span>

        <div className="update-banner-text">
          <span className="ubanner-cur-ver">v{APP_VERSION}</span>
          {" · "}
          {state === "ready" && (
            <>
              <strong>v{newVer} ready!</strong>
              {" "}Restart to install.
            </>
          )}
          {state === "downloading" && (
            <>
              <strong>Downloading v{newVer}…</strong>
              {" "}{Math.round(progress)}%
            </>
          )}
          {state === "available" && (
            <>
              <strong>v{newVer} available</strong>
              {" — "}tap Refresh to update.
            </>
          )}
        </div>

        <div className="update-banner-actions">
          {state === "ready" && window.electronAPI?.installUpdate && (
            <button className="update-banner-btn primary" onClick={() => window.electronAPI.installUpdate()}>
              Restart &amp; Install
            </button>
          )}
          {state === "available" && !window.electronAPI && (
            <button className="update-banner-btn primary" onClick={handleRefresh}>
              Refresh Now
            </button>
          )}
          <button className="update-banner-btn dismiss" onClick={handleDismiss} title="Dismiss">
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

// ── Helpers ────────────────────────────────────────────────────────────────────

// Returns 1 if a > b, -1 if a < b, 0 if equal
function compareVersions(a, b) {
  const pa = (a || "0").split(".").map(Number);
  const pb = (b || "0").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

/**
 * Convenience export so the POS topbar / settings can display the
 * current running version without importing a separate constant.
 */
export { APP_VERSION };
