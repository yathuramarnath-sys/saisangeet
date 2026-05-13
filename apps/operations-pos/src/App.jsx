import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import { UpdateBanner, APP_VERSION } from "./components/UpdateBanner";
import { MenuPanel }          from "./components/MenuPanel";
import { OrderPanel }         from "./components/OrderPanel";
import { PaymentSheet }       from "./components/PaymentSheet";
import { SplitBillSheet }     from "./components/SplitBillSheet";
import { ShiftGate }          from "./components/ShiftGate";
import { CashMovementModal, CloseShiftModal } from "./components/ShiftModals";
import { AdvanceOrderModal }  from "./components/AdvanceOrderModal";
import { AdvanceOrdersPanel } from "./components/AdvanceOrdersPanel";
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
import { PhonePeQRModal }     from "./components/PhonePeQRModal";
import { areas as seedAreas, categories as seedCategories, menuItems as seedMenuItems } from "./data/pos.seed";
import { api } from "./lib/api";
import { printKOT, getKotPrinter, getKotPrinterForStation, kotAutoSendEnabled } from "./lib/kotPrint";
import { printBill } from "./lib/printBill";
import { openCashDrawer, hasCashPayment } from "./lib/cashDrawer";
import { setItemAvailability } from "../../../packages/shared-types/src/stockAvailability.js";

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
  // Auth token is required — without it the server returns 401 and the KOT stays stuck
  const token = localStorage.getItem("pos_token") || "";
  const failed = [];
  for (const payload of queue) {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1"}/operations/kot`,
        {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ ...payload, outletId }),
        }
      );
      // Only discard if server confirmed receipt — re-queue on any HTTP error
      if (!resp.ok) failed.push(payload);
    } catch (_) {
      failed.push(payload);
    }
  }
  saveKotQueue(failed);
}

// ── Closed-order offline queue ────────────────────────────────────────────
// When the server is unreachable at settle-time, the closed order is queued
// here and flushed automatically when connectivity returns.
// This ensures the owner dashboard and backend records are never permanently
// missing a sale just because the internet dropped during billing.
const CLOSED_QUEUE_KEY = "pos_closed_order_queue";

function loadClosedOrderQueue() {
  try { return JSON.parse(localStorage.getItem(CLOSED_QUEUE_KEY) || "[]"); }
  catch { return []; }
}
function saveClosedOrderQueue(queue) {
  try { localStorage.setItem(CLOSED_QUEUE_KEY, JSON.stringify(queue)); } catch (_) {}
}

async function flushClosedOrderQueue(outletId) {
  const queue = loadClosedOrderQueue();
  if (!queue.length) return;
  const token = localStorage.getItem("pos_token") || "";
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";
  const failed = [];
  for (const payload of queue) {
    try {
      const resp = await fetch(`${apiBase}/operations/closed-order`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...payload, outletId }),
      });
      if (!resp.ok) failed.push(payload);
    } catch (_) {
      failed.push(payload);
    }
  }
  saveClosedOrderQueue(failed);
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

// ── Offline menu / config cache ───────────────────────────────────────────
// Saved on every successful bootstrap or sync so the POS can start fully
// functional even when the server is unreachable (power cut, no internet).
const CACHE_OUTLET      = "pos_cache_outlet";
const CACHE_CATEGORIES  = "pos_cache_categories";
const CACHE_MENU_ITEMS  = "pos_cache_menu_items";
const CACHE_TABLE_AREAS = "pos_cache_table_areas";

function saveConfigCache({ outlet, categories, menuItems, tableAreas }) {
  try {
    if (outlet)     localStorage.setItem(CACHE_OUTLET,      JSON.stringify(outlet));
    if (categories?.length) localStorage.setItem(CACHE_CATEGORIES,  JSON.stringify(categories));
    if (menuItems?.length)  localStorage.setItem(CACHE_MENU_ITEMS,   JSON.stringify(menuItems));
    if (tableAreas?.length) localStorage.setItem(CACHE_TABLE_AREAS,  JSON.stringify(tableAreas));
  } catch (e) { console.warn("[cache] save failed:", e.message); }
}

function loadConfigCache() {
  const parse = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
    catch { return fallback; }
  };
  return {
    outlet:     parse(CACHE_OUTLET,      null),
    categories: parse(CACHE_CATEGORIES,  []),
    menuItems:  parse(CACHE_MENU_ITEMS,  []),
    tableAreas: parse(CACHE_TABLE_AREAS, null),
  };
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
  const [kitchenStations, setKitchenStations] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pos_kitchen_stations") || "[]"); } catch { return []; }
  });
  const [orders,          setOrders]          = useState(() => loadSavedOrders());
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [isOnline,        setIsOnline]        = useState(() => navigator.onLine);
  const [showPayment,     setShowPayment]     = useState(false);
  const [showSplitBill,   setShowSplitBill]   = useState(false);
  const [activeArea,      setActiveArea]      = useState(null);
  const [serviceMode,     setServiceMode]     = useState("dine-in");
  const [toast,           setToast]           = useState(null);
  const socketRef      = useRef(null);   // cloud socket
  const localSocketRef = useRef(null);   // local WiFi socket (port 4001)
  // Mirror of orders state for socket closures (avoids stale-closure problem)
  const ordersRef  = useRef({});
  // Tracks socket connection state for reconnect-resync logic
  const socketConnRef = useRef("connecting"); // "connecting" | "live" | "offline"
  const [serverConn,  setServerConn]  = useState("connecting"); // for UI banner
  const [localConn,   setLocalConn]   = useState(false);        // local WiFi server status

  // ── Shift state ───────────────────────────────────────────────────────────
  const [activeShift,      setActiveShift]      = useState(() => loadActiveShift());
  const [cashierName,      setCashierName]      = useState(null);
  const [activeCategory,   setActiveCategory]   = useState(null);
  const [showCashIn,       setShowCashIn]       = useState(false);
  const [showCashOut,      setShowCashOut]      = useState(false);
  const [showCloseShift,   setShowCloseShift]   = useState(false);
  const [showAdvanceOrder, setShowAdvanceOrder] = useState(false); // legacy — replaced by panel
  const [showAdvancePanel, setShowAdvancePanel] = useState(false);
  const [counterTicketNum,   setCounterTicketNum]   = useState(() => {
    try { return parseInt(localStorage.getItem("pos_counter_ticket_num") || "1", 10); }
    catch { return 1; }
  });
  const [showCustomerForm,   setShowCustomerForm]   = useState(false);
  const [showSettings,       setShowSettings]       = useState(false);
  const [showPastOrders,     setShowPastOrders]     = useState(false);
  const [showOnlineOrders,    setShowOnlineOrders]    = useState(false);
  const [pendingOnlineCount,  setPendingOnlineCount]  = useState(0);
  const [onlineOrdersEnabled, setOnlineOrdersEnabled] = useState(() =>
    localStorage.getItem("pos_online_orders_enabled") !== "false"
  );
  const [showPhonePeQR,      setShowPhonePeQR]      = useState(false);
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

        // Store kitchen stations enriched with category NAMES as fallback for ID-type mismatches.
        // If category IDs in Owner Console were saved as a different type (string vs number),
        // the name fallback ensures routing still works.
        if (kitchenStations.length) {
          const catIdToName = {};
          cats.forEach(c => { catIdToName[String(c.id)] = c.name; });
          const enriched = kitchenStations.map(s => ({
            ...s,
            categoryNames: (s.categories || [])
              .map(id => catIdToName[String(id)])
              .filter(Boolean)
          }));
          localStorage.setItem("pos_kitchen_stations", JSON.stringify(enriched));
          setKitchenStations(enriched);
        }

        if (cats.length)  setCategories(cats);
        if (items.length) {
          setMenuItems(items.map((i) => ({
            ...i,
            price: parsePriceNumber(i.basePrice || i.price)
          })));
        }

        const builtAreas = target.tables?.length ? buildAreasFromOutlet(target) : null;
        if (builtAreas) setTableAreas(builtAreas);

        // ── Save everything to offline cache so the next cold start is instant ──
        saveConfigCache({
          outlet:     target,
          categories: cats,
          menuItems:  items,
          tableAreas: builtAreas,
        });

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
            builtAreas || (target.tables?.length ? buildAreasFromOutlet(target) : seedAreas),
            target.name
          );
        });

        setServerConn("live");
        socketConnRef.current = "live";

        const socketUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1")
          .replace("/api/v1", "");
        const socket = io(socketUrl, {
          query: { outletId: target.id },
          reconnection:      true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 8000,
          reconnectionAttempts: Infinity,
        });
        socketRef.current = socket;

        // ── Socket reconnect: re-fetch live orders & flush queues ─────────────
        socket.on("connect", () => {
          const wasOffline = socketConnRef.current === "offline";
          socketConnRef.current = "live";
          setServerConn("live");
          if (wasOffline) {
            // Internet / server came back — resync everything
            api.get(`/operations/orders?outletId=${target.id}`)
              .then((liveOrders) => {
                const apiMap = Object.fromEntries(liveOrders.map((o) => [o.tableId, o]));
                setOrders((prev) => {
                  const merged = { ...prev };
                  Object.entries(apiMap).forEach(([tableId, serverOrder]) => {
                    const local = prev[tableId];
                    const serverItemIds = new Set((serverOrder.items || []).map(i => i.id));
                    const localOnlyUnsent = (local?.items || []).filter(
                      li => !li.sentToKot && !serverItemIds.has(li.id)
                    );
                    merged[tableId] = localOnlyUnsent.length
                      ? { ...serverOrder, items: [...(serverOrder.items || []), ...localOnlyUnsent] }
                      : serverOrder;
                  });
                  return merged;
                });
              })
              .catch(() => {});
            flushKotQueue(target.id).catch(() => {});
            flushClosedOrderQueue(target.id).catch(() => {});
          }
        });

        socket.on("disconnect", () => {
          socketConnRef.current = "offline";
          setServerConn("offline");
        });

        socket.on("connect_error", () => {
          if (socketConnRef.current !== "offline") {
            socketConnRef.current = "offline";
            setServerConn("offline");
          }
        });

        socket.on("order:updated", (updatedOrder) => {
          setOrders((prev) => {
            const current = prev[updatedOrder.tableId];
            // Stale-write guard: if our local copy is newer, ignore this event.
            // Prevents a slow Captain socket event from overwriting POS changes
            // that were made after the Captain last touched the order.
            if (
              current &&
              !updatedOrder.isClosed &&
              (current.updatedAt || 0) > (updatedOrder.updatedAt || 0)
            ) {
              return prev; // our version is newer — discard incoming
            }
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

        // ── Receive full availability state on connect (sent by backend) ──────
        // Bulk state received on connect (server catch-up)
        socket.on("item:availability:state", (state) => {
          Object.entries(state || {}).forEach(([id, val]) => {
            setItemAvailability(id, val !== false ? true : false);
          });
        });

        // Live update when a single item availability changes
        // (from POS toggle, OR from Owner Console "Show in POS" toggle)
        socket.on("item:availability", (data) => {
          if (data?.itemId != null) {
            setItemAvailability(data.itemId, data.available !== false);
          }
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

        // ── Local WiFi socket (localhost:4001) ────────────────────────────────
        // Connects to the local server running in the Electron main process.
        // Tablets on the same WiFi connect to this directly — no internet needed.
        const localSock = io("http://localhost:4001", {
          reconnection:         true,
          reconnectionDelay:    500,
          reconnectionDelayMax: 3000,
          reconnectionAttempts: Infinity,
          query: { role: "pos" },
        });
        localSocketRef.current = localSock;

        localSock.on("connect", () => {
          setLocalConn(true);
          // Push current order state so tablets get it immediately on connect
          const active = Object.values(ordersRef.current).filter(o => !o.isClosed);
          localSock.emit("pos:sync-orders", active);
        });
        localSock.on("disconnect", () => setLocalConn(false));

        // Order update from Captain via local WiFi → update POS table state
        localSock.on("order:updated", (updatedOrder) => {
          setOrders((prev) => {
            const current = prev[updatedOrder.tableId];
            if (current && (current.updatedAt || 0) > (updatedOrder.updatedAt || 0)) return prev;
            const next = { ...prev, [updatedOrder.tableId]: updatedOrder };
            saveOrdersToStorage(next);
            return next;
          });
        });

        // KOT sent by Captain via local WiFi → print it + mark items sent
        localSock.on("kot:new", (kot) => {
          if (!kot.localMode) return; // cloud KOTs handled by the cloud socket path
          const order = ordersRef.current[kot.tableId] || { ...kot, outletName: outlet?.name || "" };
          // Print on default KOT printer
          const waiterPrinter = getKotPrinter();
          printKOT(order, kot.items || [], waiterPrinter, kot.kotNumber, { sentBy: kot.actorName });
          // Per-station printers
          (kot.stationGroups || []).forEach(sg => {
            const stPrinter = getKotPrinterForStation(sg.station);
            if (stPrinter && stPrinter.name !== waiterPrinter?.name && sg.items?.length) {
              printKOT(order, sg.items, stPrinter, kot.kotNumber, { sentBy: kot.actorName });
            }
          });
          // Mark items as sent on POS table
          const kotItemIds = new Set((kot.items || []).map(i => i.id));
          setOrders(prev => {
            const o = prev[kot.tableId];
            if (!o) return prev;
            return {
              ...prev,
              [kot.tableId]: {
                ...o,
                items: o.items.map(i => kotItemIds.has(i.id) ? { ...i, sentToKot: true } : i),
              },
            };
          });
          showToast(`🖨 KOT #${kot.kotNumber} (local) → Kitchen`);
        });

        // ── New online order arrives from UrbanPiper webhook ──────────────────
        socket.on("online:order:new", () => {
          // Only bump badge if online orders are currently enabled
          setOnlineOrdersEnabled(enabled => {
            if (enabled) setPendingOnlineCount(n => n + 1);
            return enabled;
          });
        });

        // ── PhonePe QR payment confirmed (via webhook → socket) ───────────────
        // Primary handling is inside PhonePeQRModal (onConfirmed prop).
        // This listener catches the case where no modal is open (e.g. Captain App
        // initiated the QR) — it shows a toast so the cashier knows to settle.
        socket.on("payment:phonepe:confirmed", (payload) => {
          const { tableId, amount, tableLabel: tLabel } = payload;
          if (!tableId || !amount) return;
          setShowPhonePeQR(false);
          showToast(`📱 PhonePe payment ₹${amount} confirmed · ${tLabel || ""}`);
        });

      } catch (err) {
        console.error("POS bootstrap failed (offline?) — loading from cache:", err.message);

        // ── Restore full working state from offline cache ─────────────────────
        // This runs when the server is unreachable on startup (power cut, no internet).
        // Everything was saved on the last successful bootstrap / sync, so the POS
        // starts with the real restaurant menu, real table layout, and all open orders.
        const cache = loadConfigCache();

        if (cache.outlet) {
          setOutlet(cache.outlet);
        }
        if (cache.categories.length) {
          setCategories(cache.categories);
        }
        if (cache.menuItems.length) {
          setMenuItems(cache.menuItems.map(i => ({
            ...i,
            price: parsePriceNumber(i.basePrice || i.price)
          })));
        }
        const cachedAreas = cache.tableAreas;
        if (cachedAreas) {
          setTableAreas(cachedAreas);
        }

        // Restore orders from localStorage — merge with cached table layout
        const savedOrders = loadSavedOrders();
        setOrders((prev) =>
          ensureOrders(
            Object.keys(prev).length ? prev : savedOrders,
            cachedAreas || tableAreas,
            cache.outlet?.name || "Outlet"
          )
        );

        setServerConn("offline");
        socketConnRef.current = "offline";

        // ── Retry bootstrap in background — connect when server becomes available ──
        // Socket.io will auto-reconnect once the server is reachable. The socket is
        // created with reconnection:true so no manual retry loop is needed here.
        const socketUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1")
          .replace("/api/v1", "");
        const socket = io(socketUrl, {
          query: { outletId: branchConfig.outletId },
          reconnection:      true,
          reconnectionDelay: 2000,
          reconnectionDelayMax: 15000,
          reconnectionAttempts: Infinity,
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          // Server came back — do a full resync
          socketConnRef.current = "live";
          setServerConn("live");
          bootstrap(); // re-run with server now available
          socket.disconnect(); // the re-run creates a fresh socket
        });

        socket.on("disconnect", () => {
          if (socketConnRef.current !== "offline") {
            socketConnRef.current = "offline";
            setServerConn("offline");
          }
        });
      }
    }

    bootstrap();
    return () => { socketRef.current?.disconnect(); };
  }, [branchConfig]);

  // ── Menu + Tables sync (called by socket event OR manual Sync button) ─────
  async function syncMenuData(outletId) {
    if (!outletId && !outlet?.id) return;
    const id = outletId || outlet.id;
    setIsSyncing(true);
    try {
      const [cats, items, stations, outletsList] = await Promise.all([
        api.get(`/menu/categories?outletId=${id}`).catch(() => null),
        api.get(`/menu/items?outletId=${id}`).catch(() => null),
        api.get("/kitchen-stations").catch(() => null),
        api.get("/outlets").catch(() => null),
      ]);
      if (cats)    setCategories(cats);
      if (items)   setMenuItems(items.map((i) => ({ ...i, price: parsePriceNumber(i.basePrice || i.price) })));
      if (stations?.length) {
        localStorage.setItem("pos_kitchen_stations", JSON.stringify(stations));
      }
      // Re-sync tables/areas from the latest outlet data
      if (Array.isArray(outletsList)) {
        const freshOutlet = outletsList.find(o => o.id === id);
        if (freshOutlet?.tables?.length) {
          const builtAreas = buildAreasFromOutlet(freshOutlet);
          setTableAreas(builtAreas);
          localStorage.setItem("pos_table_config", JSON.stringify(builtAreas));
        }
      }
      // Persist fresh config to offline cache
      const freshOutlet = Array.isArray(outletsList) ? outletsList.find(o => o.id === id) : null;
      const freshAreas  = freshOutlet?.tables?.length ? buildAreasFromOutlet(freshOutlet) : null;
      saveConfigCache({
        outlet:     freshOutlet || null,
        categories: cats    || [],
        menuItems:  items   || [],
        tableAreas: freshAreas,
      });

      const now = new Date();
      setLastSyncedAt(now);
      localStorage.setItem("pos_last_synced", now.toISOString());
      showToast("Synced ✓");
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

  // Track online / offline via browser events (secondary to socket events above).
  // In Electron, the browser "online/offline" events fire when the OS reports a
  // network change — useful as a supplement to the socket disconnect handler.
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      // Socket reconnect handler is the primary queue-flush trigger.
      // This is a safety-net in case the socket reconnect fires before the outlet
      // state is set (race at startup).
      if (outlet?.id) {
        flushKotQueue(outlet.id).catch(() => {});
        flushClosedOrderQueue(outlet.id).catch(() => {});
      }
    };
    const goOffline = () => {
      setIsOnline(false);
      // Don't override socket-based serverConn — socket handles its own state
    };
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [outlet]);

  // ── Cashier-visible print failure alerts ──────────────────────────────────
  // printBill.js and kotPrint.js dispatch this event when Electron silent
  // printing fails — otherwise the cashier has no idea the KOT/Bill didn't print.
  useEffect(() => {
    function onPrintError(e) {
      const { source = "Print", printerName, error } = e.detail || {};
      const label   = printerName ? ` (${printerName})` : "";
      const reason  = error       ? ` — ${error}`       : "";
      showToast(`⚠️ ${source} print failed${label}${reason}`);
    }
    window.addEventListener("dinex:print-error", onPrintError);
    return () => window.removeEventListener("dinex:print-error", onPrintError);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Emit to cloud socket (for Owner Web + remote Captain/KDS)
      socketRef.current?.emit("order:update", { outletId: outlet?.id, order: next });
      // Emit to local socket (for tablets on same WiFi — works without internet)
      localSocketRef.current?.emit("order:update", { order: next });
      // Keep Electron main process local store in sync
      window.electronAPI?.pushOrdersToLocal?.([next]);
      return { ...prev, [tableId]: next };
    });
  }

  function handleToggleAvailability(itemId, currentlySoldOut) {
    const nowAvailable = currentlySoldOut; // toggling: soldOut→available, available→soldOut
    setItemAvailability(itemId, nowAvailable);
    socketRef.current?.emit("item:availability", {
      outletId: outlet?.id,
      itemId,
      available: nowAvailable,
    });
  }

  function handleToggleOnlineOrders() {
    const next = !onlineOrdersEnabled;
    setOnlineOrdersEnabled(next);
    localStorage.setItem("pos_online_orders_enabled", String(next));
    socketRef.current?.emit("online:orders:toggle", { outletId: outlet?.id, enabled: next });
    if (!next) setPendingOnlineCount(0);
  }

  async function handleAddItem(item) {
    if (!selectedTableId) return;
    const tableId = selectedTableId;

    // Generate the item ID here so local state and the backend record use the same ID.
    // This makes the reconcile step safe: when we apply the server response we can
    // identify which items are already tracked server-side by ID (no phantom duplicates).
    const itemId = `item-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

    // Resolve station at outer scope so it is available for both the local push
    // and the backend API call below (was previously block-scoped inside the else branch,
    // causing a ReferenceError on the API call and silent failure to sync items).
    // Primary: match by category ID (String-coerced to handle number vs string mismatches).
    // Fallback: match by category name in case IDs are stale or mismatched.
    const itemCatName = (item.category || item.categoryName || "").trim().toLowerCase();
    const resolvedStation = item.station ||
      kitchenStations.find(s =>
        (Array.isArray(s.categories) && s.categories.some(cid => String(cid) === String(item.categoryId))) ||
        (Array.isArray(s.categoryNames) && s.categoryNames.some(n => n.trim().toLowerCase() === itemCatName))
      )?.name || "";

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
          note:       "",
          station:    resolvedStation,
          categoryId: item.categoryId || "",
          category:   (categories.find(c => c.id === item.categoryId)?.name)
                        || item.categoryName || item.category || "",
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
          id:         itemId,
          menuItemId: item.id,
          name:       item.name,
          price:      parsePriceNumber(item.price || item.basePrice),
          quantity:   1,
          note:       "",
          stationName: resolvedStation,
          categoryId:  item.categoryId || "",
          category:    (categories.find(c => c.id === item.categoryId)?.name)
                         || item.categoryName || item.category || "",
        }
      });

      if (serverOrder && !serverOrder.skipped) {
        // 3. Reconcile: apply server state as the source of truth.
        //    Any unsent local items whose IDs are absent from the server response are
        //    offline-added items that haven't been acknowledged yet — keep them.
        //    Filter server items to exclude any that were locally deleted (not in local state)
        //    — guards against race where DELETE /order/item is still in flight.
        setOrders((prev) => {
          const localOrder = prev[tableId];
          if (!localOrder) return prev;
          const localItemIds  = new Set((localOrder.items || []).map((i) => i.id));
          const serverItemIds = new Set((serverOrder.items || []).map((i) => i.id));
          const localOnlyUnsent = (localOrder.items || []).filter(
            (li) => !li.sentToKot && !serverItemIds.has(li.id)
          );
          // Drop server items that are unsent AND no longer in local state (locally deleted)
          const filteredServerItems = (serverOrder.items || []).filter(
            (si) => si.sentToKot || si.isVoided || localItemIds.has(si.id)
          );
          return {
            ...prev,
            [tableId]: {
              ...serverOrder,
              items: [...filteredServerItems, ...localOnlyUnsent]
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
    const item = orders[selectedTableId]?.items?.[idx];
    mutateOrder(selectedTableId, (order) => { order.items.splice(idx, 1); return order; });
    // Also remove from backend so server-side reconcile doesn't restore it
    if (item?.id && !item?.sentToKot &&
        !selectedTableId.startsWith("counter-") &&
        !selectedTableId.startsWith("online-")) {
      api.delete("/operations/order/item", { tableId: selectedTableId, itemId: item.id })
        .catch(err => console.warn("[POS] item-remove from backend failed:", err.message));
    }
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

    // ── 1. Mark items as sent optimistically ─────────────────────────────
    const kotSeq = (order.kotCount || 0) + 1;
    mutateOrder(selectedTableId, (o) => {
      o.items    = o.items.map((i) => ({ ...i, sentToKot: true }));
      o.kotCount = kotSeq;
      return o;
    });

    // ── 2. Send ALL items in ONE request — backend splits by station ──────
    // Sending a single request guarantees every station KOT shares the SAME
    // KOT number (sequential counter increments only once).
    // The backend uses Owner Console Kitchen Station → Category mapping to
    // resolve which items belong to which station.
    let serverKots = [];
    let lastServerOrder = null;
    const kotPayload = {
      outletId:    outlet?.id,
      orderId:     order.id,
      tableId:     order.tableId,
      tableNumber: order.tableNumber,
      areaName:    order.areaName,
      source:      "pos",
      actorName:   cashierName || "POS",   // shown as operator name on KDS card
      items:       unsent,  // ALL unsent items — server handles station split
    };
    try {
      const result = await api.post("/operations/kot", kotPayload);
      if (result?.kots?.length) serverKots = result.kots;
      else if (result?.kot)     serverKots = [result.kot];
      if (result?.order) lastServerOrder = result.order;
    } catch (err) {
      // Offline — queue for retry; print with local kotSeq
      const queue = loadKotQueue();
      queue.push(kotPayload);
      saveKotQueue(queue);
      console.warn("KOT queued (offline):", kotSeq);
    }

    const serverKotNumber = serverKots.length ? serverKots[0].kotNumber : kotSeq;

    // ── 3. Print KOT slips ────────────────────────────────────────────────
    // Printer logic:
    //   • Waiter KOT printer  → prints ALL items (1 full slip, always)
    //   • Kitchen station printer → prints only that station's items
    //                               (only if a DEDICATED printer is configured for that station)
    if (kotAutoSendEnabled()) {
      const waiterPrinter = getKotPrinter();

      // Waiter slip: all items on the default/waiter KOT printer
      printKOT(order, unsent, waiterPrinter, serverKotNumber, { sentBy: cashierName });

      // Kitchen station slips: one per station, only if a dedicated printer exists
      serverKots.forEach(kot => {
        const st = (kot.station || "").trim();
        if (!st || st.toLowerCase() === "main kitchen") return; // no dedicated kitchen printer for fallback group
        const stPrinter = getKotPrinterForStation(st);
        // Only print if the station printer is DIFFERENT from the waiter printer
        // (avoids printing the same physical printer twice)
        if (stPrinter && stPrinter.name !== waiterPrinter?.name) {
          printKOT(order, kot.items || [], stPrinter, serverKotNumber, { sentBy: cashierName });
        }
      });
    }

    const printer = getKotPrinter();
    const printerLabel = printer ? ` → ${printer.name}` : "";
    showToast(`🖨️ KOT #${serverKotNumber} sent${printerLabel}`);

    // Reconcile from the last server response (most up-to-date order state).
    // All items across all station groups are sentToKot: true on the server by
    // this point. Unsent local items absent from the server response are kept.
    if (lastServerOrder && !order.tableId.startsWith("counter-") && !order.tableId.startsWith("online-")) {
      setOrders((prev) => {
        const localOrder = prev[order.tableId];
        if (!localOrder) return prev;
        const localItemIds  = new Set((localOrder.items || []).map((i) => i.id));
        const serverItemIds = new Set((lastServerOrder.items || []).map((i) => i.id));
        const localOnlyUnsent = (localOrder.items || []).filter(
          (li) => !li.sentToKot && !serverItemIds.has(li.id)
        );
        // Drop server items that are unsent AND locally deleted (race: DELETE still in flight)
        const filteredServerItems = (lastServerOrder.items || []).filter(
          (si) => si.sentToKot || si.isVoided || localItemIds.has(si.id)
        );
        // Safety: if server returned 0 items but local order has sent items,
        // keep the local sent items — prevents table showing as "Free" when
        // the server KOT response body omits the items array.
        const sentLocalItems = (localOrder.items || []).filter(i => i.sentToKot && !i.isVoided);
        const mergedItems = filteredServerItems.length > 0
          ? [...filteredServerItems, ...localOnlyUnsent]
          : [...sentLocalItems, ...localOnlyUnsent];
        return {
          ...prev,
          [order.tableId]: {
            ...lastServerOrder,
            items: mergedItems
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
    printKOT(order, sentItems, printer, order.kotCount || 1, { sentBy: cashierName });
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
    const allPayments  = [...(order.payments || []), ...newPayments];
    const billableItems = order.items.filter(i => !i.isVoided && !i.isComp);
    const subtotal     = billableItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const disc         = Math.min(order.discountAmount || 0, subtotal);
    const afterDisc    = subtotal - disc;
    // Per-item tax (mirrors printBill.js logic — defaults to 5% if item.taxRate unset)
    const taxAmt       = billableItems.reduce((s, i) => {
      const lineAfter = subtotal > 0 ? (i.price * i.quantity) * (afterDisc / subtotal) : 0;
      return s + Math.round(lineAfter * ((i.taxRate != null && i.taxRate !== "" ? Number(i.taxRate) : 5) / 100));
    }, 0);
    const total        = afterDisc + taxAmt;
    const paid         = allPayments.reduce((s, p) => s + p.amount, 0);

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
      payments:    allPayments,
      isClosed:    true,
      closedAt:    new Date().toISOString(),
      cashierName: cashierName || "POS",
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
    // Notify Captain App + KDS that this table's bill is settled
    socketRef.current?.emit("order:update", { outletId: outlet?.id, order: closedOrder });
    localSocketRef.current?.emit("order:clear", { tableId });
    window.electronAPI?.pushOrdersToLocal?.([]);

    // 3. Push full closed order to backend so Owner Web shows real sales figures.
    // This is also the gate for the fresh-table reset: clearTableAfterSettle runs
    // server-side inside deviceCloseOrderHandler. We only reset the POS slot and
    // broadcast "fresh table" to Captain AFTER the backend confirms the order is
    // recorded and its in-memory slot has been cleared. If the call fails, the
    // table stays isClosed: true on both POS and Captain — consistent with the
    // backend still holding the old order — so no device disagrees about state.
    let backendConfirmed = false;
    try {
      // Server returns { ok, billNo, billNoMode, billNoFY, billNoDate, closedAt }
      const closeResult = await api.post("/operations/closed-order", {
        outletId: outlet?.id,
        order:    closedOrder,
      });
      backendConfirmed = true;

      // ── Stamp server-assigned bill number onto the local record ────────────
      // This ensures the printed receipt and Past Orders modal both show the
      // correct sequential bill number (e.g. 42 or FY25-0042) instead of the
      // POS-local orderNumber (e.g. 10051).
      if (closeResult?.billNo != null) {
        closedOrder.billNo     = closeResult.billNo;
        closedOrder.billNoMode = closeResult.billNoMode  || null;
        closedOrder.billNoFY   = closeResult.billNoFY    || null;
        closedOrder.billNoDate = closeResult.billNoDate  || null;
        closedOrder.closedAt   = closeResult.closedAt    || closedOrder.closedAt;

        // Overwrite the localStorage record with the stamped version
        try {
          const prev = JSON.parse(localStorage.getItem("pos_closed_orders") || "[]");
          // Replace the first entry (we just unshifted it above) with the stamped copy
          if (prev.length && prev[0].orderNumber === closedOrder.orderNumber) {
            prev[0] = closedOrder;
          }
          localStorage.setItem("pos_closed_orders", JSON.stringify(prev));
        } catch {}
      }
    } catch (err) {
      console.warn("[POS] closed-order sync failed (offline?) — queuing for retry:", err.message);
      // Queue the closed order so it syncs automatically when connectivity returns.
      // billNo will be assigned by the server when the queue is flushed.
      const q = loadClosedOrderQueue();
      q.push({ order: closedOrder });
      saveClosedOrderQueue(q);
    }

    // ── Print receipt after settle ─────────────────────────────────────────
    // Print once here — AFTER the server has assigned the official billNo.
    // This ensures the thermal receipt shows the sequential GST bill number
    // (e.g. "Bill No: #42") rather than the local POS orderNumber.
    printBill(
      closedOrder,
      closedOrder.items,
      outlet || branchConfig?.outletName,
      { cashierName }
    );

    setShowPayment(false);
    setSelectedTableId(null);

    // Trigger cash drawer if any payment was cash (Electron only, silent on web)
    if (hasCashPayment(allPayments)) openCashDrawer();

    showToast(
      backendConfirmed
        ? "✓ Bill settled · Table is ready"
        : "✓ Bill settled · Syncing in background"
    );

    // Local safety-net reset: if the backend is offline (no network) the server-side
    // order:updated broadcast won't fire, so we reset the local table state here.
    // When online, the server emits order:updated (blank) and this runs in parallel —
    // both set the same blank state, no harm done.
    setTimeout(() => {
      const area  = tableAreas.find(a => a.tables.some(t => t.id === tableId));
      const table = area?.tables.find(t => t.id === tableId);
      if (!table || !area) return; // counter/online IDs — no catalog entry
      setOrders(prev => {
        const maxNum = Math.max(10050, ...Object.values(prev).map(o => o.orderNumber || 10050)) + 1;
        const fresh  = buildBlankOrder(table, area, outlet?.name || "Outlet", maxNum);
        return { ...prev, [tableId]: fresh };
      });
    }, 1500);
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
    // Read the toast message INSIDE mutateOrder so we see the new value,
    // not the stale closure value of orders[selectedTableId].
    mutateOrder(selectedTableId, o => {
      o.isOnHold = !o.isOnHold;
      showToast(o.isOnHold ? "Order put on hold" : "Order resumed");
      return o;
    });
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
  // This button MARKS the table as "Bill Due" (turns it blue on the floor plan
  // and notifies Captain app). The actual receipt prints after settlement so the
  // bill number on the receipt is the server-assigned sequential GST bill number.
  function handlePrintBill() {
    if (!selectedTableId) return;
    const tableId = selectedTableId;
    const order   = orders[tableId];
    if (!order?.items?.length) { showToast("No items to print"); return; }

    // Mark bill as requested — changes table to blue on POS table picker
    // and broadcasts via socket so Captain app also shows "Bill Due"
    mutateOrder(tableId, (o) => {
      o.billRequested   = true;
      o.billRequestedAt = new Date().toISOString();
      return o;
    });

    showToast("📋 Bill requested · Collect payment to print receipt");

    // Close the order panel — table stays blue until payment is collected
    setSelectedTableId(null);

    // Persist billRequested to backend (fire-and-forget)
    if (!tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
      api.post("/operations/bill-request", { outletId: outlet?.id, tableId })
        .catch(err => console.warn("[POS] bill-request after print failed:", err.message));
    }
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
    const item = orders[selectedTableId]?.items?.[idx];
    mutateOrder(selectedTableId, o => {
      if (o.items[idx]) {
        o.items[idx].isVoided   = true;
        o.items[idx].voidReason = reason;
        o.items[idx].sentToKot  = true; // treat as sent so it can't be re-sent
      }
      return o;
    });
    showToast("Item voided");
    // Persist void to backend so Captain app + KDS see the change immediately.
    // Include managerPin so server-side validation passes when a PIN is configured.
    if (item?.id &&
        !selectedTableId.startsWith("counter-") &&
        !selectedTableId.startsWith("online-")) {
      const sec = JSON.parse(localStorage.getItem("pos_security") || "{}");
      api.patch("/operations/order/item", {
        tableId:    selectedTableId,
        itemId:     item.id,
        voidReason: reason || "Voided by POS",
        managerPin: sec.managerPin || ""
      }).catch(err => console.warn("[POS] item-void to backend failed:", err.message));
    }
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
    setShowCloseShift(false);   // dismiss modal BEFORE nulling shift to avoid crash
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
  const openTables = Object.values(orders).filter(o => o.items?.length && !o.isClosed && !o.isOnHold).length;
  const pendingKOT = Object.values(orders).reduce((s, o) => s + (o.items || []).filter(i => !i.sentToKot && !i.isVoided).length, 0);

  // ─── Main POS UI ──────────────────────────────────────────────────────────
  return (
    <div className="pos-shell">

      {/* ── Update banner ────────────────────────────────────────────────── */}
      <UpdateBanner />

      {/* ── Connection banner ────────────────────────────────────────────── */}
      {serverConn === "offline" && (
        <div className="pos-offline-banner">
          {(() => {
            const kots    = loadKotQueue().length;
            const settled = loadClosedOrderQueue().length;
            const parts   = [];
            if (kots    > 0) parts.push(`${kots} KOT${kots > 1 ? "s" : ""}`);
            if (settled > 0) parts.push(`${settled} bill${settled > 1 ? "s" : ""}`);
            return parts.length > 0
              ? `📡 Server offline — ${parts.join(" & ")} queued · will auto-sync when connection returns · Printing unaffected`
              : "📡 Server offline — all orders saved locally · Printing unaffected · Auto-syncing when connection returns";
          })()}
        </div>
      )}
      {serverConn === "connecting" && (
        <div className="pos-connecting-banner">
          ⏳ Connecting to server…
        </div>
      )}
      {localConn && (
        <div className="pos-local-banner">
          📶 Local WiFi server active — tablets work without internet
        </div>
      )}

      {/* ── Row 1: Brand bar ─────────────────────────────────────────────── */}
      <div className="pos-brand-bar">
        {/* Brand */}
        <div className="pbb-brand">
          <span className="pbb-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="9"/>
              <path d="M8 12h8" strokeLinecap="round"/>
            </svg>
          </span>
          <div>
            <div className="pbb-name">{outlet?.name || "Plato POS"}</div>
            <div className="pbb-sub">POS Terminal</div>
          </div>
        </div>

        {/* Service mode pills */}
        <div className="pbb-modes">
          {SERVICE_MODES.map((m) => (
            <button key={m.id} type="button"
              className={`pbb-mode-pill${serviceMode === m.id ? " active" : ""}`}
              onClick={() => { setServiceMode(m.id); setSelectedTableId(null); }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Right: cashier + clock */}
        <div className="pbb-right">
          <div className="pbb-cashier-chip">
            <div className="pbb-avatar">{cashierName?.[0]}</div>
            <div>
              <div className="pbb-cashier-name">{activeShift.cashier}</div>
              <div className="pbb-session">
                {activeShift.session}
                <span className="pbb-ver-badge">v{APP_VERSION}</span>
              </div>
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
            onClick={() => { setShowOnlineOrders(true); setPendingOnlineCount(0); }}>
            <span className="pab-label">Online Orders</span>
            {pendingOnlineCount > 0 && onlineOrdersEnabled && (
              <span className="pab-badge">{pendingOnlineCount}</span>
            )}
          </button>
          <button
            type="button"
            className={`online-toggle-btn ${onlineOrdersEnabled ? "enabled" : "disabled"}`}
            onClick={handleToggleOnlineOrders}
            title={onlineOrdersEnabled ? "Online orders ON — click to pause" : "Online orders PAUSED — click to enable"}
          >
            <span>{onlineOrdersEnabled ? "Online ON" : "Online OFF"}</span>
          </button>
          <button type="button" className="pab-btn blue"
            onClick={() => setShowPastOrders(true)}>
            <span className="pab-label">Past Orders</span>
          </button>
          <button type="button" className="pab-btn purple"
            onClick={() => setShowAdvancePanel(true)}>
            <span className="pab-label">Advance</span>
          </button>
          <button type="button" className="pab-btn teal"
            onClick={() => selectedTableId ? setShowCustomerForm(true) : showToast("Select a table first")}>
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
            <span className="pab-label">Cash In</span>
          </button>
          <button type="button" className="pab-btn red"
            onClick={() => setShowCashOut(true)}>
            <span className="pab-label">Cash Out</span>
          </button>
          <button type="button" className={`pab-btn cyan${isSyncing ? " syncing" : ""}`}
            onClick={() => syncMenuData()}
            title={lastSyncedAt ? `Last synced: ${lastSyncedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}` : "Sync menu from server"}
            disabled={isSyncing}>
            <span className="pab-label">{isSyncing ? "Syncing…" : "Sync"}</span>
          </button>
          <button type="button" className="pab-btn gray"
            onClick={() => setShowSettings(true)}>
            <span className="pab-label">Settings</span>
          </button>
          <button type="button" className="pab-btn dark"
            onClick={() => setShowCloseShift(true)}>
            <span className="pab-label">End Shift</span>
          </button>
          <button type="button" className="pab-btn logout-btn"
            onClick={() => { setCashierName(null); setActiveShift(null); setSelectedTableId(null); }}
            title="Logout">
            <span className="pab-label">Exit</span>
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
          onToggleAvailability={handleToggleAvailability}
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
          onPhonePeQR={() => { setShowPayment(false); setShowPhonePeQR(true); }}
        />
      )}

      {/* ── PhonePe QR payment modal ──────────────────────────────────────── */}
      {showPhonePeQR && selectedOrder && (
        <PhonePeQRModal
          order={selectedOrder}
          outletId={outlet?.id}
          socket={socketRef.current}
          onConfirmed={(payload) => {
            setShowPhonePeQR(false);
            handleSettle([{ method: "phonepe", label: "PhonePe", amount: payload.amount }]);
          }}
          onClose={() => { setShowPhonePeQR(false); setShowPayment(true); }}
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

      {/* ── Advance Orders Panel ─────────────────────────────────────────── */}
      {showAdvancePanel && (
        <AdvanceOrdersPanel
          outlet={outlet}
          menuItems={menuItems}
          tableAreas={tableAreas}
          orders={orders}
          onClose={() => setShowAdvancePanel(false)}
          onCheckIn={(advOrder, tableId) => {
            setShowAdvancePanel(false);

            // ── Takeaway / Delivery → create a counter ticket ─────────────
            if (!tableId) {
              const orderType  = advOrder.orderType || "takeaway";
              const ticketNum  = counterTicketNum;
              const ticketId   = `counter-${Date.now()}`;
              const areaLabel  = orderType === "delivery" ? "Delivery" : "Takeaway";
              const areaObj    = { id: "counter", name: areaLabel };
              const fakeTable  = { id: ticketId, number: String(ticketNum).padStart(3, "0") };
              const orderNum   = Math.max(10050, ...Object.values(orders).map((o) => o.orderNumber || 10050)) + 1;

              const counterOrder = {
                ...buildBlankOrder(fakeTable, areaObj, outlet?.name || "Outlet", orderNum),
                isCounter:    true,
                ticketNumber: ticketNum,
              };

              // Enrich and add items from advance booking
              const enriched = (advOrder.items || []).map((advItem) => {
                const menuItem = menuItems.find((m) => m.id === advItem.menuItemId);
                const itemCatName = (menuItem?.categoryName || menuItem?.category || "").trim().toLowerCase();
                const resolvedStation =
                  menuItem?.station ||
                  kitchenStations.find((s) =>
                    (Array.isArray(s.categories) &&
                      s.categories.some((cid) => String(cid) === String(menuItem?.categoryId))) ||
                    (Array.isArray(s.categoryNames) &&
                      s.categoryNames.some((n) => n.trim().toLowerCase() === itemCatName))
                  )?.name || "";
                return {
                  id:         `ci-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  menuItemId: advItem.menuItemId,
                  name:       advItem.name,
                  price:      parsePriceNumber(advItem.price),
                  quantity:   advItem.quantity || 1,
                  sentToKot:  false,
                  note:       advOrder.advanceAmount > 0
                                ? `Advance paid ₹${advOrder.advanceAmount}`
                                : "",
                  station:    resolvedStation,
                  categoryId: menuItem?.categoryId || "",
                  category:
                    categories.find((c) => c.id === menuItem?.categoryId)?.name ||
                    menuItem?.categoryName || menuItem?.category || "",
                };
              });

              counterOrder.items = enriched;

              setOrders((prev) => ({ ...prev, [ticketId]: counterOrder }));
              setCounterTicketNum((n) => n + 1);
              setServiceMode(orderType === "delivery" ? "delivery" : "takeaway");
              setSelectedTableId(ticketId);

              const itemCount = enriched.reduce((s, i) => s + i.quantity, 0);
              const advPaid   = advOrder.advanceAmount > 0
                ? ` · ₹${advOrder.advanceAmount} advance paid`
                : "";
              showToast(
                `${advOrder.customerName} · ${areaLabel} #${String(ticketNum).padStart(3, "0")} ✓${itemCount > 0 ? ` — ${itemCount} item${itemCount !== 1 ? "s" : ""} loaded` : ""}${advPaid}`
              );
              return;
            }

            // ── Enrich advance items with station + category data ──────────
            const enrichedItems = (advOrder.items || []).map((advItem) => {
              const menuItem    = menuItems.find((m) => m.id === advItem.menuItemId);
              const itemCatName = (menuItem?.categoryName || menuItem?.category || "").trim().toLowerCase();
              const resolvedStation =
                menuItem?.station ||
                kitchenStations.find((s) =>
                  (Array.isArray(s.categories) &&
                    s.categories.some((cid) => String(cid) === String(menuItem?.categoryId))) ||
                  (Array.isArray(s.categoryNames) &&
                    s.categoryNames.some((n) => n.trim().toLowerCase() === itemCatName))
                )?.name || "";

              return {
                id:         `ci-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                menuItemId: advItem.menuItemId,
                name:       advItem.name,
                price:      parsePriceNumber(advItem.price),
                quantity:   advItem.quantity || 1,
                sentToKot:  false,
                note:       advOrder.advanceAmount > 0
                              ? `Advance paid ₹${advOrder.advanceAmount}`
                              : "",
                station:    resolvedStation,
                categoryId: menuItem?.categoryId || "",
                category:
                  categories.find((c) => c.id === menuItem?.categoryId)?.name ||
                  menuItem?.categoryName || menuItem?.category || "",
              };
            });

            // ── Load items into the table order immediately ───────────────
            mutateOrder(tableId, (order) => {
              for (const item of enrichedItems) {
                const existing = order.items.findIndex(
                  (i) => i.menuItemId === item.menuItemId && !i.sentToKot
                );
                if (existing >= 0) {
                  order.items[existing].quantity += item.quantity;
                } else {
                  order.items.push(item);
                }
              }
              return order;
            });

            // ── Select the table so cashier sees the loaded order ─────────
            setSelectedTableId(tableId);

            // Toast with a clear summary
            const itemCount = enrichedItems.reduce((s, i) => s + i.quantity, 0);
            const advPaid   = advOrder.advanceAmount > 0
              ? ` · ₹${advOrder.advanceAmount} advance paid`
              : "";
            showToast(
              `${advOrder.customerName} seated ✓ — ${itemCount} item${itemCount !== 1 ? "s" : ""} loaded${advPaid}`
            );

            // ── Sync to backend in background (one call per unique item) ──
            for (const item of enrichedItems) {
              // Post once per item — backend merges quantity for unsent items
              for (let q = 0; q < item.quantity; q++) {
                api.post("/operations/order/item", {
                  tableId,
                  outletId: outlet?.id,
                  item: {
                    id:          item.id,
                    menuItemId:  item.menuItemId,
                    name:        item.name,
                    price:       item.price,
                    quantity:    1,
                    note:        item.note,
                    stationName: item.station,
                    categoryId:  item.categoryId,
                    category:    item.category,
                  },
                }).catch(() => {}); // silent — local state already updated
              }
            }
          }}
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
          outlet={outlet}
          outletName={outlet?.name || branchConfig?.outletName}
          cashierName={cashierName}
        />
      )}

      {/* ── Online Orders panel ───────────────────────────────────────────── */}
      {showOnlineOrders && (
        <OnlineOrdersPanel
          outletId={outlet?.id}
          outletName={outlet?.name || branchConfig?.outletName}
          outletAddress={outlet?.address || outlet?.location || ""}
          socket={socketRef.current}
          onAccept={handleAcceptOnlineOrder}
          onClose={() => { setShowOnlineOrders(false); setPendingOnlineCount(0); }}
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
