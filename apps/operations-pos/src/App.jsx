import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import { TableGrid }       from "./components/TableGrid";
import { MenuPanel }       from "./components/MenuPanel";
import { OrderPanel }      from "./components/OrderPanel";
import { PaymentSheet }    from "./components/PaymentSheet";
import { SplitBillSheet }  from "./components/SplitBillSheet";
import { ShiftGate }       from "./components/ShiftGate";
import { CashMovementModal, CloseShiftModal } from "./components/ShiftModals";
import { CounterPanel }    from "./components/CounterPanel";
import { areas as seedAreas, categories as seedCategories, menuItems as seedMenuItems } from "./data/pos.seed";
import { api } from "./lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePriceNumber(value) {
  if (typeof value === "number") return value;
  return Number(String(value || "").replace(/[^\d.]/g, "")) || 0;
}

function buildBlankOrder(table, area, outletName, orderNumber) {
  return {
    tableId:        table.id,
    tableNumber:    table.number,
    orderNumber,
    kotNumber:      `KOT-${orderNumber}`,
    outletName,
    areaName:       area.name,
    guests:         0,
    items:          [],
    payments:       [],
    billSplitCount: 1,
    isClosed:       false,
    billRequested:  false,
    discountAmount: 0,
    voidRequested:  false,
    voidReason:     "",
    auditTrail:     [],
    isCounter:      false
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

function buildAreasFromOutlet(outlet) {
  if (!outlet?.tables?.length) return seedAreas;
  const workAreaNames = [...new Set(outlet.tables.map((t) => t.workArea || t.area_name).filter(Boolean))];
  if (!workAreaNames.length) workAreaNames.push("Main");
  return workAreaNames.map((areaName) => {
    const tables = outlet.tables
      .filter((t) => (t.workArea || t.area_name || "Main") === areaName)
      .map((t) => ({
        id:     t.id,
        number: t.table_number || t.tableNumber || t.name,
        seats:  t.seats || 4
      }));
    return {
      id:     `area-${areaName.toLowerCase().replace(/\s+/g, "-")}`,
      name:   areaName,
      tables
    };
  });
}

// Load active shift from localStorage
function loadActiveShift() {
  try {
    const shifts = JSON.parse(localStorage.getItem("pos_active_shifts") || "[]");
    return (Array.isArray(shifts) ? shifts : []).find(s => s.status === "open") || null;
  } catch { return null; }
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function Clock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="pos-topbar-time">
      {time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
    </span>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [outlet,          setOutlet]          = useState(null);
  const [tableAreas,      setTableAreas]      = useState(seedAreas);
  const [categories,      setCategories]      = useState(seedCategories);
  const [menuItems,       setMenuItems]       = useState(seedMenuItems);
  const [orders,          setOrders]          = useState({});
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [showPayment,     setShowPayment]     = useState(false);
  const [showSplitBill,   setShowSplitBill]   = useState(false);
  const [activeArea,      setActiveArea]      = useState(null);
  const [serviceMode,     setServiceMode]     = useState("dine-in");
  const [toast,           setToast]           = useState(null);
  const socketRef = useRef(null);

  // ── Shift state ───────────────────────────────────────────────────────────
  const [activeShift,      setActiveShift]      = useState(() => loadActiveShift());
  const [showCashIn,       setShowCashIn]       = useState(false);
  const [showCashOut,      setShowCashOut]      = useState(false);
  const [showCloseShift,   setShowCloseShift]   = useState(false);
  const [counterTicketNum, setCounterTicketNum] = useState(1);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function bootstrap() {
      try {
        const outletCode = localStorage.getItem("pos_outlet_code");
        const outlets    = await api.get("/outlets");
        const target     = outletCode ? outlets.find((o) => o.code === outletCode) : outlets[0];
        if (!target) return;

        setOutlet(target);

        const [cats, items] = await Promise.all([
          api.get(`/menu/categories?outletId=${target.id}`).catch(() => []),
          api.get(`/menu/items?outletId=${target.id}`).catch(() => [])
        ]);

        if (cats.length)  setCategories(cats);
        if (items.length) {
          setMenuItems(items.map((i) => ({
            ...i,
            price: parsePriceNumber(i.basePrice || i.price)
          })));
        }

        if (target.tables?.length) {
          const builtAreas = buildAreasFromOutlet(target);
          setTableAreas(builtAreas);
        }

        const liveOrders = await api.get(`/operations/orders?outletId=${target.id}`).catch(() => []);
        const orderMap   = Object.fromEntries(liveOrders.map((o) => [o.tableId, o]));
        setOrders((prev) =>
          ensureOrders(
            { ...prev, ...orderMap },
            target.tables?.length ? buildAreasFromOutlet(target) : seedAreas,
            target.name
          )
        );

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
        setOrders(ensureOrders({}, seedAreas, "Outlet"));
      }
    }

    bootstrap();
    return () => { socketRef.current?.disconnect(); };
  }, []);

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

  const isCounterMode = serviceMode === "takeaway" || serviceMode === "delivery";

  const tableLabel = useMemo(() => {
    if (!selectedTableId) return "";
    if (selectedOrder?.isCounter) {
      return `${serviceMode === "delivery" ? "Delivery" : "Takeaway"} #${String(selectedOrder.ticketNumber || "").padStart(3, "0")}`;
    }
    if (selectedTable) return `Table ${selectedTable.number} · ${selectedTable.areaName}`;
    return "";
  }, [selectedTableId, selectedTable, selectedOrder, serviceMode]);

  // ── Order mutations ───────────────────────────────────────────────────────
  function mutateOrder(tableId, updater) {
    setOrders((prev) => {
      const order = prev[tableId];
      if (!order) return prev;
      const next = updater(structuredClone(order));
      socketRef.current?.emit("order:update", { outletId: outlet?.id, order: next });
      return { ...prev, [tableId]: next };
    });
  }

  function handleAddItem(item) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => {
      const existing = order.items.findIndex((i) => i.menuItemId === item.id && !i.sentToKot);
      if (existing >= 0) {
        order.items[existing].quantity += 1;
      } else {
        order.items.push({
          id:         `item-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          menuItemId: item.id,
          name:       item.name,
          price:      parsePriceNumber(item.price || item.basePrice),
          quantity:   1,
          sentToKot:  false,
          note:       ""
        });
      }
      return order;
    });
  }

  function handleChangeQty(idx, qty) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => {
      if (qty <= 0) order.items.splice(idx, 1);
      else          order.items[idx].quantity = qty;
      return order;
    });
  }

  function handleRemoveItem(idx) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => { order.items.splice(idx, 1); return order; });
  }

  function handleNoteChange(idx, note) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => { order.items[idx].note = note; return order; });
  }

  function handleGuestsChange(count) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => { order.guests = count; return order; });
  }

  function handleDiscountChange(amount) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => { order.discountAmount = amount; return order; });
  }

  async function handleSendKOT() {
    if (!selectedTableId) return;
    const order  = orders[selectedTableId];
    const unsent = (order.items || []).filter((i) => !i.sentToKot);
    if (!unsent.length) return;

    mutateOrder(selectedTableId, (o) => {
      o.items = o.items.map((i) => ({ ...i, sentToKot: true }));
      return o;
    });
    showToast("KOT sent to kitchen");

    try {
      await api.post("/operations/kot", {
        outletId:    outlet?.id,
        orderId:     order.id,
        tableId:     order.tableId,
        tableNumber: order.tableNumber,
        items:       unsent
      });
    } catch (err) {
      console.error("KOT send failed:", err.message);
    }
  }

  async function handleRequestBill() {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, (order) => {
      order.billRequested   = true;
      order.billRequestedAt = new Date().toISOString();
      return order;
    });
    showToast("Bill requested");
    try {
      await api.post("/operations/bill-request", { outletId: outlet?.id, tableId: selectedTableId });
    } catch {}
  }

  async function handleSettle(paymentsInput) {
    if (!selectedTableId) return;
    const order       = orders[selectedTableId];
    const newPayments = Array.isArray(paymentsInput) ? paymentsInput : [paymentsInput];

    mutateOrder(selectedTableId, (o) => {
      o.payments = [...(o.payments || []), ...newPayments];
      const paid     = o.payments.reduce((s, p) => s + p.amount, 0);
      const subtotal = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
      const disc     = Math.min(o.discountAmount || 0, subtotal);
      const total    = Math.round((subtotal - disc) * 1.05);
      if (paid >= total) {
        o.isClosed = true;
        o.closedAt = new Date().toISOString();
      }
      return o;
    });

    for (const p of newPayments) {
      try {
        await api.post("/operations/payment", {
          outletId:  outlet?.id,
          orderId:   order.id,
          tableId:   order.tableId,
          method:    p.method,
          amount:    p.amount,
          reference: p.reference
        });
      } catch (err) {
        console.error("Payment record failed:", err.message);
      }
    }

    setShowPayment(false);
    const totalPaid = newPayments.reduce((s, p) => s + p.amount, 0);
    showToast(`Payment recorded · ₹${totalPaid}`);
  }

  async function handlePaySplit(amount) {
    if (!selectedTableId) return;
    await handleSettle([{ method: "cash", amount, reference: undefined }]);
    showToast(`Split payment · ₹${amount}`);
  }

  // ── Counter order ─────────────────────────────────────────────────────────
  function handleNewCounterOrder() {
    const ticketNum = counterTicketNum;
    const ticketId  = `counter-${Date.now()}`;
    const area      = { id: "counter", name: serviceMode === "delivery" ? "Delivery" : "Takeaway" };
    const fakeTable = { id: ticketId, number: String(ticketNum).padStart(3, "0") };
    const orderNum  = Math.max(10050, ...Object.values(orders).map(o => o.orderNumber || 10050)) + 1;

    const newOrder = {
      ...buildBlankOrder(fakeTable, area, outlet?.name || "Outlet", orderNum),
      isCounter:    true,
      ticketNumber: ticketNum
    };

    setOrders(prev => ({ ...prev, [ticketId]: newOrder }));
    setCounterTicketNum(n => n + 1);
    setSelectedTableId(ticketId);
  }

  // ── Shift callbacks ───────────────────────────────────────────────────────
  function handleShiftStarted(shift) {
    setActiveShift(shift);
  }

  function handleMovementSaved(movement, updatedShift) {
    setActiveShift(updatedShift || activeShift);
    showToast(`${movement.type === "in" ? "Cash In" : "Cash Out"} · ₹${movement.amount}`);
  }

  function handleShiftClosed() {
    setActiveShift(null);
    setSelectedTableId(null);
    showToast("Shift closed");
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  // ── Service modes ─────────────────────────────────────────────────────────
  const SERVICE_MODES = [
    { id: "dine-in",  label: "Dine-In"  },
    { id: "takeaway", label: "Takeaway" },
    { id: "delivery", label: "Delivery" }
  ];

  // ── Shift Gate (no active shift) ──────────────────────────────────────────
  if (!activeShift) {
    return <ShiftGate outletName={outlet?.name} onShiftStarted={handleShiftStarted} />;
  }

  // ─── Main POS UI ──────────────────────────────────────────────────────────
  return (
    <div className="pos-shell">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="pos-topbar">
        <div className="pos-topbar-brand">
          <span className="pos-topbar-name">{outlet?.name || "Restaurant OS"}</span>
          <span className="pos-topbar-sub">POS Terminal</span>
        </div>

        <div className="pos-topbar-center">
          <div className="pos-mode-pills">
            {SERVICE_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`pos-mode-pill${serviceMode === m.id ? " active" : ""}`}
                onClick={() => { setServiceMode(m.id); setSelectedTableId(null); }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pos-topbar-right">
          {/* Shift info + controls */}
          <div className="pos-shift-bar">
            <div className="pos-shift-info">
              <span className="pos-shift-cashier">{activeShift.cashier}</span>
              <span className="pos-shift-session">{activeShift.session}</span>
            </div>
            <div className="pos-shift-actions">
              <button type="button" className="pos-shift-btn in"
                onClick={() => setShowCashIn(true)}>
                ↑ In
              </button>
              <button type="button" className="pos-shift-btn out"
                onClick={() => setShowCashOut(true)}>
                ↓ Out
              </button>
              <button type="button" className="pos-shift-btn end"
                onClick={() => setShowCloseShift(true)}>
                End Shift
              </button>
            </div>
          </div>
          <Clock />
        </div>
      </div>

      {/* ── Left: Floor / Table / Counter panel ─────────────────────────── */}
      <div className="pos-left">
        {isCounterMode ? (
          <CounterPanel
            orders={orders}
            selectedId={selectedTableId}
            onSelect={setSelectedTableId}
            onNewOrder={handleNewCounterOrder}
            mode={serviceMode}
          />
        ) : (
          <>
            {tableAreas.length > 0 && (
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
            <div className="pos-left-scroll">
              <TableGrid
                areas={filteredAreas}
                orders={orders}
                selectedTableId={selectedTableId}
                onSelectTable={setSelectedTableId}
              />
            </div>
            <div className="pos-legend">
              {[
                { cls: "available", label: "Free"     },
                { cls: "occupied",  label: "Occupied" },
                { cls: "bill",      label: "Bill"     },
                { cls: "void",      label: "Void"     }
              ].map((l) => (
                <span key={l.cls} className={`pos-legend-item legend-${l.cls}`}>{l.label}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Center: Menu panel ───────────────────────────────────────────── */}
      <div className="pos-center">
        <MenuPanel
          categories={categories}
          menuItems={menuItems}
          onAddItem={handleAddItem}
        />
      </div>

      {/* ── Right: Order panel ───────────────────────────────────────────── */}
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
          onOpenSplitBill={() => setShowSplitBill(true)}
          onGuestsChange={handleGuestsChange}
          onDiscountChange={handleDiscountChange}
        />
      </div>

      {/* ── Payment sheet ─────────────────────────────────────────────────── */}
      {showPayment && selectedOrder && (
        <PaymentSheet
          order={selectedOrder}
          tableLabel={tableLabel}
          onClose={() => setShowPayment(false)}
          onSettle={handleSettle}
        />
      )}

      {/* ── Split Bill sheet ──────────────────────────────────────────────── */}
      {showSplitBill && selectedOrder && (
        <SplitBillSheet
          order={selectedOrder}
          tableLabel={tableLabel}
          onClose={() => setShowSplitBill(false)}
          onPaySplit={handlePaySplit}
        />
      )}

      {/* ── Cash In modal ─────────────────────────────────────────────────── */}
      {showCashIn && (
        <CashMovementModal
          shift={activeShift}
          type="in"
          onClose={() => setShowCashIn(false)}
          onSaved={handleMovementSaved}
        />
      )}

      {/* ── Cash Out modal ────────────────────────────────────────────────── */}
      {showCashOut && (
        <CashMovementModal
          shift={activeShift}
          type="out"
          onClose={() => setShowCashOut(false)}
          onSaved={handleMovementSaved}
        />
      )}

      {/* ── Close Shift modal ─────────────────────────────────────────────── */}
      {showCloseShift && (
        <CloseShiftModal
          shift={activeShift}
          orders={orders}
          onClose={() => setShowCloseShift(false)}
          onShiftClosed={handleShiftClosed}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="pos-toast" role="status">{toast}</div>
      )}
    </div>
  );
}
