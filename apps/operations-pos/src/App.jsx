import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import { MenuPanel }          from "./components/MenuPanel";
import { OrderPanel }         from "./components/OrderPanel";
import { PaymentSheet }       from "./components/PaymentSheet";
import { SplitBillSheet }     from "./components/SplitBillSheet";
import { ShiftGate }          from "./components/ShiftGate";
import { CashMovementModal, CloseShiftModal } from "./components/ShiftModals";
import { AdvanceOrderModal }  from "./components/AdvanceOrderModal";
import { PosLogin }           from "./components/PosLogin";
import {
  BranchSetupScreen,
  loadBranchConfig,
  clearBranchConfig,
} from "./components/BranchSetupScreen";
import { CategorySidebar }    from "./components/CategorySidebar";
import { TablePickerPanel }   from "./components/TablePickerPanel";
import { CustomerFormModal }  from "./components/CustomerFormModal";
import { PosSettingsModal }   from "./components/PosSettingsModal";
import { PastOrdersModal }    from "./components/PastOrdersModal";
import { OnlineOrdersPanel }  from "./components/OnlineOrdersPanel";
import { areas as seedAreas, categories as seedCategories, menuItems as seedMenuItems } from "./data/pos.seed";
import { api } from "./lib/api";
import { printKOT, getKotPrinter, getKotPrinterForStation, kotAutoSendEnabled } from "./lib/kotPrint";
import { printBill } from "./lib/printBill";

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

// ── KOT offline queue ─────────────────────────────────────────────────────
const KOT_QUEUE_KEY = "pos_kot_queue";

function loadKotQueue() {
  try { return JSON.parse(localStorage.getItem(KOT_QUEUE_KEY) || "[]"); }
  catch { return []; }
}

function saveKotQueue(queue) {
  try { localStorage.setItem(KOT_QUEUE_KEY, JSON.stringify(queue)); } catch (_) {}
}

async function flushKotQueue(outletId) {
  const queue = loadKotQueue();
  if (!queue.length) return;
  const failed = [];
  for (const payload of queue) {
    try {
      await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1"}/operations/kot`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, outletId }) }
      );
    } catch (_) {
      failed.push(payload);
    }
  }
  saveKotQueue(failed);
}

// ── Active orders persistence ─────────────────────────────────────────────
const ORDERS_KEY = "pos_active_orders";

function loadSavedOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) || "null") || {};
  } catch { return {}; }
}

function saveOrdersToStorage(ordersMap) {
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(ordersMap));
  } catch (e) {
    console.warn("Could not persist orders:", e.message);
  }
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
  const [branchConfig,    setBranchConfig]    = useState(() => loadBranchConfig());
  const [outlet,          setOutlet]          = useState(null);
  const [tableAreas,      setTableAreas]      = useState(seedAreas);
  const [categories,      setCategories]      = useState(seedCategories);
  const [menuItems,       setMenuItems]       = useState(seedMenuItems);
  const [orders,          setOrders]          = useState(() => loadSavedOrders());
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [isOnline,        setIsOnline]        = useState(() => navigator.onLine);
  const [showPayment,     setShowPayment]     = useState(false);
  const [showSplitBill,   setShowSplitBill]   = useState(false);
  const [activeArea,      setActiveArea]      = useState(null);
  const [serviceMode,     setServiceMode]     = useState("dine-in");
  const [toast,           setToast]           = useState(null);
  const socketRef  = useRef(null);
  // Mirror of orders state for socket closures (avoids stale-closure problem)
  const ordersRef  = useRef({});

  // ── Shift state ───────────────────────────────────────────────────────────
  const [activeShift,      setActiveShift]      = useState(() => loadActiveShift());
  const [cashierName,      setCashierName]      = useState(null);
  const [activeCategory,   setActiveCategory]   = useState(null);
  const [showCashIn,       setShowCashIn]       = useState(false);
  const [showCashOut,      setShowCashOut]      = useState(false);
  const [showCloseShift,   setShowCloseShift]   = useState(false);
  const [showAdvanceOrder, setShowAdvanceOrder] = useState(false);
  const [counterTicketNum,   setCounterTicketNum]   = useState(() => {
    try { return parseInt(localStorage.getItem("pos_counter_ticket_num") || "1", 10); }
    catch { return 1; }
  });
  const [showCustomerForm,   setShowCustomerForm]   = useState(false);
  const [showSettings,       setShowSettings]       = useState(false);
  const [showPastOrders,     setShowPastOrders]     = useState(false);
  const [showOnlineOrders,   setShowOnlineOrders]   = useState(false);
  const [isSyncing,          setIsSyncing]          = useState(false);
  const [lastSyncedAt,       setLastSyncedAt]       = useState(() => {
    const s = localStorage.getItem("pos_last_synced");
    return s ? new Date(s) : null;
  });

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!branchConfig) return;   // wait — BranchSetupScreen handles this first
    async function bootstrap() {
      try {
        const outlets = await api.get("/outlets");
        const target  = outlets.find((o) => o.id === branchConfig.outletId)
                     || outlets.find((o) => o.code === branchConfig.outletCode)
                     || outlets[0];
        if (!target) return;

        setOutlet(target);

        const [cats, items, kitchenStations] = await Promise.all([
          api.get(`/menu/categories?outletId=${target.id}`).catch(() => []),
          api.get(`/menu/items?outletId=${target.id}`).catch(() => []),
          api.get("/kitchen-stations").catch(() => [])
        ]);

        // Store kitchen stations for POS Settings printer tab
        if (kitchenStations.length) {
          localStorage.setItem("pos_kitchen_stations", JSON.stringify(kitchenStations));
        }

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
        const apiMap     = Object.fromEntries(liveOrders.map((o) => [o.tableId, o]));

        // Merge strategy: server is now the authoritative source because every item-add
        // and item-reconcile writes to the backend. Server state wins for all tables it
        // knows about. The only exception is offline-added items (sentToKot: false) that
        // were written to localStorage but not yet acknowledged by the server (e.g., the
        // device was offline when the cashier tapped menu items). Those are appended on
        // top of the server state by matching item IDs — if the server already has an item
        // with the same ID it was written successfully and the local copy is dropped.
        setOrders((prev) => {
          const merged = { ...apiMap };
          Object.entries(prev).forEach(([tableId, savedOrder]) => {
            const serverOrder = apiMap[tableId];
            if (!serverOrder) {
              // Server doesn't know this table at all (offline-only order) — keep local
              merged[tableId] = savedOrder;
              return;
            }
            // Server knows this table: server wins for metadata and sentToKot items.
            // Append any unsent local items whose IDs are absent from the server state
            // (items that were added offline and never reached the backend write path).
            const serverItemIds = new Set((serverOrder.items || []).map((i) => i.id));
            const localOnlyUnsent = (savedOrder?.items || []).filter(
              (li) => !li.sentToKot && !serverItemIds.has(li.id)
            );
            if (localOnlyUnsent.length > 0) {
              merged[tableId] = {
                ...serverOrder,
                items: [...(serverOrder.items || []), ...localOnlyUnsent]
              };
            }
            // else: merged[tableId] already has the server order — nothing to add
          });
          return ensureOrders(
            merged,
            target.tables?.length ? buildAreasFromOutlet(target) : seedAreas,
            target.name
          );
        });

        const socketUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1")
          .replace("/api/v1", "");
        const socket = io(socketUrl, { query: { outletId: target.id } });
        socketRef.current = socket;

        socket.on("order:updated", (updatedOrder) => {
          setOrders((prev) => {
            const next = { ...prev, [updatedOrder.tableId]: updatedOrder };
            saveOrdersToStorage(next);
            return next;
          });
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

        // ── Auto-sync when Owner Web changes menu / stations ──────────────────
        socket.on("sync:config", () => {
          syncMenuData(target.id);
        });

        // ── When a new device (Captain App / KDS) joins the outlet room,
        //    broadcast all current active orders so they get correct table state ──
        socket.on("request:order-sync", () => {
          const current = ordersRef.current;
          Object.values(current).forEach((order) => {
            if (order.items?.length > 0 && !order.isClosed) {
              socket.emit("order:update", { outletId: target.id, order });
            }
          });
        });

      } catch (err) {
        console.error("POS bootstrap failed (offline?):", err.message);
        // Restore last known orders from localStorage so no active table is lost
        setOrders((prev) =>
          ensureOrders(
            Object.keys(prev).length ? prev : loadSavedOrders(),
            tableAreas,
            outlet?.name || "Outlet"
          )
        );
      }
    }

    bootstrap();
    return () => { socketRef.current?.disconnect(); };
  }, [branchConfig]);

  // ── Menu sync (called by socket event OR manual Sync button) ─────────────
  async function syncMenuData(outletId) {
    if (!outletId && !outlet?.id) return;
    const id = outletId || outlet.id;
    setIsSyncing(true);
    try {
      const [cats, items, stations] = await Promise.all([
        api.get(`/menu/categories?outletId=${id}`).catch(() => null),
        api.get(`/menu/items?outletId=${id}`).catch(() => null),
        api.get("/kitchen-stations").catch(() => null),
      ]);
      if (cats)    setCategories(cats);
      if (items)   setMenuItems(items.map((i) => ({ ...i, price: parsePriceNumber(i.basePrice || i.price) })));
      if (stations?.length) {
        localStorage.setItem("pos_kitchen_stations", JSON.stringify(stations));
      }
      const now = new Date();
      setLastSyncedAt(now);
      localStorage.setItem("pos_last_synced", now.toISOString());
      showToast("Menu synced ✓");
    } catch (err) {
      showToast("Sync failed — check connection");
      console.error("[sync]", err.message);
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    setOrders((prev) => ensureOrders(prev, tableAreas, outlet?.name || "Outlet"));
  }, [tableAreas, outlet]);

  // Auto-save every order change to localStorage — belt-and-suspenders
  useEffect(() => {
    if (Object.keys(orders).length > 0) saveOrdersToStorage(orders);
    ordersRef.current = orders; // keep ref in sync for socket callbacks
  }, [orders]);

  // Persist counter ticket number across refreshes
  useEffect(() => {
    localStorage.setItem("pos_counter_ticket_num", String(counterTicketNum));
  }, [counterTicketNum]);

  // Track online / offline + flush queued KOTs when connection returns
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      flushKotQueue(outlet?.id).catch(() => {});
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [outlet]);

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

  async function handleAddItem(item) {
    if (!selectedTableId) return;
    const tableId = selectedTableId;

    // Generate the item ID here so local state and the backend record use the same ID.
    // This makes the reconcile step safe: when we apply the server response we can
    // identify which items are already tracked server-side by ID (no phantom duplicates).
    const itemId = `item-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

    // 1. Optimistic local update — keeps the UI instant regardless of network latency.
    //    Backend also consolidates by menuItemId (increments existing unsent line), so
    //    if the cashier taps the same item twice the qty in both states stays in sync.
    mutateOrder(tableId, (order) => {
      const existing = order.items.findIndex((i) => i.menuItemId === item.id && !i.sentToKot);
      if (existing >= 0) {
        order.items[existing].quantity += 1;
      } else {
        order.items.push({
          id:         itemId,
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

    // 2. Persist to backend and reconcile with server response.
    //    Counter/takeaway tickets (tableId starts with "counter-") have no backend table
    //    entry — the handler returns { ok: true, skipped: true } and we keep local state.
    if (tableId.startsWith("counter-") || tableId.startsWith("online-")) return;

    try {
      const serverOrder = await api.post("/operations/order/item", {
        tableId,
        outletId: outlet?.id,
        item: {
          id:         itemId,   // shared ID — server stores this exact value
          menuItemId: item.id,
          name:       item.name,
          price:      parsePriceNumber(item.price || item.basePrice),
          quantity:   1,
          note:       ""
        }
      });

      if (serverOrder && !serverOrder.skipped) {
        // 3. Reconcile: apply server state as the source of truth.
        //    Any unsent local items whose IDs are absent from the server response are
        //    offline-added items that haven't been acknowledged yet — keep them.
        setOrders((prev) => {
          const localOrder = prev[tableId];
          if (!localOrder) return prev;
          const serverItemIds = new Set((serverOrder.items || []).map((i) => i.id));
          const localOnlyUnsent = (localOrder.items || []).filter(
            (li) => !li.sentToKot && !serverItemIds.has(li.id)
          );
          return {
            ...prev,
            [tableId]: {
              ...serverOrder,
              items: [...(serverOrder.items || []), ...localOnlyUnsent]
            }
          };
        });
      }
    } catch (err) {
      // Offline or server unreachable — local optimistic state is intact, no data lost.
      // Items will reach the server when the connection returns (or at KOT send time).
      console.warn("[POS] item-add to backend failed (offline?):", err.message);
    }
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
    const unsent = (order.items || []).filter((i) => !i.sentToKot && !i.isVoided);
    if (!unsent.length) { showToast("No new items to send"); return; }

    // ── 1. Mark items as sent ─────────────────────────────────────────────
    // Build a KOT sequence number (increment per order)
    const kotSeq = (order.kotCount || 0) + 1;
    mutateOrder(selectedTableId, (o) => {
      o.items    = o.items.map((i) => ({ ...i, sentToKot: true }));
      o.kotCount = kotSeq;
      return o;
    });

    // ── 2. Group unsent items by kitchen station ──────────────────────────
    // Built here so it is shared by both the print block and the API block below.
    // item.station is set when menu items carry station assignments from the kitchen
    // catalog. Today that field is not yet populated, so every item falls into
    // "__default__" and we get one group — identical to the previous single-call
    // behavior. When items gain station assignments (next slice), this grouping
    // automatically produces per-station KOTs for both printing and backend.
    const stationGroups = {};
    unsent.forEach(item => {
      const st = item.station || "__default__";
      if (!stationGroups[st]) stationGroups[st] = [];
      stationGroups[st].push(item);
    });

    // ── 3. Print KOT — one ticket per station group ───────────────────────
    if (kotAutoSendEnabled()) {
      Object.entries(stationGroups).forEach(([stationName, stItems]) => {
        const printer = stationName === "__default__"
          ? getKotPrinter()
          : getKotPrinterForStation(stationName);
        printKOT(order, stItems, printer, kotSeq);
      });
    }

    const printer = getKotPrinter();
    const printerLabel = printer ? ` → ${printer.name}` : "";
    showToast(`🖨️ KOT #${kotSeq} printed${printerLabel}`);

    // ── 4. Send to backend — one API call per station group ───────────────
    // Passing stationName per group means each KOT object on the backend (and
    // therefore each KDS ticket) carries the correct station for filtering.
    // For the "__default__" group stationName is omitted; the backend defaults
    // to "Main Kitchen". Counter/online orders queue offline like before.
    let lastServerOrder = null;
    for (const [stationKey, stItems] of Object.entries(stationGroups)) {
      const kotPayload = {
        outletId:    outlet?.id,
        orderId:     order.id,
        tableId:     order.tableId,
        tableNumber: order.tableNumber,
        kotNumber:   `KOT-${String(kotSeq).padStart(4,"0")}`,
        areaName:    order.areaName,
        // stationName is the station name string for real groups, undefined for
        // the "__default__" fallback (items with no station assignment).
        stationName: stationKey === "__default__" ? undefined : stationKey,
        items:       stItems
      };
      try {
        // Response: { kot, order? }
        const result = await api.post("/operations/kot", kotPayload);
        if (result?.order) lastServerOrder = result.order;
      } catch (err) {
        // Offline or server unreachable — queue for retry when connection returns
        const queue = loadKotQueue();
        queue.push(kotPayload);
        saveKotQueue(queue);
        console.warn("KOT queued (offline):", kotPayload.kotNumber);
      }
    }

    // Reconcile from the last server response (most up-to-date order state).
    // All items across all station groups are sentToKot: true on the server by
    // this point. Unsent local items absent from the server response are kept.
    if (lastServerOrder && !order.tableId.startsWith("counter-") && !order.tableId.startsWith("online-")) {
      setOrders((prev) => {
        const localOrder = prev[order.tableId];
        if (!localOrder) return prev;
        const serverItemIds = new Set((lastServerOrder.items || []).map((i) => i.id));
        const localOnlyUnsent = (localOrder.items || []).filter(
          (li) => !li.sentToKot && !serverItemIds.has(li.id)
        );
        return {
          ...prev,
          [order.tableId]: {
            ...lastServerOrder,
            items: [...(lastServerOrder.items || []), ...localOnlyUnsent]
          }
        };
      });
    }

    // ── 4. Return to table view after KOT sent ────────────────────────────
    setSelectedTableId(null);
  }

  function handleReprintKOT() {
    if (!selectedTableId) return;
    const order = orders[selectedTableId];
    const sentItems = (order.items || []).filter(i => i.sentToKot && !i.isVoided);
    if (!sentItems.length) { showToast("No items sent yet"); return; }
    const printer = getKotPrinter();
    printKOT(order, sentItems, printer, order.kotCount || 1);
    showToast(`🖨️ KOT reprinted → ${printer?.name || "Kitchen"}`);
  }

  async function handleRequestBill() {
    if (!selectedTableId) return;
    const tableId = selectedTableId;

    // 1. Optimistic local update — instant UI
    mutateOrder(tableId, (order) => {
      order.billRequested   = true;
      order.billRequestedAt = new Date().toISOString();
      return order;
    });
    showToast("Bill requested");

    // 2. Persist to backend and reconcile
    //    Response: { ok: true, order? }
    if (!tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
      try {
        const result = await api.post("/operations/bill-request", { outletId: outlet?.id, tableId });
        if (result?.order) {
          setOrders((prev) => ({
            ...prev,
            [tableId]: result.order
          }));
        }
      } catch (err) {
        console.warn("[POS] bill-request sync failed (offline?):", err.message);
      }
    }
  }

  async function handleSettle(paymentsInput) {
    if (!selectedTableId) return;
    const order       = orders[selectedTableId];
    const tableId     = selectedTableId;
    const newPayments = Array.isArray(paymentsInput) ? paymentsInput : [paymentsInput];

    // Build the fully-paid order snapshot
    const allPayments = [...(order.payments || []), ...newPayments];
    const subtotal    = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const disc        = Math.min(order.discountAmount || 0, subtotal);
    const total       = Math.round((subtotal - disc) * 1.05);
    const paid        = allPayments.reduce((s, p) => s + p.amount, 0);

    if (paid < total) {
      // Partial — record locally (optimistic) then fire-and-forget sync to backend.
      mutateOrder(tableId, (o) => { o.payments = allPayments; return o; });
      setShowPayment(false);
      showToast(`Payment recorded · ₹${newPayments.reduce((s,p)=>s+p.amount,0)}`);

      // Backend payment sync (fire-and-forget so the PaymentSheet loading state clears instantly).
      // Counter/online orders have no backend table entry — skip.
      if (!tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
        (async () => {
          let lastServerOrder = null;
          for (const p of newPayments) {
            try {
              const result = await api.post("/operations/payment", {
                outletId:  outlet?.id,
                tableId,
                method:    p.method,
                label:     p.label || String(p.method || "cash").toUpperCase(),
                amount:    p.amount,
                reference: p.reference
              });
              if (result?.order) lastServerOrder = result.order;
            } catch (err) {
              console.warn("[POS] partial payment sync failed (offline?):", err.message);
            }
          }
          // Reconcile from the last server response — server payment totals are authoritative.
          if (lastServerOrder) {
            setOrders((prev) => ({ ...prev, [tableId]: lastServerOrder }));
          }
        })();
      }
      return;
    }

    // ── Full settlement ───────────────────────────────────────────────────
    const closedOrder = {
      ...structuredClone(order),
      payments: allPayments,
      isClosed: true,
      closedAt: new Date().toISOString(),
    };

    // 1. Save to pos_closed_orders in localStorage
    try {
      const prev = JSON.parse(localStorage.getItem("pos_closed_orders") || "[]");
      prev.unshift(closedOrder);
      // Keep last 500 orders
      localStorage.setItem("pos_closed_orders", JSON.stringify(prev.slice(0, 500)));
    } catch {}

    // 2. Temporarily mark as closed so UI shows ✓ for 1.5 s
    setOrders(prev => ({ ...prev, [tableId]: closedOrder }));
    // Notify Captain App that this table's bill is settled
    socketRef.current?.emit("order:update", { outletId: outlet?.id, order: closedOrder });

    // Each POST /operations/payment now persists the payment to the backend order state.
    // We do NOT reconcile local state from these responses because the table is already
    // showing as closed (isClosed: true set above). The 1.5 s reset handles the fresh-order
    // transition client-side; the backend reset is handled by POST /operations/closed-order.
    for (const p of newPayments) {
      try {
        await api.post("/operations/payment", {
          outletId:  outlet?.id,
          tableId:   order.tableId,
          method:    p.method,
          label:     p.label || String(p.method || "cash").toUpperCase(),
          amount:    p.amount,
          reference: p.reference
        });
      } catch (err) {
        console.warn("[POS] full-settlement payment record failed (offline?):", err.message);
      }
    }

    // 3. Push full closed order to backend so Owner Web shows real sales figures.
    // This is also the gate for the fresh-table reset: clearTableAfterSettle runs
    // server-side inside deviceCloseOrderHandler. We only reset the POS slot and
    // broadcast "fresh table" to Captain AFTER the backend confirms the order is
    // recorded and its in-memory slot has been cleared. If the call fails, the
    // table stays isClosed: true on both POS and Captain — consistent with the
    // backend still holding the old order — so no device disagrees about state.
    let backendConfirmed = false;
    try {
      await api.post("/operations/closed-order", {
        outletId: outlet?.id,
        order:    closedOrder,
      });
      backendConfirmed = true;
    } catch (err) {
      console.error("Closed-order sync failed:", err.message);
    }

    setShowPayment(false);
    setSelectedTableId(null);
    showToast(
      backendConfirmed
        ? "✓ Bill settled · Table is ready"
        : "✓ Bill settled · Table will reset once connection restores"
    );

    // Reset the table to a fresh blank order only when the backend confirmed the
    // close. The socket broadcast of the fresh order is also gated here so Captain
    // and POS always transition to "fresh" together — never ahead of the backend.
    if (backendConfirmed) {
      setTimeout(() => {
        setOrders(prev => {
          const area = tableAreas.find(a => a.tables.some(t => t.id === tableId));
          const table = area?.tables.find(t => t.id === tableId);
          if (!table || !area) return prev;
          const maxNum = Math.max(10050, ...Object.values(prev).map(o => o.orderNumber || 10050)) + 1;
          const fresh  = buildBlankOrder(table, area, outlet?.name || "Outlet", maxNum);
          // Broadcast blank order so Captain App clears the table immediately
          socketRef.current?.emit("order:update", { outletId: outlet?.id, order: fresh });
          return { ...prev, [tableId]: fresh };
        });
      }, 1500);
    }
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

  // ── Select table (dine-in) ─────────────────────────────────────────────────
  // 1. Sets selectedTableId immediately so the order panel opens without waiting.
  // 2. Calls GET /operations/order?tableId=... to get or create the backend order.
  // 3. Reconciles: server state is authoritative; any unsent local items the server
  //    does not know (offline-added) are appended on top.
  // Counter/takeaway/online tickets are skipped — they have no backend table entry.
  async function handleSelectTable(tableId) {
    setSelectedTableId(tableId);

    if (!tableId || !outlet?.id) return;
    if (tableId.startsWith("counter-") || tableId.startsWith("online-")) return;

    try {
      const serverOrder = await api.get(`/operations/order?tableId=${tableId}&outletId=${outlet.id}`);
      if (!serverOrder || serverOrder.skipped) return;

      setOrders((prev) => {
        const localOrder = prev[tableId];
        // Preserve unsent local items whose IDs are absent from server state (offline adds)
        const serverItemIds = new Set((serverOrder.items || []).map((i) => i.id));
        const localOnlyUnsent = (localOrder?.items || []).filter(
          (li) => !li.sentToKot && !serverItemIds.has(li.id)
        );
        return {
          ...prev,
          [tableId]: {
            ...serverOrder,
            items: [...(serverOrder.items || []), ...localOnlyUnsent]
          }
        };
      });
    } catch (err) {
      // Offline or server unreachable — keep local state, no data lost
      console.warn("[POS] table fetch failed (offline?):", err.message);
    }
  }

  // ── Hold order ────────────────────────────────────────────────────────────
  function handleHoldToggle() {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, o => {
      o.isOnHold = !o.isOnHold;
      return o;
    });
    const isNowHeld = !orders[selectedTableId]?.isOnHold;
    showToast(isNowHeld ? "Order put on hold" : "Order resumed");
  }

  // ── Transfer table ─────────────────────────────────────────────────────────
  function handleTransferTable(toTableId) {
    if (!selectedTableId || !toTableId || selectedTableId === toTableId) return;
    setOrders(prev => {
      const fromOrder = prev[selectedTableId];
      const toOrder   = prev[toTableId];
      if (!fromOrder || !toOrder) return prev;
      const next = { ...prev };
      // Move order items/data to new table
      next[toTableId]     = { ...fromOrder, tableId: toTableId, tableNumber: toOrder.tableNumber, areaName: toOrder.areaName };
      // Clear the from-table
      next[selectedTableId] = { ...toOrder, items: [], payments: [], discountAmount: 0,
        billRequested: false, isOnHold: false, isClosed: false };
      return next;
    });
    setSelectedTableId(toTableId);
    showToast(`Order transferred to Table ${orders[toTableId]?.tableNumber || toTableId}`);
  }

  // ── Edit payment on closed order ─────────────────────────────────────────
  function handleEditPayment(order, newPayments) {
    setOrders(prev => {
      const updated = { ...prev };
      const key = Object.keys(updated).find(k => updated[k]?.orderNumber === order.orderNumber);
      if (!key) return prev;
      updated[key] = {
        ...updated[key],
        payments: newPayments.map(p => ({ method: p.method, amount: p.amount })),
        paymentCorrectedAt: new Date().toISOString()
      };
      return updated;
    });
    showToast("Payment method corrected ✓");
  }

  // ── Accept online order → auto-create order + KOT ─────────────────────────
  function handleAcceptOnlineOrder(onlineOrder) {
    const ticketId  = `online-${Date.now()}`;
    const area      = { id: "online", name: onlineOrder.platform };
    const fakeTable = { id: ticketId, number: onlineOrder.orderId };
    const orderNum  = Math.max(10050, ...Object.values(orders).map(o => o.orderNumber || 10050)) + 1;

    const posItems = onlineOrder.items.map((item, i) => ({
      id:         `item-${Date.now()}-${i}`,
      menuItemId: `online-${i}`,
      name:       item.name,
      price:      item.price,
      quantity:   item.quantity,
      sentToKot:  true,   // auto-sent
      note:       onlineOrder.notes || ""
    }));

    const newOrder = {
      ...buildBlankOrder(fakeTable, area, outlet?.name || "Outlet", orderNum),
      isCounter:      true,
      isOnlineOrder:  true,
      onlinePlatform: onlineOrder.platform,
      onlineOrderId:  onlineOrder.orderId,
      ticketNumber:   onlineOrder.orderId,
      items:          posItems,
      customer:       onlineOrder.customer,
      billRequested:  true,
      billRequestedAt: new Date().toISOString(),
    };

    setOrders(prev => ({ ...prev, [ticketId]: newOrder }));
    setSelectedTableId(ticketId);
    setShowOnlineOrders(false);

    // Post KOT to kitchen
    api.post("/operations/kot", {
      outletId:    outlet?.id,
      tableId:     ticketId,
      tableNumber: onlineOrder.orderId,
      items:       posItems
    }).catch(() => {});

    showToast(`✓ ${onlineOrder.platform} order accepted · KOT sent`);
  }

  // ── Customer details ──────────────────────────────────────────────────────
  function handleSaveCustomer(data) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, o => { o.customer = data; return o; });
    setShowCustomerForm(false);
    showToast("Customer details saved");
  }

  // ── Print bill ────────────────────────────────────────────────────────────
  function handlePrintBill() {
    if (!selectedTableId) return;
    const order = orders[selectedTableId];
    if (!order?.items?.length) { showToast("No items to print"); return; }
    printBill(order, order.items, outlet?.name || branchConfig?.outletName);
    showToast("🖨️ Printing bill…");
    setSelectedTableId(null);
  }

  // ── Order note ────────────────────────────────────────────────────────────
  function handleOrderNoteChange(note) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, o => { o.orderNote = note; return o; });
  }

  // ── Comp item toggle ──────────────────────────────────────────────────────
  function handleCompToggle(idx) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, o => {
      if (o.items[idx]) o.items[idx].isComp = !o.items[idx].isComp;
      return o;
    });
  }

  // ── Void item ─────────────────────────────────────────────────────────────
  function handleVoidItem(idx, reason) {
    if (!selectedTableId) return;
    mutateOrder(selectedTableId, o => {
      if (o.items[idx]) {
        o.items[idx].isVoided   = true;
        o.items[idx].voidReason = reason;
        o.items[idx].sentToKot  = true; // treat as sent so it can't be re-sent
      }
      return o;
    });
    showToast("Item voided");
  }

  // ── Shift callbacks ───────────────────────────────────────────────────────
  function handleShiftStarted(shift) {
    setActiveShift(shift);
    // Sync to backend so Owner Web console can see live shift
    api.post("/shifts/open", { shift }).catch(err => console.error("Shift open sync failed:", err.message));
  }

  function handleMovementSaved(movement, updatedShift) {
    setActiveShift(updatedShift || activeShift);
    showToast(`${movement.type === "in" ? "Cash In" : "Cash Out"} · ₹${movement.amount}`);
    // Sync cash movement to backend
    api.post("/shifts/movement", { movement }).catch(err => console.error("Movement sync failed:", err.message));
  }

  function handleShiftClosed(closedShift) {
    setActiveShift(null);
    setSelectedTableId(null);
    showToast("Shift closed");
    // Sync closed shift to backend so Owner Web shows the reconciliation
    if (closedShift) {
      api.post("/shifts/close", { shift: closedShift }).catch(err => console.error("Shift close sync failed:", err.message));
    }
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

  // ── POS Login (no cashier selected) ───────────────────────────────────────
  // ── Branch setup gate (first launch) ─────────────────────────────────────
  if (!branchConfig) {
    return (
      <BranchSetupScreen
        onComplete={(cfg) => setBranchConfig(cfg)}
      />
    );
  }

  if (!cashierName) {
    return <PosLogin outletName={outlet?.name || branchConfig.outletName} onLogin={name => setCashierName(name)} />;
  }

  // ── Shift Gate (cashier logged in, no active shift) ────────────────────────
  if (!activeShift) {
    return (
      <ShiftGate
        outletName={outlet?.name}
        cashierName={cashierName}
        onShiftStarted={handleShiftStarted}
      />
    );
  }

  // ── Quick stats ───────────────────────────────────────────────────────────
  const onlineOrders = (() => {
    try { return (JSON.parse(localStorage.getItem("pos_online_orders") || "[]") || []).filter(o => o.status === "pending"); }
    catch { return []; }
  })();
  const openTables = Object.values(orders).filter(o => o.items?.length && !o.isClosed && !o.isOnHold).length;
  const pendingKOT = Object.values(orders).reduce((s, o) => s + (o.items || []).filter(i => !i.sentToKot && !i.isVoided).length, 0);

  // ─── Main POS UI ──────────────────────────────────────────────────────────
  return (
    <div className="pos-shell">

      {/* ── Offline banner ───────────────────────────────────────────────── */}
      {!isOnline && (
        <div className="pos-offline-banner">
          {(() => {
            const q = loadKotQueue().length;
            return q > 0
              ? `📡 Offline — ${q} KOT${q > 1 ? "s" : ""} queued, will sync when connection returns. Printing unaffected.`
              : "📡 No internet — operating on local network. Orders & printing unaffected.";
          })()}
        </div>
      )}

      {/* ── Row 1: Brand bar ─────────────────────────────────────────────── */}
      <div className="pos-brand-bar">
        {/* Brand */}
        <div className="pbb-brand">
          <span className="pbb-icon">🍽</span>
          <div>
            <div className="pbb-name">{outlet?.name || "Restaurant OS"}</div>
            <div className="pbb-sub">POS Terminal</div>
          </div>
        </div>

        {/* Service mode pills */}
        <div className="pbb-modes">
          {SERVICE_MODES.map((m) => (
            <button key={m.id} type="button"
              className={`pbb-mode-pill${serviceMode === m.id ? " active" : ""}`}
              onClick={() => { setServiceMode(m.id); setSelectedTableId(null); }}>
              {m.id === "dine-in" ? "🪑" : m.id === "takeaway" ? "🛍" : "🛵"} {m.label}
            </button>
          ))}
        </div>

        {/* Right: cashier + clock */}
        <div className="pbb-right">
          <div className="pbb-cashier-chip">
            <div className="pbb-avatar">{cashierName?.[0]}</div>
            <div>
              <div className="pbb-cashier-name">{activeShift.cashier}</div>
              <div className="pbb-session">{activeShift.session}</div>
            </div>
          </div>
          <Clock />
        </div>
      </div>

      {/* ── Row 2: Action toolbar ─────────────────────────────────────────── */}
      <div className="pos-action-bar">
        {/* Left group: order actions */}
        <div className="pab-group">
          <button type="button" className="pab-btn orange"
            onClick={() => setShowOnlineOrders(true)}>
            <span className="pab-icon">📦</span>
            <span className="pab-label">Online Orders</span>
            {onlineOrders.length > 0 && (
              <span className="pab-badge">{onlineOrders.length}</span>
            )}
          </button>
          <button type="button" className="pab-btn blue"
            onClick={() => setShowPastOrders(true)}>
            <span className="pab-icon">📋</span>
            <span className="pab-label">Past Orders</span>
          </button>
          <button type="button" className="pab-btn purple"
            onClick={() => setShowAdvanceOrder(true)}>
            <span className="pab-icon">📅</span>
            <span className="pab-label">Advance</span>
          </button>
          <button type="button" className="pab-btn teal"
            onClick={() => selectedTableId ? setShowCustomerForm(true) : showToast("Select a table first")}>
            <span className="pab-icon">👤</span>
            <span className="pab-label">Customer</span>
          </button>
        </div>

        {/* Center: quick stats */}
        <div className="pab-stats">
          <div className="pab-stat">
            <span className="pab-stat-val">{openTables}</span>
            <span className="pab-stat-lbl">Open Tables</span>
          </div>
          <div className="pab-stat-divider" />
          <div className="pab-stat">
            <span className={`pab-stat-val${pendingKOT > 0 ? " warn" : ""}`}>{pendingKOT}</span>
            <span className="pab-stat-lbl">Pending KOT</span>
          </div>
        </div>

        {/* Right group: shift actions */}
        <div className="pab-group">
          <button type="button" className="pab-btn green"
            onClick={() => setShowCashIn(true)}>
            <span className="pab-icon">↑</span>
            <span className="pab-label">Cash In</span>
          </button>
          <button type="button" className="pab-btn red"
            onClick={() => setShowCashOut(true)}>
            <span className="pab-icon">↓</span>
            <span className="pab-label">Cash Out</span>
          </button>
          <button type="button" className={`pab-btn cyan${isSyncing ? " syncing" : ""}`}
            onClick={() => syncMenuData()}
            title={lastSyncedAt ? `Last synced: ${lastSyncedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}` : "Sync menu from server"}
            disabled={isSyncing}>
            <span className="pab-icon">{isSyncing ? "⏳" : "🔄"}</span>
            <span className="pab-label">{isSyncing ? "Syncing…" : "Sync"}</span>
          </button>
          <button type="button" className="pab-btn gray"
            onClick={() => setShowSettings(true)}>
            <span className="pab-icon">⚙️</span>
            <span className="pab-label">Settings</span>
          </button>
          <button type="button" className="pab-btn dark"
            onClick={() => setShowCloseShift(true)}>
            <span className="pab-icon">⏹</span>
            <span className="pab-label">End Shift</span>
          </button>
          <button type="button" className="pab-btn logout-btn"
            onClick={() => { setCashierName(null); setActiveShift(null); setSelectedTableId(null); }}
            title="Logout">
            <span className="pab-icon">⏻</span>
          </button>
        </div>
      </div>

      {/* ── Left: Category Sidebar ───────────────────────────────────────── */}
      <div className="pos-left">
        <CategorySidebar
          categories={categories}
          menuItems={menuItems}
          activeCategory={activeCategory || categories[0]?.name}
          onSelect={setActiveCategory}
          outletName={outlet?.name}
        />
      </div>

      {/* ── Center: Menu Items ───────────────────────────────────────────── */}
      <div className="pos-center">
        <MenuPanel
          categories={categories}
          menuItems={menuItems}
          activeCategory={activeCategory || categories[0]?.name}
          onAddItem={handleAddItem}
        />
      </div>

      {/* ── Right: Table Picker or Order Panel ───────────────────────────── */}
      <div className="pos-right">
        {!selectedTableId ? (
          <TablePickerPanel
            tableAreas={tableAreas}
            orders={orders}
            onSelectTable={handleSelectTable}
            serviceMode={serviceMode}
            onNewCounterOrder={handleNewCounterOrder}
          />
        ) : (
        <OrderPanel
          order={selectedOrder}
          tableLabel={tableLabel}
          tableAreas={tableAreas}
          orders={orders}
          onChangeQty={handleChangeQty}
          onRemoveItem={handleRemoveItem}
          onNoteChange={handleNoteChange}
          onSendKOT={handleSendKOT}
          onRequestBill={handleRequestBill}
          onOpenPayment={() => setShowPayment(true)}
          onOpenSplitBill={() => setShowSplitBill(true)}
          onGuestsChange={handleGuestsChange}
          onDiscountChange={handleDiscountChange}
          onHoldToggle={handleHoldToggle}
          onTransferTable={handleTransferTable}
          onOrderNoteChange={handleOrderNoteChange}
          onCompToggle={handleCompToggle}
          onVoidItem={handleVoidItem}
          onReprintKOT={handleReprintKOT}
          onPrintBill={handlePrintBill}
        />
        )}
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

      {/* ── Advance Order modal ───────────────────────────────────────────── */}
      {showAdvanceOrder && (
        <AdvanceOrderModal
          onClose={() => setShowAdvanceOrder(false)}
          onSaved={() => showToast("Advance order booked ✓")}
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

      {/* ── Past Orders modal ─────────────────────────────────────────────── */}
      {showPastOrders && (
        <PastOrdersModal
          orders={orders}
          onClose={() => setShowPastOrders(false)}
          onEditPayment={handleEditPayment}
        />
      )}

      {/* ── Online Orders panel ───────────────────────────────────────────── */}
      {showOnlineOrders && (
        <OnlineOrdersPanel
          onAccept={handleAcceptOnlineOrder}
          onClose={() => setShowOnlineOrders(false)}
        />
      )}

      {/* ── Customer Form modal ───────────────────────────────────────────── */}
      {showCustomerForm && (
        <CustomerFormModal
          order={selectedOrder}
          serviceMode={serviceMode}
          onSave={handleSaveCustomer}
          onClose={() => setShowCustomerForm(false)}
        />
      )}

      {/* ── POS Settings modal ────────────────────────────────────────────── */}
      {showSettings && (
        <PosSettingsModal
          cashierName={cashierName}
          activeShift={activeShift}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="pos-toast" role="status">{toast}</div>
      )}
    </div>
  );
}
