/**
 * AppUpdateNotifier
 * Fetches /app-versions on load, compares against last-seen versions stored
 * in localStorage, and shows a popup if any app has a newer version.
 */
import { useEffect, useState } from "react";
import { api } from "../lib/api";

const SEEN_KEY = "owner_seen_app_versions";

function getSeenVersions() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); }
  catch { return {}; }
}

function saveSeenVersions(versions) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(versions));
}

// Simple semver-style compare: returns true if `next` is newer than `current`
function isNewer(current, next) {
  if (!current || !next) return false;
  const parse = v => String(v).split(".").map(Number);
  const [ca, cb, cc = 0] = parse(current);
  const [na, nb, nc = 0] = parse(next);
  if (na !== ca) return na > ca;
  if (nb !== cb) return nb > cb;
  return nc > cc;
}

const GH = "https://github.com/yathuramarnath-sys/saisangeet/releases/latest/download";
const APP_ICONS = { pos: "🖥️", captain: "📱", kds: "📺", ownerWeb: "⚙️" };

export function AppUpdateNotifier() {
  const [updates, setUpdates] = useState([]);
  const [show,    setShow]    = useState(false);
  const [raw,     setRaw]     = useState(null);

  useEffect(() => {
    api.get("/app-versions")
      .then(data => {
        if (!data || typeof data !== "object") return;
        setRaw(data);
        const seen = getSeenVersions();
        const found = Object.entries(data)
          .filter(([key, info]) => isNewer(seen[key], info.version))
          .map(([key, info]) => ({ key, ...info }));
        if (found.length > 0) {
          setUpdates(found);
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  function dismiss() {
    if (raw) {
      const seen = {};
      Object.entries(raw).forEach(([key, info]) => { seen[key] = info.version; });
      saveSeenVersions(seen);
    }
    setShow(false);
  }

  if (!show || updates.length === 0) return null;

  return (
    <div className="aun-overlay" onClick={e => e.target === e.currentTarget && dismiss()}>
      <div className="aun-modal">
        <div className="aun-header">
          <div className="aun-header-icon">🚀</div>
          <div>
            <h3 className="aun-title">New Updates Available</h3>
            <p className="aun-subtitle">{updates.length} app{updates.length > 1 ? "s" : ""} updated — download to get the latest features</p>
          </div>
          <button className="aun-close" onClick={dismiss}>✕</button>
        </div>

        <div className="aun-list">
          {updates.map(app => (
            <div key={app.key} className="aun-app-row">
              <span className="aun-app-icon">{APP_ICONS[app.key] || "📦"}</span>
              <div className="aun-app-info">
                <strong className="aun-app-name">{app.label}</strong>
                <span className="aun-app-version">v{app.version} · {app.releaseDate}</span>
                {app.changelog && <p className="aun-app-changelog">{app.changelog}</p>}
              </div>
              <div className="aun-app-actions">
                {app.downloadUrl && (
                  <a href={app.downloadUrl} className="aun-dl-btn" target="_blank" rel="noopener noreferrer" download>
                    ↓ .exe
                  </a>
                )}
                {app.apkUrl && (
                  <a href={app.apkUrl} className="aun-dl-btn apk" target="_blank" rel="noopener noreferrer" download>
                    ↓ APK
                  </a>
                )}
                {!app.downloadUrl && !app.apkUrl && (
                  <span className="aun-web-badge">Refresh to update</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="aun-footer">
          <a href="/app-store" className="aun-store-link" onClick={dismiss}>View App Store →</a>
          <button className="aun-dismiss-btn" onClick={dismiss}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}
