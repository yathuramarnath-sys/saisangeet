import { useState, useEffect } from "react";
import { tapImpact } from "../lib/haptics";
import { api } from "../lib/api";

const FAVORITES_CHIP_ID = "__favorites__";

function parsePriceNumber(v) {
  if (typeof v === "number") return v;
  return Number(String(v || "").replace(/[^\d.]/g, "")) || 0;
}

// Plain closure (not a hook) — toggles `callback` on a long press, cancels on
// early release so a normal tap/click still passes through untouched.
function makeLongPress(callback, ms = 550) {
  let timer = null;
  return {
    onPointerDown: () => { timer = setTimeout(callback, ms); },
    onPointerUp:   () => clearTimeout(timer),
    onPointerLeave:() => clearTimeout(timer),
    onPointerCancel:() => clearTimeout(timer),
  };
}

export function MenuBrowser({ order, categories, menuItems, stockState = {}, categoryStockState = {}, outletId, socket, onUpdateOrder, onItemAdded, onItemRemoved, onBack, tableLabel, guests = 0, onUpdateGuests }) {
  const [guestVal, setGuestVal] = useState(guests);
  // Restrict the menu to the table's area, mirroring the POS work-area filter:
  // a category only shows here if it's explicitly tagged for this area (categories with
  // no area tag are reserved for full-access terminals/screens); an item with no area tag
  // of its own simply inherits its category's visibility. Counter orders with no area
  // (order.areaName empty) see everything, same as a "Full Access" POS terminal.
  const workArea = order?.areaName || "";
  function categoryVisibleInWorkArea(category) {
    if (!workArea) return true;
    const avail = category.areaAvailability || [];
    if (avail.length === 0) return true;
    return avail.some((a) => a.area === workArea && a.enabled !== false);
  }
  function itemVisibleInWorkArea(item) {
    if (!workArea) return true;
    const avail = item.areaAvailability || [];
    if (avail.length === 0) return true;
    return avail.some((a) => a.area === workArea && a.enabled !== false);
  }
  const visibleCategories = workArea ? categories.filter(categoryVisibleInWorkArea) : categories;
  const visibleCatIds     = new Set(visibleCategories.map((c) => c.id));
  // Items explicitly hidden from the Captain app (exposeInCaptain: false) never show here.
  const captainMenuItems = menuItems.filter((item) =>
    item.exposeInCaptain !== false &&
    itemVisibleInWorkArea(item) &&
    (!workArea || !item.categoryId || visibleCatIds.has(item.categoryId))
  );

  const [activeCat, setActiveCat] = useState(visibleCategories[0]?.id || visibleCategories[0]?.name || "");
  const [search,    setSearch]    = useState("");

  // Captain-only Favourites (manually curated, shared across the outlet's devices)
  // and category chip order (captain-only display preference — never touches
  // POS/customer-web category order). Both live server-side per outlet and sync
  // live over the socket, same pattern as item:availability.
  const [favoriteIds,   setFavoriteIds]   = useState([]);
  const [categoryOrder, setCategoryOrder] = useState([]);
  const [reorderMode,   setReorderMode]   = useState(false);

  useEffect(() => {
    if (!outletId) return;
    api.get(`/menu/captain/favorites?outletId=${outletId}`)
      .then(res => setFavoriteIds(res?.itemIds || []))
      .catch(() => {});
    api.get(`/menu/captain/category-order?outletId=${outletId}`)
      .then(res => setCategoryOrder(res?.categoryIds || []))
      .catch(() => {});
  }, [outletId]);

  useEffect(() => {
    if (!socket) return;
    function onFavorites(data) { if (data.outletId === outletId) setFavoriteIds(data.itemIds || []); }
    function onCategoryOrder(data) { if (data.outletId === outletId) setCategoryOrder(data.categoryIds || []); }
    socket.on("captain:favorites", onFavorites);
    socket.on("captain:category-order", onCategoryOrder);
    return () => {
      socket.off("captain:favorites", onFavorites);
      socket.off("captain:category-order", onCategoryOrder);
    };
  }, [socket, outletId]);

  function toggleFavorite(itemId) {
    tapImpact();
    const next = favoriteIds.includes(itemId)
      ? favoriteIds.filter(id => id !== itemId)
      : [...favoriteIds, itemId];
    setFavoriteIds(next);
    if (outletId) api.put("/menu/captain/favorites", { outletId, itemIds: next }).catch(() => {});
  }

  function reorderCategory(draggedId, targetId) {
    if (draggedId === targetId) return;
    const ids  = visibleCategories.map(c => c.id || c.name);
    const known   = categoryOrder.filter(id => ids.includes(id));
    const unknown = ids.filter(id => !known.includes(id));
    const current = [...known, ...unknown];
    const from = current.indexOf(draggedId);
    const to   = current.indexOf(targetId);
    if (from < 0 || to < 0) return;
    current.splice(from, 1);
    current.splice(to, 0, draggedId);
    setCategoryOrder(current);
    if (outletId) api.put("/menu/captain/category-order", { outletId, categoryIds: current }).catch(() => {});
  }

  // Apply the captain's saved chip order; any category not yet in the saved
  // order (new categories) keeps its default position appended at the end.
  const orderedCategories = (() => {
    const byKey = {};
    visibleCategories.forEach(c => { byKey[c.id || c.name] = c; });
    const known   = categoryOrder.map(id => byKey[id]).filter(Boolean);
    const knownIds = new Set(categoryOrder);
    const rest    = visibleCategories.filter(c => !knownIds.has(c.id || c.name));
    return [...known, ...rest];
  })();

  // When real categories load from API (seed → real transition), reset activeCat to the
  // first real category so a chip is always properly highlighted.
  useEffect(() => {
    if (!visibleCategories.length) return;
    if (activeCat === FAVORITES_CHIP_ID) return;
    const isValid = visibleCategories.some(c =>
      String(c.id  || "").toLowerCase() === activeCat.toLowerCase() ||
      String(c.name|| "").toLowerCase() === activeCat.toLowerCase()
    );
    if (!isValid) {
      setActiveCat(visibleCategories[0]?.id || visibleCategories[0]?.name || "");
    }
  }, [visibleCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build robust category lookup maps so items match by BOTH id and name.
  // Handles seed categoryId ("cat-soups") vs real ID ("cat-17769…") mismatches.
  const catIdToName = {};
  const catNameToId = {};
  visibleCategories.forEach(c => {
    if (c.id) catIdToName[String(c.id).toLowerCase()] = (c.name || "").toLowerCase();
    catNameToId[(c.name || "").toLowerCase()] = String(c.id || c.name).toLowerCase();
  });
  const activeLower    = activeCat.toLowerCase();
  const activeCatName  = catIdToName[activeLower] || activeLower; // resolved name of active cat

  const searchTrimmed   = search.trim();
  const isNumericSearch = /^\d+$/.test(searchTrimmed);

  const displayItems = searchTrimmed
    ? captainMenuItems.filter(i =>
        isNumericSearch
          ? (i.sku || "").toLowerCase().startsWith(searchTrimmed.toLowerCase())
          : i.name.toLowerCase().includes(searchTrimmed.toLowerCase()) ||
            (i.sku || "").toLowerCase().includes(searchTrimmed.toLowerCase())
      )
    : activeCat === FAVORITES_CHIP_ID
    ? captainMenuItems.filter(i => favoriteIds.includes(i.id) && i.isActive !== false)
    : captainMenuItems.filter(i => {
        const itemCatId   = (i.categoryId  || "").toLowerCase();
        const itemCatName = (i.category || i.categoryName || "").toLowerCase();
        return (
          itemCatId   === activeLower   ||   // ID exact match
          itemCatName === activeLower   ||   // name matches the activeCat value
          itemCatName === activeCatName ||   // name matches resolved active cat name
          itemCatId   === (catNameToId[activeLower] || "")  // ID matches when activeCat is a name
        ) && i.isActive !== false;
      });

  function addItem(item) {
    tapImpact();
    // All local state mutation happens in App.jsx handleAddItem via setOrders(prev => …).
    // Using prev (the latest committed state, not a captured prop) means two rapid taps
    // always see each other's changes — the second tap increments qty instead of creating
    // a ghost duplicate row.
    onItemAdded?.(item);
  }

  function removeItem(menuItemId) {
    tapImpact();
    // Use functional updater so rapid double-taps always see the latest committed state,
    // not a stale snapshot of the `order` prop from the last render.
    onUpdateOrder((prevOrders) => {
      const prevOrder = prevOrders[order.tableId];
      if (!prevOrder) return { tableId: order.tableId, order: null };
      const items    = [...(prevOrder.items || [])];
      const idx      = items.findIndex(i => i.menuItemId === menuItemId && !i.sentToKot);
      if (idx < 0) return { tableId: order.tableId, order: null };
      const cartItem = items[idx];
      const wasLast  = (cartItem.quantity || 1) <= 1;
      if (wasLast) {
        items.splice(idx, 1);
        // Tell backend to DELETE the item so it doesn't reappear on sync
        onItemRemoved?.(cartItem.id);
      } else {
        items[idx] = { ...items[idx], quantity: items[idx].quantity - 1 };
      }
      return { tableId: order.tableId, order: { ...prevOrder, items } };
    });
  }

  const unsentCount = (order.items || []).filter(i => !i.sentToKot).length;
  const cartItems   = (order.items || []).filter(i => !i.isVoided && !i.isComp);
  const cartSub     = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartTax     = cartItems.reduce((s, i) => {
    const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    return s + Math.round(i.price * i.quantity * rate / 100);
  }, 0);
  const cartTotal   = cartSub + cartTax;

  return (
    <div className="menu-page mb2-page">
      {/* Header */}
      <div className="mb2-header">
        <button className="mb2-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="mb2-header-text">
          <h2 className="mb2-title">Add Items</h2>
          {tableLabel && <p className="mb2-subtitle">{tableLabel}</p>}
        </div>
        <div className="mb2-guest-stepper">
          <span className="mb2-gs-label">Guests</span>
          <button
            className="mb2-gs-btn"
            onClick={() => {
              tapImpact();
              const n = Math.max(0, guestVal - 1);
              setGuestVal(n);
              onUpdateGuests?.(n);
            }}
          >−</button>
          <span className="mb2-gs-val">{guestVal || "0"}</span>
          <button
            className="mb2-gs-btn mb2-gs-btn-add"
            onClick={() => {
              tapImpact();
              const n = guestVal + 1;
              setGuestVal(n);
              onUpdateGuests?.(n);
            }}
          >+</button>
        </div>
      </div>

      {/* Search */}
      <div className={`mb2-search${search ? " mb2-search-active" : ""}`}>
        <svg className="mb2-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          className="mb2-search-input"
          placeholder="Search by name or code #352"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && search.trim() && /^\d+$/.test(search.trim())) {
              const match = captainMenuItems.find(i => String(i.sku || "") === search.trim());
              if (match) { addItem(match); setSearch(""); }
              e.preventDefault();
            }
          }}
        />
        {search && (
          <button className="mb2-search-clear" onClick={() => setSearch("")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* Category chips — long-press any chip to enter reorder mode */}
      {!search && (
        <div className="mb2-cats">
          <button
            className={`mb2-cat mb2-cat-fav${activeCat === FAVORITES_CHIP_ID ? " mb2-cat-active" : ""}`}
            onClick={() => { setActiveCat(FAVORITES_CHIP_ID); tapImpact(); }}
          >
            ★ Favourites
          </button>
          {orderedCategories.map(c => {
            const id = c.id || c.name;
            const longPress = makeLongPress(() => { setReorderMode(true); tapImpact(); });
            const catDisabled = categoryStockState[c.id]?.available === false;
            return (
              <button
                key={id}
                draggable={reorderMode}
                onDragStart={reorderMode ? (e) => e.dataTransfer.setData("text/plain", id) : undefined}
                onDragOver={reorderMode ? (e) => e.preventDefault() : undefined}
                onDrop={reorderMode ? (e) => { e.preventDefault(); reorderCategory(e.dataTransfer.getData("text/plain"), id); } : undefined}
                className={`mb2-cat${activeCat === id ? " mb2-cat-active" : ""}${reorderMode ? " mb2-cat-reorder" : ""}${catDisabled ? " mb2-cat-disabled" : ""}`}
                onClick={() => { if (reorderMode) { setReorderMode(false); return; } setActiveCat(id); tapImpact(); }}
                {...(!reorderMode ? longPress : {})}
              >
                {catDisabled && "⏸ "}{c.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Items list */}
      <div className="mb2-items">
        {/* Empty state */}
        {displayItems.length === 0 && search && (
          <div className="mb2-empty">
            <div className="mb2-empty-icon-wrap">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C4BFB5" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
                <line x1="8.5" y1="8.5" x2="13.5" y2="13.5"/>
                <line x1="13.5" y1="8.5" x2="8.5" y2="13.5"/>
              </svg>
            </div>
            <p className="mb2-empty-title">No matches for "{search}"</p>
            <p className="mb2-empty-sub">Try a different name, or search by item code like #214.</p>
            <button className="mb2-clear-search-btn" onClick={() => setSearch("")}>× Clear search</button>
          </div>
        )}
        {displayItems.length === 0 && !search && (
          <div className="mb2-empty">
            <p className="mb2-empty-title">
              {activeCat === FAVORITES_CHIP_ID
                ? "No favourites yet — tap ★ on any item to add one"
                : "No items in this category"}
            </p>
          </div>
        )}

        {displayItems.map(item => {
          const price       = parsePriceNumber(item.price || item.basePrice);
          const soldOut     = stockState[item.id]?.available === false;
          const catDisabled = categoryStockState[item.categoryId]?.available === false;
          const unavailable = soldOut || catDisabled;
          const cartItem    = (order.items || []).find(i => i.menuItemId === item.id && !i.sentToKot);
          const cartQty     = cartItem ? cartItem.quantity : 0;
          const isFavorite  = favoriteIds.includes(item.id);
          const isVeg       = item.isVeg === true;
          const isNonVeg    = item.isVeg === false;

          return (
            <div key={item.id} className={`mb2-item${unavailable ? " mb2-item-unavail" : ""}`}>
              {/* Left: details */}
              <div className="mb2-item-left">
                <div className="mb2-item-meta-row">
                  {isVeg    && <span className="mb2-veg-icon"><span className="mb2-veg-dot"/></span>}
                  {isNonVeg && <span className="mb2-nonveg-icon">▲</span>}
                  <button
                    className={`mb2-fav-btn${isFavorite ? " mb2-fav-active" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
                  >
                    {isFavorite ? "★" : "☆"}
                  </button>
                </div>
                <p className="mb2-item-name">
                  {item.name}
                  {item.unit ? <span className="mb2-item-unit"> /{item.unit}</span> : null}
                </p>
                <p className="mb2-item-price-row">
                  <span className="mb2-item-price">₹{price}</span>
                  {item.sku && <span className="mb2-item-sku">  #{item.sku}</span>}
                </p>
                {item.description && <p className="mb2-item-desc">{item.description}</p>}
                {soldOut     && <span className="mb2-soldout-tag">Sold out</span>}
                {!soldOut && catDisabled && <span className="mb2-soldout-tag">Category unavailable</span>}
              </div>

              {/* Right: photo + action */}
              <div className="mb2-item-right">
                <div className={`mb2-photo${isVeg ? " mb2-photo-veg" : isNonVeg ? " mb2-photo-nonveg" : " mb2-photo-neutral"}`} />
                {!unavailable && (
                  cartQty > 0 ? (
                    <div className="mb2-stepper">
                      <button className="mb2-step-btn mb2-step-minus" onClick={() => removeItem(item.id)}>−</button>
                      <span className="mb2-step-num">{cartQty}</span>
                      <button className="mb2-step-btn mb2-step-plus" onClick={() => addItem(item)}>+</button>
                    </div>
                  ) : (
                    <button className="mb2-add-btn" onClick={() => addItem(item)}>ADD +</button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cart bar — shows when order has any items */}
      {(order.items?.length > 0) && (
        <div className="mb2-cart-bar">
          <button className="mb2-cart-btn" onClick={onBack}>
            <div className="mb2-cart-left">
              <span className="mb2-cart-amount">₹{cartTotal}</span>
              <span className="mb2-cart-sub">
                {unsentCount > 0
                  ? `${unsentCount} unsent item${unsentCount > 1 ? "s" : ""}`
                  : `${order.items.length} item${order.items.length > 1 ? "s" : ""}`}
              </span>
            </div>
            <span className="mb2-cart-view">View Order →</span>
          </button>
        </div>
      )}
    </div>
  );
}
