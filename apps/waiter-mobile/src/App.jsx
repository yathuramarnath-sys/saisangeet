import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import { api } from "./lib/api";
import { printBill } from "./lib/printBill";
import {
  mobileAreas      as seedAreas,
  mobileCategories as seedCategories,
  mobileMenuItems  as seedMenuItems,
  mobileInstructions as seedInstructions
} from "./data/mobile.seed";

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_NOTES = [
  "Less spicy", "No onion", "No garlic", "Extra spicy",
  "Less salt", "No coriander", "Well done", "Half portion"
];

const STATUS_LABEL = { open: "Free", hold: "Hold", bill: "Bill", running: "Running" };

// seat colour palette: index 0 = shared (grey), 1..4 per person
const SEAT_BG   = ["#e5e7eb", "#dbeafe", "#dcfce7", "#fef9c3", "#fce7f3"];
const SEAT_TEXT = ["#374151", "#1d4ed8", "#15803d", "#854d0e", "#9d174d"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePriceNumber(v) {
  if (typeof v === "number") return v;
  return Number(String(v || "").replace(/[^\d.]/g, "")) || 0;
}

function buildBlankOrder(table, area) {
  return {
    tableId:       table.id,
    tableNumber:   table.number,
    areaName:      area.name,
    guests:        0,
    items:         [],
    billRequested: false,
    isOnHold:      false
  };
}

// ─── Screen: Table Floor ──────────────────────────────────────────────────────

function TableScreen({ areas, orders, onSelectTable }) {
  const [activeArea, setActiveArea] = useState(null);

  const visibleAreas = activeArea
    ? areas.filter((a) => a.id === activeArea)
    : areas;

  function tableStatus(tableId) {
    const o = orders[tableId];
    if (!o?.items?.length) return "open";
    if (o.isOnHold)        return "hold";
    if (o.billRequested)   return "bill";
    return "running";
  }

  return (
    <div className="w-screen">
      {/* Area filter tabs */}
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

      {/* Table grid */}
      <div className="table-list">
        {visibleAreas.map((area) => (
          <div key={area.id} className="table-area-section">
            <p className="table-area-head">{area.name}</p>
            <div className="table-chips">
              {area.tables.map((table) => {
                const status = tableStatus(table.id);
                const count  = orders[table.id]?.items?.length || 0;
                return (
                  <button
                    key={table.id}
                    className={`table-chip status-${status}`}
                    onClick={() => onSelectTable(table.id, area)}
                  >
                    <span className="table-chip-num">{table.number}</span>
                    {count > 0 && <span className="table-chip-badge">{count}</span>}
                    <span className="table-chip-status">{STATUS_LABEL[status]}</span>
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

// ─── Screen: Split Bill ───────────────────────────────────────────────────────

function SplitBillScreen({ order, outletName, onBack }) {
  const [seats,       setSeats]       = useState(2);
  const [assignments, setAssignments] = useState({}); // { [itemId]: 0..N }

  const items = order.items || [];

  function cycleAssignment(itemId) {
    setAssignments((prev) => {
      const cur  = prev[itemId] ?? 0;
      const next = cur >= seats ? 0 : cur + 1;
      return { ...prev, [itemId]: next };
    });
  }

  function changeSeatCount(n) {
    setSeats(n);
    // Clamp any assignments that exceed the new count back to "shared"
    setAssignments((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => { if (next[id] > n) next[id] = 0; });
      return next;
    });
  }

  function getItemsForSeat(seatNum) {
    // seatNum 0 = all items; else items assigned to that seat OR shared (0)
    return items.filter((i) => {
      const a = assignments[i.id] ?? 0;
      return seatNum === 0 ? true : (a === 0 || a === seatNum);
    });
  }

  function handlePrintSeat(seatNum) {
    const seatItems = getItemsForSeat(seatNum);
    if (!seatItems.length) return;
    printBill(order, seatItems, outletName, { seatLabel: `Person ${seatNum}` });
  }

  function handlePrintAll() {
    printBill(order, items, outletName);
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const total    = Math.round(subtotal * 1.05);

  return (
    <div className="w-screen split-screen">
      {/* Header */}
      <div className="split-head">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <div>
          <h2 className="split-title">Split Bill</h2>
          <p className="split-sub">Table {order.tableNumber} · ₹{total} total</p>
        </div>
      </div>

      {/* Person count selector */}
      <div className="split-count-bar">
        <span className="split-count-label">Split between</span>
        <div className="split-count-btns">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              className={`split-count-btn${seats === n ? " active" : ""}`}
              onClick={() => changeSeatCount(n)}
            >{n} people</button>
          ))}
        </div>
      </div>

      <p className="split-hint">Tap an item to assign it — grey means shared by all</p>

      {/* Item assignment list */}
      <div className="split-item-list">
        {items.map((item) => {
          const seat = assignments[item.id] ?? 0;
          return (
            <button
              key={item.id}
              className="split-item-row"
              onClick={() => cycleAssignment(item.id)}
            >
              <div className="split-item-left">
                <span className="split-item-name">{item.name}</span>
                {item.note && <span className="split-item-note">{item.note}</span>}
              </div>
              <div className="split-item-right">
                <span className="split-item-price">
                  ×{item.quantity} · ₹{(item.price * item.quantity).toFixed(0)}
                </span>
                <span
                  className="split-seat-badge"
                  style={{ background: SEAT_BG[seat], color: SEAT_TEXT[seat] }}
                >
                  {seat === 0 ? "All" : `P${seat}`}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Print buttons */}
      <div className="split-print-area">
        <div className="split-print-grid">
          {Array.from({ length: seats }, (_, i) => i + 1).map((n) => {
            const count = getItemsForSeat(n).length;
            return (
              <button
                key={n}
                className="waiter-btn split-person-btn"
                onClick={() => handlePrintSeat(n)}
                disabled={count === 0}
              >
                🖨️ Person {n}
                <span className="split-person-count">{count} items</span>
              </button>
            );
          })}
        </div>
        <button className="waiter-btn bill" onClick={handlePrintAll}>
          Print Full Bill
        </button>
      </div>
    </div>
  );
}

// ─── Screen: Order ────────────────────────────────────────────────────────────

function OrderScreen({
  order, tableLabel, categories, menuItems,
  outletName, onBack, onSendKOT, onRequestBill,
  onPrintBill, onToggleHold, onUpdateOrder
}) {
  const [screen,      setScreen]      = useState("order"); // "order" | "menu" | "note" | "split"
  const [activeCat,   setActiveCat]   = useState(categories[0]?.name || "");
  const [noteItemIdx, setNoteItemIdx] = useState(null);
  const [noteValue,   setNoteValue]   = useState("");
  const [search,      setSearch]      = useState("");

  const displayItems = search.trim()
    ? menuItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : menuItems.filter((i) => {
        const cat = i.categoryId || i.category || i.categoryName || "";
        return cat === activeCat && i.isActive !== false;
      });

  function addItem(item) {
    const items = [...(order.items || [])];
    const idx   = items.findIndex((i) => i.menuItemId === item.id && !i.sentToKot);
    if (idx >= 0) {
      items[idx] = { ...items[idx], quantity: items[idx].quantity + 1 };
    } else {
      items.push({
        id:        `item-${Date.now()}-${Math.random().toString(16).slice(2, 5)}`,
        menuItemId: item.id,
        name:      item.name,
        price:     parsePriceNumber(item.price || item.basePrice),
        quantity:  1,
        sentToKot: false,
        note:      ""
      });
    }
    onUpdateOrder({ ...order, items });
    setScreen("order");
  }

  function changeQty(idx, delta) {
    const items  = [...(order.items || [])];
    const newQty = (items[idx]?.quantity || 1) + delta;
    if (newQty <= 0) items.splice(idx, 1);
    else items[idx] = { ...items[idx], quantity: newQty };
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

  const unsentCount  = (order.items || []).filter((i) => !i.sentToKot).length;
  const totalAmount  = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0);
  const hasItems     = (order.items || []).length > 0;

  // ── Split screen ───────────────────────────────────────────────────────────
  if (screen === "split") {
    return (
      <SplitBillScreen
        order={order}
        outletName={outletName}
        onBack={() => setScreen("order")}
      />
    );
  }

  // ── Note screen ────────────────────────────────────────────────────────────
  if (screen === "note") {
    const item = order.items?.[noteItemIdx];
    return (
      <div className="w-screen note-screen">
        <button className="back-btn" onClick={() => setScreen("order")}>← Back</button>
        <h2 className="note-title">{item?.name}</h2>
        <p className="note-subtitle">Add kitchen instruction</p>
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
        <button className="waiter-btn primary" onClick={saveNote}>Save Note</button>
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
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search menu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
              <button key={item.id} className="menu-item-row" onClick={() => addItem(item)}>
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
          {displayItems.length === 0 && <p className="no-items">No items found</p>}
        </div>
      </div>
    );
  }

  // ── Order screen (main) ────────────────────────────────────────────────────
  return (
    <div className="w-screen order-screen">
      {/* Header */}
      <div className="order-head">
        <div className="order-head-row">
          <button className="back-btn" onClick={onBack}>← Tables</button>
          {order.isOnHold && <span className="hold-tag">ON HOLD</span>}
        </div>
        <div className="order-head-info">
          <h2 className="order-table-title">{tableLabel}</h2>
          <p className="order-table-sub">
            {order.areaName} ·&nbsp;
            <input
              className="guests-inline"
              type="number"
              min="0"
              max="20"
              value={order.guests || ""}
              placeholder="0"
              onChange={(e) => onUpdateOrder({ ...order, guests: Number(e.target.value) })}
            />
            &nbsp;guests
          </p>
        </div>
      </div>

      {/* Item list */}
      <div className="order-item-list">
        {!hasItems && (
          <div className="empty-order">
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" opacity=".3">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
            <p>No items yet</p>
            <p className="empty-hint">Tap + Add Items to start the order</p>
          </div>
        )}
        {(order.items || []).map((item, idx) => (
          <div key={item.id || idx} className={`order-row${item.sentToKot ? " sent" : ""}`}>
            <div className="order-row-info">
              <span className="order-row-name">{item.name}</span>
              {item.sentToKot && <span className="kot-badge">KOT ✓</span>}
              {item.note ? (
                <button
                  className="note-chip active"
                  onClick={() => !item.sentToKot && openNote(idx)}
                >{item.note}</button>
              ) : !item.sentToKot && (
                <button className="note-chip" onClick={() => openNote(idx)}>+ note</button>
              )}
            </div>
            <div className="order-row-right">
              {!item.sentToKot ? (
                <div className="qty-row">
                  <button className="qty-mini" onClick={() => changeQty(idx, -1)}>−</button>
                  <span className="qty-val">{item.quantity}</span>
                  <button className="qty-mini" onClick={() => changeQty(idx, +1)}>+</button>
                </div>
              ) : (
                <span className="qty-sent">×{item.quantity}</span>
              )}
              <span className="order-row-price">₹{(item.price * item.quantity).toFixed(0)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add items bar */}
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
        {/* Send KOT — only when unsent items exist */}
        {unsentCount > 0 && (
          <button className="waiter-btn kot" onClick={onSendKOT}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              <path d="M8 12l2 2 4-4"/>
            </svg>
            Send KOT ({unsentCount} item{unsentCount > 1 ? "s" : ""})
          </button>
        )}

        {/* Hold + Print Bill — shown when items exist */}
        {hasItems && (
          <div className="action-row-2">
            <button
              className={`waiter-btn half-btn${order.isOnHold ? " hold-active" : " hold-idle"}`}
              onClick={onToggleHold}
            >
              {order.isOnHold ? "▶ Resume" : "⏸ Hold"}
            </button>
            <button
              className="waiter-btn half-btn print-idle"
              onClick={onPrintBill}
            >
              🖨️ Print Bill
            </button>
          </div>
        )}

        {/* Split Bill */}
        {hasItems && (
          <button className="waiter-btn split-idle" onClick={() => setScreen("split")}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
            </svg>
            Split Bill
          </button>
        )}

        {/* Request Bill / Bill-requested banner */}
        {hasItems && !order.billRequested && (
          <button className="waiter-btn bill" onClick={onRequestBill}>
            Request Bill
          </button>
        )}
        {order.billRequested && (
          <div className="bill-requested-banner">
            ✓ Bill requested — awaiting cashier
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

export function App() {
  const [areas,           setAreas]           = useState(seedAreas);
  const [categories,      setCategories]      = useState(seedCategories);
  const [menuItems,       setMenuItems]       = useState(seedMenuItems);
  const [orders,          setOrders]          = useState({});
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedArea,    setSelectedArea]    = useState(null);
  const [outlet,          setOutlet]          = useState(null);
  const [toast,           setToast]           = useState(null);
  const socketRef = useRef(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function bootstrap() {
      try {
        const outlets = await api.get("/outlets");
        const target  = outlets[0];
        if (!target) return;
        setOutlet(target);

        const [cats, items] = await Promise.all([
          api.get(`/menu/categories?outletId=${target.id}`).catch(() => []),
          api.get(`/menu/items?outletId=${target.id}`).catch(() => [])
        ]);

        if (cats.length)  setCategories(cats);
        if (items.length) setMenuItems(items.map((i) => ({
          ...i,
          price: parsePriceNumber(i.basePrice || i.price)
        })));

        const liveOrders = await api.get(`/operations/orders?outletId=${target.id}`).catch(() => []);
        setOrders(Object.fromEntries(liveOrders.map((o) => [o.tableId, o])));

        const socket = io("http://localhost:4000", { query: { outletId: target.id } });
        socketRef.current = socket;

        socket.on("order:updated", (o) =>
          setOrders((prev) => ({ ...prev, [o.tableId]: o }))
        );

        socket.on("kot:sent", ({ tableId }) =>
          setOrders((prev) => {
            if (!prev[tableId]) return prev;
            return {
              ...prev,
              [tableId]: {
                ...prev[tableId],
                items: prev[tableId].items.map((i) => ({ ...i, sentToKot: true }))
              }
            };
          })
        );
      } catch (err) {
        console.error("Waiter bootstrap failed:", err.message);
      }
    }

    bootstrap();
    return () => socketRef.current?.disconnect();
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function handleSelectTable(tableId, area) {
    setOrders((prev) => {
      if (prev[tableId]) return prev;
      const table = area.tables.find((t) => t.id === tableId);
      if (!table) return prev;
      return { ...prev, [tableId]: buildBlankOrder(table, area) };
    });
    setSelectedTableId(tableId);
    setSelectedArea(area);
  }

  function handleUpdateOrder(nextOrder) {
    setOrders((prev) => ({ ...prev, [nextOrder.tableId]: nextOrder }));
    socketRef.current?.emit("order:update", { outletId: outlet?.id, order: nextOrder });
  }

  async function handleSendKOT() {
    const order  = orders[selectedTableId];
    if (!order) return;
    const unsent = (order.items || []).filter((i) => !i.sentToKot);
    if (!unsent.length) return;

    handleUpdateOrder({
      ...order,
      items: order.items.map((i) => ({ ...i, sentToKot: true }))
    });
    showToast("🍽️ KOT sent to kitchen");

    try {
      await api.post("/operations/kot", {
        outletId:    outlet?.id,
        tableId:     order.tableId,
        tableNumber: order.tableNumber,
        items:       unsent
      });
    } catch (err) {
      console.error("KOT failed:", err.message);
    }
  }

  async function handleRequestBill() {
    const order = orders[selectedTableId];
    if (!order) return;
    handleUpdateOrder({ ...order, billRequested: true });
    showToast("Bill requested — cashier notified");
    try {
      await api.post("/operations/bill-request", {
        outletId: outlet?.id,
        tableId:  selectedTableId
      });
    } catch (_) {}
  }

  function handlePrintBill() {
    const order = orders[selectedTableId];
    if (!order?.items?.length) { showToast("No items to print"); return; }
    printBill(order, order.items, outlet?.name);
    showToast("Printing bill…");
  }

  function handleToggleHold() {
    const order = orders[selectedTableId];
    if (!order) return;
    const next = { ...order, isOnHold: !order.isOnHold };
    handleUpdateOrder(next);
    showToast(next.isOnHold ? "⏸ Order on hold" : "▶ Order resumed");
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const selectedOrder = selectedTableId ? orders[selectedTableId] : null;
  const selectedTable = selectedTableId && selectedArea
    ? selectedArea.tables.find((t) => t.id === selectedTableId)
    : null;
  const tableLabel = selectedTable ? `Table ${selectedTable.number}` : "";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="waiter-app">
      <header className="waiter-header">
        <div className="waiter-header-inner">
          <div className="waiter-brand">
            <span className="waiter-brand-mark">C</span>
            <div>
              <strong>Captain App</strong>
              <p>{outlet?.name || "Restaurant"}</p>
            </div>
          </div>
          <div className="waiter-header-right">
            <span className="online-dot" title="Online" />
          </div>
        </div>
      </header>

      <main className="waiter-main">
        {!selectedTableId ? (
          <TableScreen
            areas={areas}
            orders={orders}
            onSelectTable={handleSelectTable}
          />
        ) : (
          <OrderScreen
            order={selectedOrder || buildBlankOrder(
              { id: selectedTableId, number: selectedTableId },
              selectedArea || { name: "" }
            )}
            tableLabel={tableLabel}
            categories={categories}
            menuItems={menuItems}
            outletName={outlet?.name}
            onBack={() => setSelectedTableId(null)}
            onSendKOT={handleSendKOT}
            onRequestBill={handleRequestBill}
            onPrintBill={handlePrintBill}
            onToggleHold={handleToggleHold}
            onUpdateOrder={handleUpdateOrder}
          />
        )}
      </main>

      {toast && <div className="waiter-toast">{toast}</div>}
    </div>
  );
}
