import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import { api } from "./lib/api";
import {
  mobileAreas as seedAreas,
  mobileCategories as seedCategories,
  mobileMenuItems as seedMenuItems,
  mobileInstructions as seedInstructions
} from "./data/mobile.seed";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUICK_NOTES = [
  "Less spicy", "No onion", "No garlic", "Extra spicy",
  "Less salt", "No coriander", "Well done", "Half portion"
];

function parsePriceNumber(v) {
  if (typeof v === "number") return v;
  return Number(String(v || "").replace(/[^\d.]/g, "")) || 0;
}

function buildBlankOrder(table, area, orderNum) {
  return {
    tableId: table.id,
    tableNumber: table.number,
    areaName: area.name,
    guests: 0,
    items: [],
    billRequested: false
  };
}

// ─── Screen: Table list ───────────────────────────────────────────────────────

function TableScreen({ areas, orders, onSelectTable }) {
  const [activeArea, setActiveArea] = useState(null);

  const filteredAreas = activeArea
    ? areas.filter((a) => a.id === activeArea)
    : areas;

  function tableStatus(tableId) {
    const o = orders[tableId];
    if (!o?.items?.length) return "open";
    if (o.billRequested) return "bill";
    return "running";
  }

  function tableItemCount(tableId) {
    return orders[tableId]?.items?.length || 0;
  }

  return (
    <div className="w-screen">
      {/* Area filter */}
      {areas.length > 1 && (
        <div className="area-tabs">
          <button
            className={`area-tab${!activeArea ? " active" : ""}`}
            onClick={() => setActiveArea(null)}
          >All</button>
          {areas.map((a) => (
            <button
              key={a.id}
              className={`area-tab${activeArea === a.id ? " active" : ""}`}
              onClick={() => setActiveArea(a.id)}
            >{a.name}</button>
          ))}
        </div>
      )}

      <div className="table-list">
        {filteredAreas.map((area) => (
          <div key={area.id} className="table-area-section">
            <p className="table-area-head">{area.name}</p>
            <div className="table-chips">
              {area.tables.map((table) => {
                const status = tableStatus(table.id);
                const count = tableItemCount(table.id);
                return (
                  <button
                    key={table.id}
                    className={`table-chip status-${status}`}
                    onClick={() => onSelectTable(table.id, area)}
                  >
                    <span className="table-chip-num">{table.number}</span>
                    {count > 0 && <span className="table-chip-count">{count}</span>}
                    <span className="table-chip-status">
                      {status === "open" ? "Free" : status === "bill" ? "Bill" : "Running"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Screen: Order (add items) ────────────────────────────────────────────────

function OrderScreen({ order, tableLabel, categories, menuItems, instructions, onBack, onSendKOT, onRequestBill, onUpdateOrder }) {
  const [screen, setScreen] = useState("order"); // "order" | "menu" | "note"
  const [activeCat, setActiveCat] = useState(categories[0]?.name);
  const [noteItemIdx, setNoteItemIdx] = useState(null);
  const [noteValue, setNoteValue] = useState("");
  const [search, setSearch] = useState("");

  const displayItems = search.trim()
    ? menuItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : menuItems.filter((i) => (i.category || i.categoryName) === activeCat && i.isActive !== false);

  function addItem(item) {
    const items = [...(order.items || [])];
    const idx = items.findIndex((i) => i.menuItemId === item.id && !i.sentToKot);
    if (idx >= 0) {
      items[idx] = { ...items[idx], quantity: items[idx].quantity + 1 };
    } else {
      items.push({
        id: `item-${Date.now()}-${Math.random().toString(16).slice(2,5)}`,
        menuItemId: item.id,
        name: item.name,
        price: parsePriceNumber(item.price || item.basePrice),
        quantity: 1,
        sentToKot: false,
        note: ""
      });
    }
    onUpdateOrder({ ...order, items });
    setScreen("order");
  }

  function changeQty(idx, delta) {
    const items = [...(order.items || [])];
    const newQty = (items[idx]?.quantity || 1) + delta;
    if (newQty <= 0) {
      items.splice(idx, 1);
    } else {
      items[idx] = { ...items[idx], quantity: newQty };
    }
    onUpdateOrder({ ...order, items });
  }

  function openNote(idx) {
    setNoteItemIdx(idx);
    setNoteValue(order.items[idx]?.note || "");
    setScreen("note");
  }

  function saveNote() {
    const items = [...(order.items || [])];
    items[noteItemIdx] = { ...items[noteItemIdx], note: noteValue };
    onUpdateOrder({ ...order, items });
    setScreen("order");
  }

  const unsentCount = (order.items || []).filter((i) => !i.sentToKot).length;
  const totalAmount = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0);

  // ── Note screen ────────────────────────────────────────────────────────────
  if (screen === "note") {
    const item = order.items?.[noteItemIdx];
    return (
      <div className="w-screen note-screen">
        <button className="back-btn" onClick={() => setScreen("order")}>← Back</button>
        <h2 className="note-title">{item?.name}</h2>
        <p className="note-subtitle">Add kitchen instructions</p>

        <div className="quick-notes">
          {QUICK_NOTES.map((n) => (
            <button
              key={n}
              className={`quick-note-chip${noteValue === n ? " active" : ""}`}
              onClick={() => setNoteValue(n)}
            >{n}</button>
          ))}
        </div>

        <textarea
          className="note-input"
          placeholder="Custom instruction…"
          value={noteValue}
          onChange={(e) => setNoteValue(e.target.value)}
          rows={3}
        />

        <button className="waiter-btn primary" onClick={saveNote}>
          Save Note
        </button>
      </div>
    );
  }

  // ── Menu screen ────────────────────────────────────────────────────────────
  if (screen === "menu") {
    return (
      <div className="w-screen menu-screen">
        <div className="menu-head">
          <button className="back-btn" onClick={() => setScreen("order")}>← Back</button>
          <h2>Add Items</h2>
        </div>

        <div className="menu-search-bar">
          <input
            type="text"
            placeholder="Search menu…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
          />
          {search && <button onClick={() => setSearch("")}>✕</button>}
        </div>

        {!search && (
          <div className="menu-cat-scroll">
            {categories.map((c) => (
              <button
                key={c.name}
                className={`menu-cat-chip${activeCat === c.name ? " active" : ""}`}
                onClick={() => setActiveCat(c.name)}
              >{c.name}</button>
            ))}
          </div>
        )}

        <div className="menu-item-list">
          {displayItems.map((item) => {
            const price = parsePriceNumber(item.price || item.basePrice);
            return (
              <button
                key={item.id}
                className="menu-item-row"
                onClick={() => addItem(item)}
              >
                <div className="menu-item-info">
                  {item.isVeg !== undefined && (
                    <span className={`veg-badge ${item.isVeg ? "veg" : "nonveg"}`} />
                  )}
                  <span className="menu-item-name">{item.name}</span>
                </div>
                <span className="menu-item-price">₹{price}</span>
              </button>
            );
          })}
          {displayItems.length === 0 && (
            <p className="no-items">No items found</p>
          )}
        </div>
      </div>
    );
  }

  // ── Order screen (default) ─────────────────────────────────────────────────
  return (
    <div className="w-screen order-screen">
      {/* Header */}
      <div className="order-head">
        <button className="back-btn" onClick={onBack}>← Tables</button>
        <div>
          <h2 className="order-table-title">{tableLabel}</h2>
          <p className="order-table-sub">
            {order.areaName} ·{" "}
            <input
              className="guests-inline"
              type="number"
              min="0"
              max="20"
              value={order.guests || ""}
              placeholder="0"
              onChange={(e) => onUpdateOrder({ ...order, guests: Number(e.target.value) })}
            />
            {" "}guests
          </p>
        </div>
      </div>

      {/* Item list */}
      <div className="order-item-list">
        {(order.items || []).length === 0 && (
          <div className="empty-order">
            <p>No items yet</p>
            <p className="empty-hint">Tap + to add from menu</p>
          </div>
        )}
        {(order.items || []).map((item, idx) => (
          <div key={item.id || idx} className={`order-row${item.sentToKot ? " sent" : ""}`}>
            <div className="order-row-info">
              <span className="order-row-name">{item.name}</span>
              {item.sentToKot && <span className="kot-badge">KOT</span>}
              {item.note ? (
                <button className="note-chip active" onClick={() => !item.sentToKot && openNote(idx)}>
                  {item.note}
                </button>
              ) : !item.sentToKot && (
                <button className="note-chip" onClick={() => openNote(idx)}>+ note</button>
              )}
            </div>
            <div className="order-row-right">
              {!item.sentToKot && (
                <div className="qty-row">
                  <button className="qty-mini" onClick={() => changeQty(idx, -1)}>−</button>
                  <span>{item.quantity}</span>
                  <button className="qty-mini" onClick={() => changeQty(idx, +1)}>+</button>
                </div>
              )}
              {item.sentToKot && <span className="qty-sent">×{item.quantity}</span>}
              <span className="order-row-price">₹{(item.price * item.quantity).toFixed(0)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add items button */}
      <div className="add-items-bar">
        <button className="add-items-btn" onClick={() => setScreen("menu")}>
          + Add Items
        </button>
        {totalAmount > 0 && (
          <span className="running-total">₹{Math.round(totalAmount * 1.05)}</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="order-actions">
        {unsentCount > 0 && (
          <button className="waiter-btn kot" onClick={onSendKOT}>
            Send KOT ({unsentCount} item{unsentCount > 1 ? "s" : ""})
          </button>
        )}
        {(order.items || []).length > 0 && !order.billRequested && (
          <button className="waiter-btn bill" onClick={onRequestBill}>
            Request Bill
          </button>
        )}
        {order.billRequested && (
          <div className="bill-requested-banner">Bill requested — awaiting cashier</div>
        )}
      </div>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

export function App() {
  const [areas, setAreas] = useState(seedAreas);
  const [categories, setCategories] = useState(seedCategories);
  const [menuItems, setMenuItems] = useState(seedMenuItems);
  const [orders, setOrders] = useState({});
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);
  const [outlet, setOutlet] = useState(null);
  const [toast, setToast] = useState(null);
  const socketRef = useRef(null);

  // Bootstrap
  useEffect(() => {
    async function bootstrap() {
      try {
        const outlets = await api.get("/outlets");
        const target = outlets[0];
        if (!target) return;
        setOutlet(target);

        const [cats, items] = await Promise.all([
          api.get(`/menu/categories?outletId=${target.id}`).catch(() => []),
          api.get(`/menu/items?outletId=${target.id}`).catch(() => [])
        ]);

        if (cats.length) setCategories(cats);
        if (items.length) setMenuItems(items.map((i) => ({ ...i, price: parsePriceNumber(i.basePrice || i.price) })));

        const liveOrders = await api.get(`/operations/orders?outletId=${target.id}`).catch(() => []);
        const orderMap = Object.fromEntries(liveOrders.map((o) => [o.tableId, o]));
        setOrders(orderMap);

        const socket = io("http://localhost:4000", { query: { outletId: target.id } });
        socketRef.current = socket;

        socket.on("order:updated", (o) => {
          setOrders((prev) => ({ ...prev, [o.tableId]: o }));
        });

        socket.on("kot:sent", ({ tableId }) => {
          setOrders((prev) => {
            if (!prev[tableId]) return prev;
            const order = { ...prev[tableId] };
            order.items = order.items.map((i) => ({ ...i, sentToKot: true }));
            return { ...prev, [tableId]: order };
          });
        });
      } catch (err) {
        console.error("Waiter bootstrap failed:", err.message);
      }
    }

    bootstrap();
    return () => socketRef.current?.disconnect();
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function handleSelectTable(tableId, area) {
    // Ensure order exists for this table
    setOrders((prev) => {
      if (prev[tableId]) return prev;
      const table = area.tables.find((t) => t.id === tableId);
      if (!table) return prev;
      return { ...prev, [tableId]: buildBlankOrder(table, area, 10100) };
    });
    setSelectedTableId(tableId);
    setSelectedArea(area);
  }

  function handleUpdateOrder(nextOrder) {
    setOrders((prev) => ({ ...prev, [nextOrder.tableId]: nextOrder }));
    socketRef.current?.emit("order:update", { outletId: outlet?.id, order: nextOrder });
  }

  async function handleSendKOT() {
    const order = orders[selectedTableId];
    if (!order) return;
    const unsent = (order.items || []).filter((i) => !i.sentToKot);
    if (!unsent.length) return;

    handleUpdateOrder({
      ...order,
      items: order.items.map((i) => ({ ...i, sentToKot: true }))
    });

    showToast("KOT sent to kitchen");

    try {
      await api.post("/operations/kot", {
        outletId: outlet?.id,
        tableId: order.tableId,
        tableNumber: order.tableNumber,
        items: unsent
      });
    } catch (err) {
      console.error("KOT failed:", err.message);
    }
  }

  async function handleRequestBill() {
    const order = orders[selectedTableId];
    if (!order) return;
    handleUpdateOrder({ ...order, billRequested: true });
    showToast("Bill requested");
    try {
      await api.post("/operations/bill-request", {
        outletId: outlet?.id,
        tableId: selectedTableId
      });
    } catch (_) {}
  }

  const selectedOrder = selectedTableId ? orders[selectedTableId] : null;
  const tableLabel = selectedTableId && selectedArea
    ? `Table ${selectedArea.tables.find((t) => t.id === selectedTableId)?.number || selectedTableId}`
    : "";

  return (
    <div className="waiter-app">
      {/* Header */}
      <header className="waiter-header">
        <div className="waiter-header-inner">
          <div className="waiter-brand">
            <span className="waiter-brand-mark">R</span>
            <div>
              <strong>Captain</strong>
              <p>{outlet?.name || "Restaurant OS"}</p>
            </div>
          </div>
          <div className="waiter-header-right">
            <span className="online-dot" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="waiter-main">
        {!selectedTableId ? (
          <TableScreen
            areas={areas}
            orders={orders}
            onSelectTable={handleSelectTable}
          />
        ) : (
          <OrderScreen
            order={selectedOrder || { tableId: selectedTableId, items: [], guests: 0 }}
            tableLabel={tableLabel}
            categories={categories}
            menuItems={menuItems}
            instructions={seedInstructions}
            onBack={() => setSelectedTableId(null)}
            onSendKOT={handleSendKOT}
            onRequestBill={handleRequestBill}
            onUpdateOrder={handleUpdateOrder}
          />
        )}
      </main>

      {/* Toast */}
      {toast && <div className="waiter-toast">{toast}</div>}
    </div>
  );
}
