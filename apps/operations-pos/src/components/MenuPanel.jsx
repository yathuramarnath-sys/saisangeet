import { useMemo, useState } from "react";

export function MenuPanel({ categories, menuItems, onAddItem }) {
  const [activeCat, setActiveCat] = useState(null);
  const [search, setSearch]       = useState("");

  const activeCategory = activeCat || categories[0]?.name;

  const filtered = useMemo(() => {
    const q          = search.trim().toLowerCase();
    const activeCatId = categories.find((c) => c.name === activeCategory)?.id || activeCategory?.toLowerCase();
    const base = q
      ? menuItems.filter((i) => i.name.toLowerCase().includes(q))
      : menuItems.filter(
          (i) =>
            i.category    === activeCategory ||
            i.categoryName === activeCategory ||
            i.categoryId  === activeCatId
        );
    return base.filter((i) => i.isActive !== false);
  }, [menuItems, categories, activeCategory, search]);

  return (
    <div className="menu-panel">
      {/* Search */}
      <div className="menu-search-wrap">
        <svg className="menu-search-icon" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="menu-search"
          type="text"
          placeholder="Search menu…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setActiveCat(null); }}
        />
        {search && (
          <button
            type="button"
            className="menu-search-clear"
            onClick={() => setSearch("")}
            aria-label="Clear search"
          >✕</button>
        )}
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="menu-cats">
          {categories.map((cat) => (
            <button
              key={cat.name}
              type="button"
              className={`menu-cat-btn${activeCategory === cat.name ? " active" : ""}`}
              onClick={() => setActiveCat(cat.name)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Items grid */}
      <div className="menu-items-grid">
        {filtered.length === 0 && (
          <p className="menu-empty">No items found</p>
        )}
        {filtered.map((item) => {
          const price = typeof item.price === "number"
            ? item.price
            : Number(String(item.price || item.basePrice || "").replace(/[^\d.]/g, "")) || 0;

          return (
            <button
              key={item.id}
              type="button"
              className="menu-item-btn"
              onClick={() => onAddItem({ ...item, price })}
            >
              {item.isVeg !== undefined && (
                <span className={`veg-dot ${item.isVeg ? "veg" : "nonveg"}`} />
              )}
              <span className="menu-item-name">{item.name}</span>
              <span className="menu-item-price">₹{price}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
