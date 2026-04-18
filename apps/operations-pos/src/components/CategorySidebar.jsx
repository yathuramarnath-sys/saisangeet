import { useMemo } from "react";

const PALETTE = [
  "#FF5733","#27AE60","#2980B9","#8E44AD",
  "#E67E22","#C0392B","#16A085","#D35400",
  "#2C3E50","#F39C12","#1ABC9C","#E74C3C",
];

export function CategorySidebar({ categories, menuItems, activeCategory, onSelect, outletName }) {
  // Count items per category
  const counts = useMemo(() => {
    const m = {};
    categories.forEach(cat => {
      const id = cat.id || cat.name.toLowerCase();
      m[cat.name] = menuItems.filter(
        i => i.category === cat.name || i.categoryName === cat.name || i.categoryId === id
      ).length;
    });
    return m;
  }, [categories, menuItems]);

  return (
    <div className="cat-sidebar">
      {/* Brand */}
      <div className="cat-sidebar-brand">
        <div className="cat-sidebar-brand-dot">🍽</div>
        <span className="cat-sidebar-brand-name">{outletName || "Restaurant OS"}</span>
      </div>

      {/* Menu label */}
      <div className="cat-sidebar-label">MENU</div>

      {/* Category list */}
      <nav className="cat-sidebar-nav">
        {categories.map((cat, i) => {
          const color    = PALETTE[i % PALETTE.length];
          const isActive = activeCategory === cat.name;
          return (
            <button
              key={cat.name}
              type="button"
              className={`cat-sidebar-item${isActive ? " active" : ""}`}
              onClick={() => onSelect(cat.name)}
              style={{ "--cat-color": color }}
            >
              <span
                className="cat-sidebar-dot"
                style={{ background: isActive ? "#fff" : color }}
              />
              <span className="cat-sidebar-name">{cat.name}</span>
              <span
                className="cat-sidebar-count"
                style={{
                  background: isActive ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)",
                  color: isActive ? "#fff" : "rgba(255,255,255,0.5)"
                }}
              >
                {counts[cat.name] || 0}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
