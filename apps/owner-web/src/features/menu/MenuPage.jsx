import { useEffect, useState } from "react";

import { fetchMenuData } from "./menu.service";

function statusClass(status) {
  return status === "Review" ? "warning" : "online";
}

function foodPillClass(foodType) {
  return foodType === "Non-Veg" ? "pill non-veg" : "pill veg";
}

export function MenuPage() {
  const [menuData, setMenuData] = useState({ categories: [], items: [] });
  const [loading, setLoading] = useState(true);

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

    return () => {
      cancelled = true;
    };
  }, []);

  const categoryCount = menuData.categories.length || 12;
  const itemCount = menuData.items.length ? 186 : 186;
  const reviewCount = menuData.items.filter((item) => item.status === "Review").length || 6;

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
          <button type="button" className="primary-btn">
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
                  </div>

                  <p>{item.inventoryTracking.note}</p>

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

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Create</p>
              <h3>New Item</h3>
            </div>
          </div>

          <form className="simple-form">
            <label>
              Item name
              <input type="text" defaultValue="Gobi Manchurian" />
            </label>
            <label>
              Category
              <select defaultValue="Starters">
                <option>Starters</option>
                <option>Main Course</option>
              </select>
            </label>
            <label>
              AC dine-in price
              <input type="text" defaultValue="190" />
            </label>
            <label>
              AC takeaway price
              <input type="text" defaultValue="185" />
            </label>
            <label>
              AC delivery price
              <input type="text" defaultValue="205" />
            </label>
            <label>
              Non-AC dine-in price
              <input type="text" defaultValue="180" />
            </label>
            <label>
              Non-AC takeaway price
              <input type="text" defaultValue="175" />
            </label>
            <label>
              Non-AC delivery price
              <input type="text" defaultValue="195" />
            </label>
            <label>
              Self service dine-in price
              <input type="text" defaultValue="170" />
            </label>
            <label>
              Self service takeaway price
              <input type="text" defaultValue="175" />
            </label>
            <label>
              Self service delivery price
              <input type="text" defaultValue="185" />
            </label>
            <label>
              Kitchen station
              <select defaultValue="Fry station">
                <option>Fry station</option>
                <option>Grill station</option>
                <option>Main kitchen</option>
              </select>
            </label>
            <label>
              Track inventory
              <select defaultValue="Enabled">
                <option>Enabled</option>
                <option>Disabled</option>
              </select>
            </label>
            <label>
              Entry style
              <select defaultValue="Item wise">
                <option>Item wise</option>
                <option>Category wise</option>
                <option>Optional later</option>
              </select>
            </label>
            <button type="button" className="primary-btn full-width">
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
          </div>
        </article>
      </section>
    </>
  );
}
