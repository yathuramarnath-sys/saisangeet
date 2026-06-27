import { useEffect, useMemo, useState } from "react";
import {
  getStockState,
  subscribeStock,
} from "../../../../packages/shared-types/src/stockAvailability.js";
import {
  getCategoryStockState,
  subscribeCategoryStock,
} from "../../../../packages/shared-types/src/categoryAvailability.js";

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

const FAVOURITES_CAT = "⭐ Favourites";

export function MenuPanel({ categories, menuItems, activeCategory: activeCategoryProp, onAddItem, onToggleAvailability, onToggleCategoryAvailability, quantities, onDecrement, stockSnapshot, onSkuLookup, onCategoryChange, favouriteItemIds = [] }) {
  const [search,      setSearch]      = useState("");
  const [stockState,  setStockState]  = useState(() => getStockState());
  const [categoryStockState, setCategoryStockState] = useState(() => getCategoryStockState());
  const [pendingDisableCat,  setPendingDisableCat]   = useState(null); // { id, name } | null
  const [customTime,         setCustomTime]          = useState("");

  // Keep stock state in sync with other tabs / windows
  useEffect(() => {
    const unsub = subscribeStock((s) => setStockState({ ...s }));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeCategoryStock((s) => setCategoryStockState({ ...s }));
    return unsub;
  }, []);

  function categoryEta(entry) {
    if (!entry?.availableAt) return "until re-enabled";
    const d = new Date(entry.availableAt);
    return `until ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  function confirmDisableCategory(minutesFromNow) {
    if (!pendingDisableCat) return;
    const availableAt = new Date(Date.now() + minutesFromNow * 60_000).toISOString();
    onToggleCategoryAvailability?.(pendingDisableCat.id, false, availableAt);
    setPendingDisableCat(null);
    setCustomTime("");
  }

  function confirmDisableCategoryCustomTime() {
    if (!pendingDisableCat || !customTime) return;
    const [h, m] = customTime.split(":").map(Number);
    const at = new Date();
    at.setHours(h, m, 0, 0);
    if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1); // time already passed today → tomorrow
    onToggleCategoryAvailability?.(pendingDisableCat.id, false, at.toISOString());
    setPendingDisableCat(null);
    setCustomTime("");
  }

  const catColors = useMemo(() => {
    const map = {};
    categories.forEach((cat, i) => { map[cat.name] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [categories]);

  const activeCategory = activeCategoryProp || categories[0]?.name;
  const activeCatId    = categories.find(c => c.name === activeCategory)?.id || activeCategory?.toLowerCase();
  const activeColor    = catColors[activeCategory] || PALETTE[0];
  const activeCatDisabledEntry = categoryStockState[activeCatId]?.available === false
    ? categoryStockState[activeCatId]
    : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      const isNumeric = /^\d+$/.test(q);
      return menuItems.filter(i =>
        (isNumeric
          ? (i.sku || "").toLowerCase().startsWith(q)
          : i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q))
        && i.isActive !== false
      );
    }
    if (activeCategory === FAVOURITES_CAT) {
      const favSet = new Set(favouriteItemIds);
      return menuItems.filter(i => favSet.has(String(i.id)) && i.isActive !== false);
    }
    return menuItems.filter(i =>
      (i.category === activeCategory || i.categoryName === activeCategory || i.categoryId === activeCatId)
      && i.isActive !== false
    );
  }, [menuItems, activeCategory, activeCatId, search, favouriteItemIds]);

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
          placeholder="Search or type item # + Enter"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && search.trim()) {
              const val = search.trim();
              // Pure number → SKU lookup, clear search
              if (/^\d+$/.test(val) && onSkuLookup) {
                onSkuLookup(val);
                setSearch("");
                e.preventDefault();
              }
            }
          }}
        />
        {search && (
          <button type="button" className="menu-search-clear"
            onClick={() => setSearch("")}>✕</button>
        )}
      </div>

      {/* ── Category chips — horizontal ──────────────────────────────────── */}
      <div className="menu-cats">
        {favouriteItemIds.length > 0 && (
          <button
            key="__fav__"
            type="button"
            className={`menu-cat-btn${activeCategory === FAVOURITES_CAT ? " active" : ""}`}
            onClick={() => onCategoryChange?.(FAVOURITES_CAT)}
          >
            ⭐ Favourites
          </button>
        )}
        {categories.map((cat) => {
          const catEntry    = categoryStockState[cat.id];
          const catDisabled = catEntry?.available === false;
          return (
            <div key={cat.name} className="menu-cat-chip-wrap">
              <button
                type="button"
                className={`menu-cat-btn${activeCategory === cat.name ? " active" : ""}${catDisabled ? " cat-disabled" : ""}`}
                onClick={() => onCategoryChange?.(cat.name)}
                title={catDisabled ? `Unavailable ${categoryEta(catEntry)}` : undefined}
              >
                {catDisabled && <span className="menu-cat-pause">⏸ </span>}{cat.name}
              </button>
              {onToggleCategoryAvailability && (
                <button
                  type="button"
                  className={`menu-cat-avail-toggle${catDisabled ? " off" : " on"}`}
                  title={catDisabled ? "Mark category available" : "Mark category unavailable"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (catDisabled) {
                      onToggleCategoryAvailability(cat.id, true, null);
                    } else {
                      setPendingDisableCat({ id: cat.id, name: cat.name });
                    }
                  }}
                >
                  {catDisabled ? "✕" : "✓"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Disable-category modal — pick next-availability time ──────────── */}
      {pendingDisableCat && (
        <div className="cat-avail-modal-backdrop" onClick={() => setPendingDisableCat(null)}>
          <div className="cat-avail-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Disable "{pendingDisableCat.name}" — when will it be available again?</h4>
            <div className="cat-avail-presets">
              <button type="button" onClick={() => confirmDisableCategory(60)}>+1 hour</button>
              <button type="button" onClick={() => confirmDisableCategory(120)}>+2 hours</button>
              <button type="button" onClick={() => confirmDisableCategory(240)}>+4 hours</button>
            </div>
            <div className="cat-avail-custom">
              <label>Or pick a time today:</label>
              <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
              <button type="button" disabled={!customTime} onClick={confirmDisableCategoryCustomTime}>Set</button>
            </div>
            <button type="button" className="cat-avail-cancel" onClick={() => setPendingDisableCat(null)}>Cancel</button>
          </div>
        </div>
      )}

      {activeCatDisabledEntry && (
        <div className="menu-cat-disabled-banner">
          🚫 "{activeCategory}" is unavailable {categoryEta(activeCatDisabledEntry)}
        </div>
      )}

      {/* ── Food card grid ───────────────────────────────────────────────── */}
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
          const soldOut     = stockState[item.id]?.available === false;
          const catEntry    = categoryStockState[item.categoryId];
          const catDisabled = catEntry?.available === false;
          const unavailable = soldOut || catDisabled;
          const qty      = (quantities && quantities[item.id]) || 0;
          const snap     = stockSnapshot?.[item.id];
          const stockOut = snap && snap.currentStock <= 0 && snap.allowNegative === false;
          const stockLow = snap && !stockOut && snap.lowStockLevel > 0 && snap.currentStock <= snap.lowStockLevel;

          return (
            /* Use <div> not <button> so inner <button> elements are valid HTML */
            <div
              key={item.id}
              className={`menu-food-card${unavailable ? " sold-out" : stockOut ? " stock-out" : ""}${item.isVeg === false ? " nonveg-card" : " veg-card"}${qty > 0 ? " in-cart" : ""}`}
              title={soldOut ? "Sold Out — tap toggle to re-enable" : catDisabled ? `Category unavailable ${categoryEta(catEntry)}` : undefined}
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
              <div className="mfc-icon-area" style={{ background: unavailable ? "#e5e7eb" : color.grad }}>
                <span className="mfc-emoji">{unavailable ? "🚫" : emoji}</span>
                {item.isVeg !== undefined && !unavailable && (
                  <span className={`mfc-veg-badge ${item.isVeg ? "veg" : "nonveg"}`}>
                    {item.isVeg ? "●" : "●"}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="mfc-info">
                {item.isVeg !== undefined && !unavailable && (
                  <span className={`mfc-veg-dot ${item.isVeg ? "veg" : "nonveg"}`} />
                )}
                <span className="mfc-name">{item.sku && <span className="mfc-sku">#{item.sku}</span>}{item.name}</span>
                {soldOut ? (
                  <div className="mfc-soldout-label">SOLD OUT</div>
                ) : catDisabled ? (
                  <div className="mfc-soldout-label">CATEGORY UNAVAILABLE</div>
                ) : stockOut ? (
                  <div className="mfc-soldout-label mfc-stockout-label">OUT OF STOCK</div>
                ) : (
                  <div className="mfc-bottom">
                    <span className="mfc-price" style={{ color: color.bg }}>
                      ₹{price}{item.unit ? <span className="mfc-unit">/{item.unit}</span> : null}
                    </span>
                    {stockLow && (
                      <span className="mfc-stock-low-badge">Low ({snap.currentStock})</span>
                    )}
                    {qty > 0 ? (
                      <div className="mfc-qty-controls" onClick={e => e.stopPropagation()}>
                        <button type="button" className="mfc-qty-btn mfc-minus"
                          style={{ background: color.bg }}
                          onClick={() => onDecrement?.({ ...item, price })}>−</button>
                        <span className="mfc-qty-val">{qty}</span>
                        <button type="button" className="mfc-qty-btn mfc-plus"
                          style={{ background: color.bg }}
                          onClick={() => onAddItem({ ...item, price })}>+</button>
                      </div>
                    ) : (
                      <button type="button" className="mfc-add-btn" style={{ background: color.bg }}
                        onClick={() => onAddItem({ ...item, price })}>+</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
