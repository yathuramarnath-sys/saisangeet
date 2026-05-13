import { useEffect, useMemo, useState } from "react";
import {
  getStockState,
  subscribeStock,
} from "../../../../packages/shared-types/src/stockAvailability.js";

// Category → emoji mapping
const CAT_EMOJI = {
  starters:    "🥗", appetizers: "🥗", salad: "🥗",
  biryani:     "🍛", rice: "🍚", mains: "🍛",
  beverages:   "🥤", drinks: "🍹", juice: "🧃",
  desserts:    "🍮", sweets: "🍭",
  breads:      "🫓", roti: "🫓", naan: "🫓",
  soups:       "🍲",
  pizza:       "🍕",
  burgers:     "🍔", burger: "🍔",
  pasta:       "🍝",
  seafood:     "🦐", fish: "🐟",
  chicken:     "🍗",
  chinese:     "🥡",
  south:       "🫙", idli: "🫙", dosa: "🫔",
  snacks:      "🍟",
  combos:      "🎁",
  default:     "🍽",
};

function getCatEmoji(name = "") {
  const key = name.toLowerCase().replace(/\s+/g, "");
  for (const [k, v] of Object.entries(CAT_EMOJI)) {
    if (key.includes(k)) return v;
  }
  return CAT_EMOJI.default;
}

// Item name → emoji for food cards
const ITEM_EMOJI_MAP = [
  { keys: ["paneer","tikka","kebab"],  emoji: "🧆" },
  { keys: ["corn","crispy"],           emoji: "🌽" },
  { keys: ["biryani","rice"],          emoji: "🍛" },
  { keys: ["butter","naan","roti","bread"], emoji: "🫓" },
  { keys: ["soup"],                    emoji: "🍲" },
  { keys: ["chicken"],                 emoji: "🍗" },
  { keys: ["pizza"],                   emoji: "🍕" },
  { keys: ["burger"],                  emoji: "🍔" },
  { keys: ["salad"],                   emoji: "🥗" },
  { keys: ["juice","lime","soda","lemon","lemonade"], emoji: "🧃" },
  { keys: ["coffee","tea","chai"],     emoji: "☕" },
  { keys: ["lassi","shake","smoothie"],emoji: "🥛" },
  { keys: ["ice cream","dessert","gulab","halwa","kheer"], emoji: "🍮" },
  { keys: ["fish","prawn","seafood"],  emoji: "🦐" },
  { keys: ["manchurian","chinese"],    emoji: "🥡" },
  { keys: ["dosa","idli","vada"],      emoji: "🫔" },
  { keys: ["pasta","noodle"],          emoji: "🍝" },
  { keys: ["mushroom"],                emoji: "🍄" },
  { keys: ["egg"],                     emoji: "🍳" },
];

function getItemEmoji(name = "") {
  const lc = name.toLowerCase();
  for (const { keys, emoji } of ITEM_EMOJI_MAP) {
    if (keys.some(k => lc.includes(k))) return emoji;
  }
  return "🍽";
}

// Vibrant palette
const PALETTE = [
  { bg: "#FF5733", light: "#FFF0ED", grad: "linear-gradient(135deg,#FF6B4A,#FF3300)" },
  { bg: "#27AE60", light: "#E9F7EF", grad: "linear-gradient(135deg,#2ECC71,#1A8C4E)" },
  { bg: "#2980B9", light: "#EBF5FB", grad: "linear-gradient(135deg,#3498DB,#1A5F8A)" },
  { bg: "#8E44AD", light: "#F5EEF8", grad: "linear-gradient(135deg,#9B59B6,#6C3483)" },
  { bg: "#E67E22", light: "#FEF5E7", grad: "linear-gradient(135deg,#F39C12,#CA6F1E)" },
  { bg: "#C0392B", light: "#FDEDEC", grad: "linear-gradient(135deg,#E74C3C,#922B21)" },
  { bg: "#16A085", light: "#E8F8F5", grad: "linear-gradient(135deg,#1ABC9C,#0E6655)" },
  { bg: "#D35400", light: "#FDEBD0", grad: "linear-gradient(135deg,#E67E22,#9A3412)" },
];

export function MenuPanel({ categories, menuItems, activeCategory: activeCategoryProp, onAddItem, onToggleAvailability }) {
  const [search,      setSearch]      = useState("");
  const [stockState,  setStockState]  = useState(() => getStockState());

  // Keep stock state in sync with other tabs / windows
  useEffect(() => {
    const unsub = subscribeStock((s) => setStockState({ ...s }));
    return unsub;
  }, []);

  const catColors = useMemo(() => {
    const map = {};
    categories.forEach((cat, i) => { map[cat.name] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [categories]);

  const activeCategory = activeCategoryProp || categories[0]?.name;
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
  }, [menuItems, activeCategory, activeCatId, search]);

  function itemCatColor(item) {
    for (const cat of categories) {
      const id = cat.id || cat.name.toLowerCase();
      if (item.category === cat.name || item.categoryName === cat.name || item.categoryId === id)
        return catColors[cat.name] || PALETTE[0];
    }
    return PALETTE[0];
  }

  return (
    <div className="menu-panel">

      {/* ── Search bar ────────────────────────────────────────────────────── */}
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
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="menu-search-clear"
            onClick={() => setSearch("")}>✕</button>
        )}
      </div>

      {/* ── Category heading strip ────────────────────────────────────────── */}
      {!search && (
        <div className="menu-cat-banner" style={{ background: activeColor.grad }}>
          <span className="menu-cat-banner-emoji">{getCatEmoji(activeCategory)}</span>
          <div>
            <div className="menu-cat-banner-name">{activeCategory}</div>
            <div className="menu-cat-banner-count">{filtered.length} items available</div>
          </div>
        </div>
      )}
      {search && (
        <div className="menu-cat-banner search-banner">
          <span className="menu-cat-banner-emoji">🔍</span>
          <div>
            <div className="menu-cat-banner-name">Search results</div>
            <div className="menu-cat-banner-count">{filtered.length} item{filtered.length !== 1 ? "s" : ""} found</div>
          </div>
        </div>
      )}

      {/* ── 2-column food card grid ───────────────────────────────────────── */}
      <div className="menu-cards-grid">
        {filtered.length === 0 && (
          <div className="menu-empty-state">
            <div className="menu-empty-icon">🍽</div>
            <p>No items found</p>
          </div>
        )}
        {filtered.map((item) => {
          const price   = typeof item.price === "number"
            ? item.price
            : Number(String(item.price || item.basePrice || "").replace(/[^\d.]/g, "")) || 0;
          const color   = search ? PALETTE[0] : itemCatColor(item);
          const emoji   = getItemEmoji(item.name);
          const soldOut = stockState[item.id]?.available === false;

          return (
            <button
              key={item.id}
              type="button"
              className={`menu-food-card${soldOut ? " sold-out" : ""}${item.isVeg === false ? " nonveg-card" : " veg-card"}`}
              onClick={() => !soldOut && onAddItem({ ...item, price })}
              title={soldOut ? "Sold Out — tap toggle to re-enable" : undefined}
            >
              {/* Availability toggle */}
              {onToggleAvailability && (
                <button
                  type="button"
                  className={`mfc-avail-toggle${soldOut ? " off" : " on"}`}
                  title={soldOut ? "Mark available" : "Mark sold out"}
                  onClick={(e) => { e.stopPropagation(); onToggleAvailability(item.id, soldOut); }}
                >
                  {soldOut ? "✕" : "✓"}
                </button>
              )}

              {/* Emoji icon area */}
              <div className="mfc-icon-area" style={{ background: soldOut ? "#e5e7eb" : color.grad }}>
                <span className="mfc-emoji">{soldOut ? "🚫" : emoji}</span>
                {item.isVeg !== undefined && !soldOut && (
                  <span className={`mfc-veg-badge ${item.isVeg ? "veg" : "nonveg"}`}>
                    {item.isVeg ? "●" : "●"}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="mfc-info">
                <span className="mfc-name">{item.name}</span>
                {soldOut ? (
                  <div className="mfc-soldout-label">SOLD OUT</div>
                ) : (
                  <div className="mfc-bottom">
                    <span className="mfc-price" style={{ color: color.bg }}>
                      ₹{price}{item.unit ? <span className="mfc-unit">/{item.unit}</span> : null}
                    </span>
                    <span className="mfc-add-btn" style={{ background: color.bg }}>+</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
