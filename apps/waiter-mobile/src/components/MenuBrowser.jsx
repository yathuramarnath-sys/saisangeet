import { useState } from "react";
import { tapImpact } from "../lib/haptics";

function parsePriceNumber(v) {
  if (typeof v === "number") return v;
  return Number(String(v || "").replace(/[^\d.]/g, "")) || 0;
}

export function MenuBrowser({ order, categories, menuItems, stockState = {}, onUpdateOrder, onBack }) {
  const [activeCat, setActiveCat] = useState(categories[0]?.id || categories[0]?.name || "");
  const [search,    setSearch]    = useState("");

  const displayItems = search.trim()
    ? menuItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : menuItems.filter(i => {
        const cat = i.categoryId || i.category || i.categoryName || "";
        return (cat === activeCat || cat.toLowerCase() === activeCat.toLowerCase()) && i.isActive !== false;
      });

  function addItem(item) {
    tapImpact();
    const items = [...(order.items || [])];
    const idx   = items.findIndex(i => i.menuItemId === item.id && !i.sentToKot);
    if (idx >= 0) {
      items[idx] = { ...items[idx], quantity: items[idx].quantity + 1 };
    } else {
      items.push({
        id:         `item-${Date.now()}-${Math.random().toString(16).slice(2, 5)}`,
        menuItemId: item.id,
        name:       item.name,
        price:      parsePriceNumber(item.price || item.basePrice),
        quantity:   1,
        sentToKot:  false,
        note:       "",
        station:    item.station || "",
      });
    }
    onUpdateOrder({ ...order, items });
  }

  function removeItem(menuItemId) {
    tapImpact();
    const items = [...(order.items || [])];
    const idx   = items.findIndex(i => i.menuItemId === menuItemId && !i.sentToKot);
    if (idx < 0) return;
    if ((items[idx].quantity || 1) <= 1) items.splice(idx, 1);
    else items[idx] = { ...items[idx], quantity: items[idx].quantity - 1 };
    onUpdateOrder({ ...order, items });
  }

  const unsentCount = (order.items || []).filter(i => !i.sentToKot).length;
  const cartTotal   = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div className="menu-page">
      {/* Header */}
      <div className="menu-header">
        <button className="icon-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 className="menu-title">Add Items</h2>
      </div>

      {/* Search */}
      <div className="menu-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          placeholder="Search menu…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch("")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* Category chips */}
      {!search && (
        <div className="cat-chips">
          {categories.map(c => (
            <button
              key={c.id || c.name}
              className={`cat-chip${activeCat === (c.id || c.name) ? " cat-chip-active" : ""}`}
              onClick={() => { setActiveCat(c.id || c.name); tapImpact(); }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Items list */}
      <div className="menu-items">
        {displayItems.length === 0 && (
          <div className="menu-empty">
            <p>No items found</p>
          </div>
        )}
        {displayItems.map(item => {
          const price   = parsePriceNumber(item.price || item.basePrice);
          const soldOut = stockState[item.id]?.available === false;
          const cartItem = (order.items || []).find(i => i.menuItemId === item.id && !i.sentToKot);
          const cartQty  = cartItem ? cartItem.quantity : 0;

          return (
            <div key={item.id} className={`menu-item${soldOut ? " menu-item-soldout" : ""}`}>
              <div className="menu-item-left">
                {item.isVeg !== undefined && (
                  <span className={`veg-dot${item.isVeg ? " veg" : " nonveg"}`} />
                )}
                <div className="menu-item-info">
                  <span className="menu-item-name">{item.name}{item.unit ? <span className="menu-item-unit">/{item.unit}</span> : null}</span>
                  {soldOut && <span className="soldout-tag">Sold out</span>}
                </div>
              </div>
              <div className="menu-item-right">
                <span className="menu-item-price">₹{price}</span>
                {!soldOut && (
                  cartQty > 0 ? (
                    <div className="menu-qty-ctrl">
                      <button className="qty-btn" onClick={() => removeItem(item.id)}>−</button>
                      <span className="qty-num">{cartQty}</span>
                      <button className="qty-btn qty-btn-add" onClick={() => addItem(item)}>+</button>
                    </div>
                  ) : (
                    <button className="menu-add-btn" onClick={() => addItem(item)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating cart bar */}
      {(order.items?.length > 0) && (
        <div className="cart-bar">
          <button className="cart-bar-btn" onClick={onBack}>
            <span className="cart-bar-left">
              <span className="cart-count-badge">{order.items.length}</span>
              <span>
                {unsentCount > 0
                  ? `${unsentCount} unsent item${unsentCount > 1 ? "s" : ""}`
                  : `${order.items.length} item${order.items.length > 1 ? "s" : ""}`}
              </span>
            </span>
            <span className="cart-bar-right">
              <span>₹{Math.round(cartTotal * 1.05)}</span>
              <span className="cart-view-chip">View Order →</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
