import { useMemo } from "react";

const PALETTE = [
  { bg: "#FF5733", grad: "linear-gradient(135deg,#FF6B4A,#FF3300)" },
  { bg: "#27AE60", grad: "linear-gradient(135deg,#2ECC71,#1A8C4E)" },
  { bg: "#2980B9", grad: "linear-gradient(135deg,#3498DB,#1A5F8A)" },
  { bg: "#8E44AD", grad: "linear-gradient(135deg,#9B59B6,#6C3483)" },
  { bg: "#E67E22", grad: "linear-gradient(135deg,#F39C12,#CA6F1E)" },
  { bg: "#C0392B", grad: "linear-gradient(135deg,#E74C3C,#922B21)" },
  { bg: "#16A085", grad: "linear-gradient(135deg,#1ABC9C,#0E6655)" },
  { bg: "#D35400", grad: "linear-gradient(135deg,#E67E22,#9A3412)" },
  { bg: "#2C3E50", grad: "linear-gradient(135deg,#34495E,#1A252F)" },
  { bg: "#F39C12", grad: "linear-gradient(135deg,#F1C40F,#D68910)" },
];

const CAT_EMOJI = {
  starters: "🥗", appetizers: "🥗", salad: "🥗",
  biryani: "🍛",  rice: "🍚",       mains: "🍛",
  beverages: "🥤",drinks: "🍹",     juice: "🧃",
  desserts: "🍮", sweets: "🍭",
  breads: "🫓",   roti: "🫓",       naan: "🫓",
  soups: "🍲",    pizza: "🍕",
  burgers: "🍔",  burger: "🍔",
  pasta: "🍝",    seafood: "🦐",
  chicken: "🍗",  chinese: "🥡",
  south: "🫙",    snacks: "🍟",
  combos: "🎁",
};

function getCatEmoji(name = "") {
  const key = name.toLowerCase().replace(/\s+/g, "");
  for (const [k, v] of Object.entries(CAT_EMOJI)) {
    if (key.includes(k)) return v;
  }
  return "🍽";
}

export function CategorySidebar({ categories, menuItems, activeCategory, onSelect, outletName }) {
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
        <div className="cat-sidebar-brand-icon">🍽</div>
        <div className="cat-sidebar-brand-text">
          <span className="cat-sidebar-brand-name">{outletName || "Restaurant OS"}</span>
          <span className="cat-sidebar-brand-sub">POS Terminal</span>
        </div>
      </div>

      {/* Label */}
      <div className="cat-sidebar-label">CATEGORIES</div>

      {/* List */}
      <nav className="cat-sidebar-nav">
        {categories.map((cat, i) => {
          const pal      = PALETTE[i % PALETTE.length];
          const isActive = activeCategory === cat.name;
          const emoji    = getCatEmoji(cat.name);

          return (
            <button
              key={cat.name}
              type="button"
              className={`cat-sidebar-item${isActive ? " active" : ""}`}
              onClick={() => onSelect(cat.name)}
              style={{ "--cat-color": pal.bg, "--cat-grad": pal.grad }}
            >
              {/* Emoji icon box */}
              <div className={`cat-sidebar-icon-box${isActive ? " active" : ""}`}
                style={{ background: isActive ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.07)" }}>
                {emoji}
              </div>
              <span className="cat-sidebar-name">{cat.name}</span>
              <span className="cat-sidebar-count"
                style={{
                  background: isActive ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.07)",
                  color: isActive ? "#fff" : "rgba(255,255,255,0.45)"
                }}>
                {counts[cat.name] || 0}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
