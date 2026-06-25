import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { OnboardingWizard, isOnboardingDone } from "../features/onboarding/OnboardingWizard";
import { api } from "../lib/api";

/**
 * Show the onboarding wizard when:
 *   1. localStorage flag is NOT set (never completed), AND
 *   2. The account has no outlets yet (genuinely new account)
 *
 * Once either condition is broken the wizard never appears again.
 */
function useShowOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Already completed — never show
    if (isOnboardingDone()) return;

    // Check if they have any outlets — if yes, skip wizard
    api.get("/outlets")
      .then(data => {
        const outlets = Array.isArray(data) ? data : [];
        if (outlets.length === 0) {
          setShow(true);
        } else {
          // Has outlets — mark done so we never check again
          import("../features/onboarding/OnboardingWizard")
            .then(({ markOnboardingDone }) => markOnboardingDone());
        }
      })
      .catch(() => {
        // Network error — don't block the UI, skip wizard silently
      });
  }, []);

  return [show, () => setShow(false)];
}

export function OwnerLayout({ children }) {
  const [showWizard, closeWizard] = useShowOnboarding();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile nav tap)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="app-shell">
      {/* Mobile top bar — hidden on desktop via CSS */}
      <div className="mob-topbar">
        <button
          type="button"
          className="mob-hamburger"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <span /><span /><span />
        </button>
        <span className="mob-topbar-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/favicon.svg" width="28" height="28" alt="Plato" style={{ borderRadius: 6 }} />
          Plato
        </span>
      </div>

      {/* Backdrop — closes sidebar when tapped */}
      {sidebarOpen && (
        <div className="mob-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">{children}</main>

      {showWizard && (
        <OnboardingWizard onComplete={closeWizard} />
      )}
    </div>
  );
}
