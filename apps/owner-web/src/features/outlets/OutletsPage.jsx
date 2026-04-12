import { useEffect, useState } from "react";

import { fetchOutlets } from "./outlets.service";

function statusClass(status) {
  return status === "Review" ? "warning" : "online";
}

export function OutletsPage() {
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchOutlets();

      if (!cancelled) {
        setOutlets(result);
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const outletCount = outlets.length || 4;
  const deviceCount = outlets.reduce((total, outlet) => total + outlet.devicesLinked, 0) || 6;
  const reviewCount = outlets.filter((outlet) => outlet.status === "Review").length || 1;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Locations</p>
          <h2>Outlets</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn">
            Bulk Update
          </button>
          <button type="button" className="primary-btn">
            Create Outlet
          </button>
        </div>
      </header>

      <section className="hero-panel outlet-hero">
        <div>
          <p className="hero-label">Location-first setup</p>
          <h3>Configure shops before POS devices and staff go live</h3>
          <p className="hero-copy">
            Each outlet should have its own hours, services, tax defaults, receipt template, and
            linked devices so the floor team can start without technical setup.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Live outlets</span>
            <strong>{outletCount}</strong>
          </div>
          <div>
            <span>Devices linked</span>
            <strong>{deviceCount}</strong>
          </div>
          <div>
            <span>Pending setup</span>
            <strong className="negative">{reviewCount}</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Dine-in enabled</span>
          <strong>4/4</strong>
          <p>All locations accept dine-in orders</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Delivery enabled</span>
          <strong>3/4</strong>
          <p>One outlet is not yet configured for delivery</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Needs setup</span>
          <strong>1</strong>
          <p>Missing default GST and receipt template</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Average uptime</span>
          <strong>99.2%</strong>
          <p>All active outlets reporting today</p>
        </article>
      </section>

      <section className="dashboard-grid outlets-layout">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Location Directory</p>
              <h3>Outlet Overview</h3>
            </div>
            <button type="button" className="ghost-btn">
              Download list
            </button>
          </div>

          {loading ? (
            <div className="panel-empty">Loading outlets...</div>
          ) : (
            <div className="outlet-cards">
              {outlets.map((outlet) => (
                <div key={outlet.id} className="location-card">
                  <div className="location-card-head">
                    <div>
                      <strong>{outlet.name}</strong>
                      <span>
                        {outlet.city} • {outlet.code}
                      </span>
                    </div>
                    <span className={`status ${statusClass(outlet.status)}`}>{outlet.status}</span>
                  </div>

                  <div className="location-meta">
                    <span>Hours: {outlet.hours}</span>
                    <span>Services: {outlet.services.join(", ")}</span>
                    <span>Devices: {outlet.devicesLinked} linked</span>
                    <span>Default tax: {outlet.defaultTax}</span>
                  </div>

                  <div className="location-actions">
                    <button type="button" className="ghost-chip">
                      {outlet.status === "Review" ? "Complete setup" : "Edit"}
                    </button>
                    <button type="button" className="ghost-chip">
                      {outlet.status === "Review" ? "Assign GST" : "Link device"}
                    </button>
                    <button type="button" className="ghost-chip">
                      {outlet.status === "Review" ? "Link device" : "Receipt"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Create</p>
              <h3>New Outlet</h3>
            </div>
          </div>

          <form className="simple-form">
            <label>
              Outlet name
              <input type="text" defaultValue="Electronic City" />
            </label>
            <label>
              Outlet code
              <input type="text" defaultValue="BLR-05" />
            </label>
            <label>
              City
              <input type="text" defaultValue="Bengaluru" />
            </label>
            <label>
              Default GST
              <select defaultValue="GST 5%">
                <option>GST 5%</option>
                <option>GST 18%</option>
              </select>
            </label>
            <button type="button" className="primary-btn full-width">
              Save Outlet
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Default Controls</p>
              <h3>Service Modes</h3>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-card">
              <span>Dine-in</span>
              <strong>Enabled</strong>
            </div>
            <div className="mini-card">
              <span>Takeaway</span>
              <strong>Enabled</strong>
            </div>
            <div className="mini-card">
              <span>Delivery</span>
              <strong>Enabled for 3 outlets</strong>
            </div>
            <div className="mini-card">
              <span>Offline billing</span>
              <strong>Ready on all POS devices</strong>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
