import { useEffect, useState } from "react";

import { fetchReportsData } from "./reports.service";

function statusClass(status) {
  return ["Review", "Conditional"].includes(status) ? "warning" : "online";
}

export function ReportsPage() {
  const [reportData, setReportData] = useState({
    outletComparison: [],
    insights: [],
    closingSummary: [],
    alerts: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchReportsData();

      if (!cancelled) {
        setReportData(result);
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
          <p className="eyebrow">Analytics • Daily Closing</p>
          <h2>Reports</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn">
            Export PDF
          </button>
          <button type="button" className="primary-btn">
            Send Closing Report
          </button>
        </div>
      </header>

      <section className="hero-panel reports-hero">
        <div>
          <p className="hero-label">Owner visibility</p>
          <h3>Track performance and deliver the closing report automatically</h3>
          <p className="hero-copy">
            Monitor sales, profit, tax, expenses, staff activity, and outlet comparison, then
            trigger the end-of-day closing summary to the owner by email every night.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Today sales</span>
            <strong>Rs 2,45,000</strong>
          </div>
          <div>
            <span>Net profit</span>
            <strong>Rs 61,800</strong>
          </div>
          <div>
            <span>Owner mail</span>
            <strong className="positive">Scheduled</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Orders today</span>
          <strong>512</strong>
          <p>Across all active outlets</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">GST total</span>
          <strong>Rs 12,420</strong>
          <p>Ready for tax reporting</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Expense ratio</span>
          <strong>18%</strong>
          <p>Higher than yesterday by 3%</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Cash mismatch</span>
          <strong>Rs 1,200</strong>
          <p>1 outlet under review before final close</p>
        </article>
      </section>

      <section className="dashboard-grid reports-layout">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Daily Snapshot</p>
              <h3>Outlet Comparison</h3>
            </div>
            <button type="button" className="ghost-btn">
              Open full report
            </button>
          </div>

          {loading ? (
            <div className="panel-empty">Loading outlet comparison...</div>
          ) : (
            <div className="staff-table">
              <div className="staff-row staff-head">
                <span>Outlet</span>
                <span>Sales</span>
                <span>Profit</span>
                <span>Expenses</span>
                <span>Status</span>
              </div>
              {reportData.outletComparison.map((row) => (
                <div key={row.id} className="staff-row">
                  <span>{row.outlet}</span>
                  <span>{row.sales}</span>
                  <span>{row.profit}</span>
                  <span>{row.expenses}</span>
                  <span className={`status ${statusClass(row.status)}`}>{row.status}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Closing Email</p>
              <h3>Owner Mail Trigger</h3>
            </div>
          </div>

          <form className="simple-form">
            <label>
              Owner email
              <input type="text" defaultValue="owner@a2bkitchens.com" />
            </label>
            <label>
              Delivery time
              <select defaultValue="11:30 PM">
                <option>11:30 PM</option>
                <option>11:00 PM</option>
                <option>12:00 AM</option>
              </select>
            </label>
            <label>
              Report format
              <select defaultValue="PDF + Summary Email">
                <option>PDF + Summary Email</option>
                <option>Summary Email Only</option>
                <option>Excel Attachment</option>
              </select>
            </label>
            <label>
              Trigger condition
              <select defaultValue="Send after all outlets close">
                <option>Send after all outlets close</option>
                <option>Send at fixed time</option>
              </select>
            </label>
            <button type="button" className="primary-btn full-width">
              Save Trigger
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Core Reports</p>
              <h3>Available Views</h3>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-card">
              <span>Sales report</span>
              <strong>Live</strong>
            </div>
            <div className="mini-card">
              <span>Profit report</span>
              <strong>Live</strong>
            </div>
            <div className="mini-card">
              <span>GST report</span>
              <strong>Ready</strong>
            </div>
            <div className="mini-card">
              <span>Staff activity</span>
              <strong>Tracked</strong>
            </div>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Today’s Insights</p>
              <h3>Business Signals</h3>
            </div>
            <button type="button" className="ghost-btn">
              View trends
            </button>
          </div>

          <div className="journey-grid">
            {reportData.insights.map((insight) => (
              <div key={insight.id} className="journey-step">
                <strong>{insight.title}</strong>
                <span>{insight.description}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Closing Summary</p>
              <h3>What Goes To Owner Mail</h3>
            </div>
            <button type="button" className="ghost-btn">
              Preview email
            </button>
          </div>

          <div className="integration-grid">
            {reportData.closingSummary.map((card) => (
              <div key={card.id} className={`integration-card ${card.warning ? "review" : ""}`}>
                <div className="integration-card-head">
                  <strong>{card.title}</strong>
                  <span className={`status ${statusClass(card.status)}`}>{card.status}</span>
                </div>
                <div className="integration-meta">
                  <span>{card.meta}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Attention Needed</p>
              <h3>Report Alerts</h3>
            </div>
          </div>

          <div className="alert-list">
            {reportData.alerts.map((alert) => (
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
