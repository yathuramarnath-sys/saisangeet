import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchOverviewData } from "./overview.service";

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

export function OverviewPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState({
    appConfig: {
      businessProfile: null,
      outlets: [],
      roles: [],
      devices: [],
      menu: { categories: [], items: [] }
    },
    reportSummary: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchOverviewData();
        if (!cancelled) {
          setOverview(result);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const { appConfig, reportSummary } = overview;
  const totalSales = reportSummary?.salesOverview?.todaySales || reportSummary?.salesToday || 0;
  const totalOrders = reportSummary?.salesOverview?.todayOrders || reportSummary?.ordersToday || 0;
  const profitTrend = reportSummary?.salesOverview?.profitTrend || "+0%";

  const controlTiles = [
    { title: "Business Info", copy: "GSTIN, address, branding, invoice header", path: "/business" },
    { title: "Outlets", copy: "Create and configure location-wise setup", path: "/outlets" },
    { title: "Items & Categories", copy: "Create menus fast and assign stations", path: "/menu" },
    { title: "Roles & Permissions", copy: "Owner, manager, cashier, captain, waiter", path: "/staff" },
    { title: "Tax Setup", copy: "GST profiles, inclusive or exclusive pricing", path: "/taxes-receipts" },
    { title: "Receipt Templates", copy: "Dine-in, takeaway, delivery formats", path: "/taxes-receipts" }
  ];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Today • Live view</p>
          <h2>Business Control Center</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate("/reports")}>
            Export Report
          </button>
          <button type="button" className="primary-btn" onClick={() => navigate("/devices")}>
            Link New POS
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <div>
          <p className="hero-label">Simple by default</p>
          <h3>Everything your owner needs before the outlet starts billing</h3>
          <p className="hero-copy">
            Create items, manage staff, control taxes, link devices, and monitor outlet performance
            from one clean dashboard.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Total Sales</span>
            <strong>{formatCurrency(totalSales)}</strong>
          </div>
          <div>
            <span>Orders Today</span>
            <strong>{totalOrders}</strong>
          </div>
          <div>
            <span>Profit Trend</span>
            <strong className="positive">{profitTrend}</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Active outlets</span>
          <strong>{appConfig.outlets.length}</strong>
          <p>Locations configured for restaurant operations</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Menu items</span>
          <strong>{appConfig.menu.items.length}</strong>
          <p>{appConfig.menu.categories.length} categories ready for service</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Staff active</span>
          <strong>{appConfig.roles.length}</strong>
          <p>Roles and staff access managed from owner console</p>
        </article>
      </section>

      {/* ── App Launcher ──────────────────────────────────────────────────── */}
      <section className="app-launcher-section">
        <div className="app-launcher-head">
          <h3>Launch Applications</h3>
          <p>Open any terminal from here. Each app runs independently.</p>
        </div>
        <div className="app-launcher-grid">
          {[
            {
              icon:  "🖥️",
              name:  "POS Terminal",
              desc:  "Billing · Orders · Shifts · Payments",
              url:   "https://pos.dinexpos.in",
              color: "#2563eb",
              bg:    "#eff6ff",
            },
            {
              icon:  "📱",
              name:  "Captain App",
              desc:  "Table orders · KOT · Guest requests",
              url:   "https://captain.dinexpos.in",
              color: "#059669",
              bg:    "#f0fdf4",
            },
            {
              icon:  "📺",
              name:  "Kitchen Display",
              desc:  "Live KOT queue · Station-wise view",
              url:   "https://kds.dinexpos.in",
              color: "#dc2626",
              bg:    "#fff1f2",
            },
            {
              icon:  "📊",
              name:  "Reports & Analytics",
              desc:  "Sales · GST · Shifts · Staff",
              path:  "/reports",
              color: "#7c3aed",
              bg:    "#f5f3ff",
            },
          ].map((app) => (
            <button
              key={app.name}
              type="button"
              className="app-launch-card"
              style={{ "--app-color": app.color, "--app-bg": app.bg }}
              onClick={() => {
                if (app.path) navigate(app.path);
                else window.open(app.url, "_blank");
              }}
            >
              <div className="alc-icon-wrap" style={{ background: app.bg, color: app.color }}>
                {app.icon}
              </div>
              <div className="alc-body">
                <div className="alc-name">{app.name}</div>
                <div className="alc-desc">{app.desc}</div>
              </div>
              <div className="alc-arrow" style={{ color: app.color }}>
                {app.url ? new URL(app.url).hostname : "Internal"} →
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-large">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Owner Setup</p>
              <h3>Master Controls</h3>
            </div>
            <button type="button" className="ghost-btn" onClick={() => navigate("/business")}>
              View all
            </button>
          </div>

          <div className="control-grid">
            {controlTiles.map((tile) => (
              <button key={tile.title} type="button" className="control-tile" onClick={() => navigate(tile.path)}>
                <strong>{tile.title}</strong>
                <span>{tile.copy}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Devices</p>
              <h3>POS Linking</h3>
            </div>
            <button type="button" className="ghost-btn" onClick={() => navigate("/devices")}>
              Generate code
            </button>
          </div>

          <div className="device-card">
            <div className="device-code">{appConfig.devices[0]?.linkCode || "No code yet"}</div>
            <p>Use the Devices screen to create outlet-linked POS access codes.</p>
          </div>

          <ul className="plain-list">
            {appConfig.devices.slice(0, 3).map((device) => (
              <li key={device.id}>
                {device.deviceName} <span className={`status ${device.status === "active" ? "online" : "pending"}`}>{device.status}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Outlet Performance</p>
              <h3>Sales Snapshot</h3>
            </div>
            <button type="button" className="ghost-btn" onClick={() => navigate("/reports")}>
              Open report
            </button>
          </div>

          <div className="outlet-table">
            <div className="outlet-row outlet-head">
              <span>Outlet</span>
              <span>City</span>
              <span>Devices</span>
              <span>Default Tax</span>
              <span>Status</span>
            </div>
            {appConfig.outlets.map((outlet) => (
              <div key={outlet.id} className="outlet-row">
                <span>{outlet.name}</span>
                <span>{outlet.city}</span>
                <span>{appConfig.devices.filter((device) => device.outletName === outlet.name).length}</span>
                <span>{outlet.defaultTaxProfileId || "Pending"}</span>
                <span className={`status ${outlet.isActive ? "online" : "warning"}`}>{outlet.isActive ? "Healthy" : "Inactive"}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Staff Access</p>
              <h3>Role Summary</h3>
            </div>
            <button type="button" className="ghost-btn" onClick={() => navigate("/staff")}>
              Manage roles
            </button>
          </div>

          <ul className="plain-list compact">
            {appConfig.roles.map((role) => (
              <li key={role.id}>
                {role.name} <span>{role.description || `${role.permissions?.length || 0} permissions`}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Setup Progress</p>
              <h3>Readiness</h3>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-card">
              <span>Business profile</span>
              <strong>{appConfig.businessProfile?.tradeName ? "Ready" : "Pending"}</strong>
            </div>
            <div className="mini-card">
              <span>Outlets</span>
              <strong>{appConfig.outlets.length > 0 ? "Ready" : "Pending"}</strong>
            </div>
            <div className="mini-card">
              <span>Menu</span>
              <strong>{appConfig.menu.items.length > 0 ? "Ready" : "Pending"}</strong>
            </div>
            <div className="mini-card">
              <span>Roles & users</span>
              <strong>{appConfig.roles.length > 0 ? "Ready" : "Pending"}</strong>
            </div>
          </div>
        </article>
      </section>

      {loading ? <section className="panel"><p>Loading overview...</p></section> : null}
    </>
  );
}
