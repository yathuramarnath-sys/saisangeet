import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { OnboardingWizard, isOnboardingDone } from "../features/onboarding/OnboardingWizard";
import { api } from "../lib/api";

function useShowOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isOnboardingDone()) return;
    api.get("/outlets")
      .then(data => {
        const outlets = Array.isArray(data) ? data : [];
        if (outlets.length === 0) {
          setShow(true);
        } else {
          import("../features/onboarding/OnboardingWizard")
            .then(({ markOnboardingDone }) => markOnboardingDone());
        }
      })
      .catch(() => {});
  }, []);

  return [show, () => setShow(false)];
}

export function OwnerLayout({ children }) {
  const [showWizard, closeWizard] = useShowOnboarding();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="oc-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="oc-main">
        {/* Top bar */}
        <header className="oc-topbar">
          {/* Mobile hamburger */}
          <button
            type="button"
            className="oc-mob-hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span /><span /><span />
          </button>

          {/* Search */}
          <div className="oc-search-wrap">
            <svg className="oc-search-icon" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="oc-search"
              type="search"
              placeholder="Search outlets, items, staff..."
              aria-label="Global search"
            />
          </div>

          {/* Right actions */}
          <div className="oc-topbar-right">
            <button className="oc-icon-btn" aria-label="Help" title="Help">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </button>
            <button className="oc-icon-btn" aria-label="Notifications" title="Notifications">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="oc-content">
          {children}
        </main>
      </div>

      {showWizard && <OnboardingWizard onComplete={closeWizard} />}
    </div>
  );
}
