import { useEffect, useState } from "react";

import { fetchDiscountData } from "./discounts.service";

function statusClass(status) {
  return ["Review", "Sensitive", "Escalated"].includes(status) ? "warning" : "online";
}

export function DiscountRulesPage() {
  const [discountData, setDiscountData] = useState({
    rules: [],
    approvalPolicy: [],
    activity: [],
    alerts: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchDiscountData();

      if (!cancelled) {
        setDiscountData(result);
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
          <p className="eyebrow">Owner Setup • Pricing Controls</p>
          <h2>Discount Rules</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn">
            Export Rules
          </button>
          <button type="button" className="primary-btn">
            Create Rule
          </button>
        </div>
      </header>

      <section className="hero-panel discounts-hero">
        <div>
          <p className="hero-label">Controlled flexibility</p>
          <h3>Allow discounts without losing profit control</h3>
          <p className="hero-copy">
            Create reusable discount policies by outlet, item, role, and time window. Keep fraud
            under control with approval limits, override tracking, and discount misuse alerts.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Active rules</span>
            <strong>8</strong>
          </div>
          <div>
            <span>Manager approval</span>
            <strong>Required</strong>
          </div>
          <div>
            <span>Flagged today</span>
            <strong className="negative">3</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Order-level rules</span>
          <strong>5</strong>
          <p>Applied on complete bill totals</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Item-level rules</span>
          <strong>3</strong>
          <p>Applied to selected menu items</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Overrides today</span>
          <strong>2</strong>
          <p>Manager reviewed both discount exceptions</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Cashier max discount</span>
          <strong>5%</strong>
          <p>Anything above requires approval</p>
        </article>
      </section>

      <section className="dashboard-grid discounts-layout">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Rule Library</p>
              <h3>Active Discount Policies</h3>
            </div>
            <button type="button" className="ghost-btn">
              Bulk update
            </button>
          </div>

          {loading ? (
            <div className="panel-empty">Loading discount rules...</div>
          ) : (
            <div className="integration-grid">
              {discountData.rules.map((rule) => (
                <div key={rule.id} className={`integration-card ${rule.review ? "review" : ""}`}>
                  <div className="integration-card-head">
                    <strong>{rule.name}</strong>
                    <span className={`status ${statusClass(rule.status)}`}>{rule.status}</span>
                  </div>
                  <div className="integration-meta">
                    {rule.meta.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <div className="location-actions">
                    {rule.actions.map((action) => (
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
              <p className="eyebrow">Quick Create</p>
              <h3>New Rule</h3>
            </div>
          </div>

          <form className="simple-form">
            <label>
              Rule name
              <input type="text" defaultValue="Weekend Family Offer" />
            </label>
            <label>
              Discount type
              <select defaultValue="Percentage">
                <option>Percentage</option>
                <option>Flat Amount</option>
              </select>
            </label>
            <label>
              Scope
              <select defaultValue="Order">
                <option>Order</option>
                <option>Item</option>
              </select>
            </label>
            <label>
              Value
              <input type="text" defaultValue="10" />
            </label>
            <button type="button" className="primary-btn full-width">
              Save Rule
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Approval Policy</p>
              <h3>Role-wise Discount Limits</h3>
            </div>
            <button type="button" className="ghost-btn">
              Edit policy
            </button>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Role</span>
              <span>Manual Discount</span>
              <span>Order Void</span>
              <span>Bill Delete</span>
              <span>Status</span>
            </div>
            {discountData.approvalPolicy.map((row) => (
              <div key={row.id} className="staff-row">
                <span>{row.role}</span>
                <span>{row.manualDiscount}</span>
                <span>{row.orderVoid}</span>
                <span>{row.billDelete}</span>
                <span className={`status ${statusClass(row.status)}`}>{row.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Rule Defaults</p>
              <h3>Guardrails</h3>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-card">
              <span>Cashier limit</span>
              <strong>5%</strong>
            </div>
            <div className="mini-card">
              <span>Manager limit</span>
              <strong>15%</strong>
            </div>
            <div className="mini-card">
              <span>Reason required</span>
              <strong>Yes</strong>
            </div>
            <div className="mini-card">
              <span>Audit log</span>
              <strong>Always on</strong>
            </div>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Discount Activity</p>
              <h3>Recent Overrides and Usage</h3>
            </div>
            <button type="button" className="ghost-btn">
              Open audit log
            </button>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Time</span>
              <span>User</span>
              <span>Action</span>
              <span>Amount</span>
              <span>Status</span>
            </div>
            {discountData.activity.map((item) => (
              <div key={item.id} className="staff-row">
                <span>{item.time}</span>
                <span>{item.user}</span>
                <span>{item.action}</span>
                <span>{item.amount}</span>
                <span className={`status ${statusClass(item.status)}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Attention Needed</p>
              <h3>Discount Alerts</h3>
            </div>
          </div>

          <div className="alert-list">
            {discountData.alerts.map((alert) => (
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
