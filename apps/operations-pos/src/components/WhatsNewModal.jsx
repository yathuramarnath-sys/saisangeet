/**
 * WhatsNewModal — shown automatically once on first launch of a new version.
 * Shows:
 *   • What's new in this release
 *   • Installation guide (how to update next time)
 *
 * Dismissed by clicking "Got it" — never shown again for this version.
 * localStorage key: pos_whats_new_seen_v{VERSION}
 */

import { useState } from "react";
import { APP_VERSION } from "./UpdateBanner";

const SEEN_KEY = `pos_whats_new_seen_v${APP_VERSION}`;

const WHATS_NEW = [
  { icon: "📋", text: "Order panel is now compact — 5-6 items visible at once on 15\" touch screens" },
  { icon: "🔒", text: "Data isolation — changing outlet code completely wipes previous outlet's data from this machine before loading the new outlet" },
  { icon: "🗑", text: "Wastage button — log spoilage, overcooked or dropped items during shift" },
  { icon: "📄", text: "Menu now shows 20 items per page with page navigation" },
  { icon: "✏️", text: "Category list is compact and scrollable — no more long scroll" },
];

const INSTALL_GUIDE = [
  "Close Plato POS completely. If it won't close, open Task Manager → find 'Plato POS' → End Task.",
  "Run 'Plato-POS-Setup.exe' as Administrator — right-click the file → Run as administrator.",
  "Click Yes on the security / UAC prompt.",
  "Follow the installer: click Next → Next → Install. Takes about 30 seconds.",
  "POS opens automatically when done. Log in with your cashier PIN.",
];

export function useWhatsNew() {
  const alreadySeen = () => {
    try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; }
  };
  const [show, setShow] = useState(!alreadySeen());

  function dismiss() {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
    setShow(false);
  }

  return { show, dismiss };
}

export function WhatsNewModal({ onClose }) {
  const [tab, setTab] = useState("new"); // "new" | "guide"

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sm-modal" style={{ maxWidth: 480, width: "95vw" }}>

        {/* Header */}
        <div className="sm-head" style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)", borderRadius: "12px 12px 0 0", padding: "18px 20px" }}>
          <div>
            <h3 style={{ color: "#fff", margin: 0, fontSize: 17 }}>
              ✨ What's New in v{APP_VERSION}
            </h3>
            <p className="sm-sub" style={{ color: "rgba(255,255,255,0.8)", margin: "2px 0 0" }}>
              Plato POS — Latest update
            </p>
          </div>
          <button type="button" className="sm-close-btn"
            style={{ color: "#fff", opacity: 0.8 }}
            onClick={onClose}>✕</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", borderBottom: "1.5px solid #e5e7eb", background: "#fafafa" }}>
          {[
            { key: "new",   label: "✨ What's New"       },
            { key: "guide", label: "📋 Install Guide"    },
          ].map(t => (
            <button key={t.key} type="button"
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: "11px 0", fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
                background: "none", border: "none", cursor: "pointer",
                borderBottom: tab === t.key ? "2.5px solid #059669" : "2.5px solid transparent",
                color: tab === t.key ? "#059669" : "#6b7280",
                marginBottom: -1.5,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="sm-body" style={{ padding: "20px 22px", minHeight: 220 }}>

          {/* What's New tab */}
          {tab === "new" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {WHATS_NEW.map((item, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  background: "#f0fdf4", border: "1px solid #bbf7d0",
                  borderRadius: 8, padding: "10px 14px"
                }}>
                  <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: 13.5, color: "#111827", lineHeight: 1.5 }}>{item.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Install Guide tab */}
          {tab === "guide" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                Follow these steps to install a future update:
              </p>
              {INSTALL_GUIDE.map((step, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  background: "#fff", border: "1.5px solid #e5e7eb",
                  borderRadius: 8, padding: "10px 14px"
                }}>
                  <span style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
                    background: "#059669", color: "#fff", fontSize: 12,
                    fontWeight: 700, display: "flex", alignItems: "center",
                    justifyContent: "center"
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13.5, color: "#111827", lineHeight: 1.5 }}>{step}</span>
                </div>
              ))}
              <div style={{
                marginTop: 4, padding: "10px 14px", background: "#fef3c7",
                border: "1px solid #fde68a", borderRadius: 8, fontSize: 12.5, color: "#92400e"
              }}>
                ⚠️ Always close the POS before running the installer — or it will fail.
              </div>
            </div>
          )}
        </div>

        <div className="sm-footer" style={{ padding: "14px 20px" }}>
          <button type="button" className="ghost-btn" onClick={() => setTab(tab === "new" ? "guide" : "new")}>
            {tab === "new" ? "📋 View Install Guide" : "✨ View What's New"}
          </button>
          <button type="button" className="sm-btn-action close-ok"
            style={{ background: "#059669" }}
            onClick={onClose}>
            Got it — Let's go! 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
