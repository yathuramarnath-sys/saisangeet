import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import { TableGrid } from "./components/TableGrid";
import { MenuPanel } from "./components/MenuPanel";
import { OrderPanel } from "./components/OrderPanel";
import { PaymentSheet } from "./components/PaymentSheet";
import { areas as seedAreas, categories as seedCategories, menuItems as seedMenuItems } from "./data/pos.seed";
import { api } from "./lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePriceNumber(value) {
  if (typeof value === "number") return value;
  return Number(String(value || "").replace(/[^\d.]/g, "")) || 0;
}

function buildBlankOrder(table, area, outletName, orderNumber) {
  return {
    tableId: table.id,
    tableNumber: table.number,
    orderNumber,
    kotNumber: `KOT-${orderNumber}`,
    outletName,
    areaName: area.name,
    guests: 0,
    items: [],
    payments: [],
    billSplitCount: 1,
    isClosed: false,
    billRequested: false,
    discountAmount: 0,
    voidRequested: false,
    voidReason: "",
    auditTrail: []
  };
}

function ensureOrders(currentOrders, tableAreas, outletName) {
  const next = { ...currentOrders };
  let counter = Math.max(10050, ...Object.values(next).map((o) => o.orderNumber || 10050)) + 1;

  for (const area of tableAreas) {
    for (const table of area.tables) {
      if (!next[table.id]) {
        next[table.id] = buildBlankOrder(table, area, outletName, counter++);
      }
    }
  }

  return next;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [outlet, setOutlet] = useState(null);
  const [tableAreas, setTableAreas] = useState(seedAreas);
  const [categories, setCategories] = useState(seedCategories);
  const [menuItems, setMenuItems] = useState(seedMenuItems);
  const [orders, setOrders] = useState({});
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [activeArea, setActiveArea] = useState(null);
  const [serviceMode, setServiceMode] = useState("dine-in");
  const [toast, setToast] = useState(null);
  const socketRef = useRef(null);

  // ── Bootstrap: load outlet config from backend ────────────────────────────
  useEffect(() => {
    async function bootstrap() {
      try {
        const outletCode = localStorage.getItem("pos_outlet_code");
        const outlets = await api.get("/outlets");

        const target = outletCode
          ? outlets.find((o) => o.code === outletCode)
          : outlets[0];

        if (!target) return;

        setOutlet(target);

        // Load menu
        const [cats, items] = await Promise.all([
          api.get(`/menu/categories?outletId=${target.id}`).catch(() => []),
          api.get(`/menu/items?outletId=${target.id}`).catch(() => [])
        ]);

        if (cats.length) setCategories(cats);
        if (items.length) {
          setMenuItems(
            items.map((i) => ({
              ...i,
              price: parsePriceNumber(i.basePrice || i.price)
            }))
          );
        }

        // Load tables
        if (target.tables?.length) {
          const builtAreas = buildAreasFromOutlet(target);
          setTableAreas(builtAreas);
        }

        // Load live orders
        const liveOrders = await api.get(`/operations/orders?outletId=${target.id}`).catch(() => []);
        const orderMap = Object.fromEntries(liveOrders.map((o) => [o.tableId, o]));
        setOrders((prev) => ensureOrders({ ...prev, ...orderMap }, target.tables?.length ? buildAreasFromOutlet(target) : seedAreas, target.name));

        // Socket.io
        const socket = io("http://localhost:4000", { query: { outletId: target.id } });
        socketRef.current = socket;

        socket.on("order:updated", (updatedOrder) => {
          setOrders((prev) => ({ ...prev, [updatedOrder.tableId]: updatedOrder }));
        });

        socket.on("kot:sent", ({ tableId }) => {
          setOrders((prev) => {
            if (!prev[tableId]) return prev;
            const order = { ...prev[tableId] };
            order.items = order.items.map((i) => ({ ...i, sentToKot: true }));
            return { ...prev, [tableId]: order };
          });
          showToast("KOT sent to kitchen");
        });

      } catch (err) {
        console.error("POS bootstrap failed:", err.message);
        // Fall back to seed data (offline mode)
        setOrders(ensureOrders({}, seedAreas, "Outlet"));
      }
    }

    bootstrap();

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Ensure orders exist for all tables after areas load
  useEffect(() => {
    setOrders((prev) => ensureOrders(prev, tableAreas, outlet?.name || "Outlet"));
  }, [tableAreas, outlet]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const selectedOrder = selectedTableId ? orders[selectedTableId] : null;
  const selectedTable = useMemo(() => {
    for (const area of tableAreas) {
      const t = area.tables.find((t) => t.id === selectedTableId);
      if (t) return { ...t, areaName: area.name };
    }
    return null;
  }, [tableAreas, selectedTableId]);

  const filteredAreas = activeArea
    ? tableAreas.filter((a) => a.id === activeArea)
    : tableAreas;

  // ── Order mutations ───────────────────────────────────────────────────────
  function mutateOrder(tableId, updater) {
    setOrders((prev) => {
      const order = prev[tableId];
      if (!order) return prev;
      const next = updater(structuredClone(order));
      // Optimistically update; emit to socket
      socketRef.current?.emit("order:update", { outletId: outlet?.id, order: next });
      return { ...prev, [tableId]: next };
    });
  }

  function handleAddItem(item) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => {
      const existing = order.items.findIndex(
        (i) => i.menuItemId === item.id && !i.sentToKot
      );
      if (existing >= 0) {
        order.items[existing].quantity += 1;
      } else {
        order.items.push({
          id: `item-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          menuItemId: item.id,
          name: item.name,
          price: parsePriceNumber(item.price || item.basePrice),
          quantity: 1,
          sentToKot: false,
          note: ""
        });
      }
      return order;
    });
  }

  function handleChangeQty(idx, qty) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => {
      if (qty <= 0) {
        order.items.splice(idx, 1);
      } else {
        order.items[idx].quantity = qty;
      }
      return order;
    });
  }

  function handleRemoveItem(idx) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => {
      order.items.splice(idx, 1);
      return order;
    });
  }

  function handleNoteChange(idx, note) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => {
      order.items[idx].note = note;
      return order;
    });
  }

  function handleGuestsChange(count) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => {
      order.guests = count;
      return order;
    });
  }

  function handleDiscountChange(amount) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => {
      order.discountAmount = amount;
      return order;
    });
  }

  async function handleSendKOT() {
    if (!selectedTableId) return;
    const order = orders[selectedTableId];
    const unsent = (order.items || []).filter((i) => !i.sentToKot);
    if (!unsent.length) return;

    mutateOrder(selectedTableId, (o) => {
      o.items = o.items.map((i) => ({ ...i, sentToKot: true }));
      return o;
    });

    showToast("KOT sent to kitchen");

    // Post to backend
    try {
      await api.post("/operations/kot", {
        outletId: outlet?.id,
        orderId: order.id,
        tableId: order.tableId,
        tableNumber: order.tableNumber,
        items: unsent
      });
    } catch (err) {
      console.error("KOT send failed:", err.message);
    }
  }

  async function handleRequestBill() {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => {
      order.billRequested = true;
      order.billRequestedAt = new Date().toISOString();
      return order;
    });
    showToast("Bill requested");
    try {
      await api.post("/operations/bill-request", {
        outletId: outlet?.id,
        tableId: selectedTableId
      });
    } catch (_) {}
  }

  async function handleSettle({ method, amount, reference }) {
    if (!selectedTableId) return;
    const order = orders[selectedTableId];

    mutateOrder(selectedTableId, (o) => {
      o.payments = [...(o.payments || []), { method, amount, reference }];
      const paid = o.payments.reduce((s, p) => s + p.amount, 0);
      const subtotal = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
      const disc = Math.min(o.discountAmount || 0, subtotal);
      const total = Math.round((subtotal - disc) * 1.05);
      if (paid >= total) {
        o.isClosed = true;
        o.closedAt = new Date().toISOString();
      }
      return o;
    });

    try {
      await api.post("/operations/payment", {
        outletId: outlet?.id,
        orderId: order.id,
        tableId: order.tableId,
        method,
        amount,
        reference
      });
    } catch (err) {
      console.error("Payment record failed:", err.message);
    }

    setShowPayment(false);
    showToast(`Payment recorded · ₹${amount}`);
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  const tableLabel = selectedTable
    ? `Table ${selectedTable.number} · ${selectedTable.areaName}`
    : "";

  return (
    <div className="pos-shell">
      {/* ── Left: Floor / Table panel ──────────────────────────────────────── */}
      <div className="pos-left">
        {/* Header */}
        <div className="pos-left-head">
          <div>
            <h1 className="pos-brand">{outlet?.name || "Restaurant OS"}</h1>
            <p className="pos-outlet-label">POS Terminal</p>
          </div>
          <div className="pos-head-right">
            <select
              className="pos-mode-select"
              value={serviceMode}
              onChange={(e) => setServiceMode(e.target.value)}
            >
              <option value="dine-in">Dine-In</option>
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
        </div>

        {/* Area tabs */}
        {tableAreas.length > 1 && (
          <div className="pos-area-tabs">
            <button
              type="button"
              className={`pos-area-tab${!activeArea ? " active" : ""}`}
              onClick={() => setActiveArea(null)}
            >All</button>
            {tableAreas.map((area) => (
              <button
                key={area.id}
                type="button"
                className={`pos-area-tab${activeArea === area.id ? " active" : ""}`}
                onClick={() => setActiveArea(area.id)}
              >{area.name}</button>
            ))}
          </div>
        )}

        {/* Table grid */}
        <div className="pos-left-scroll">
          <TableGrid
            areas={filteredAreas}
            orders={orders}
            selectedTableId={selectedTableId}
            onSelectTable={setSelectedTableId}
          />
        </div>

        {/* Legend */}
        <div className="pos-legend">
          {[
            { cls: "available", label: "Free" },
            { cls: "occupied", label: "Occupied" },
            { cls: "bill", label: "Bill" },
            { cls: "void", label: "Void" }
          ].map((l) => (
            <span key={l.cls} className={`pos-legend-item legend-${l.cls}`}>{l.label}</span>
          ))}
        </div>
      </div>

      {/* ── Center: Menu panel ─────────────────────────────────────────────── */}
      <div className="pos-center">
        <MenuPanel
          categories={categories}
          menuItems={menuItems}
          onAddItem={handleAddItem}
        />
      </div>

      {/* ── Right: Order panel ─────────────────────────────────────────────── */}
      <div className="pos-right">
        <OrderPanel
          order={selectedOrder}
          tableLabel={tableLabel}
          onChangeQty={handleChangeQty}
          onRemoveItem={handleRemoveItem}
          onNoteChange={handleNoteChange}
          onSendKOT={handleSendKOT}
          onRequestBill={handleRequestBill}
          onOpenPayment={() => setShowPayment(true)}
          onGuestsChange={handleGuestsChange}
          onDiscountChange={handleDiscountChange}
        />
      </div>

      {/* ── Payment sheet ──────────────────────────────────────────────────── */}
      {showPayment && selectedOrder && (
        <PaymentSheet
          order={selectedOrder}
          tableLabel={tableLabel}
          onClose={() => setShowPayment(false)}
          onSettle={handleSettle}
        />
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="pos-toast" role="status">{toast}</div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildAreasFromOutlet(outlet) {
  if (!outlet?.tables?.length) return seedAreas;

  const workAreaNames = [...new Set(outlet.tables.map((t) => t.workArea || t.area_name).filter(Boolean))];
  if (!workAreaNames.length) workAreaNames.push("Main");

  return workAreaNames.map((areaName) => {
    const tables = outlet.tables
      .filter((t) => (t.workArea || t.area_name || "Main") === areaName)
      .map((t) => ({
        id: t.id,
        number: t.table_number || t.tableNumber || t.name,
        seats: t.seats || 4
      }));

    return {
      id: `area-${areaName.toLowerCase().replace(/\s+/g, "-")}`,
      name: areaName,
      tables
    };
  });
}
