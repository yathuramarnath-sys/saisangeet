import { useState, useEffect } from "react";
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

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">{children}</main>
      {showWizard && (
        <OnboardingWizard onComplete={closeWizard} />
      )}
    </div>
  );
}
