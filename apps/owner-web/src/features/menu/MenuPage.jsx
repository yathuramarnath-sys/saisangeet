import { useEffect, useRef, useState } from "react";

import {
  subscribeRestaurantState,
  updateInventoryState,
  updateMenuControls
} from "../../../../../packages/shared-types/src/mockRestaurantStore.js";
import { createCustomMenuItem, fetchMenuData } from "./menu.service";

function statusClass(status) {
  return status === "Review" ? "warning" : "online";
}

function foodPillClass(foodType) {
  return foodType === "Non-Veg" ? "pill non-veg" : "pill veg";
}

function toggleOutlet(item, outletName) {
  return {
    ...item,
    outletAvailability: (item.outletAvailability || []).map((entry) =>
      entry.outlet === outletName ? { ...entry, enabled: !entry.enabled } : entry
    )
  };
}

export function MenuPage() {
  const [menuData, setMenuData] = useState({ categories: [], items: [], menuGroups: [], menuAssignments: [], menuAlerts: [] });
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const formRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchMenuData();

      if (!cancelled) {
        setMenuData(result);
        setLoading(false);
      }
    }

    load();

    const unsubscribe = subscribeRestaurantState(load);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const categoryCount = menuData.categories.length || 12;
  const itemCount = menuData.items.length ? 186 : 186;
  const reviewCount = menuData.items.filter((item) => item.status === "Review").length || 6;

  function updateItem(itemId, updater) {
    setMenuData((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? updater(item) : item))
    }));
  }

  async function reloadMenu() {
    const result = await fetchMenuData();
    setMenuData(result);
    setLoading(false);
  }

  async function handleSaveItem(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      setSaveError("");
      await createCustomMenuItem({
        itemName: formData.get("itemName"),
        categoryName: formData.get("categoryName"),
        acDineIn: formData.get("acDineIn"),
        acTakeaway: formData.get("acTakeaway"),
        acDelivery: formData.get("acDelivery"),
        nonAcDineIn: formData.get("nonAcDineIn"),
        nonAcTakeaway: formData.get("nonAcTakeaway"),
        nonAcDelivery: formData.get("nonAcDelivery"),
        selfDineIn: formData.get("selfDineIn"),
        selfTakeaway: formData.get("selfTakeaway"),
        selfDelivery: formData.get("selfDelivery"),
        station: formData.get("station"),
        trackInventory: formData.get("trackInventory"),
        entryStyle: formData.get("entryStyle"),
        foodType: formData.get("foodType")
      });
      await reloadMenu();
      event.currentTarget.reset();
      setSaveMessage("New menu item saved in the owner preview.");
    } catch (error) {
      setSaveError(error.message || "Unable to save the new menu item.");
    }
  }

  function toggleInventoryTracking(itemId) {
    updateInventoryState((current) => ({
      ...current,
      diningItems: current.diningItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              trackingEnabled: !item.trackingEnabled,
              alert: !item.trackingEnabled
                ? "Track sellable stock for POS and waiter ordering"
                : "Inventory tracking is disabled for this item"
            }
          : item
      )
    }));
  }

  function toggleSalesAvailability(itemId) {
    updateMenuControls((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || {}),
        salesAvailability: current[itemId]?.salesAvailability === "Sold Out" ? "Available" : "Sold Out"
      }
    }));
  }

  function toggleOutletAvailability(itemId, outletName) {
    updateMenuControls((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || {}),
        outletAvailability: {
          ...((current[itemId] && current[itemId].outletAvailability) || {}),
          [outletName]: !current[itemId]?.outletAvailability?.[outletName]
        }
      }
    }));
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Menu</p>
          <h2>Menu & Categories</h2>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn">
            Bulk Import
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Add Item
          </button>
        </div>
      </header>

      <section className="hero-panel menu-hero">
        <div>
          <p className="hero-label">Menu-first operations</p>
          <h3>Build a fast, clean menu before the POS goes live</h3>
          <p className="hero-copy">
            Owners should be able to create categories, assign taxes, define kitchen stations,
            and mark top-selling items without needing technical help.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Categories</span>
            <strong>{categoryCount}</strong>
          </div>
          <div>
            <span>Items active</span>
            <strong>{itemCount}</strong>
          </div>
          <div>
            <span>Needs review</span>
            <strong className="negative">{reviewCount}</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Pricing profiles</span>
          <strong>9</strong>
          <p>Area-wise and order-type pricing enabled</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Veg items</span>
          <strong>118</strong>
          <p>Clearly tagged for POS and receipts</p>
        </article>
        <article className="metric-card warning">
          <span className="metric-label">Missing GST</span>
          <strong>4</strong>
          <p>Assign tax profiles before billing starts</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Kitchen mapped</span>
          <strong>184</strong>
          <p>2 items still need station assignment</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Inventory tracking</span>
          <strong>Per product optional</strong>
          <p>Enable only for items the restaurant wants to track in sales inventory</p>
        </article>
      </section>

      <section className="dashboard-grid menu-layout">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Categories</p>
              <h3>Category List</h3>
            </div>
            <button type="button" className="ghost-btn">
              Add category
            </button>
          </div>

          <div className="category-stack">
            {menuData.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`category-chip ${category.active ? "active" : ""}`}
              >
                {category.name} <span>{category.count}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Item Directory</p>
              <h3>Starter Items</h3>
            </div>
            <button type="button" className="ghost-btn">
              Export menu
            </button>
          </div>

          {loading ? (
            <div className="panel-empty">Loading menu items...</div>
          ) : (
            <div className="menu-card-grid">
              {menuData.items.map((item) => (
                <div key={item.id} className={`menu-item-card ${item.review ? "review" : ""}`}>
                  <div className="menu-item-head">
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {item.station} • {item.gstLabel}
                      </span>
                    </div>
                    <span className={`status ${statusClass(item.status)}`}>{item.status}</span>
                  </div>

                  <div className="menu-item-meta">
                    <span className={foodPillClass(item.foodType)}>{item.foodType}</span>
                    {item.badges.map((badge) => (
                      <span key={badge} className="pill">
                        {badge}
                      </span>
                    ))}
                  </div>

                  <div className="mini-stack">
                    <div className="mini-card">
                      <span>Inventory tracking</span>
                      <strong>{item.inventoryTracking.enabled ? "Enabled" : "Disabled"}</strong>
                    </div>
                    <div className="mini-card">
                      <span>Entry style</span>
                      <strong>{item.inventoryTracking.mode}</strong>
                    </div>
                    <div className="mini-card">
                      <span>Sales availability</span>
                      <strong>{item.salesAvailability}</strong>
                    </div>
                  </div>

                  <p>{item.inventoryTracking.note}</p>

                  <div className="mini-stack">
                    {(item.outletAvailability || []).map((entry) => (
                      <div key={`${item.id}-${entry.outlet}`} className="mini-card">
                        <span>{entry.outlet}</span>
                        <strong>{entry.enabled ? "Enabled" : "Hidden"}</strong>
                      </div>
                    ))}
                  </div>

                  <div className={`pricing-table ${item.compact ? "compact" : ""}`}>
                    <div className="pricing-table-row pricing-table-head">
                      <span>Area</span>
                      <span>Dine-In</span>
                      <span>Takeaway</span>
                      <span>Delivery</span>
                    </div>

                    {item.pricing.map((priceRow) => (
                      <div key={priceRow.area} className="pricing-table-row">
                        <span>{priceRow.area}</span>
                        <strong>{priceRow.dineIn}</strong>
                        <strong>{priceRow.takeaway}</strong>
                        <strong>{priceRow.delivery}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="location-actions">
                    <button
                      type="button"
                      className="ghost-chip"
                      onClick={() => toggleSalesAvailability(item.id)}
                    >
                      {item.salesAvailability === "Sold Out" ? "Mark Available" : "Mark Sold Out"}
                    </button>
                    <button
                      type="button"
                      className="ghost-chip"
                      onClick={() => toggleInventoryTracking(item.id)}
                    >
                      {item.inventoryTracking.enabled ? "Track Inventory Off" : "Track Inventory On"}
                    </button>
                    {(item.outletAvailability || []).slice(0, 2).map((entry) => (
                      <button
                        key={`${item.id}-${entry.outlet}-toggle`}
                        type="button"
                        className="ghost-chip"
                        onClick={() => toggleOutletAvailability(item.id, entry.outlet)}
                      >
                        {entry.enabled ? `Hide ${entry.outlet}` : `Enable ${entry.outlet}`}
                      </button>
                    ))}
                    {item.actions.map((action) => (
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

        <article ref={formRef} className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Create</p>
              <h3>New Item</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={handleSaveItem}>
            <label>
              Item name
              <input type="text" name="itemName" defaultValue="Gobi Manchurian" required />
            </label>
            <label>
              Category
              <select name="categoryName" defaultValue="Starters">
                <option>Starters</option>
                <option>Main Course</option>
                <option>Beverages</option>
                <option>Desserts</option>
              </select>
            </label>
            <label>
              Food type
              <select name="foodType" defaultValue="Veg">
                <option>Veg</option>
                <option>Non-Veg</option>
              </select>
            </label>
            <label>
              AC dine-in price
              <input type="number" name="acDineIn" defaultValue="190" min="0" required />
            </label>
            <label>
              AC takeaway price
              <input type="number" name="acTakeaway" defaultValue="185" min="0" required />
            </label>
            <label>
              AC delivery price
              <input type="number" name="acDelivery" defaultValue="205" min="0" required />
            </label>
            <label>
              Non-AC dine-in price
              <input type="number" name="nonAcDineIn" defaultValue="180" min="0" required />
            </label>
            <label>
              Non-AC takeaway price
              <input type="number" name="nonAcTakeaway" defaultValue="175" min="0" required />
            </label>
            <label>
              Non-AC delivery price
              <input type="number" name="nonAcDelivery" defaultValue="195" min="0" required />
            </label>
            <label>
              Self service dine-in price
              <input type="number" name="selfDineIn" defaultValue="170" min="0" required />
            </label>
            <label>
              Self service takeaway price
              <input type="number" name="selfTakeaway" defaultValue="175" min="0" required />
            </label>
            <label>
              Self service delivery price
              <input type="number" name="selfDelivery" defaultValue="185" min="0" required />
            </label>
            <label>
              Kitchen station
              <select name="station" defaultValue="Fry station">
                <option>Fry station</option>
                <option>Grill station</option>
                <option>Main kitchen</option>
              </select>
            </label>
            <label>
              Track inventory
              <select name="trackInventory" defaultValue="Enabled">
                <option>Enabled</option>
                <option>Disabled</option>
              </select>
            </label>
            <label>
              Entry style
              <select name="entryStyle" defaultValue="Item wise">
                <option>Item wise</option>
                <option>Category wise</option>
                <option>Optional later</option>
              </select>
            </label>
            {saveMessage ? <p>{saveMessage}</p> : null}
            {saveError ? <p>{saveError}</p> : null}
            <button type="submit" className="primary-btn full-width">
              Save Item
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Configuration</p>
              <h3>Menu Rules</h3>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-card">
              <span>Default pricing mode</span>
              <strong>Area + order type</strong>
            </div>
            <div className="mini-card">
              <span>Pricing zones</span>
              <strong>AC, Non-AC, Self Service</strong>
            </div>
            <div className="mini-card">
              <span>Order-type pricing</span>
              <strong>Dine-In, Takeaway, Delivery</strong>
            </div>
            <div className="mini-card">
              <span>Default GST</span>
              <strong>GST 5%</strong>
            </div>
            <div className="mini-card">
              <span>Menu structure</span>
              <strong>One page, simple assignment</strong>
            </div>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Menu Assignment</p>
              <h3>Menu Groups and Service Windows</h3>
            </div>
          </div>

          <div className="staff-table">
            <div className="staff-row staff-head">
              <span>Menu</span>
              <span>Status</span>
              <span>Items</span>
              <span>Channels</span>
              <span>Notes</span>
            </div>
            {menuData.menuGroups.map((menu) => (
              <div key={menu.id} className="staff-row">
                <span>{menu.name}</span>
                <span className={`status ${statusClass(menu.status)}`}>{menu.status}</span>
                <span>{menu.itemCount}</span>
                <span>{menu.channels}</span>
                <span>{menu.note}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Outlet Mapping</p>
              <h3>Where Menus Appear</h3>
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
            {menuData.menuAssignments.map((assignment) => (
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
              <p className="eyebrow">Pending Tasks</p>
              <h3>Menu Cleanup</h3>
            </div>
          </div>

          <div className="alert-list">
            <div className="alert-item">
              <strong>4 items missing GST profile</strong>
              <span>These should be fixed before cashier billing begins</span>
            </div>
            <div className="alert-item">
              <strong>6 items missing area-wise pricing</strong>
              <span>Set AC, Non-AC, and Self Service prices before outlet launch</span>
            </div>
            <div className="alert-item">
              <strong>2 items missing kitchen station</strong>
              <span>KOT routing will fail for those items</span>
            </div>
            {menuData.menuAlerts.map((alert) => (
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
