/**
 * BranchSetupScreen
 * Shown on first launch (or after "Forget device").
 * Asks staff to enter the branch link code generated in Owner Web → Outlets.
 * On success: saves config to localStorage and calls onComplete(config).
 */
import { useState } from "react";
import { api } from "../lib/api";

const LS_KEY = "pos_branch_config";

export function loadBranchConfig() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }
  catch { return null; }
}

export function saveBranchConfig(config) {
  localStorage.setItem(LS_KEY, JSON.stringify(config));
}

export function clearBranchConfig() {
  localStorage.removeItem(LS_KEY);
}

/**
 * Wipe every outlet-scoped localStorage key.
 * Called whenever the outlet code changes — ensures ZERO data from one
 * client/outlet can ever be seen by another client/outlet on the same machine.
 *
 * Keys preserved across outlet switches (user preferences / auth):
 *   pos_branch_config   — overwritten immediately after this call
 *   pos_token           — overwritten immediately after this call
 *   pos_staff           — overwritten immediately after this call
 *   pos_whats_new_seen_* — per-version modal "seen" flag (UX only, no client data)
 *   pos_update_dismissed_for — update banner dismissal (UX only)
 */
export function wipeOutletData() {
  const OUTLET_KEYS = [
    "pos_active_orders",
    "pos_active_orders_outlet",
    "pos_closed_orders",
    "pos_cache_outlet",
    "pos_cache_categories",
    "pos_cache_menu_items",
    "pos_cache_table_areas",
    "pos_kitchen_stations",
    "pos_table_config",
    "pos_active_shifts",
    "pos_discount_rules",
    "pos_last_synced",
    "pos_kot_queue",
    "pos_closed_order_queue",
    "pos_counter_ticket_num",
    "pos_wastage_log",
    "pos_wastage_sides",
    "pos_online_orders_enabled",
    "pos_security",
  ];
  for (const key of OUTLET_KEYS) {
    try { localStorage.removeItem(key); } catch {}
  }
  console.info("[POS] Outlet data wiped — clean slate for new outlet.");
}

export function BranchSetupScreen({ onComplete }) {
  const [code,     setCode]     = useState("");
  const [status,   setStatus]   = useState("idle"); // idle | loading | success | error
  const [result,   setResult]   = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [workArea, setWorkArea] = useState(""); // "" = Full Access (all areas)

  async function handleVerify(e) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const data = await api.post("/devices/resolve-link-code", {
        linkCode:   trimmed,
        deviceType: "POS Terminal",
      });
      setResult(data);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message || "Invalid link code — check with your manager.");
    }
  }

  function handleConfirm() {
    const config = {
      outletId:      result.outletId,
      outletCode:    result.outletCode,
      outletName:    result.outletName,
      // Which work area this physical terminal serves — "" / null = Full Access
      // (all areas, all tables). Set once here, remembered on this machine until
      // "Forget device" is used or a different branch code is linked.
      workArea:      workArea || null,
      configuredAt:  new Date().toISOString(),
    };

    // ── Data isolation — CRITICAL ────────────────────────────────────────────
    // If the outlet is changing (different outletId from what's stored), wipe
    // ALL outlet-scoped data before writing the new outlet's config.
    // This guarantees zero data from one client ever shows to another client,
    // even on a machine that has been used with multiple outlet codes.
    const existing = loadBranchConfig();
    if (existing?.outletId && existing.outletId !== result.outletId) {
      wipeOutletData();
    }
    // ────────────────────────────────────────────────────────────────────────

    saveBranchConfig(config);
    // Save device token — used for all subsequent API calls (correct tenant + outlet)
    if (result.deviceToken) {
      localStorage.setItem("pos_token", result.deviceToken);
    }
    // Save staff list for the login grid
    if (result.staff?.length) {
      localStorage.setItem("pos_staff", JSON.stringify(result.staff));
    }
    // Save kitchen stations immediately so printer setup works right away
    if (result.kitchenStations?.length) {
      localStorage.setItem("pos_kitchen_stations", JSON.stringify(result.kitchenStations));
    }

    // Register this device in the backend (fire-and-forget — non-blocking)
    const isElectron = typeof window !== "undefined" && !!window.__ELECTRON__;
    api.post("/devices/link", {
      outletId:   result.outletId,
      deviceType: "pos",
      deviceName: "POS Terminal",
      platform:   isElectron ? "windows" : "web",
    }).then((device) => {
      if (device?.id) localStorage.setItem("pos_device_id", device.id);
    }).catch(() => {});

    onComplete(config);
  }

  return (
    <div className="branch-setup-screen">
      <div className="branch-setup-card">

        {/* Logo */}
        <div className="branch-setup-logo">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9"/>
            <path d="M8 12h8" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 className="branch-setup-title">Plato</h1>
        <p className="branch-setup-subtitle">POS Terminal Setup</p>

        {status !== "success" ? (
          <>
            <p className="branch-setup-instruction">
              Enter the branch link code from<br />
              <strong>Owner Web → Outlets → Link Device</strong>
            </p>

            <form className="branch-setup-form" onSubmit={handleVerify}>
              <input
                className={`branch-code-input${status === "error" ? " error" : ""}`}
                type="text"
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setStatus("idle"); }}
                placeholder="e.g. VNB2-92345678"
                maxLength={20}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              {status === "error" && (
                <p className="branch-setup-error">⚠ {errorMsg}</p>
              )}
              <button
                className="branch-setup-btn"
                type="submit"
                disabled={status === "loading" || !code.trim()}
              >
                {status === "loading" ? "Verifying…" : "Connect to Branch →"}
              </button>
            </form>

            <p className="branch-setup-hint">
              The link code is generated by the outlet manager. It looks like <code>VNB2-92345678</code>.
            </p>
          </>
        ) : (
          /* ── Success confirmation ──────────────────────────────────────── */
          <div className="branch-setup-success">
            <div className="branch-success-check">✓</div>
            <h2 className="branch-success-name">{result.outletName}</h2>
            <p className="branch-success-meta">
              {result.tables?.length || 0} tables
              {result.workAreas?.length ? ` · ${result.workAreas.join(", ")}` : ""}
            </p>

            {result.workAreas?.length > 0 && (
              <div className="branch-setup-workarea">
                <p className="branch-setup-workarea-label">This terminal is for:</p>
                <label className={`branch-workarea-option${!workArea ? " selected" : ""}`}>
                  <input type="radio" name="workArea" checked={!workArea} onChange={() => setWorkArea("")} />
                  <span>Full Access — all areas, all tables</span>
                </label>
                {result.workAreas.map((area) => (
                  <label key={area} className={`branch-workarea-option${workArea === area ? " selected" : ""}`}>
                    <input type="radio" name="workArea" checked={workArea === area} onChange={() => setWorkArea(area)} />
                    <span>{area}</span>
                  </label>
                ))}
              </div>
            )}

            <button className="branch-setup-btn success" onClick={handleConfirm}>
              Start POS →
            </button>
            <button
              className="branch-setup-back"
              onClick={() => { setStatus("idle"); setResult(null); setCode(""); }}
            >
              ← Wrong outlet?
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
