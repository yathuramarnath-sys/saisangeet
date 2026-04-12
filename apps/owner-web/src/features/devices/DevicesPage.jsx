import { useEffect, useState } from "react";

import { fetchDevicesData } from "./devices.service";

function statusClass(status) {
  return status === "Review" ? "warning" : "online";
}

export function DevicesPage() {
  const [deviceData, setDeviceData] = useState({
    linkCode: null,
    devices: [],
    alerts: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchDevicesData();

      if (!cancelled) {
        setDeviceData(result);
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
          <p className="eyebrow">Owner Setup • Devices</p>
          <h2>Devices</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn">
            Refresh Status
          </button>
          <button type="button" className="primary-btn">
            Generate Link Code
          </button>
        </div>
      </header>

      <section className="hero-panel devices-hero">
        <div>
          <p className="hero-label">Simple linking</p>
          <h3>Connect POS devices without network complexity</h3>
          <p className="hero-copy">
            Generate a code, install the app, connect on the same network, and assign the device
            to an outlet. Printers, kitchen screens, and payment devices should feel easy to onboard.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Linked devices</span>
            <strong>6</strong>
          </div>
          <div>
            <span>Pending link</span>
            <strong>1</strong>
          </div>
          <div>
            <span>Setup health</span>
            <strong className="positive">92%</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">POS terminals</span>
          <strong>2</strong>
          <p>Front billing counters active</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Captain tablets</span>
          <strong>2</strong>
          <p>Floor staff order-taking devices</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Printer issues</span>
          <strong>1</strong>
          <p>Kitchen printer needs routing review</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Payment devices</span>
          <strong>2</strong>
          <p>Paytm and PhonePe linked to counters</p>
        </article>
      </section>

      <section className="dashboard-grid devices-layout">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Fast Onboarding</p>
              <h3>Link Code</h3>
            </div>
            <button type="button" className="ghost-btn">
              Generate new
            </button>
          </div>

          <div className="device-link-card">
            <div className="device-code">{deviceData.linkCode?.code || "POS24190"}</div>
            <p>Use this code on a new terminal within 15 minutes.</p>
            <div className="mini-stack">
              <div className="mini-card">
                <span>Outlet</span>
                <strong>{deviceData.linkCode?.outlet || "Indiranagar"}</strong>
              </div>
              <div className="mini-card">
                <span>Expires</span>
                <strong>{deviceData.linkCode?.expiresAt || "10:15 AM"}</strong>
              </div>
            </div>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Device Registry</p>
              <h3>Linked Devices</h3>
            </div>
            <button type="button" className="ghost-btn">
              Manage all
            </button>
          </div>

          {loading ? (
            <div className="panel-empty">Loading devices...</div>
          ) : (
            <div className="staff-table">
              <div className="staff-row staff-head">
                <span>Device</span>
                <span>Type</span>
                <span>Outlet</span>
                <span>Setup</span>
                <span>Status</span>
              </div>
              {deviceData.devices.map((device) => (
                <div key={device.id} className="staff-row">
                  <span>{device.name}</span>
                  <span>{device.type}</span>
                  <span>{device.outlet}</span>
                  <span>{device.setup}</span>
                  <span className={`status ${statusClass(device.status)}`}>{device.status}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Link</p>
              <h3>New Device</h3>
            </div>
          </div>

          <form className="simple-form">
            <label>
              Device type
              <select defaultValue="POS terminal">
                <option>POS terminal</option>
                <option>Captain tablet</option>
                <option>Kitchen screen</option>
                <option>Printer</option>
                <option>Paytm QR</option>
                <option>PhonePe device</option>
              </select>
            </label>
            <label>
              Outlet
              <select defaultValue="Indiranagar">
                <option>Indiranagar</option>
                <option>Koramangala</option>
                <option>HSR Layout</option>
              </select>
            </label>
            <label>
              Default receipt template
              <select defaultValue="Dine-In Standard">
                <option>Dine-In Standard</option>
                <option>Takeaway Standard</option>
              </select>
            </label>
            <button type="button" className="primary-btn full-width">
              Generate Code
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Setup Rules</p>
              <h3>Defaults</h3>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-card">
              <span>Setup mode</span>
              <strong>Same network first</strong>
            </div>
            <div className="mini-card">
              <span>Printer setup</span>
              <strong>Auto-detect where possible</strong>
            </div>
            <div className="mini-card">
              <span>Manual IP entry</span>
              <strong>Hidden in advanced mode</strong>
            </div>
            <div className="mini-card">
              <span>Outlet assignment</span>
              <strong>Required</strong>
            </div>
            <div className="mini-card">
              <span>Payment device setup</span>
              <strong>Outlet + cashier mapping</strong>
            </div>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Device Journey</p>
              <h3>How Linking Works</h3>
            </div>
          </div>

          <div className="journey-grid">
            <div className="journey-step">
              <strong>1. Generate code</strong>
              <span>Owner creates a link code for a specific outlet and device type.</span>
            </div>
            <div className="journey-step">
              <strong>2. Install app</strong>
              <span>Open the POS or captain app on the device and enter the code.</span>
            </div>
            <div className="journey-step">
              <strong>3. Detect devices</strong>
              <span>System finds supported printers and linked services on the same network.</span>
            </div>
            <div className="journey-step">
              <strong>4. Start work</strong>
              <span>Menu, taxes, receipt templates, outlet settings, and payment preferences sync automatically.</span>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Action Needed</p>
              <h3>Device Alerts</h3>
            </div>
          </div>

          <div className="alert-list">
            {deviceData.alerts.map((alert) => (
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
