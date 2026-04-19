import { useEffect, useState } from "react";

import {
  getStockState,
  isAvailable,
  resetAllToAvailable,
  setItemAvailability,
  subscribeStock,
} from "../../../../../packages/shared-types/src/stockAvailability.js";
import { fetchMenuData } from "../menu/menu.service";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatSoldOutTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function AvailToggle({ available, onChange }) {
  return (
    <button
      className={`avail-toggle${available ? " on" : " off"}`}
      onClick={() => onChange(!available)}
      title={available ? "Mark as Sold Out" : "Mark as Available"}
    >
      <span className="avail-toggle-thumb" />
      <span className="avail-toggle-label">{available ? "Available" : "Sold Out"}</span>
    </button>
  );
}

// ─── Category block ───────────────────────────────────────────────────────────

function CategoryBlock({ category, items, stockState, onToggle, search }) {
  const [open, setOpen] = useState(true);

  const soldOutCount = items.filter((i) => stockState[i.id]?.available === false).length;
  const allAvailable = soldOutCount === 0;

  function markAllAvailable() {
    items.forEach((i) => {
      if (stockState[i.id]?.available === false) onToggle(i.id, true);
    });
  }

  function markAllSoldOut() {
    items.forEach((i) => {
      if (stockState[i.id]?.available !== false) onToggle(i.id, false);
    });
  }

  if (items.length === 0) return null;

  return (
    <div className={`stock-cat-block${soldOutCount > 0 ? " has-soldout" : ""}`}>
      {/* Category header */}
      <div className="stock-cat-head" onClick={() => setOpen((o) => !o)}>
        <div className="stock-cat-head-left">
          <span className="stock-cat-chevron">{open ? "▾" : "▸"}</span>
          <span className="stock-cat-name">{category.name}</span>
          <span className="stock-cat-count">{items.length} item{items.length !== 1 ? "s" : ""}</span>
          {soldOutCount > 0 && (
            <span className="stock-soldout-badge">{soldOutCount} sold out</span>
          )}
        </div>
        <div className="stock-cat-head-actions" onClick={(e) => e.stopPropagation()}>
          {!allAvailable && (
            <button className="stock-cat-action-btn available" onClick={markAllAvailable}>
              ✓ All available
            </button>
          )}
          {allAvailable && (
            <button className="stock-cat-action-btn soldout" onClick={markAllSoldOut}>
              ✕ All sold out
            </button>
          )}
        </div>
      </div>

      {/* Item rows */}
      {open && (
        <div className="stock-item-list">
          {items.map((item) => {
            const avail   = stockState[item.id]?.available !== false;
            const soldAt  = stockState[item.id]?.soldOutAt;
            const resetDay = stockState[item.id]?.resetDay;
            const price   = item.price || item.basePrice || 0;

            return (
              <div key={item.id} className={`stock-item-row${!avail ? " soldout" : ""}`}>
                {/* Food type dot */}
                {item.isVeg !== undefined && (
                  <span className={`stock-veg-dot ${item.isVeg ? "veg" : "nonveg"}`} />
                )}

                {/* Item info */}
                <div className="stock-item-info">
                  <span className="stock-item-name">{item.name}</span>
                  <div className="stock-item-meta">
                    <span className="stock-item-price">₹{price}</span>
                    {item.stationName && (
                      <span className="stock-item-station">{item.stationName}</span>
                    )}
                    {!avail && soldAt && (
                      <span className="stock-soldout-time">
                        Marked sold out at {formatSoldOutTime(soldAt)}
                        {resetDay && <> · Auto-resets {resetDay === new Date(Date.now() + 86_400_000).toDateString() ? "tomorrow" : resetDay}</>}
                      </span>
                    )}
                  </div>
                </div>

                {/* Toggle */}
                <AvailToggle available={avail} onChange={(v) => onToggle(item.id, v)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StockAvailabilityPage() {
  const [menuData,    setMenuData]    = useState({ categories: [], items: [] });
  const [stockState,  setStockState]  = useState(() => getStockState());
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [filterMode,  setFilterMode]  = useState("all"); // all | available | soldout
  const [flash,       setFlash]       = useState(null);  // itemId that just changed

  // Load menu data
  useEffect(() => {
    fetchMenuData().then((data) => {
      setMenuData(data);
      setLoading(false);
    });
  }, []);

  // Subscribe to stock changes (cross-tab + same-tab)
  useEffect(() => {
    const unsub = subscribeStock((state) => setStockState({ ...state }));
    return unsub;
  }, []);

  function toggleItem(itemId, available) {
    setItemAvailability(itemId, available);
    setStockState(getStockState());
    // Flash the toggled item briefly
    setFlash(itemId);
    setTimeout(() => setFlash(null), 800);
  }

  function handleResetAll() {
    if (!window.confirm("Mark ALL items as Available? This will reset all sold-out items.")) return;
    resetAllToAvailable();
    setStockState({});
  }

  // Filter + search items
  const filteredItems = menuData.items.filter((item) => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    const avail = stockState[item.id]?.available !== false;
    const matchFilter =
      filterMode === "all"       ? true :
      filterMode === "available" ? avail :
      /* soldout */                !avail;
    return matchSearch && matchFilter;
  });

  // Group filtered items by category
  const categoryGroups = menuData.categories.map((cat) => ({
    ...cat,
    items: filteredItems.filter(
      (i) => i.categoryId === cat.id || i.categoryName === cat.name
    ),
  }));

  const totalSoldOut  = Object.keys(stockState).length;
  const totalItems    = menuData.items.length;

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div>
          <p className="eyebrow">Operations · Live Control</p>
          <h2>Stock Availability</h2>
        </div>
        <div className="topbar-actions">
          {totalSoldOut > 0 && (
            <button type="button" className="secondary-btn" onClick={handleResetAll}>
              Reset All to Available
            </button>
          )}
        </div>
      </header>

      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <section className="hero-panel stock-hero">
        <div>
          <p className="hero-label">Turn items off when they run out — POS, Captain App &amp; Online will block them instantly</p>
          <h3>
            {totalSoldOut === 0
              ? "All items are currently available ✓"
              : `${totalSoldOut} item${totalSoldOut !== 1 ? "s" : ""} currently sold out`}
          </h3>
        </div>
        <div className="hero-stats">
          <div>
            <span>Total items</span>
            <strong>{totalItems}</strong>
          </div>
          <div>
            <span>Available</span>
            <strong className="positive">{totalItems - totalSoldOut}</strong>
          </div>
          <div>
            <span>Sold out</span>
            <strong className={totalSoldOut > 0 ? "negative" : ""}>{totalSoldOut}</strong>
          </div>
        </div>
      </section>

      {/* ── Info banner ─────────────────────────────────────────────────── */}
      <div className="stock-info-banner">
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>
          Sold-out items are <strong>blocked in POS, Captain App &amp; Online orders</strong> — staff cannot add them.
          Items <strong>auto-reset to Available the next day</strong>, or you can turn them back on manually anytime.
        </span>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="stock-toolbar">
        <div className="stock-search-wrap">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            className="stock-search"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="stock-filter-tabs">
          {[
            { id: "all",       label: "All items" },
            { id: "available", label: "Available" },
            { id: "soldout",   label: `Sold Out${totalSoldOut > 0 ? ` (${totalSoldOut})` : ""}` },
          ].map((f) => (
            <button
              key={f.id}
              className={`stock-filter-tab${filterMode === f.id ? " active" : ""}`}
              onClick={() => setFilterMode(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Category blocks ──────────────────────────────────────────────── */}
      <div className="stock-body">
        {loading ? (
          <div className="stock-loading">Loading menu…</div>
        ) : categoryGroups.every((g) => g.items.length === 0) ? (
          <div className="stock-empty">
            <p>No items match your search or filter.</p>
          </div>
        ) : (
          categoryGroups.map((cat) => (
            <CategoryBlock
              key={cat.id}
              category={cat}
              items={cat.items}
              stockState={stockState}
              onToggle={toggleItem}
              search={search}
            />
          ))
        )}
      </div>
    </>
  );
}
