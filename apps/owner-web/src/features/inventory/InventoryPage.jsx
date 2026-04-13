import { useEffect, useState } from "react";

import { subscribeRestaurantState } from "../../../../../packages/shared-types/src/mockRestaurantStore.js";
import { addProductionWaste, fetchInventoryData, toggleDiningItemStatus, toggleProductionStock } from "./inventory.service";

function statusClass(status) {
  return ["Low Stock", "Critical", "Out of Stock"].includes(status) ? "warning" : "online";
}

export function InventoryPage() {
  const [inventoryData, setInventoryData] = useState({
    accessCards: [],
    alerts: [],
    diningItems: [],
    productionItems: [],
    wasteLog: []
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
            Export Stock
          </button>
          <button type="button" className="primary-btn">
            Add Stock Entry
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <div>
          <p className="hero-label">Inventory workflow</p>
          <h3>Split dining availability and kitchen production stock cleanly</h3>
          <p className="hero-copy">
            Cashiers and managers can control saleable dining items, while store incharge and
            managers track only production stock used by the kitchen.
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

      <section className="dashboard-grid reports-layout">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Dining Inventory</p>
              <h3>Cashier and Manager Access</h3>
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
                  <button type="button" className="ghost-btn" onClick={() => toggleDiningItemStatus(item.id)}>
                    {item.status === "Out of Stock" ? "Mark Available" : "Mark Out Of Stock"}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Kitchen Production</p>
              <h3>Store Incharge and Manager Access</h3>
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
                  </div>
                </span>
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
