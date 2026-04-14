import { useEffect, useState } from "react";

import { subscribeRestaurantState } from "../../../../../packages/shared-types/src/mockRestaurantStore.js";
import {
  addProductionWaste,
  addPurchaseStock,
  fetchInventoryData,
  issueToKitchen,
  runDiningCountCheck,
  runProductionCountCheck,
  toggleDiningItemStatus,
  toggleProductionStock
} from "./inventory.service";

function statusClass(status) {
  return ["Low Stock", "Critical", "Out of Stock"].includes(status) ? "warning" : "online";
}

export function InventoryPage() {
  const [inventoryData, setInventoryData] = useState({
    accessCards: [],
    alerts: [],
    diningItems: [],
    productionItems: [],
    wasteLog: [],
    issueLog: [],
    purchaseLog: [],
    countLog: [],
    varianceLog: [],
    dailySummary: []
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchInventoryData();

      if (!cancelled) {
        setInventoryData(result);
      }
    }

    load();

    const unsubscribe = subscribeRestaurantState(load);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const lowDiningCount = inventoryData.diningItems.filter((item) => item.status !== "Available").length;
  const productionRiskCount = inventoryData.productionItems.filter((item) => item.status !== "Healthy").length;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Stock Control • Two-Layer Inventory</p>
          <h2>Inventory</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn">
            Category Entry
          </button>
          <button type="button" className="primary-btn">
            Item Entry
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <div>
          <p className="hero-label">Inventory workflow</p>
          <h3>Split dining availability and kitchen production stock cleanly</h3>
          <p className="hero-copy">
            Sales inventory stays independent for POS and waiter ordering. Kitchen inventory is a
            separate optional module for raw materials, waste, issue, and kitchen-side control.
            Keep sales stock entry simple with category-wise or item-wise updates before shift start
            and again during service whenever needed.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Dining alerts</span>
            <strong>{lowDiningCount}</strong>
          </div>
          <div>
            <span>Production risks</span>
            <strong>{productionRiskCount}</strong>
          </div>
          <div>
            <span>Captain mobile</span>
            <strong className="positive">Live alerts</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        {inventoryData.accessCards.map((card) => (
          <article key={card.id} className="metric-card">
            <span className="metric-label">{card.title}</span>
            <strong>{card.roles}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Quick Entry Mode</span>
          <strong>Category-wise or item-wise</strong>
          <p>Cashier or manager can load stock quickly before shift opening or update it mid-shift.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Shift Timing</span>
          <strong>Opening and in-between</strong>
          <p>Designed for simple stock entry before service starts and fast correction during live billing.</p>
        </article>
      </section>

      <section className="metrics-grid">
        {inventoryData.dailySummary.map((item) => (
          <article key={item.id} className="metric-card">
            <span className="metric-label">{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.helper}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-grid reports-layout">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Dining Inventory</p>
              <h3>Sales Inventory • Cashier and Manager Access</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Item</span>
              <span>Outlet</span>
              <span>Status</span>
              <span>Qty</span>
              <span>Threshold</span>
              <span>Alert</span>
              <span>Action</span>
            </div>
            {inventoryData.diningItems.map((item) => (
              <div key={item.id} className="staff-row">
                <span>{item.name}</span>
                <span>{item.outlet}</span>
                <span className={`status ${statusClass(item.status)}`}>{item.status}</span>
                <span>{item.quantityLabel}</span>
                <span>{item.threshold} portions</span>
                <span>{item.alert}</span>
                <span>
                  <div className="topbar-actions">
                    <button type="button" className="ghost-btn" onClick={() => toggleDiningItemStatus(item.id)}>
                      {item.status === "Out of Stock" ? "Mark Available" : "Mark Out Of Stock"}
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => runDiningCountCheck(item.id)}>
                      Count Check
                    </button>
                  </div>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Kitchen Production</p>
              <h3>Kitchen Inventory • Store Incharge and Manager Access</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Raw Material</span>
              <span>Unit</span>
              <span>Status</span>
              <span>Qty</span>
              <span>Threshold</span>
              <span>Action</span>
            </div>
            {inventoryData.productionItems.map((item) => (
              <div key={item.id} className="staff-row">
                <span>{item.name}</span>
                <span>{item.unit}</span>
                <span className={`status ${statusClass(item.status)}`}>{item.status}</span>
                <span>{item.quantityLabel}</span>
                <span>{item.threshold} {item.unit}</span>
                <span>
                  <div className="topbar-actions">
                    <button type="button" className="ghost-btn" onClick={() => toggleProductionStock(item.id)}>
                      {item.status === "Healthy" ? "Mark Low Stock" : "Restock"}
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => addProductionWaste(item.id)}>
                      Waste 0.5
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => issueToKitchen(item.id)}>
                      Issue 1
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => addPurchaseStock(item.id)}>
                      Inward 5
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => runProductionCountCheck(item.id)}>
                      Count Check
                    </button>
                  </div>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Physical Count</p>
              <h3>Daily Stock Count Log</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Item</span>
              <span>Type</span>
              <span>System</span>
              <span>Counted</span>
              <span>Variance</span>
              <span>Actor</span>
              <span>Time</span>
            </div>
            {inventoryData.countLog.map((row) => (
              <div key={row.id} className="staff-row">
                <span>{row.itemName}</span>
                <span>{row.category}</span>
                <span>{row.systemQuantity}</span>
                <span>{row.countedQuantity}</span>
                <span>{row.variance}</span>
                <span>{row.actor}</span>
                <span>{row.time}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Variance Review</p>
              <h3>Missing Stock Alert Report</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Item</span>
              <span>Type</span>
              <span>Variance</span>
              <span>Severity</span>
              <span>Note</span>
              <span>Actor</span>
              <span>Time</span>
            </div>
            {inventoryData.varianceLog.map((row) => (
              <div key={row.id} className="staff-row">
                <span>{row.itemName}</span>
                <span>{row.category}</span>
                <span>{row.variance}</span>
                <span className={`status ${row.severity === "Missing" ? "warning" : "online"}`}>{row.severity}</span>
                <span>{row.note}</span>
                <span>{row.actor}</span>
                <span>{row.time}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Store To Kitchen</p>
              <h3>Production Issue Log</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Item</span>
              <span>Qty</span>
              <span>Destination</span>
              <span>Actor</span>
              <span>Time</span>
            </div>
            {inventoryData.issueLog.map((row) => (
              <div key={row.id} className="staff-row">
                <span>{row.itemName}</span>
                <span>{row.amount}</span>
                <span>{row.destination}</span>
                <span>{row.actor}</span>
                <span>{row.time}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Purchase Inward</p>
              <h3>Stock Entry Log</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Item</span>
              <span>Qty</span>
              <span>Vendor</span>
              <span>Actor</span>
              <span>Time</span>
            </div>
            {inventoryData.purchaseLog.map((row) => (
              <div key={row.id} className="staff-row">
                <span>{row.itemName}</span>
                <span>{row.amount}</span>
                <span>{row.vendor}</span>
                <span>{row.actor}</span>
                <span>{row.time}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Waste Control</p>
              <h3>Kitchen Waste Entry Log</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Item</span>
              <span>Amount</span>
              <span>Reason</span>
              <span>Actor</span>
              <span>Time</span>
            </div>
            {inventoryData.wasteLog.map((row) => (
              <div key={row.id} className="staff-row">
                <span>{row.itemName}</span>
                <span>{row.amount}</span>
                <span>{row.reason}</span>
                <span>{row.actor}</span>
                <span>{row.time}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Owner Notes</p>
              <h3>Workflow Alerts</h3>
            </div>
          </div>

          <div className="alert-list">
            {inventoryData.alerts.map((alert) => (
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
