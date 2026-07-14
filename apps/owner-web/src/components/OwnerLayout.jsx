import { useState, useEffect, useRef } from "react";
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

function useNotifications() {
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    Promise.allSettled([
      api.get("/shifts/summary").catch(() => null),
      api.get("/outlets").catch(() => null),
    ]).then(([shiftsResult, outletsResult]) => {
      const items = [];

      const shiftsData = shiftsResult.status === "fulfilled" ? shiftsResult.value : null;
      if (shiftsData?.mismatches > 0) {
        items.push({
          id: "shift-mismatch",
          icon: "warning",
          color: "#d97706",
          title: `${shiftsData.mismatches} cash shift mismatch${shiftsData.mismatches > 1 ? "es" : ""} found`,
          sub: "Review Shifts & Cash Control for details.",
          time: "Today",
        });
      }

      const outlets = outletsResult.status === "fulfilled" && Array.isArray(outletsResult.value)
        ? outletsResult.value : [];
      const incomplete = outlets.filter(o => !o.isActive);
      if (incomplete.length > 0) {
        items.push({
          id: "outlet-setup",
          icon: "store",
          color: "#6366f1",
          title: `${incomplete.length} outlet${incomplete.length > 1 ? "s" : ""} need${incomplete.length === 1 ? "s" : ""} setup`,
          sub: "Complete outlet configuration to go live.",
          time: "Action needed",
        });
      }

      setNotifs(items);
    });
  }, []);

  return notifs;
}

export function OwnerLayout({ children }) {
  const [showWizard, closeWizard] = useShowOnboarding();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [read, setRead] = useState(false);
  const notifRef = useRef(null);
  const location = useLocation();
  const notifs = useNotifications();

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  const unread = !read && notifs.length > 0;

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

            {/* Notifications */}
            <div className="notif-wrap" ref={notifRef}>
              <button
                className="oc-icon-btn notif-bell-btn"
                aria-label="Notifications"
                title="Notifications"
                onClick={() => { setNotifOpen(v => !v); setRead(true); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unread && <span className="notif-badge">{notifs.length}</span>}
              </button>

              {notifOpen && (
                <div className="notif-panel">
                  <div className="notif-panel-head">
                    <span className="notif-panel-title">Notifications</span>
                    {notifs.length > 0 && (
                      <button className="notif-mark-read" onClick={() => setRead(true)}>
                        Mark all read
                      </button>
                    )}
                  </div>

                  {notifs.length === 0 ? (
                    <div className="notif-empty">
                      <span className="material-symbols-rounded" style={{ fontSize: 32, color: "#d1d5db" }}>
                        notifications_none
                      </span>
                      <p>You're all caught up!</p>
                    </div>
                  ) : (
                    <div className="notif-list">
                      {notifs.map(n => (
                        <div key={n.id} className="notif-item">
                          <div className="notif-icon-wrap" style={{ background: n.color + "18" }}>
                            <span className="material-symbols-rounded" style={{ fontSize: 16, color: n.color }}>
                              {n.icon}
                            </span>
                          </div>
                          <div className="notif-body">
                            <div className="notif-title">{n.title}</div>
                            <div className="notif-sub">{n.sub}</div>
                          </div>
                          <div className="notif-time">{n.time}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
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
