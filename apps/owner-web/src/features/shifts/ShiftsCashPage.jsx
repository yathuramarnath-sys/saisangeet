import { useEffect, useState } from "react";

import { fetchShiftData, recordCashMismatchResolution, subscribeShiftData } from "./shifts.service";

function statusClass(status) {
  return ["Mismatch", "Manager check"].includes(status) ? "warning" : "online";
}

export function ShiftsCashPage() {
  const [shiftData, setShiftData] = useState({
    shifts: [],
    movements: [],
    alerts: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchShiftData();

      if (!cancelled) {
        setShiftData(result);
        setLoading(false);
      }
    }

    load();

    const unsubscribe = subscribeShiftData((nextData) => {
      if (!cancelled) {
        setShiftData(nextData);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function handleMismatchReview() {
    await recordCashMismatchResolution();
    const nextData = await fetchShiftData();
    setShiftData(nextData);
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Operations • Cashier Control</p>
          <h2>Shifts & Cash Control</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn">
            Export Shift Report
          </button>
          <button type="button" className="primary-btn">
            Open New Shift
          </button>
        </div>
      </header>

      <section className="hero-panel shifts-hero">
        <div>
          <p className="hero-label">Cash accountability</p>
          <h3>Track every cashier shift from opening cash to final close</h3>
          <p className="hero-copy">
            Owners and managers should be able to see opening balance, cash in, cash out,
            expected closing cash, actual cash counted, and mismatch for every cashier shift.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Open shifts</span>
            <strong>4</strong>
          </div>
          <div>
            <span>Cash mismatch</span>
            <strong className="negative">Rs 1,200</strong>
          </div>
          <div>
            <span>Review needed</span>
            <strong>1 shift</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Opening cash today</span>
          <strong>Rs 28,000</strong>
          <p>Total opening balance across all outlets</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Cash in entries</span>
          <strong>7</strong>
          <p>Petty additions and drawer top-ups</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Cash out entries</span>
          <strong>5</strong>
          <p>Expenses and controlled withdrawals</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Closed cleanly</span>
          <strong>3/4</strong>
          <p>One shift still has mismatch pending</p>
        </article>
      </section>

      <section className="dashboard-grid shifts-layout">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Open</p>
              <h3>Start Shift</h3>
            </div>
          </div>

          <form className="simple-form">
            <label>
              Cashier
              <select defaultValue="Arjun">
                <option>Arjun</option>
                <option>Karthik</option>
              </select>
            </label>
            <label>
              Outlet
              <select defaultValue="Koramangala">
                <option>Koramangala</option>
                <option>Indiranagar</option>
              </select>
            </label>
            <label>
              Opening cash
              <input type="text" defaultValue="5000" />
            </label>
            <label>
              Shift note
              <input type="text" defaultValue="Lunch shift" />
            </label>
            <button type="button" className="primary-btn full-width">
              Open Shift
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Shift Register</p>
              <h3>Cashier-wise Shift Status</h3>
            </div>
            <button type="button" className="ghost-btn">
              View all shifts
            </button>
          </div>

          {loading ? (
            <div className="panel-empty">Loading shifts...</div>
          ) : (
            <div className="staff-table">
              <div className="staff-row staff-head">
                <span>Cashier</span>
                <span>Outlet</span>
                <span>Opening Cash</span>
                <span>Expected Close</span>
                <span>Status</span>
              </div>
              {shiftData.shifts.map((shift) => (
                <div key={shift.id} className="staff-row">
                  <span>{shift.cashier}</span>
                  <span>{shift.outlet}</span>
                  <span>{shift.openingCash}</span>
                  <span>{shift.expectedClose}</span>
                  <span className={`status ${statusClass(shift.status)}`}>{shift.status}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Cash Entry</p>
              <h3>Cash In / Out</h3>
            </div>
          </div>

          <form className="simple-form">
            <label>
              Entry type
              <select defaultValue="Cash In">
                <option>Cash In</option>
                <option>Cash Out</option>
              </select>
            </label>
            <label>
              Cashier
              <select defaultValue="Arjun">
                <option>Arjun</option>
                <option>Priya</option>
              </select>
            </label>
            <label>
              Amount
              <input type="text" defaultValue="500" />
            </label>
            <label>
              Reason
              <input type="text" defaultValue="Change refill" />
            </label>
            <button type="button" className="primary-btn full-width">
              Save Entry
            </button>
          </form>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Cash Movement</p>
              <h3>Recent Cash In / Out</h3>
            </div>
            <button type="button" className="ghost-btn">
              Open ledger
            </button>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Cashier</span>
              <span>Type</span>
              <span>Amount</span>
              <span>Reason</span>
              <span>Status</span>
            </div>
            {shiftData.movements.map((movement) => (
              <div key={movement.id} className="staff-row">
                <span>{movement.cashier}</span>
                <span>{movement.type}</span>
                <span>{movement.amount}</span>
                <span>{movement.reason}</span>
                <span className={`status ${statusClass(movement.status)}`}>{movement.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Shift Closing</p>
              <h3>Close Shift</h3>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-card">
              <span>Expected cash</span>
              <strong>Rs 26,300</strong>
            </div>
            <div className="mini-card">
              <span>Actual cash counted</span>
              <strong>Rs 25,100</strong>
            </div>
            <div className="mini-card">
              <span>Mismatch</span>
              <strong className="negative">Rs 1,200 short</strong>
            </div>
            <div className="mini-card">
              <span>Manager approval</span>
              <strong>Required</strong>
            </div>
            <button type="button" className="secondary-btn full-width" onClick={handleMismatchReview}>
              Mark Mismatch Under Review
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Attention Needed</p>
              <h3>Cash Alerts</h3>
            </div>
          </div>

          <div className="alert-list">
            {shiftData.alerts.map((alert) => (
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
