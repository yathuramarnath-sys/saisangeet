/**
 * AppStorePage
 * One-stop hub for the manager to:
 *   1. Download every app (POS, Captain App, KDS, Owner Web)
 *   2. See / copy / regenerate the branch link code for each outlet
 *      — staff enter this code on first launch to sync the device
 */
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

// ─── App catalogue ────────────────────────────────────────────────────────────
// Download URLs come from /api/v1/app-versions (backend app-versions.json).
// Update app-versions.json + upload new file to GitHub Release → App Store auto-updates.

// Static app metadata — versions and download URLs are injected from API
function buildApps(versions = {}) {
  const pos     = versions.pos     || {};
  const captain = versions.captain || {};
  const kds     = versions.kds     || {};

  return [
    {
      id: "pos",
      name: "POS Terminal",
      tagline: "Billing counter, cash drawer, receipt printer",
      icon: "🖥️",
      color: "#2563eb",
      bg: "#eff6ff",
      border: "#bfdbfe",
      version: pos.version || null,
      changelog: pos.changelog || null,
      platforms: [
        {
          label: "Open Web App",
          icon: "🌐",
          file: null,
          url: "https://pos.dinexpos.in",
          installHint: "On Windows: Chrome menu → 'Install Plato POS' → launches as desktop app. On Android: Chrome menu → 'Add to Home Screen'."
        },
        ...(pos.downloadUrl ? [{
          label: `Windows App v${pos.version || ""} (.exe)`,
          icon: "💻",
          file: `Plato-POS-Setup-v${pos.version || ""}.exe`,
          url: pos.downloadUrl,
          installHint: "Download and run the installer on any Windows PC. Uninstall old version first if already installed, then run the new installer."
        }] : []),
        ...(pos.macArmUrl ? [{
          label: `Mac App v${pos.version || ""} (Apple Silicon)`,
          icon: "🍎",
          file: `Plato-POS-v${pos.version || ""}-arm64.dmg`,
          url: pos.macArmUrl,
          installHint: "For M1/M2/M3 Macs. Open the DMG → drag Plato POS to Applications. First launch: right-click the app → Open (to bypass Gatekeeper). Uninstall old version first if already installed."
        }] : []),
        ...(pos.macUrl ? [{
          label: `Mac App v${pos.version || ""} (Intel)`,
          icon: "🍎",
          file: `Plato-POS-v${pos.version || ""}-intel.dmg`,
          url: pos.macUrl,
          installHint: "For Intel Macs. Open the DMG → drag Plato POS to Applications. First launch: right-click the app → Open (to bypass Gatekeeper). Uninstall old version first if already installed."
        }] : []),
        ...(pos.apkUrl ? [{
          label: `Android APK v${pos.version || ""}`,
          icon: "📱",
          file: pos.apkUrl.split("/").pop(),
          url: pos.apkUrl,
          installHint: "Download APK on Android tablet → open file → tap Install. Enable 'Install from unknown sources' in Settings if prompted."
        }] : []),
      ],
      who: "Cashier / Manager",
      note: "Works on any Windows PC, Android tablet, or Chrome browser.",
    },
    {
      id: "captain",
      name: "Captain App",
      tagline: "Waiter order-taking, table management, KOT",
      icon: "📱",
      color: "#059669",
      bg: "#f0fdf4",
      border: "#bbf7d0",
      version: captain.version || null,
      changelog: captain.changelog || null,
      platforms: [
        {
          label: "Open Web App",
          icon: "🌐",
          file: null,
          url: "https://captain.dinexpos.in",
          installHint: "On Android: open in Chrome → tap ⋮ menu → 'Add to Home Screen'. It works like a native app — full screen, no browser bar."
        },
        ...(captain.apkUrl ? [{
          label: "Android APK",
          icon: "📲",
          file: captain.apkUrl.split("/").pop(),
          url: captain.apkUrl,
          installHint: "Download APK on Android phone/tablet → open file → tap Install. Enable 'Install from unknown sources' in Settings if prompted."
        }] : []),
      ],
      who: "Captain / Waiter",
      note: "Best on Android phone or tablet. Install APK for the best native experience.",
    },
    {
      id: "kds",
      name: "Kitchen Display",
      tagline: "KOT queue, item status, preparation timers",
      icon: "📺",
      color: "#dc2626",
      bg: "#fff1f2",
      border: "#fecdd3",
      version: kds.version || null,
      changelog: kds.changelog || null,
      platforms: [
        {
          label: "Open Web App",
          icon: "🌐",
          file: null,
          url: "https://kds.dinexpos.in",
          installHint: "On Android TV / tablet: open in Chrome → tap ⋮ menu → 'Add to Home Screen'. Press F11 on Windows for full-screen kiosk mode."
        },
        ...(kds.apkUrl ? [{
          label: "Android APK",
          icon: "📺",
          file: kds.apkUrl.split("/").pop(),
          url: kds.apkUrl,
          installHint: "Download APK on Android tablet → open file → tap Install. Enable 'Install from unknown sources' in Settings if prompted."
        }] : []),
      ],
      who: "Kitchen staff",
      note: "Mount a screen at each station. Works on Android, Windows, or any smart TV with Chrome.",
    },
    {
      id: "owner",
      name: "Owner Dashboard",
      tagline: "Menu, staff, reports, settings — you are here",
      icon: "⚙️",
      color: "#7c3aed",
      bg: "#f5f3ff",
      border: "#ddd6fe",
      version: null,
      changelog: null,
      platforms: [
        { label: "app.dinexpos.in", icon: "🌐", file: null, url: null, current: true },
      ],
      who: "Owner / Admin",
      note: "No installation needed — just bookmark this page.",
    },
  ];
}

// ─── Link-code card per outlet ────────────────────────────────────────────────

function LinkCodeCard({ outlet }) {
  const [code,      setCode]      = useState("");
  const [copied,    setCopied]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error,     setError]     = useState("");

  async function generateCode() {
    setGenerating(true);
    setError("");
    setCopied(false);
    try {
      const result = await api.post("/devices/link-token", {
        outletCode: outlet.code,
        outletId:   outlet.id,
      });
      setCode(result.linkCode);
    } catch (err) {
      setError("Could not generate — try again");
      console.error("[AppStore] link-token error:", err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const el = document.createElement("input");
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="as-link-card">
      <div className="as-link-top">
        <div className="as-link-outlet-info">
          <span className="as-link-outlet-dot" />
          <div>
            <strong className="as-link-outlet-name">{outlet.name}</strong>
            <span className="as-link-outlet-code">{outlet.code}</span>
          </div>
        </div>
        <span className="as-link-badge">Active</span>
      </div>

      <div className="as-link-code-row">
        {code ? (
          <>
            <span className="as-link-code">{generating ? "Generating…" : error ? error : code}</span>
            <button
              className={`as-link-copy-btn${copied ? " copied" : ""}`}
              onClick={copyCode}
              disabled={generating || !code}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </>
        ) : (
          <button
            className="as-regen-btn"
            onClick={generateCode}
            disabled={generating}
          >
            {generating ? "Generating…" : "Generate Code"}
          </button>
        )}
        {error && <span className="as-link-code error">{error}</span>}
      </div>

      <p className="as-link-hint">
        Staff enter this code on <strong>POS Terminal</strong>, <strong>Captain App</strong> or <strong>KDS</strong> first launch to sync this outlet. Valid for <strong>24 hours</strong>.
      </p>

      <div className="as-link-footer">
        <div className="as-link-usage">
          <span className="as-link-usage-item">🖥️ POS</span>
          <span className="as-link-usage-item">📱 Captain</span>
          <span className="as-link-usage-item">📺 KDS</span>
        </div>
        <button className="as-regen-btn" onClick={generateCode} disabled={generating} title="Generate new code">
          {generating ? "…" : "↺ New Code"}
        </button>
      </div>
    </div>
  );
}

// ─── Download / launch button ─────────────────────────────────────────────────

function PlatformBtn({ platform, appColor }) {
  const [showHint, setShowHint] = useState(false);

  function handleClick() {
    if (platform.current) return; // already here
    if (platform.file && platform.url) {
      // Trigger file download directly
      const a = document.createElement("a");
      a.href = platform.url;
      a.download = platform.file;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    if (platform.url) { window.open(platform.url, "_blank"); return; }
  }

  return (
    <div className="as-platform-btn-wrap">
      <button
        className={`as-platform-btn${platform.current ? " current" : ""}`}
        onClick={handleClick}
        style={platform.current ? {} : { "--app-color": appColor }}
      >
        <span className="as-platform-icon">{platform.icon}</span>
        <span className="as-platform-label">{platform.label}</span>
        {platform.current
          ? <span className="as-platform-tag">You're here</span>
          : platform.file
            ? <span className="as-platform-tag dl">↓ Download</span>
            : <span className="as-platform-tag open">Open ↗</span>
        }
      </button>

      {/* "How to install" hint toggle — shown for web apps and APK downloads */}
      {platform.installHint && (
        <>
          <button
            className="as-install-hint-btn"
            onClick={() => setShowHint(v => !v)}
            title="Installation instructions"
          >
            {platform.file ? "📋 Install guide" : "📲 How to install"}
          </button>
          {showHint && (
            <div className="as-install-hint-box">
              <strong>{platform.file ? "Installation Guide" : "Install as App"}</strong>
              <p>{platform.installHint}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AppStorePage() {
  const [outlets,  setOutlets]  = useState([]);
  const [versions, setVersions] = useState({});
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/outlets").catch(() => []),
      api.get("/app-versions").catch(() => ({})),
    ]).then(([outletData, versionData]) => {
      setOutlets(Array.isArray(outletData) ? outletData.filter(o => o.isActive !== false) : []);
      setVersions(versionData || {});
    }).finally(() => setLoading(false));
  }, []);

  const APPS = buildApps(versions);

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup</p>
          <h2>App Store &amp; Device Setup</h2>
        </div>
      </header>

      {/* ── Intro banner ───────────────────────────────────────────────── */}
      <div className="as-intro-banner">
        <div className="as-intro-icon">📲</div>
        <div>
          <strong>How it works</strong>
          <p>
            Download the app for each station → open it on the device → enter the branch link code below → the device auto-syncs to your outlet's menu, tables and staff.
          </p>
        </div>
      </div>

      {/* ── Step 1: Download apps ───────────────────────────────────────── */}
      <section className="as-section">
        <div className="as-section-head">
          <span className="as-step-badge">Step 1</span>
          <h3>Download &amp; Install Apps</h3>
          <p>One app per station type. Run as web app or install natively.</p>
        </div>

        <div className="as-apps-grid">
          {APPS.map(app => (
            <div
              key={app.id}
              className="as-app-card"
              style={{ "--app-color": app.color, "--app-bg": app.bg, "--app-border": app.border }}
            >
              <div className="as-app-icon">{app.icon}</div>
              <div className="as-app-meta">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong className="as-app-name">{app.name}</strong>
                  {app.version && (
                    <span style={{ fontSize: 11, fontWeight: 700, background: "var(--app-bg)", color: "var(--app-color)", border: "1.5px solid var(--app-border)", borderRadius: 20, padding: "2px 8px" }}>
                      v{app.version}
                    </span>
                  )}
                </div>
                <span className="as-app-tag">{app.tagline}</span>
                {app.changelog && (
                  <span style={{ fontSize: 11, color: "#888", marginTop: 2, display: "block" }}>
                    {app.changelog}
                  </span>
                )}
              </div>

              <div className="as-platform-list">
                {app.platforms.map((p, i) => (
                  <PlatformBtn key={i} platform={p} appColor={app.color} />
                ))}
              </div>

              <div className="as-app-footer">
                <span className="as-app-who">👤 {app.who}</span>
                <span className="as-app-note">{app.note}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Step 2: Branch link codes ───────────────────────────────────── */}
      <section className="as-section">
        <div className="as-section-head">
          <span className="as-step-badge">Step 2</span>
          <h3>Branch Link Codes</h3>
          <p>
            Each outlet has a unique code. Staff enter it on first launch — the app instantly syncs menu, tables and staff for that outlet.
          </p>
        </div>

        {loading ? (
          <p className="as-loading">Loading outlets…</p>
        ) : outlets.length === 0 ? (
          <div className="panel panel-empty">
            No active outlets found. <a href="/outlets">Set up outlets first →</a>
          </div>
        ) : (
          <div className="as-link-grid">
            {outlets.map(outlet => (
              <LinkCodeCard key={outlet.id} outlet={outlet} />
            ))}
          </div>
        )}
      </section>

      {/* ── Step 3: Quick guide ─────────────────────────────────────────── */}
      <section className="as-section">
        <div className="as-section-head">
          <span className="as-step-badge">Step 3</span>
          <h3>Quick Setup Guide</h3>
        </div>
        <div className="as-guide-grid">
          {[
            { icon: "🖥️", title: "POS Terminal", steps: ["Download & open POS Terminal app", "Enter the branch link code for this outlet", "Log in with Cashier PIN", "Go to Settings → Printers to configure receipt printer"] },
            { icon: "📱", title: "Captain App", steps: ["Install Captain App APK on Android tablet", "Enter the branch link code for this outlet", "Select your profile from the staff grid", "Enter your 4-digit PIN to start"] },
            { icon: "📺", title: "Kitchen Display", steps: ["Open KDS app on kitchen screen", "Enter the branch link code for this outlet", "Select your station (Hot / Grill / Beverages…)", "Go full-screen — KOTs will appear automatically"] },
          ].map(({ icon, title, steps }) => (
            <div key={title} className="as-guide-card">
              <div className="as-guide-icon">{icon}</div>
              <strong className="as-guide-title">{title}</strong>
              <ol className="as-guide-steps">
                {steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
