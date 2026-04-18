import { useMemo, useState } from "react";

// Square-style vibrant category palette — cycles if more than 8 categories
const PALETTE = [
  { bg: "#FF5733", light: "#FFF0ED" },
  { bg: "#27AE60", light: "#E9F7EF" },
  { bg: "#2980B9", light: "#EBF5FB" },
  { bg: "#8E44AD", light: "#F5EEF8" },
  { bg: "#E67E22", light: "#FEF5E7" },
  { bg: "#C0392B", light: "#FDEDEC" },
  { bg: "#16A085", light: "#E8F8F5" },
  { bg: "#2C3E50", light: "#EAECEE" },
];

export function MenuPanel({ categories, menuItems, onAddItem }) {
  const [activeCat, setActiveCat] = useState(null);
  const [search,    setSearch]    = useState("");

  // Assign a palette color to each category
  const catColors = useMemo(() => {
    const map = {};
    categories.forEach((cat, i) => {
      map[cat.name] = PALETTE[i % PALETTE.length];
    });
    return map;
  }, [categories]);

  const activeCategory = activeCat || categories[0]?.name;
  const activeCatId    = categories.find(c => c.name === activeCategory)?.id || activeCategory?.toLowerCase();
  const activeColor    = catColors[activeCategory] || PALETTE[0];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? menuItems.filter(i => i.name.toLowerCase().includes(q))
      : menuItems.filter(
          i => i.category    === activeCategory
            || i.categoryName === activeCategory
            || i.categoryId  === activeCatId
        );
    return base.filter(i => i.isActive !== false);
  }, [menuItems, categories, activeCategory, activeCatId, search]);

  // Count items per category (for badge)
  const catCounts = useMemo(() => {
    const m = {};
    categories.forEach(cat => {
      const id = cat.id || cat.name.toLowerCase();
      m[cat.name] = menuItems.filter(
        i => i.category === cat.name || i.categoryName === cat.name || i.categoryId === id
      ).length;
    });
    return m;
  }, [categories, menuItems]);

  // Get category color for an item
  function itemCatColor(item) {
    for (const cat of categories) {
      const id = cat.id || cat.name.toLowerCase();
      if (item.category === cat.name || item.categoryName === cat.name || item.categoryId === id) {
        return catColors[cat.name] || PALETTE[0];
      }
    }
    return PALETTE[0];
  }

  return (
    <div className="menu-panel">
      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="menu-search-wrap">
        <svg className="menu-search-icon" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="menu-search"
          type="text"
          placeholder="Search items…"
          value={search}
          onChange={e => { setSearch(e.target.value); setActiveCat(null); }}
        />
        {search && (
          <button type="button" className="menu-search-clear"
            onClick={() => setSearch("")} aria-label="Clear">✕</button>
        )}
      </div>

      {/* ── Category tabs — colorful Square-style ───────────────────────────── */}
      {!search && (
        <div className="menu-cats">
          {categories.map((cat) => {
            const color   = catColors[cat.name] || PALETTE[0];
            const isActive = activeCategory === cat.name;
            return (
              <button
                key={cat.name}
                type="button"
                className="menu-cat-chip"
                style={{
                  background:   isActive ? color.bg : color.light,
                  color:        isActive ? "#fff"   : color.bg,
                  borderColor:  isActive ? color.bg : "transparent",
                  boxShadow:    isActive ? `0 4px 14px ${color.bg}44` : "none"
                }}
                onClick={() => setActiveCat(cat.name)}
              >
                <span className="cat-chip-name">{cat.name}</span>
                <span className="cat-chip-count"
                  style={{ background: isActive ? "rgba(255,255,255,0.25)" : `${color.bg}22`, color: isActive ? "#fff" : color.bg }}>
                  {catCounts[cat.name] || 0}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Active category label ───────────────────────────────────────────── */}
      {!search && (
        <div className="menu-cat-heading"
          style={{ borderLeftColor: activeColor.bg, color: activeColor.bg }}>
          {activeCategory}
          <span className="menu-cat-count">{filtered.length} items</span>
        </div>
      )}

      {/* ── Items grid — 3 columns, colorful tiles ──────────────────────────── */}
      <div className="menu-items-grid">
        {filtered.length === 0 && (
          <p className="menu-empty">No items found</p>
        )}
        {filtered.map((item) => {
          const price = typeof item.price === "number"
            ? item.price
            : Number(String(item.price || item.basePrice || "").replace(/[^\d.]/g, "")) || 0;
          const color = search ? PALETTE[0] : itemCatColor(item);

          return (
            <button
              key={item.id}
              type="button"
              className="menu-item-btn"
              style={{ borderLeftColor: color.bg }}
              onClick={() => onAddItem({ ...item, price })}
            >
              {/* Veg / Non-veg indicator */}
              {item.isVeg !== undefined && (
                <span className={`veg-dot ${item.isVeg ? "veg" : "nonveg"}`} />
              )}
              <span className="menu-item-name">{item.name}</span>
              <span className="menu-item-price" style={{ color: color.bg }}>
                ₹{price}
              </span>
              {/* Add ripple */}
              <span className="menu-item-add-icon" style={{ background: color.light, color: color.bg }}>+</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
