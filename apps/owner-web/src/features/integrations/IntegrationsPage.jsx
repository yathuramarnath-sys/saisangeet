import { useEffect, useState } from "react";

import { fetchIntegrationsData } from "./integrations.service";

function statusClass(status) {
  return status === "Review" ? "warning" : "online";
}

export function IntegrationsPage() {
  const [integrationData, setIntegrationData] = useState({
    services: [],
    mapping: [],
    alerts: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchIntegrationsData();

      if (!cancelled) {
        setIntegrationData(result);
        setLoading(false);
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
          <p className="eyebrow">Owner Setup • Connected Platforms</p>
          <h2>Integrations</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn">
            Sync All
          </button>
          <button type="button" className="primary-btn">
            Add Integration
          </button>
        </div>
      </header>

      <section className="hero-panel integrations-hero">
        <div>
          <p className="hero-label">Connected operations</p>
          <h3>Keep accounting, delivery, and payment partners in one place</h3>
          <p className="hero-copy">
            Connect Zoho Books for accounting, Swiggy and Zomato for delivery sync, and payment
            partners like Paytm and PhonePe for UPI, QR, and counter settlement visibility.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Connected apps</span>
            <strong>5</strong>
          </div>
          <div>
            <span>Last sync</span>
            <strong>2 min ago</strong>
          </div>
          <div>
            <span>Needs attention</span>
            <strong className="negative">3</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Zoho Books</span>
          <strong>Connected</strong>
          <p>Sales and tax export active</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Swiggy</span>
          <strong>Connected</strong>
          <p>Live order import enabled</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Zomato</span>
          <strong>Review</strong>
          <p>1 outlet mapping still incomplete</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Payment partners</span>
          <strong>Paytm + PhonePe</strong>
          <p>UPI, QR, and settlement monitoring enabled</p>
        </article>
      </section>

      <section className="dashboard-grid integrations-layout">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Platform Cards</p>
              <h3>Connected Services</h3>
            </div>
            <button type="button" className="ghost-btn">
              Manage tokens
            </button>
          </div>

          {loading ? (
            <div className="panel-empty">Loading integrations...</div>
          ) : (
            <div className="integration-grid">
              {integrationData.services.map((service) => (
                <div key={service.id} className={`integration-card ${service.review ? "review" : ""}`}>
                  <div className="integration-card-head">
                    <strong>{service.name}</strong>
                    <span className={`status ${statusClass(service.status)}`}>{service.status}</span>
                  </div>
                  <div className="integration-meta">
                    {service.meta.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <div className="location-actions">
                    {service.actions.map((action) => (
                      <button key={action} type="button" className="ghost-chip">
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Connect</p>
              <h3>New Integration</h3>
            </div>
          </div>

          <form className="simple-form">
            <label>
              Platform
              <select defaultValue="Paytm">
                <option>Zoho Books</option>
                <option>Swiggy</option>
                <option>Zomato</option>
                <option>Paytm</option>
                <option>PhonePe</option>
              </select>
            </label>
            <label>
              Outlet
              <select defaultValue="All outlets">
                <option>All outlets</option>
                <option>Indiranagar</option>
                <option>Koramangala</option>
              </select>
            </label>
            <label>
              Sync mode
              <select defaultValue="Automatic">
                <option>Automatic</option>
                <option>Manual approval</option>
              </select>
            </label>
            <button type="button" className="primary-btn full-width">
              Connect Platform
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Outlet Mapping</p>
              <h3>Platform by Outlet</h3>
            </div>
            <button type="button" className="ghost-btn">
              Edit mapping
            </button>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Outlet</span>
              <span>Zoho Books</span>
              <span>Swiggy</span>
              <span>Zomato</span>
              <span>Payments</span>
              <span>Status</span>
            </div>
            {integrationData.mapping.map((row) => (
              <div key={row.id} className="staff-row">
                <span>{row.outlet}</span>
                <span>{row.zohoBooks}</span>
                <span>{row.swiggy}</span>
                <span>{row.zomato}</span>
                <span>{row.paymentPartners}</span>
                <span className={`status ${statusClass(row.status)}`}>{row.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Sync Rules</p>
              <h3>Defaults</h3>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-card">
              <span>Zoho sync</span>
              <strong>Daily + on demand</strong>
            </div>
            <div className="mini-card">
              <span>Swiggy orders</span>
              <strong>Auto import</strong>
            </div>
            <div className="mini-card">
              <span>Zomato menu sync</span>
              <strong>Manual review</strong>
            </div>
            <div className="mini-card">
              <span>Paytm / PhonePe</span>
              <strong>Real-time settlement status</strong>
            </div>
            <div className="mini-card">
              <span>Error alerts</span>
              <strong>Enabled</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Attention Needed</p>
              <h3>Sync Alerts</h3>
            </div>
          </div>

          <div className="alert-list">
            {integrationData.alerts.map((alert) => (
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
