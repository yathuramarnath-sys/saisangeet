import { useEffect, useState } from "react";

import { fetchMenusData } from "./menus.service";

function statusClass(status) {
  return status === "Review" ? "warning" : "online";
}

export function MenusPage() {
  const [menusData, setMenusData] = useState({
    menuGroups: [],
    assignments: [],
    quickSections: [],
    alerts: []
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchMenusData();

      if (!cancelled) {
        setMenusData(result);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Menus</p>
          <h2>Menus</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn">
            Duplicate Menu
          </button>
          <button type="button" className="primary-btn">
            Create Menu
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <div>
          <p className="hero-label">Square-style menu setup</p>
          <h3>Keep Item Library separate from Menus</h3>
          <p className="hero-copy">
            Build items once in Item Library, then decide which menu they belong to by outlet,
            channel, and service window without making staff handle complex setup.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Menus</span>
            <strong>{menusData.menuGroups.length || 3}</strong>
          </div>
          <div>
            <span>Assignments</span>
            <strong>{menusData.assignments.length || 3}</strong>
          </div>
          <div>
            <span>Setup style</span>
            <strong className="positive">Simple</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        {menusData.quickSections.map((section) => (
          <article key={section.id} className="metric-card">
            <span className="metric-label">{section.title}</span>
            <strong>{section.value}</strong>
            <p>{section.detail}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-grid reports-layout">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Menu Library</p>
              <h3>Menu Groups</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Menu</span>
              <span>Status</span>
              <span>Items</span>
              <span>Outlets</span>
              <span>Channels</span>
              <span>Notes</span>
            </div>
            {menusData.menuGroups.map((menu) => (
              <div key={menu.id} className="staff-row">
                <span>{menu.name}</span>
                <span className={`status ${statusClass(menu.status)}`}>{menu.status}</span>
                <span>{menu.itemCount}</span>
                <span>{menu.outletCount}</span>
                <span>{menu.channels.join(", ")}</span>
                <span>{menu.note}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Assignments</p>
              <h3>Outlet and Channel Mapping</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Menu</span>
              <span>Outlet</span>
              <span>Channels</span>
              <span>Availability</span>
              <span>Status</span>
            </div>
            {menusData.assignments.map((assignment) => (
              <div key={assignment.id} className="staff-row">
                <span>{assignment.menu}</span>
                <span>{assignment.outlet}</span>
                <span>{assignment.channels}</span>
                <span>{assignment.availability}</span>
                <span className={`status ${statusClass(assignment.status)}`}>{assignment.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Create</p>
              <h3>New Menu</h3>
            </div>
          </div>

          <form className="simple-form">
            <label>
              Menu name
              <input type="text" defaultValue="Lunch Menu" />
            </label>
            <label>
              Apply to outlet
              <select defaultValue="Indiranagar">
                <option>Indiranagar</option>
                <option>Koramangala</option>
                <option>HSR Layout</option>
              </select>
            </label>
            <label>
              Sales channel
              <select defaultValue="Dine-In + Takeaway">
                <option>Dine-In + Takeaway</option>
                <option>Delivery</option>
                <option>All Channels</option>
              </select>
            </label>
            <label>
              Service window
              <select defaultValue="All Day">
                <option>All Day</option>
                <option>Breakfast</option>
                <option>Lunch</option>
                <option>Dinner</option>
              </select>
            </label>
            <button type="button" className="primary-btn full-width">
              Save Menu
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Owner Notes</p>
              <h3>Menu Setup Alerts</h3>
            </div>
          </div>

          <div className="alert-list">
            {menusData.alerts.map((alert) => (
              <div key={alert.id} className="alert-item">
                <strong>{alert.title}</strong>
                <span>{alert.description}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
