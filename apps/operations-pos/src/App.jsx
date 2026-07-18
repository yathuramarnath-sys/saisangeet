import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import { UpdateBanner, APP_VERSION } from "./components/UpdateBanner";
import { MenuPanel }          from "./components/MenuPanel";
import { OrderPanel, getFinancials } from "./components/OrderPanel";
import { PaymentSheet }       from "./components/PaymentSheet";
import { SplitBillSheet }          from "./components/SplitBillSheet";
import { SplitSettlementPanel }    from "./components/SplitSettlementPanel";
import { ShiftGate }          from "./components/ShiftGate";
import { DayEndModal }        from "./components/DayEndModal";
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
import { HeldOrdersModal, isHeldOrder } from "./components/HeldOrdersModal";
import { LabelPrintModal }    from "./components/LabelPrintModal";
import { BatchLabelModal }    from "./components/BatchLabelModal";
import { CreditSettlePanel }  from "./components/CreditSettlePanel";
import { OnlineOrdersPanel }  from "./components/OnlineOrdersPanel";
import { PhonePeQRModal }     from "./components/PhonePeQRModal";
import { WastageModal }       from "./components/WastageModal";
import { WaitlistPanel }     from "./components/WaitlistPanel";
import { StockPanel }        from "./components/StockPanel";
import { WhatsNewModal, useWhatsNew } from "./components/WhatsNewModal";
import { areas as seedAreas, categories as seedCategories, menuItems as seedMenuItems } from "./data/pos.seed";
import { api } from "./lib/api";
import { printKOT, getKotPrinter, getKotPrinterForStation, kotAutoSendEnabled } from "./lib/kotPrint";
import { printBill } from "./lib/printBill";
import { openCashDrawer, hasCashPayment } from "./lib/cashDrawer";
import { setItemAvailability } from "../../../packages/shared-types/src/stockAvailability.js";
import { setCategoryAvailability } from "../../../packages/shared-types/src/categoryAvailability.js";

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
  if (!outlet?.tables?.length) return [];
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

// ── Item order count tracking (for Favourites chip) ───────────────────────
const ITEM_COUNTS_KEY = "pos_item_counts";
function loadItemCounts() {
  try { return JSON.parse(localStorage.getItem(ITEM_COUNTS_KEY) || "{}"); } catch { return {}; }
}
function saveItemCounts(counts) {
  try { localStorage.setItem(ITEM_COUNTS_KEY, JSON.stringify(counts)); } catch (_) {}
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
const ORDERS_KEY        = "pos_active_orders";
const ORDERS_OUTLET_KEY = "pos_active_orders_outlet"; // guards against cross-outlet data bleed
const MIRROR_ORDERS_KEY = "pos_mirror_orders";

// When the server returns order items it may omit taxRate (not stored in DB).
// Preserve taxRate from the local version so GST never disappears.
// Falls back to menuItems lookup for captain-added items absent from local POS state.
function withLocalTaxRate(serverItems, localItems, menuItems) {
  if (!serverItems?.length) return serverItems || [];
  const localById = Object.fromEntries((localItems || []).map(i => [i.id, i]));
  const menuById  = Object.fromEntries((menuItems  || []).map(i => [String(i.id), i]));
  return serverItems.map(si => {
    const menuItem = menuById[String(si.menuItemId || si.id)];
    let result = si;
    if (result.taxRate == null) {
      const localRate = localById[si.id]?.taxRate;
      if (localRate != null) result = { ...result, taxRate: localRate };
      else if (menuItem?.taxRate != null) result = { ...result, taxRate: menuItem.taxRate };
    }
    if (menuItem) {
      if (result.allowDecimalQty == null) result = { ...result, allowDecimalQty: !!menuItem.allowDecimalQty };
      if (!result.unit && menuItem.unit)  result = { ...result, unit: menuItem.unit };
    }
    return result;
  });
}

/**
 * Load saved orders from localStorage.
 * Pass currentOutletId so we can detect and reject stale orders from a
 * different outlet (e.g. after switching outlet code to a new client).
 */
function loadSavedOrders(currentOutletId = null) {
  try {
    // ── Cross-outlet guard ───────────────────────────────────────────────────
    const storedOutletId = localStorage.getItem(ORDERS_OUTLET_KEY);
    if (currentOutletId && (!storedOutletId || String(storedOutletId) !== String(currentOutletId))) {
      // Orders belong to a different outlet (or have no outlet stamp) — wipe them so they don't bleed in
      console.warn(
        `[POS] Clearing stale orders: stored outlet=${storedOutletId}, current outlet=${currentOutletId}`
      );
      localStorage.removeItem(ORDERS_KEY);
      localStorage.removeItem(ORDERS_OUTLET_KEY);
      return {};
    }
    const raw = JSON.parse(localStorage.getItem(ORDERS_KEY) || "null") || {};
    // Auto-clean ghost empty + closed counter orders on startup.
    // Counter order IDs (counter-${Date.now()}) are never reused like table IDs,
    // so a closed counter order that escapes the in-session cleanup timeout
    // would otherwise resurrect forever across reloads/restarts.
    const cleaned = Object.fromEntries(
      Object.entries(raw).filter(([, o]) => {
        if (!o?.isCounter) return true; // keep all dine-in orders
        if (o.isClosed) return false; // drop settled counter tickets
        const hasItems = (o.items || []).filter(i => !i.isVoided && !i.isComp).length > 0;
        return hasItems; // drop empty counter orders
      })
    );
    return cleaned;
  } catch { return {}; }
}

function saveOrdersToStorage(ordersMap) {
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(ordersMap));
    // Stamp which outlet these orders belong to — used by loadSavedOrders guard
    const cfg = loadBranchConfig();
    if (cfg?.outletId) localStorage.setItem(ORDERS_OUTLET_KEY, String(cfg.outletId));
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
  const [activeStaff,     setActiveStaff]     = useState([]);
  const [tableAreas,      setTableAreas]      = useState(() => {
    try { return JSON.parse(localStorage.getItem("pos_table_config") || "null") || []; }
    catch { return []; }
  });
  const [categories,      setCategories]      = useState(seedCategories);
  const [menuItems,       setMenuItems]       = useState(seedMenuItems);
  const [kitchenStations, setKitchenStations] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pos_kitchen_stations") || "[]"); } catch { return []; }
  });
  const [orders,          setOrders]          = useState(() => {
    // Pass current outletId so stale orders from a different outlet are wiped
    const cfg = loadBranchConfig();
    return loadSavedOrders(cfg?.outletId || null);
  });
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [isOnline,        setIsOnline]        = useState(() => navigator.onLine);
  const [showPayment,     setShowPayment]     = useState(false);
  const [showDrawer,      setShowDrawer]      = useState(false);
  const [darkMode,        setDarkMode]        = useState(() => localStorage.getItem("pos_dark_mode") === "true");
  const [itemCounts,      setItemCounts]      = useState(() => loadItemCounts());
  const [showSplitBill,   setShowSplitBill]   = useState(false);
  const [activeArea,      setActiveArea]      = useState(null);
  const [serviceMode,     setServiceMode]     = useState("dine-in");
  const [toast,           setToast]           = useState(null);
  const [undoBanner,      setUndoBanner]      = useState(null); // { label, onUndo }
  const socketRef      = useRef(null);   // cloud socket
  const localSocketRef = useRef(null);   // local WiFi socket (port 4001)
  // Mirror of orders state for socket closures (avoids stale-closure problem)
  const ordersRef  = useRef({});
  // Mirror (pending bill) orders waiting for cashier settlement while a new order is active
  const [mirrorOrders, setMirrorOrders] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MIRROR_ORDERS_KEY) || "null") || {}; } catch { return {}; }
  });
  const [selectedMirrorOrder, setSelectedMirrorOrder] = useState(null);
  // Refs for barcode scanner listener — always hold latest values without re-subscribing
  const selectedTableIdRef = useRef(null);
  const outletRef          = useRef(null);
  const handleAddItemRef   = useRef(null);
  const menuItemsRef       = useRef([]);   // latest menuItems for scale PLU lookup
  // Guard: prevent handlePrintBill from firing twice (double-click or dual-device race)
  const billPrintingRef = useRef(false);
  // KOT numbers printed via HTTP /print-kot — used to skip cloud kot:new double-print
  const printedViaHttpRef = useRef(new Set());
  // Guard: only auto-open a counter ticket once per "no table selected" episode,
  // so clearing back to null (e.g. order cancelled) doesn't loop us straight back in.
  const autoCounterOpenedRef = useRef(false);
  // Tracks socket connection state for reconnect-resync logic
  const socketConnRef = useRef("connecting"); // "connecting" | "live" | "offline"
  // Tracks whether any modal is open — barcode scanner is suppressed when true
  const modalOpenRef = useRef(false);
  const [serverConn,  setServerConn]  = useState("connecting"); // for UI banner
  const [localConn,   setLocalConn]   = useState(false);        // local WiFi server status

  // ── Shift state ───────────────────────────────────────────────────────────
  const [activeShift,      setActiveShift]      = useState(() => loadActiveShift());
  const [cashierName,      setCashierName]      = useState(null);
  const [cashierPin,       setCashierPin]       = useState("");   // stored on login for void/cancel re-auth
  const [activeCategory,   setActiveCategory]   = useState(null);
  const [showCashIn,       setShowCashIn]       = useState(false);
  const [showCashOut,      setShowCashOut]      = useState(false);
  const [showCloseShift,   setShowCloseShift]   = useState(false);
  const [showDayEnd,       setShowDayEnd]       = useState(false);
  const [dayEndPostShift,  setDayEndPostShift]  = useState(false);
  const [showAdvanceOrder, setShowAdvanceOrder] = useState(false); // legacy — replaced by panel
  const [showAdvancePanel, setShowAdvancePanel] = useState(false);
  const [counterTicketNum,   setCounterTicketNum]   = useState(() => {
    try { return parseInt(localStorage.getItem("pos_counter_ticket_num") || "1", 10); }
    catch { return 1; }
  });
  // Ticket numbers freed by abandoned (never-paid, no-item) counter orders —
  // reissued to the next new ticket before incrementing the running counter,
  // so a cancelled ticket doesn't leave a permanent gap in the sequence.
  const [recycledTicketNums, setRecycledTicketNums] = useState([]);
  const [showCustomerForm,   setShowCustomerForm]   = useState(false);
  const [showSettings,       setShowSettings]       = useState(false);
  const [showPastOrders,     setShowPastOrders]     = useState(false);
  const [showHeldOrders,     setShowHeldOrders]     = useState(false);
  const [showLabelPrint,     setShowLabelPrint]     = useState(false);
  const [showBatchLabel,     setShowBatchLabel]     = useState(false);
  const [showCreditPanel,    setShowCreditPanel]    = useState(false);
  const [discountRules,      setDiscountRules]      = useState(() => {
    try { return JSON.parse(localStorage.getItem("pos_discount_rules") || "[]"); } catch { return []; }
  });
  const [showOnlineOrders,    setShowOnlineOrders]    = useState(false);
  const [pendingOnlineCount,  setPendingOnlineCount]  = useState(0);
  const [pendingQRCount,      setPendingQRCount]      = useState(0); // customer QR orders (notification only)
  const [onlineOrdersEnabled, setOnlineOrdersEnabled] = useState(() =>
    localStorage.getItem("pos_online_orders_enabled") !== "false"
  );
  const [showPhonePeQR,      setShowPhonePeQR]      = useState(false);
  const [showWastage,        setShowWastage]        = useState(false);
  const [showStock,          setShowStock]          = useState(false);
  const [stockSnapshot,      setStockSnapshot]      = useState({}); // { [itemId]: { currentStock, lowStockLevel, allowNegative } }
  const [showWaitlist,       setShowWaitlist]       = useState(false);
  const [waitlistSuggest,    setWaitlistSuggest]    = useState(null); // { party, tableLabel, tableSeats }
  const { show: showWhatsNew, dismiss: dismissWhatsNew } = useWhatsNew();
  const [isSyncing,          setIsSyncing]          = useState(false);
  const [lastSyncedAt,       setLastSyncedAt]       = useState(() => {
    const s = localStorage.getItem("pos_last_synced");
    return s ? new Date(s) : null;
  });

  // Keep modalOpenRef in sync so the barcode listener (closure) can read it without stale state
  useEffect(() => {
    modalOpenRef.current = !!(
      showPayment || showSplitBill || showCashIn || showCashOut || showCloseShift ||
      showDayEnd || showCustomerForm || showSettings || showPastOrders || showHeldOrders ||
      showLabelPrint || showBatchLabel || showCreditPanel || showOnlineOrders ||
      showPhonePeQR || showWastage || showStock || showWaitlist || showAdvancePanel ||
      showWhatsNew
    );
  }, [
    showPayment, showSplitBill, showCashIn, showCashOut, showCloseShift,
    showDayEnd, showCustomerForm, showSettings, showPastOrders, showHeldOrders,
    showLabelPrint, showBatchLabel, showCreditPanel, showOnlineOrders,
    showPhonePeQR, showWastage, showStock, showWaitlist, showAdvancePanel,
    showWhatsNew,
  ]);

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

        const [cats, items, kitchenStations, staffRes, discountRes] = await Promise.all([
          api.get(`/menu/categories?outletId=${target.id}`).catch(() => []),
          api.get(`/menu/items?outletId=${target.id}`).catch(() => []),
          api.get("/kitchen-stations").catch(() => []),
          api.get(`/devices/staff?outletId=${target.id}`).catch(() => null),
          api.get("/settings/discounts").catch(() => null),
        ]);
        // Sync active discount rules for POS cashier picker — filter by this outlet
        if (discountRes?.rules) {
          const outletName = target?.name || "";
          const active = discountRes.rules.filter(r =>
            r.isActive !== false &&
            (r.outletScope === "All Outlets" || !r.outletScope || r.outletScope === outletName)
          );
          setDiscountRules(active);
          try { localStorage.setItem("pos_discount_rules", JSON.stringify(active)); } catch (_) {}
        }
        if (staffRes?.staff?.length) setActiveStaff(staffRes.staff);

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

        const builtAreas = buildAreasFromOutlet(target);
        setTableAreas(builtAreas);
        localStorage.setItem("pos_table_config", JSON.stringify(builtAreas));

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
            // Append any unsent local items whose IDs are absent from the server state,
            // but ONLY when the local item belongs to the same order session (same
            // orderNumber). A different orderNumber means the table was reset between
            // sessions — local unsent items are stale and must be discarded.
            const serverItemIds = new Set((serverOrder.items || []).map((i) => i.id));
            // STRICT session check: BOTH orderNumbers must be present AND equal.
            // If server has a blank/new order (orderNumber=null), treat as new session
            // and discard all stale local unsent items — prevents ghost item resurrection.
            const sameSession   = !!(savedOrder?.orderNumber && serverOrder.orderNumber &&
                                  savedOrder.orderNumber === serverOrder.orderNumber);
            const localOnlyUnsent = sameSession
              ? (savedOrder?.items || []).filter((li) => !li.sentToKot && !serverItemIds.has(li.id))
              : [];
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
            builtAreas,
            target.name
          );
        });

        // Load stock snapshot for this outlet and merge lowStockLevel from menu items
        api.get(`/inventory/stock/snapshot?outletId=${target.id}`)
          .then(snap => {
            if (snap && typeof snap === "object") {
              const merged = { ...snap };
              (items || []).forEach(item => {
                if (merged[item.id] && item.lowStockLevel > 0) {
                  merged[item.id] = { ...merged[item.id], lowStockLevel: Number(item.lowStockLevel) };
                }
              });
              setStockSnapshot(merged);
            }
          })
          .catch(() => {});

        setServerConn("live");
        socketConnRef.current = "live";

        const socketUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1")
          .replace("/api/v1", "");
        const socket = io(socketUrl, {
          query: { outletId: target.id },
          // Pass device token so the server can resolve tenantId for brand-new
          // tenants whose data isn't in the in-memory cache yet.
          auth: { token: localStorage.getItem("pos_token") || "" },
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
                    const serverItemIds  = new Set((serverOrder.items || []).map(i => i.id));
                    const sameSession    = !!(local?.orderNumber && serverOrder.orderNumber &&
                                          local.orderNumber === serverOrder.orderNumber);
                    const localOnlyUnsent = sameSession
                      ? (local?.items || []).filter(li => !li.sentToKot && !serverItemIds.has(li.id))
                      : [];
                    // Stale-write guard: don't let reconnect fetch overwrite a newer local state.
                    // Exception: closed/settled orders are always authoritative.
                    if (
                      local &&
                      !serverOrder.isClosed &&
                      (local.updatedAt || 0) > (serverOrder.updatedAt || 0)
                    ) {
                      // Local is newer — skip server overwrite, but still append unsent items
                      if (localOnlyUnsent.length) {
                        merged[tableId] = local; // already has the items
                      }
                      // else: leave merged[tableId] as local (from { ...prev })
                    } else {
                      const isGhostItem = (i) => i.isGhostVoid === true || (i.isVoided === true && i.sentToKot === false);
                      const cleanedServerItems = withLocalTaxRate(
                        (serverOrder.items || []).filter(i => !isGhostItem(i)),
                        local?.items,
                        menuItemsRef.current
                      );
                      merged[tableId] = {
                        ...serverOrder,
                        items: [...cleanedServerItems, ...localOnlyUnsent],
                      };
                    }
                  });
                  return merged;
                });
              })
              .catch(() => {});
            flushKotQueue(target.id).catch(() => {});
            flushClosedOrderQueue(target.id).catch(() => {});
          } else {
            // Cold-start: flush KOT/settle queues from any previous session that crashed offline
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
            // Petpooja-style mirror table: if POS has a pending bill for this table
            // (billRequested:true, different orderNumber) the incoming update is a new
            // seating by Captain.  Preserve the pending bill as a "mirror" tile so the
            // cashier can settle it independently; let Order 2 through into main state.
            // Use prev (authoritative) not ordersRef (may be stale) to avoid race conditions
            // when two socket events arrive in the same JS tick.
            if (
              current && current.billRequested && !current.isClosed &&
              !updatedOrder.isClosed &&
              current.orderNumber != null && updatedOrder.orderNumber != null &&
              Number(current.orderNumber) !== Number(updatedOrder.orderNumber)
            ) {
              setTimeout(() => {
                setMirrorOrders(mp => {
                  const arr = mp[current.tableId] || [];
                  if (arr.some(o => Number(o.orderNumber) === Number(current.orderNumber))) return mp;
                  return { ...mp, [current.tableId]: [...arr, current] };
                });
              }, 0);
            }
            // Stale-write guard: ignore events that are more than 30 s older than our
            // local copy. A strict timestamp comparison breaks when the Captain device
            // clock is even slightly behind the server clock (server stamps orders with
            // server-time after each KOT, making all subsequent captain broadcasts look
            // "older"). 30 s covers any realistic clock skew while still blocking truly
            // stale in-transit duplicates.
            if (
              current &&
              !updatedOrder.isClosed &&
              new Date(current.updatedAt || 0).getTime() -
                new Date(updatedOrder.updatedAt || 0).getTime() > 30_000
            ) {
              return prev; // our version is >30 s newer — discard incoming
            }

            // ── Concurrent-edit merge ─────────────────────────────────────────
            // The incoming order is the server's authoritative state but it may
            // not include items the POS just added locally (e.g. cashier tapped
            // an item a split-second before the Captain's socket event arrived).
            // Preserve any local unsent items that are absent from the incoming
            // order so they aren't silently dropped.
            let merged = updatedOrder;
            if (current && !updatedOrder.isClosed) {
              const incomingWithTax = withLocalTaxRate(updatedOrder.items || [], current.items, menuItemsRef.current);
              const incomingIds  = new Set(incomingWithTax.map(i => i.id));
              const deletedIds   = new Set(updatedOrder._deletedItemIds || []);
              const localOnly    = (current.items || []).filter(
                i => !i.sentToKot && !i.isVoided && !i.isGhostVoid && !incomingIds.has(i.id) && !deletedIds.has(i.id)
              );
              merged = { ...updatedOrder, items: [...incomingWithTax, ...localOnly] };
            }

            const next = { ...prev, [updatedOrder.tableId]: merged };
            saveOrdersToStorage(next);
            return next;
          });
        });

        // ── Bill requested from Captain (split or normal) ───────────────────
        // ── Split bill recorded by Captain → show SplitSettlementPanel ──────
        // This event bypasses the stale-write guard so POS always gets it.
        socket.on("split:updated", ({ tableId, isSplitBill, billRequested, splitBills }) => {
          setOrders((prev) => {
            const order = prev[tableId];
            if (!order) return prev;
            const updated = {
              ...order,
              isSplitBill:   true,
              billRequested: true,
              splitBills:    splitBills || order.splitBills || [],
            };
            saveOrdersToStorage({ ...prev, [tableId]: updated });
            return { ...prev, [tableId]: updated };
          });
        });

        socket.on("bill:requested", ({ tableId, isSplit }) => {
          setOrders((prev) => {
            const order = prev[tableId];
            if (!order) return prev;
            const updated = {
              ...order,
              billRequested: true,
              ...(isSplit ? { isSplitBill: true } : {}),
            };
            saveOrdersToStorage({ ...prev, [tableId]: updated });
            return { ...prev, [tableId]: updated };
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

        // ── KOT from Captain app (cloud path) → print on KOT printer ──────────
        // Backend emits one kot:new PER STATION when Captain sends a KOT.
        // Route each event to the correct printer using kot.station.
        socket.on("kot:new", (kot) => {
          if (kot.source === "pos") return; // POS already printed this itself

          // Delay 500 ms before printing so the faster HTTP /print-kot path (Captain → LAN)
          // has time to arrive, run onPrintKot, and register in printedViaHttpRef.
          // If it did, we skip here to prevent double-printing.
          // If Captain has no LAN link the HTTP request never arrives and we print as normal.
          setTimeout(() => {
            if (printedViaHttpRef.current.has(kot.kotNumber)) return;
            const order = ordersRef.current[kot.tableId] || { ...kot, outletName: outlet?.name || "" };
            const waiterPrinter = getKotPrinter();
            const printOpts = { sentBy: kot.operatorName || "", waiter: kot.waiterName || "" };

            // Waiter copy: ALL items, only on the FIRST station event.
            // Backend emits one kot:new per station — isFirstStation prevents N partial waiter slips.
            if (kot.isFirstStation !== false) {
              const waiterItems = kot.allItems || kot.items || [];
              if (waiterItems.length) printKOT(order, waiterItems, waiterPrinter, kot.kotNumber, printOpts);
            }

            // Station copy: this event's items on its dedicated kitchen printer.
            if (kot.station && (kot.items || []).length) {
              const stPrinter = getKotPrinterForStation(kot.station);
              if (stPrinter && stPrinter.name !== waiterPrinter?.name) {
                printKOT(order, kot.items, stPrinter, kot.kotNumber, printOpts);
              }
            }
          }, 500);
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

        // ── Category availability — same pattern as items, independent flag ───
        socket.on("category:availability:state", (state) => {
          Object.entries(state || {}).forEach(([id, entry]) => {
            setCategoryAvailability(id, entry.available !== false, entry.availableAt || null);
          });
        });

        socket.on("category:availability", (data) => {
          if (data?.categoryId != null) {
            setCategoryAvailability(data.categoryId, data.available !== false, data.availableAt || null);
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

        socket.on("waitlist:updated", () => {
          // Another terminal added/removed a waitlist entry — no action needed
          // here; the WaitlistPanel re-polls on its own interval.
        });

        // ── Local WiFi socket (localhost:4001) ────────────────────────────────
        // Connects to the local server running in the Electron main process.
        // Tablets on the same WiFi connect to this directly — no internet needed.
        // Electron-only: in a plain browser (web POS) there's no local server on
        // localhost:4001, so skip this — otherwise it retries forever and floods
        // the network/console with failed connection attempts.
        if (window.electronAPI) {
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
            // Mirror tile: push pending bill to mirrorOrders when a newer order arrives.
            // Use prev (authoritative) to avoid stale-ref race when two events arrive in the same tick.
            if (
              current && current.billRequested && !current.isClosed &&
              !updatedOrder.isClosed &&
              current.orderNumber != null && updatedOrder.orderNumber != null &&
              Number(current.orderNumber) !== Number(updatedOrder.orderNumber)
            ) {
              setTimeout(() => {
                setMirrorOrders(mp => {
                  const arr = mp[current.tableId] || [];
                  if (arr.some(o => Number(o.orderNumber) === Number(current.orderNumber))) return mp;
                  return { ...mp, [current.tableId]: [...arr, current] };
                });
              }, 0);
            }
            if (current && !updatedOrder.isClosed &&
                new Date(current.updatedAt || 0).getTime() -
                  new Date(updatedOrder.updatedAt || 0).getTime() > 30_000) return prev;
            let merged = updatedOrder;
            if (current && !updatedOrder.isClosed) {
              const incomingWithTax = withLocalTaxRate(updatedOrder.items || [], current.items, menuItemsRef.current);
              const incomingIds  = new Set(incomingWithTax.map(i => i.id));
              const deletedIds   = new Set(updatedOrder._deletedItemIds || []);
              const localOnly    = (current.items || []).filter(
                i => !i.sentToKot && !i.isVoided && !i.isGhostVoid && !incomingIds.has(i.id) && !deletedIds.has(i.id)
              );
              merged = { ...updatedOrder, items: [...incomingWithTax, ...localOnly] };
            }
            const next = { ...prev, [updatedOrder.tableId]: merged };
            saveOrdersToStorage(next);
            return next;
          });
        });

        // KOT sent by Captain via local WiFi → print it + mark items sent
        localSock.on("kot:new", (kot) => {
          if (!kot.localMode) return; // cloud KOTs handled by the cloud socket path
          const order = ordersRef.current[kot.tableId] || { ...kot, outletName: outlet?.name || "" };
          // Register the backend KOT number in the dedup Set so the cloud socket.on("kot:new")
          // handler (which fires 500ms later) sees it and skips printing — prevents double-print.
          if (kot.backendKotNumber != null) {
            printedViaHttpRef.current.add(kot.backendKotNumber);
            setTimeout(() => printedViaHttpRef.current.delete(kot.backendKotNumber), 30_000);
          }
          // skipPrint is set when Captain already delegated printing to POS via /print-kot HTTP.
          // In that case we still relay to KDS but skip thermal printing here.
          if (!kot.skipPrint) {
            const waiterPrinter = getKotPrinter();
            const localPrintOpts = { sentBy: kot.actorName, waiter: kot.waiterName || "" };
            printKOT(order, kot.items || [], waiterPrinter, kot.kotNumber, localPrintOpts);
            (kot.stationGroups || []).forEach(sg => {
              const stPrinter = getKotPrinterForStation(sg.station);
              if (stPrinter && stPrinter.name !== waiterPrinter?.name && sg.items?.length) {
                printKOT(order, sg.items, stPrinter, kot.kotNumber, localPrintOpts);
              }
            });
          }
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
          showToast(`🖨 KOT-${String(kot.kotNumber).padStart(4, "0")} (local) → Kitchen`);
        });
        } // end Electron-only local WiFi socket

        // ── New online order arrives from UrbanPiper webhook ──────────────────
        socket.on("online:order:new", () => {
          // Only bump badge if online orders are currently enabled
          setOnlineOrdersEnabled(enabled => {
            if (enabled) setPendingOnlineCount(n => n + 1);
            return enabled;
          });
        });

        // ── QR table orders from customers (handled by Captain App; POS just shows badge) ──
        socket.on("customer:order:new", (order) => {
          setPendingQRCount(n => n + 1);
          showToast(`📲 QR Order — Table ${order.tableLabel || order.tableId} (${order.customerName})`);
        });

        // ── Waiter called from customer QR page ───────────────────────────────
        socket.on("waiter:called", ({ tableLabel, tableId, customerName }) => {
          showToast(`🛎️ Waiter called — Table ${tableLabel || tableId}${customerName ? ` (${customerName})` : ""}`);
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
        // Rebuild areas from outlet if cached areas are missing seats (stale cache)
        let cachedAreas = cache.tableAreas;
        if (cachedAreas) {
          const missingSeats = cachedAreas.some(a => a.tables?.some(t => !t.seats));
          if (missingSeats && cache.outlet?.tables?.length) {
            cachedAreas = buildAreasFromOutlet(cache.outlet);
            saveConfigCache({ outlet: cache.outlet, categories: cache.categories, menuItems: cache.menuItems, tableAreas: cachedAreas });
          }
          setTableAreas(cachedAreas);
        } else if (cache.outlet?.tables?.length) {
          cachedAreas = buildAreasFromOutlet(cache.outlet);
          setTableAreas(cachedAreas);
        }

        // Restore orders from localStorage — merge with cached table layout
        // Pass outletId so cross-outlet stale orders are rejected
        let savedOrders = loadSavedOrders(branchConfig?.outletId || null);

        // ── Stale order cleanup ───────────────────────────────────────────────
        // Remove any active orders older than 24 hours that were never settled.
        // These are ghost orders from previous days — auto-clear on startup.
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        let staleCount = 0;
        savedOrders = Object.fromEntries(
          Object.entries(savedOrders).filter(([, order]) => {
            if (order.isClosed) return true; // keep closed (for history)
            const hasItems = (order.items || []).some(i => !i.isVoided && !i.isGhostVoid);
            if (!hasItems) return true; // empty order — keep
            const lastActivity = order.updatedAt || order.createdAt || 0;
            if (lastActivity < cutoff) { staleCount++; return false; }
            return true;
          })
        );
        if (staleCount > 0) {
          console.info(`[POS] Auto-cleared ${staleCount} stale order(s) older than 24h`);
        }

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
    return () => {
      socketRef.current?.disconnect();
      localSocketRef.current?.disconnect();
    };
  }, [branchConfig]);

  // ── Menu + Tables sync (called by socket event OR manual Sync button) ─────
  async function syncMenuData(outletId) {
    if (!outletId && !outlet?.id) return;
    const id = outletId || outlet.id;
    setIsSyncing(true);
    try {
      const [cats, items, stations, outletsList, discRes, staffRes] = await Promise.all([
        api.get(`/menu/categories?outletId=${id}`).catch(() => null),
        api.get(`/menu/items?outletId=${id}`).catch(() => null),
        api.get("/kitchen-stations").catch(() => null),
        api.get("/outlets").catch(() => null),
        api.get("/settings/discounts").catch(() => null),
        api.get(`/devices/staff?outletId=${id}`).catch(() => null),
      ]);
      // Refresh staff permissions — picks up any mid-shift permission changes from Owner Console
      if (staffRes?.staff?.length) setActiveStaff(staffRes.staff);
      if (discRes?.rules) {
        const outletName = outlet?.name || "";
        const active = discRes.rules.filter(r =>
          r.isActive !== false &&
          (r.outletScope === "All Outlets" || !r.outletScope || r.outletScope === outletName)
        );
        setDiscountRules(active);
        try { localStorage.setItem("pos_discount_rules", JSON.stringify(active)); } catch (_) {}
      }
      if (cats)    setCategories(cats);
      if (items) {
        const freshMenuItems = items.map((i) => ({ ...i, price: parsePriceNumber(i.basePrice || i.price) }));
        setMenuItems(freshMenuItems);

        // ── Propagate updated taxRate to already-open table orders ────────────
        // When owner assigns/changes GST on a menu item, open orders that already
        // have that item in the cart still carry the old taxRate (captured at add-time).
        // On every sync, refresh taxRate on open order items from the fresh menu.
        // Price is intentionally NOT updated — only the tax classification.
        setOrders(prev => {
          const menuById = Object.fromEntries(freshMenuItems.map(m => [m.id, m]));
          const updated  = {};
          let changed    = false;
          Object.entries(prev).forEach(([tableId, order]) => {
            if (!order?.items?.length) { updated[tableId] = order; return; }
            const newItems = order.items.map(item => {
              const menuItem = menuById[item.menuItemId] || menuById[item.id];
              if (!menuItem || menuItem.taxRate == null) return item;
              if (item.taxRate === menuItem.taxRate) return item;
              changed = true;
              return { ...item, taxRate: Number(menuItem.taxRate) };
            });
            updated[tableId] = changed ? { ...order, items: newItems } : order;
          });
          return changed ? updated : prev;
        });
      }
      if (stations?.length) {
        localStorage.setItem("pos_kitchen_stations", JSON.stringify(stations));
      }
      // Re-sync tables/areas from the latest outlet data — ALWAYS update,
      // even if tables array is empty (clears stale demo data from localStorage)
      const freshOutlet = Array.isArray(outletsList) ? outletsList.find(o => o.id === id) : null;
      const freshAreas  = freshOutlet ? buildAreasFromOutlet(freshOutlet) : null;
      if (freshOutlet) {
        setOutlet(freshOutlet);          // ← update React state so gstTreatment, tables etc. reflect immediately
        setTableAreas(freshAreas || []);
        localStorage.setItem("pos_table_config", JSON.stringify(freshAreas || []));
      }
      saveConfigCache({
        outlet:     freshOutlet || null,
        categories: cats    || [],
        menuItems:  items   || [],
        tableAreas: freshAreas,
      });

      // Refresh stock snapshot and merge lowStockLevel from fresh menu items
      if (items) {
        api.get(`/inventory/stock/snapshot?outletId=${id}`)
          .then(snap => {
            if (snap && typeof snap === "object") {
              const merged = { ...snap };
              items.forEach(item => {
                if (merged[item.id] && item.lowStockLevel > 0) {
                  merged[item.id] = { ...merged[item.id], lowStockLevel: Number(item.lowStockLevel) };
                }
              });
              setStockSnapshot(merged);
            }
          })
          .catch(() => {});
      }

      const now = new Date();
      setLastSyncedAt(now);
      localStorage.setItem("pos_last_synced", now.toISOString());

      // Show detailed feedback so staff can confirm tables loaded
      if (freshOutlet) {
        const tableCount = freshOutlet.tables?.length || 0;
        const areaCount  = freshAreas?.length || 0;
        if (tableCount > 0) {
          showToast(`Synced ✓ — ${tableCount} table${tableCount !== 1 ? "s" : ""} in ${areaCount} area${areaCount !== 1 ? "s" : ""}`);
        } else {
          showToast("Synced ✓ — No tables found (add tables in Owner Console)");
        }
      } else {
        showToast("Synced ✓");
      }
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

  // A work-area terminal (e.g. "Self Service", "Sweet Counter") must only ever
  // reflect ITS OWN assigned area's tables — never tables from other areas like
  // "AC Dining". "Full Access" terminals (no workArea) keep seeing everything.
  const workAreaScopedTableAreas = useMemo(() => {
    const wa = branchConfig?.workArea || "";
    if (!wa) return tableAreas;
    return tableAreas.filter((a) => a.name === wa);
  }, [tableAreas, branchConfig?.workArea]);

  // A work-area terminal with no physical tables assigned to it (a pure counter,
  // e.g. "Self Service" or "Bakery Counter") has nothing to pick a table from —
  // send it straight to the billing screen instead of showing an empty table picker.
  // Takeaway/Delivery on a Full Access terminal are the same kind of counter —
  // no table grid applies there either — so they get the identical auto-jump:
  // one tap on the mode pill drops you straight into the menu/order screen,
  // same as the Sweet Counter workflow. Recall other open tickets via Held Orders.
  useEffect(() => {
    const isPureCounterWorkArea = !!branchConfig?.workArea &&
      !workAreaScopedTableAreas.some((a) => a.tables.length > 0);
    const isCounterServiceMode = serviceMode === "takeaway" || serviceMode === "delivery";
    if (!isPureCounterWorkArea && !isCounterServiceMode) return;
    if (selectedTableId) { autoCounterOpenedRef.current = false; return; }
    if (autoCounterOpenedRef.current) return;
    autoCounterOpenedRef.current = true;
    handleNewCounterOrder();
  }, [branchConfig?.workArea, workAreaScopedTableAreas, selectedTableId, serviceMode]);

  // Auto-save every order change to localStorage — belt-and-suspenders
  useEffect(() => {
    if (Object.keys(orders).length > 0) saveOrdersToStorage(orders);
    ordersRef.current = orders; // keep ref in sync for socket callbacks
  }, [orders]);

  useEffect(() => {
    try {
      if (Object.keys(mirrorOrders).length > 0) {
        localStorage.setItem(MIRROR_ORDERS_KEY, JSON.stringify(mirrorOrders));
      } else {
        localStorage.removeItem(MIRROR_ORDERS_KEY);
      }
    } catch {}
  }, [mirrorOrders]);

  // Restrict the menu shown at this terminal to its assigned work area.
  // A "Full Access" terminal (no workArea) sees everything, as before.
  // A work-area terminal only sees categories explicitly tagged with that
  // area — categories with no area tag are NOT shown here (they only show
  // on Full Access terminals), so assigning one category to "Sweet Counter"
  // actually hides the rest of the menu instead of leaving it visible by default.
  const workArea = branchConfig?.workArea || "";
  function categoryVisibleInWorkArea(category) {
    if (!workArea) return true;
    const avail = category.areaAvailability || [];
    return avail.some((a) => a.area === workArea && a.enabled !== false);
  }
  // Item-level area tags (if set) refine/override the category's scope.
  // An item with no area tag of its own simply inherits its category's visibility.
  function itemVisibleInWorkArea(item) {
    if (!workArea) return true;
    const avail = item.areaAvailability || [];
    if (avail.length === 0) return true;
    return avail.some((a) => a.area === workArea && a.enabled !== false);
  }
  const visibleCategories = useMemo(
    () => (workArea ? categories.filter(categoryVisibleInWorkArea) : categories),
    [categories, workArea]
  );
  const visibleMenuItems = useMemo(() => {
    if (!workArea) return menuItems;
    const visibleCatIds = new Set(visibleCategories.map((c) => c.id));
    return menuItems.filter((item) =>
      itemVisibleInWorkArea(item) &&
      (!item.categoryId || visibleCatIds.has(item.categoryId))
    );
  }, [menuItems, visibleCategories, workArea]);

  // Keep barcode scanner refs in sync with latest state/functions
  useEffect(() => { selectedTableIdRef.current = selectedTableId; }, [selectedTableId]);
  useEffect(() => { outletRef.current = outlet; }, [outlet]);
  useEffect(() => { menuItemsRef.current = menuItems; }, [menuItems]);
  useEffect(() => { handleAddItemRef.current = handleAddItem; }); // no dep — always latest

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

  // ── Background outlet + menu refresh every 10 minutes ────────────────────
  // Safety net for when the Owner Console changes gstTreatment, taxRate, or
  // other settings while the POS is running. Socket sync:config handles it
  // instantly, but this periodic refresh catches missed events (e.g. POS was
  // offline or connected before the Owner Web made the change).
  useEffect(() => {
    if (!outlet?.id) return;
    const id = setInterval(() => {
      syncMenuData(outlet.id);
    }, 10 * 60 * 1000); // every 10 minutes
    return () => clearInterval(id);
  }, [outlet?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Captain → POS print delegation ───────────────────────────────────────
  // Captain sends { order, kots, allItems, kotSeq, sentBy, waiter } via HTTP
  // POST /print-kot on the local server. Main process relays via IPC. POS uses
  // its own pos_printers config to print waiter copy + per-station copies.
  useEffect(() => {
    if (!window.electronAPI?.onPrintKot) return;
    const cleanup = window.electronAPI.onPrintKot(({ order, kots, allItems, kotSeq, sentBy, waiter }) => {
      // Record this KOT number so the cloud kot:new handler skips it (prevents double-print)
      if (kotSeq != null) {
        printedViaHttpRef.current.add(kotSeq);
        setTimeout(() => printedViaHttpRef.current.delete(kotSeq), 30_000);
      }
      const waiterPrinter = getKotPrinter();
      if (allItems?.length) {
        printKOT(order, allItems, waiterPrinter, kotSeq, { sentBy, waiter });
      }
      (kots || []).forEach(kot => {
        const st = (kot.station || "").trim();
        if (!st || st.toLowerCase() === "main kitchen") return;
        const stPrinter = getKotPrinterForStation(st);
        if (stPrinter && stPrinter.name !== waiterPrinter?.name && (kot.items || []).length) {
          printKOT(order, kot.items, stPrinter, kotSeq, { sentBy, waiter });
        }
      });
    });
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bill print delegated from Captain via POST /print-bill ────────────────
  useEffect(() => {
    if (!window.electronAPI?.onPrintBill) return;
    const cleanup = window.electronAPI.onPrintBill(({ order, items, outletData, cashierName, captainName, waiterName }) => {
      printBill(order, items, outletData || outlet || branchConfig?.outletName, {
        cashierName: cashierName || null,
        captainName: captainName || null,
        waiterName:  waiterName  || null,
      });
    });
    return cleanup;
  }, [outlet, branchConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Barcode scanner listener ──────────────────────────────────────────────
  // USB/Bluetooth scanners act like a keyboard — they type the barcode very fast
  // (< 50 ms between characters) then press Enter. We buffer rapid keystrokes and
  // on Enter call /menu/sku-lookup to find the item, then add it to the order.
  // Ignored when an input/textarea/select is focused (cashier is typing normally).
  useEffect(() => {
    let buffer = "";
    let bufferTimer = null;
    // Prevents the same barcode scan from firing multiple API calls when a scanner
    // sends Enter key more than once (common on some USB scanner models).
    let scanLocked = false;

    function resetBuffer() {
      buffer = "";
      if (bufferTimer) { clearTimeout(bufferTimer); bufferTimer = null; }
    }

    function onKeyDown(e) {
      // Skip if focus is inside a text input / textarea / select
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      // Skip if any modal is open — scanner should not add items behind a dialog
      if (modalOpenRef.current) return;

      if (e.key === "Enter") {
        if (scanLocked) { resetBuffer(); return; }  // duplicate Enter from scanner — ignore
        const scanned = buffer.trim();
        resetBuffer();
        if (scanned.length < 1) return;           // empty — ignore (allow single digit item numbers)
        if (!selectedTableIdRef.current) {
          showToast("Select a table first, then scan");
          return;
        }

        // Lock for 600 ms — enough to absorb any duplicate Enter emissions
        scanLocked = true;
        setTimeout(() => { scanLocked = false; }, 600);

        // ── Weight scale EAN-13 barcode: format 02PPPPPWWWWWC ───────────────
        // "02" prefix + 5-digit PLU + 5-digit weight-grams + 1 check digit
        if (scanned.length === 13 && /^\d{13}$/.test(scanned) && scanned.startsWith("02")) {
          const plu   = parseInt(scanned.slice(2, 7), 10);
          const grams = parseInt(scanned.slice(7, 12), 10);
          const item  = menuItemsRef.current.find(i => Number(i.scalePlu) === plu);
          if (!item) {
            showToast(`❌ Scale PLU ${String(plu).padStart(5, "0")} not found — check Scale Sheet`);
            return;
          }
          const qty100g = +(grams / 100).toFixed(3);
          handleAddItemRef.current(item, qty100g, true);
          showToast(`✅ ${item.name} — ${(grams / 1000).toFixed(3)} kg added`);
          return;
        }

        // Look up item by SKU/barcode
        api.get(`/menu/sku-lookup?sku=${encodeURIComponent(scanned)}&outletId=${outletRef.current?.id || ""}`)
          .then((item) => {
            handleAddItemRef.current(item);
            showToast(`✅ ${item.name} added via scanner`);
          })
          .catch((err) => {
            const notFound = err?.message?.toLowerCase().includes("not found") || err?.message?.includes("SKU_NOT_FOUND");
            showToast(notFound ? `❌ Barcode not found: ${scanned}` : `❌ Scanner error — try again`);
          });
        return;
      }

      // Only buffer printable single characters
      if (e.key.length === 1) {
        buffer += e.key;
        // Reset buffer if no new character arrives within 80 ms (human typing is slower)
        if (bufferTimer) clearTimeout(bufferTimer);
        bufferTimer = setTimeout(resetBuffer, 80);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); resetBuffer(); };
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

  // Active (non-voided) item count in the current order — used by the order tab badge.
  const activeOrderItemCount = useMemo(() => {
    if (!selectedOrder) return 0;
    return (selectedOrder.items || []).filter(i => !i.isVoided).length;
  }, [selectedOrder]);

  // Top 8 most-ordered items (for Favourites chip)
  const favouriteItemIds = useMemo(() =>
    Object.entries(itemCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([id]) => String(id)),
  [itemCounts]);

  // Quantities of unsent items in current order — used by MenuPanel +/− buttons.
  // MUST be here (before any conditional returns) to obey React Rules of Hooks.
  const menuQuantities = useMemo(() => {
    const map = {};
    if (!selectedOrder) return map;
    (selectedOrder.items || [])
      .filter(i => !i.sentToKot && !i.isVoided)
      .forEach(i => { if (i.menuItemId) map[i.menuItemId] = (map[i.menuItemId] || 0) + i.quantity; });
    return map;
  }, [selectedOrder]);

  // ── Order mutations ───────────────────────────────────────────────────────
  function mutateOrder(tableId, updater) {
    setOrders((prev) => {
      const order = prev[tableId];
      if (!order) return prev;
      const next = updater(structuredClone(order));
      // Stamp cashierName so Captain App bill always shows the correct POS cashier
      if (cashierName) next.cashierName = cashierName;
      // Always stamp updatedAt so the stale-write guard in order:updated handler
      // can correctly reject any incoming socket event that has older data.
      // Without this, cleared items can reappear when Captain broadcasts old state.
      next.updatedAt = Date.now();
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

  // available=false requires availableAt (ISO timestamp the cashier expects to restock).
  // Independent of item-level salesAvailability — disables the whole category.
  function handleToggleCategoryAvailability(categoryId, available, availableAt = null) {
    setCategoryAvailability(categoryId, available, availableAt);
    socketRef.current?.emit("category:availability", {
      outletId: outlet?.id,
      categoryId,
      available,
      availableAt,
    });
  }

  function handleToggleOnlineOrders() {
    const next = !onlineOrdersEnabled;
    setOnlineOrdersEnabled(next);
    localStorage.setItem("pos_online_orders_enabled", String(next));
    socketRef.current?.emit("online:orders:toggle", { outletId: outlet?.id, enabled: next });
    if (!next) setPendingOnlineCount(0);
  }

  async function handleAddItem(item, overrideQty = null, fromScale = false) {
    if (!selectedTableId) return;
    const tableId = selectedTableId;

    // Block add if stock is tracked, at 0, and allowNegative is off
    const snap = stockSnapshot[item.id];
    if (snap && snap.currentStock <= 0 && snap.allowNegative === false) {
      showToast(`${item.name} is out of stock`);
      return;
    }

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
      // Stamp occupiedAt when first active item is added — used for elapsed time display
      if (!order.occupiedAt && !(order.items || []).some(i => !i.isVoided && !i.isComp)) {
        order.occupiedAt = Date.now();
      }
      // Scale items always get a new line (never merge) — each scan is a distinct weight
      const existing = fromScale ? -1 : order.items.findIndex((i) => i.menuItemId === item.id && !i.sentToKot);
      if (existing >= 0) {
        order.items[existing].quantity += overrideQty ?? 1;
      } else {
        // Use area override price if the table's area matches one of the item's overrides
        const _aov1 = item.areaOverrides?.[order.areaName || ""];
        order.items.push({
          id:              itemId,
          menuItemId:      item.id,
          name:            item.name,
          price:           (_aov1 && Number(_aov1) > 0) ? Number(_aov1) : parsePriceNumber(item.price || item.basePrice),
          quantity:        overrideQty ?? 1,
          sentToKot:       false,
          note:            "",
          station:         resolvedStation,
          categoryId:      item.categoryId || "",
          category:        (categories.find(c => c.id === item.categoryId)?.name)
                             || item.categoryName || item.category || "",
          // ⚠️ taxRate MUST be included so 0% items don't fall back to 5% default
          taxRate:         item.taxRate != null ? Number(item.taxRate) : null,
          unit:            item.unit || "",
          allowDecimalQty: !!item.allowDecimalQty,
        });
      }
      return order;
    });

    // Track item order frequency for Favourites chip
    setItemCounts(prev => {
      const updated = { ...prev, [item.id]: (prev[item.id] || 0) + 1 };
      saveItemCounts(updated);
      return updated;
    });

    // 2. Persist to backend and reconcile with server response.
    //    Counter/takeaway tickets (tableId starts with "counter-") have no backend table
    //    entry — the handler returns { ok: true, skipped: true } and we keep local state.
    if (tableId.startsWith("counter-") || tableId.startsWith("online-")) return;

    try {
      // Resolve area override for the backend payload (mirrors local-push logic above)
      const _areaName2 = orders[tableId]?.areaName || "";
      const _aov2      = item.areaOverrides?.[_areaName2];
      const serverOrder = await api.post("/operations/order/item", {
        tableId,
        outletId: outlet?.id,
        item: {
          id:         itemId,
          menuItemId: item.id,
          name:       item.name,
          price:      (_aov2 && Number(_aov2) > 0) ? Number(_aov2) : parsePriceNumber(item.price || item.basePrice),
          quantity:   overrideQty ?? 1,
          note:       "",
          stationName: resolvedStation,
          categoryId:  item.categoryId || "",
          category:    (categories.find(c => c.id === item.categoryId)?.name)
                         || item.categoryName || item.category || "",
          taxRate:     item.taxRate != null ? Number(item.taxRate) : null,
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
          const filteredServerItems = withLocalTaxRate(
            (serverOrder.items || []).filter(
              (si) => si.sentToKot || si.isVoided || localItemIds.has(si.id)
            ),
            localOrder.items,
            menuItemsRef.current
          );
          return {
            ...prev,
            [tableId]: {
              ...serverOrder,
              items: [...filteredServerItems, ...localOnlyUnsent]
            }
          };
        });

        // Race-condition guard: if the user removed this item (×) while api.post was
        // still in-flight, api.delete would have been a no-op (item not on server yet).
        // Now the server has the item but local state doesn't. Re-issue the delete so
        // the backend is clean and the item won't resurrect on the next table open.
        setTimeout(() => {
          const current = ordersRef.current[tableId];
          const stillPresent = (current?.items || []).some(i => i.id === itemId);
          if (!stillPresent) {
            api.delete("/operations/order/item", { tableId, itemId })
              .catch(() => {}); // best-effort; backend may already be clean
          }
        }, 0);
      }
    } catch (err) {
      // Offline or server unreachable — local optimistic state is intact, no data lost.
      // Items will reach the server when the connection returns (or at KOT send time).
      console.warn("[POS] item-add to backend failed (offline?):", err.message);
    }
  }

  function handleChangeQty(idx, qty) {
    if (!selectedTableId) return;
    const tableId = selectedTableId;
    let removedItem = null;
    mutateOrder(tableId, (order) => {
      if (qty <= 0) {
        removedItem = order.items[idx]; // capture before splice
        order.items.splice(idx, 1);
      } else {
        order.items[idx].quantity = qty;
      }
      return order;
    });
    // When qty drops to 0 via the − button, delete from backend too (mirrors handleRemoveItem)
    if (removedItem?.id && !removedItem.sentToKot &&
        !tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
      api.delete("/operations/order/item", { tableId, itemId: removedItem.id })
        .catch(err => console.warn("[POS] item-remove from backend failed:", err.message));
    }
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

  // Decrement quantity of the last unsent instance of an item (for menu −/+ buttons)
  function handleDecrementItem(item) {
    if (!selectedTableId) return;
    const order = orders[selectedTableId];
    if (!order) return;
    // Find last unsent item matching this menuItemId
    const idx = [...(order.items || [])]
      .map((i, index) => ({ i, index }))
      .reverse()
      .find(({ i }) => i.menuItemId === item.id && !i.sentToKot)?.index;
    if (idx == null) return;
    handleChangeQty(idx, (order.items[idx].quantity || 1) - 1);
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
      actorName:   "POS",   // always "POS" so backend never writes cashier name into captainName
      items:       unsent,  // ALL unsent items — server handles station split
    };
    let wasQueued = false;
    try {
      const result = await api.post("/operations/kot", kotPayload);
      if (result?.kots?.length) serverKots = result.kots;
      else if (result?.kot)     serverKots = [result.kot];
      if (result?.order) lastServerOrder = result.order;
    } catch (err) {
      // Offline — queue for retry; print with local kotSeq
      wasQueued = true;
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
    // Always print KOT when staff explicitly sends from POS.
    // kotAutoSendEnabled() only gates automated/background scenarios — a
    // deliberate "Send KOT" click must always fire the printer.
    {
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
    if (wasQueued) {
      showToast(`⚡ KOT-${String(serverKotNumber).padStart(4, "0")} queued — will send when online`);
    } else {
      showToast(`🖨️ KOT-${String(serverKotNumber).padStart(4, "0")} sent${printerLabel}`);
    }

    // Deduct stock for tracked items — fire-and-forget, non-blocking
    if (outlet?.id && unsent.length) {
      api.post("/inventory/stock/deduct", {
        outletId: outlet.id,
        items: unsent.map(i => ({ itemId: i.menuItemId || i.id, quantity: i.quantity || 1 })),
      }).then(result => {
        if (result?.deducted?.length) {
          setStockSnapshot(prev => {
            const next = { ...prev };
            result.deducted.forEach(({ itemId, newStock }) => {
              if (next[itemId]) next[itemId] = { ...next[itemId], currentStock: newStock };
            });
            return next;
          });
        }
      }).catch(err => {
        console.warn("[POS] stock deduction failed:", err?.message);
        // Delay warning so it doesn't overlap the KOT sent toast
        setTimeout(() => showToast("⚠ Stock deduction failed — update inventory manually"), 3000);
      });
    }

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
    // Reset the counter auto-open guard so the next render opens a fresh ticket
    // when in counter/takeaway/delivery mode (prevents blank screen after KOT).
    autoCounterOpenedRef.current = false;
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

    if (tableId.startsWith("counter-") || tableId.startsWith("online-")) return;

    // 2. Pre-assign bill number at request time so the preview and audit trail
    //    show the correct sequential number, not just the order number.
    //    The endpoint is idempotent — if print happens first it returns the same number.
    try {
      const billResult = await api.post("/operations/assign-bill-no", {
        outletId: outlet?.id,
        tableId,
        source: "pos-request",
      });
      if (billResult?.billNo != null) {
        mutateOrder(tableId, o => {
          o.billNo     = billResult.billNo;
          o.billNoMode = billResult.billNoMode || null;
          o.billNoFY   = billResult.billNoFY   || null;
          o.billNoDate = billResult.billNoDate  || null;
          return o;
        });
      }
    } catch (err) {
      console.warn("[POS] assign-bill-no at request-time failed (offline?):", err.message);
    }

    // 3. Persist bill-requested flag to backend and reconcile
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

  async function handleSettle(paymentsInput) {
    if (!selectedTableId && !selectedMirrorOrder) return;
    const isMirrorSettle = !!selectedMirrorOrder;
    const order       = selectedMirrorOrder || orders[selectedTableId];
    const tableId     = selectedTableId || order?.tableId;
    if (!order || !tableId) return;
    const newPayments = Array.isArray(paymentsInput) ? paymentsInput : [paymentsInput];

    // Build the fully-paid order snapshot
    const allPayments  = [...(order.payments || []), ...newPayments];
    const billableItems = order.items.filter(i => !i.isVoided && !i.isComp);
    const subtotal     = billableItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const disc         = Math.min(order.discountAmount || 0, subtotal);
    const afterDisc    = subtotal - disc;
    // Per-item tax — must match getFinancials exactly so "amount due" on screen == settlement total.
    // Falls back to 0 (not outlet defaultTaxRate) so display and settlement always agree.
    const inclusive    = outlet?.gstTreatment === "inclusive";
    const taxAmt       = billableItems.reduce((s, i) => {
      const lineAfter = subtotal > 0 ? (i.price * i.quantity) * (afterDisc / subtotal) : 0;
      const rate      = i.taxRate != null && i.taxRate !== "" ? Number(i.taxRate) : 0;
      return s + Math.round(lineAfter * rate / (inclusive ? (100 + rate) : 100));
    }, 0);
    const total        = inclusive ? afterDisc : afterDisc + taxAmt;
    const paid         = allPayments.reduce((s, p) => s + p.amount, 0);

    if (paid < total) {
      // Partial payment — for mirror orders update in mirrorOrders; for normal use mutateOrder.
      if (isMirrorSettle) {
        const updatedMirror = { ...order, payments: allPayments };
        setMirrorOrders(mp => {
          const arr = (mp[tableId] || []).map(o =>
            o.orderNumber === order.orderNumber ? updatedMirror : o
          );
          return { ...mp, [tableId]: arr };
        });
        setSelectedMirrorOrder(updatedMirror);
      } else {
        mutateOrder(tableId, (o) => { o.payments = allPayments; return o; });
      }
      setShowPayment(false);
      if (!isMirrorSettle) setSelectedMirrorOrder(null);
      showToast(`Payment recorded · ₹${newPayments.reduce((s,p)=>s+p.amount,0)}`);

      // Backend partial sync only for normal (non-mirror) orders.
      // Mirror orders are settled in full via /closed-order — partial backend sync
      // would target the wrong in-memory slot (which holds the newer active order).
      if (!isMirrorSettle && !tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
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
    // Detect credit sale — payment method "credit" carries creditCustomer details
    const creditPayment    = newPayments.find(p => p.method === "credit");
    const isCreditSale     = !!creditPayment;
    const creditCustomer   = creditPayment?.creditCustomer || null;

    // Stamp creditCustomer on the live order NOW so any reprint includes the customer name.
    // For mirror settle, the live orders[tableId] is the NEW order — don't stamp it.
    if (isCreditSale && creditCustomer && !isMirrorSettle) {
      mutateOrder(tableId, o => { o.creditCustomer = creditCustomer; o.isCreditSale = true; return o; });
    }

    const closedOrder = {
      ...structuredClone(order),
      payments:       allPayments,
      isClosed:       true,
      closedAt:       new Date().toISOString(),
      cashierName:    cashierName || "POS",
      // Credit sale fields — present only for credit settlements
      ...(isCreditSale && {
        isCreditSale:   true,
        creditStatus:   "unpaid",
        creditCustomer,
      }),
    };

    // 1. Save to pos_closed_orders in localStorage
    try {
      const prev = JSON.parse(localStorage.getItem("pos_closed_orders") || "[]");
      // Stamp outlet so PastOrdersModal can filter cross-outlet contamination
      prev.unshift({ ...closedOrder, _outletId: outlet?.id || branchConfig?.outletId });
      // Keep last 500 orders
      localStorage.setItem("pos_closed_orders", JSON.stringify(prev.slice(0, 500)));
    } catch {}

    // 2. For normal settle: temporarily mark table closed for the 1.5 s UI flash.
    //    For mirror settle: orders[tableId] holds the ACTIVE new order — don't touch it.
    if (!isMirrorSettle) {
      setOrders(prev => ({ ...prev, [tableId]: closedOrder }));
      // Notify Captain App + KDS that this table's bill is settled
      socketRef.current?.emit("order:update", { outletId: outlet?.id, order: closedOrder });
      localSocketRef.current?.emit("order:clear", { tableId });
      window.electronAPI?.pushOrdersToLocal?.([]);
    }

    // 3. Push full closed order to backend so Owner Web shows real sales figures.
    // For mirror settle: backend detects hasNewerOrder (Order 2 in memory != Order 1 being
    // settled), skips clearTableAfterSettle, and re-broadcasts Order 2 to all devices.
    let backendConfirmed = false;
    try {
      // Server returns { ok, billNo, billNoMode, billNoFY, billNoDate, closedAt }
      const closeResult = await api.post("/operations/closed-order", {
        outletId: outlet?.id,
        order:    closedOrder,
      });
      backendConfirmed = true;

      // ── Stamp server-assigned bill number onto the local record ────────────
      if (closeResult?.billNo != null) {
        closedOrder.billNo     = closeResult.billNo;
        closedOrder.billNoMode = closeResult.billNoMode  || null;
        closedOrder.billNoFY   = closeResult.billNoFY    || null;
        closedOrder.billNoDate = closeResult.billNoDate  || null;
        closedOrder.closedAt   = closeResult.closedAt    || closedOrder.closedAt;

        // Overwrite the localStorage record with the stamped version
        try {
          const prev = JSON.parse(localStorage.getItem("pos_closed_orders") || "[]");
          if (prev.length && prev[0].orderNumber === closedOrder.orderNumber) {
            prev[0] = { ...closedOrder, _outletId: outlet?.id || branchConfig?.outletId };
          }
          localStorage.setItem("pos_closed_orders", JSON.stringify(prev));
        } catch {}
      }
    } catch (err) {
      console.warn("[POS] closed-order sync failed (offline?) — queuing for retry:", err.message);
      const q = loadClosedOrderQueue();
      q.push({ order: closedOrder });
      saveClosedOrderQueue(q);
    }

    setShowPayment(false);
    setSelectedMirrorOrder(null);
    setSelectedTableId(null);

    // Trigger cash drawer if any payment was cash (Electron only, silent on web)
    if (hasCashPayment(allPayments)) openCashDrawer();

    showToast(
      backendConfirmed
        ? "✓ Bill settled · Table is ready"
        : "✓ Bill settled · Syncing in background"
    );

    if (isMirrorSettle) {
      // Notify cloud + LAN KDS that the mirror order (Order 1) is now closed.
      // Cloud backend's hasNewerOrder guard will re-broadcast Order 2 to cloud KDS clients.
      socketRef.current?.emit("order:update", { outletId: outlet?.id, order: closedOrder });
      // LAN KDS tablets (local WiFi socket) don't receive the cloud re-broadcast,
      // so clear the table display explicitly; Order 2's KOTs are already on KDS.
      localSocketRef.current?.emit("order:clear", { tableId });
      // Remove this mirror order from the mirrorOrders tile — the active new order stays.
      const settledNum = order.orderNumber;
      setMirrorOrders(mp => {
        const arr = (mp[tableId] || []).filter(o => o.orderNumber !== settledNum);
        if (!arr.length) {
          const next = { ...mp };
          delete next[tableId];
          return next;
        }
        return { ...mp, [tableId]: arr };
      });
      // Backend's hasNewerOrder guard re-broadcasts the active new order — no local reset needed.
    } else {
      // Normal settle: drop billRequested before backend's Order 2 broadcast lands.
      setOrders(prev => {
        const cur = prev[tableId];
        if (!cur) return prev;
        return { ...prev, [tableId]: { ...cur, billRequested: false } };
      });

      // Local safety-net reset after 1.5 s (no-op when backend broadcast already landed).
      setTimeout(() => {
        const area  = tableAreas.find(a => a.tables.some(t => t.id === tableId));
        const table = area?.tables.find(t => t.id === tableId);

        if (!table || !area) {
          setOrders(prev => {
            if (!prev[tableId]?.isClosed) return prev;
            const next = { ...prev };
            delete next[tableId];
            return next;
          });
          return;
        }

        setOrders(prev => {
          if (prev[tableId]?.orderNumber !== order.orderNumber) return prev;
          const maxNum = Math.max(10050, ...Object.values(prev).map(o => o.orderNumber || 10050)) + 1;
          const fresh  = buildBlankOrder(table, area, outlet?.name || "Outlet", maxNum);
          return { ...prev, [tableId]: fresh };
        });
        checkWaitlistSuggest(tableId);
      }, 1500);
    }
  }

  function handleSelectMirrorOrder(tableId, mirrorOrder) {
    setSelectedTableId(tableId);
    setSelectedMirrorOrder(mirrorOrder);
    setShowPayment(true);
  }

  async function handleConfirmSplit(splits) {
    if (!selectedTableId || !outlet?.id) return;
    for (const split of splits) {
      try {
        await api.post("/operations/split-bill-record", {
          outletId:  outlet.id,
          tableId:   selectedTableId,
          seatLabel: split.seatLabel,
          billNo:    split.billNo,
          items:     split.items,
          subtotal:  split.subtotal,
          tax:       split.tax,
          total:     split.total,
        });
      } catch (err) {
        console.warn("[POS] split-bill-record failed:", err.message);
      }
    }
    showToast("Split recorded · Collect per seat");
  }

  // ── Delete empty counter order (ghost cleanup) ────────────────────────────
  function handleDeleteCounterOrder(tableId) {
    setOrders(prev => {
      const order = prev[tableId];
      if (!order?.isCounter) return prev;
      const hasItems = (order.items || []).filter(i => !i.isVoided && !i.isComp).length > 0;
      if (hasItems) return prev; // only delete truly empty tickets
      // Abandoned before any items were rung up — recycle its ticket number
      // back to the front of the queue instead of leaving a permanent gap.
      if (order.ticketNumber != null) {
        setRecycledTicketNums(nums => [order.ticketNumber, ...nums]);
      }
      const next = { ...prev };
      delete next[tableId];
      return next;
    });
    setSelectedTableId(prev => prev === tableId ? null : prev);
  }

  // Issues the next counter ticket number — reuses a recycled number (from an
  // abandoned ticket) before advancing the running counter.
  function nextCounterTicketNumber() {
    if (recycledTicketNums.length > 0) {
      const num = recycledTicketNums[0];
      setRecycledTicketNums(nums => nums.slice(1));
      return num;
    }
    const num = counterTicketNum;
    setCounterTicketNum(n => n + 1);
    return num;
  }

  // ── Counter order ─────────────────────────────────────────────────────────
  function handleNewCounterOrder() {
    const ticketNum = nextCounterTicketNumber();
    const ticketId  = `counter-${Date.now()}`;
    // If this terminal is dedicated to a work area (e.g. "Sweet Counter", "Self Service"),
    // every counter ticket rung here is priced using that area's price overrides.
    // "Full Access" terminals (no workArea set) keep the old Takeaway/Delivery naming.
    const areaName = branchConfig?.workArea || (serviceMode === "delivery" ? "Delivery" : "Takeaway");
    const area      = { id: "counter", name: areaName };
    const fakeTable = { id: ticketId, number: String(ticketNum).padStart(3, "0") };
    const orderNum  = Math.max(10050, ...Object.values(orders).map(o => o.orderNumber || 10050)) + 1;

    const newOrder = {
      ...buildBlankOrder(fakeTable, area, outlet?.name || "Outlet", orderNum),
      isCounter:    true,
      ticketNumber: ticketNum
    };

    setOrders(prev => ({ ...prev, [ticketId]: newOrder }));
    setSelectedTableId(ticketId);
  }

  // ── Select table (dine-in) ─────────────────────────────────────────────────
  // 1. Sets selectedTableId immediately so the order panel opens without waiting.
  // 2. Calls GET /operations/order?tableId=... to get or create the backend order.
  // 3. Reconciles: server state is authoritative; any unsent local items the server
  //    does not know (offline-added) are appended on top.
  // Counter/takeaway/online tickets are skipped — they have no backend table entry.
  async function handleSelectTable(tableId) {
    setSelectedMirrorOrder(null); // always clear stale mirror order when selecting a table
    setSelectedTableId(tableId);

    if (!tableId || !outlet?.id) return;
    if (tableId.startsWith("counter-") || tableId.startsWith("online-")) return;

    try {
      const serverOrder = await api.get(`/operations/order?tableId=${tableId}&outletId=${outlet.id}`);
      if (!serverOrder || serverOrder.skipped) return;

      // Mirror tile: if local has a pending bill and server has a newer order, save pending bill
      const localSnapshot = ordersRef.current[tableId];
      if (
        localSnapshot && localSnapshot.billRequested && !localSnapshot.isClosed &&
        !serverOrder.isClosed &&
        localSnapshot.orderNumber != null && serverOrder.orderNumber != null &&
        Number(localSnapshot.orderNumber) !== Number(serverOrder.orderNumber)
      ) {
        setMirrorOrders(mp => {
          const arr = mp[tableId] || [];
          if (arr.some(o => Number(o.orderNumber) === Number(localSnapshot.orderNumber))) return mp;
          return { ...mp, [tableId]: [...arr, localSnapshot] };
        });
      }

      setOrders((prev) => {
        const localOrder = prev[tableId];
        // Stale-write guard: if our local copy is newer than the server's (same session),
        // don't overwrite. Allow server to win when it's a closed/settled order or a
        // different order session (mirror situation — let Order 2 through).
        if (
          localOrder &&
          !serverOrder.isClosed &&
          localOrder.orderNumber === serverOrder.orderNumber &&
          (localOrder.updatedAt || 0) > (serverOrder.updatedAt || 0)
        ) {
          return prev;
        }
        // Preserve unsent local items for the SAME order session (offline adds).
        // If orderNumber differs, the table was reset between sessions — discard stale items.
        const serverItemIds   = new Set((serverOrder.items || []).map((i) => i.id));
        const sameSession     = !!(localOrder?.orderNumber && serverOrder.orderNumber &&
                                localOrder.orderNumber === serverOrder.orderNumber);
        const localOnlyUnsent = sameSession
          ? (localOrder?.items || []).filter((li) => !li.sentToKot && !serverItemIds.has(li.id))
          : [];
        // Clean ghost voided items: items voided BEFORE they were ever sent to the kitchen.
        const isGhostItem  = (i) => i.isGhostVoid === true || (i.isVoided === true && i.sentToKot === false);
        const cleanedServerItems = withLocalTaxRate(
          (serverOrder.items || []).filter(i => !isGhostItem(i)),
          localOrder?.items,
          menuItemsRef.current
        );
        return {
          ...prev,
          [tableId]: {
            ...serverOrder,
            items: [...cleanedServerItems, ...localOnlyUnsent]
          }
        };
      });

      // Permanently delete ghost items from backend so server never sends them back.
      // Same catch-all predicate: voided + never sent to KOT = ghost, always.
      const isGhostItem2 = (i) => i.isGhostVoid === true || (i.isVoided === true && i.sentToKot === false);
      const ghostIdsToDelete = (serverOrder.items || [])
        .filter(isGhostItem2)
        .map(i => i.id);
      ghostIdsToDelete.forEach(itemId => {
        api.delete("/operations/order/item", { tableId, itemId })
          .catch(() => {}); // silent — best-effort cleanup
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
  async function handleTransferTable(toTableId) {
    if (!selectedTableId || !toTableId || selectedTableId === toTableId) return;
    const fromOrder = orders[selectedTableId];
    const toOrder   = orders[toTableId];
    if (!fromOrder || !toOrder) return;

    const toTableNumber = toOrder.tableNumber || toTableId;

    // Call backend first — same pattern as Captain app to avoid race conditions
    try {
      await api.post(`/operations/orders/${selectedTableId}/move-table`, {
        targetTableId: toTableId,
        actorName: "POS",
        actorRole: "POS",
      });
    } catch (err) {
      showToast(`Transfer failed: ${err.message || "Server error"}`, "error");
      console.warn("[POS] transfer failed:", err.message);
      return;
    }

    // Backend confirmed — update local state and navigate to new table
    setOrders(prev => {
      const from = prev[selectedTableId];
      const to   = prev[toTableId];
      if (!from || !to) return prev;
      const next = { ...prev };
      next[toTableId]       = { ...from, tableId: toTableId, tableNumber: to.tableNumber, areaName: to.areaName };
      next[selectedTableId] = { ...to, items: [], payments: [], discountAmount: 0,
        billRequested: false, isOnHold: false, isClosed: false };
      return next;
    });
    setSelectedTableId(toTableId);
    showToast(`Order transferred to Table ${toTableNumber}`);
  }

  // ── Edit payment on closed order ─────────────────────────────────────────
  // The order's table has usually already been recycled into a new order by
  // the time this runs, so tableId/orderNumber are no longer valid lookup
  // keys — closedAt + outletId is the only reliable match. Persists to
  // localStorage (so Past Orders reflects it immediately on this device) and
  // to the backend (so it syncs cross-device and into Owner Console).
  async function handleEditPayment(order, newPayments) {
    const cleanPayments = newPayments.map(p => ({ method: p.method, amount: p.amount }));

    try {
      const prev = JSON.parse(localStorage.getItem("pos_closed_orders") || "[]");
      const idx  = prev.findIndex(o => o.closedAt === order.closedAt);
      if (idx >= 0) {
        prev[idx] = { ...prev[idx], payments: cleanPayments, paymentCorrectedAt: new Date().toISOString() };
        localStorage.setItem("pos_closed_orders", JSON.stringify(prev));
      }
    } catch {}

    try {
      await api.post("/operations/closed-order/payments", {
        outletId: outlet?.id || branchConfig?.outletId,
        closedAt: order.closedAt,
        payments: cleanPayments,
      });
      showToast("Payment method corrected ✓");
      return true;
    } catch (err) {
      showToast("Payment correction failed to sync — check connection");
      return false;
    }
  }

  // ── Accept online order → auto-create order + KOT ─────────────────────────
  function handleAcceptOnlineOrder(onlineOrder) {
    const ticketId  = `online-${Date.now()}`;
    const area      = { id: "online", name: onlineOrder.platform };
    const fakeTable = { id: ticketId, number: onlineOrder.orderId };
    const orderNum  = Math.max(10050, ...Object.values(orders).map(o => o.orderNumber || 10050)) + 1;

    const posItems = onlineOrder.items.map((item, i) => {
      const matched = menuItems.find(m =>
        m.name?.toLowerCase().trim() === item.name?.toLowerCase().trim()
      );
      return {
        id:         `item-${Date.now()}-${i}`,
        menuItemId: matched?.id || `online-${i}`,
        name:       item.name,
        price:      item.price,
        quantity:   item.quantity,
        taxRate:    matched?.taxRate ?? (outlet?.defaultTaxRate ?? 0),
        sentToKot:  true,   // auto-sent
        note:       onlineOrder.notes || ""
      };
    });

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
    // Persist to customer master so credit form can pick from it
    if (data.name) {
      api.post("/customers", {
        name:    data.name,
        phone:   data.phone   || "",
        email:   data.email   || "",
        gstin:   data.gstn    || "",   // CustomerFormModal uses "gstn" key
        address: data.address || "",
      }).catch(() => {}); // fire-and-forget — non-critical
    }
  }

  // ── Print bill ────────────────────────────────────────────────────────────
  // Mark one person's split bill as paid.
  // When the LAST seat is paid, auto-close the table — no second settlement needed.
  function handleSplitMarkPaid(billNo, paymentMethod) {
    if (!selectedTableId) return;
    const tableId = selectedTableId;
    const order   = orders[tableId];
    if (!order) return;

    // Compute the updated splits upfront so we can check allPaid immediately
    const updatedSplits = (order.splitBills || []).map(s =>
      s.billNo === billNo
        ? { ...s, paid: true, paymentMethod, paidAt: new Date().toISOString() }
        : s
    );

    mutateOrder(tableId, (o) => {
      o.splitBills = updatedSplits;
      o.updatedAt  = Date.now();
      return o;
    });

    // Sync to all devices via socket
    socketRef.current?.emit("order:update", { outletId: outlet?.id, order: {
      ...order, splitBills: updatedSplits, updatedAt: Date.now(),
    }});

    // ── All seats settled → auto-close the table ─────────────────────────
    const allPaid = updatedSplits.length > 0 && updatedSplits.every(s => s.paid);
    if (allPaid) {
      // Build payments grouped by payment method from split totals
      const paymentMap = {};
      for (const s of updatedSplits) {
        const m = s.paymentMethod || "Cash";
        paymentMap[m] = (paymentMap[m] || 0) + (s.total || 0);
      }
      const payments = Object.entries(paymentMap).map(([method, amount]) => ({ method, amount }));
      autoCloseSplitTable(tableId, { ...order, splitBills: updatedSplits }, payments);
    }
  }

  // Close a table after all split seats are paid — mirrors handleSettle but skips
  // the paid-vs-total check (splits are already fully settled by definition).
  async function autoCloseSplitTable(tableId, order, payments) {
    const closedOrder = {
      ...structuredClone(order),
      payments,
      isClosed:    true,
      closedAt:    new Date().toISOString(),
      cashierName: cashierName || "POS",
    };

    // 1. Save to pos_closed_orders
    try {
      const prev = JSON.parse(localStorage.getItem("pos_closed_orders") || "[]");
      // Stamp outlet so PastOrdersModal can filter cross-outlet contamination
      prev.unshift({ ...closedOrder, _outletId: outlet?.id || branchConfig?.outletId });
      localStorage.setItem("pos_closed_orders", JSON.stringify(prev.slice(0, 500)));
    } catch {}

    // 2. Optimistic close + broadcast to Captain / KDS
    setOrders(prev => ({ ...prev, [tableId]: closedOrder }));
    socketRef.current?.emit("order:update", { outletId: outlet?.id, order: closedOrder });
    localSocketRef.current?.emit("order:clear", { tableId });
    window.electronAPI?.pushOrdersToLocal?.([]);

    // 3. Push to backend so Owner Web sees sales figures
    let backendConfirmed = false;
    try {
      const closeResult = await api.post("/operations/closed-order", {
        outletId: outlet?.id,
        order:    closedOrder,
      });
      backendConfirmed = true;
      if (closeResult?.billNo != null) {
        closedOrder.billNo     = closeResult.billNo;
        closedOrder.billNoMode = closeResult.billNoMode  || null;
        closedOrder.billNoFY   = closeResult.billNoFY    || null;
        closedOrder.billNoDate = closeResult.billNoDate  || null;
        closedOrder.closedAt   = closeResult.closedAt    || closedOrder.closedAt;
        try {
          const prev = JSON.parse(localStorage.getItem("pos_closed_orders") || "[]");
          if (prev.length && prev[0].orderNumber === closedOrder.orderNumber) {
            prev[0] = { ...closedOrder, _outletId: outlet?.id || branchConfig?.outletId };
          }
          localStorage.setItem("pos_closed_orders", JSON.stringify(prev));
        } catch {}
      }
    } catch (err) {
      console.warn("[POS] split auto-close sync failed (offline?) — queuing:", err.message);
      const q = loadClosedOrderQueue();
      q.push({ order: closedOrder });
      saveClosedOrderQueue(q);
    }

    // 4. Close UI
    setSelectedTableId(null);
    if (hasCashPayment(payments)) openCashDrawer();
    showToast(
      backendConfirmed
        ? "✓ Split bill settled · Table is ready"
        : "✓ Split bill settled · Syncing in background"
    );

    // 5. Reset table to blank after 1.5 s (same as normal settle)
    setTimeout(() => {
      const area  = tableAreas.find(a => a.tables.some(t => t.id === tableId));
      const table = area?.tables.find(t => t.id === tableId);
      if (!table || !area) return;
      setOrders(prev => {
        // Mirror-table: if Order 2 already landed via order:updated, orderNumber differs.
        if (prev[tableId]?.orderNumber !== order.orderNumber) return prev;
        const maxNum = Math.max(10050, ...Object.values(prev).map(o => o.orderNumber || 10050)) + 1;
        const fresh  = buildBlankOrder(table, area, outlet?.name || "Outlet", maxNum);
        return { ...prev, [tableId]: fresh };
      });
      checkWaitlistSuggest(tableId);
    }, 1500);
  }

  // Assigns the next sequential bill number (FY or daily, per owner-console setting)
  // at print-time via the backend. Idempotent: if Captain already printed and
  // assigned a number, POS gets the same number back.
  async function handlePrintBill() {
    if (!selectedTableId) return;
    // Guard: prevent double-print if button is tapped twice quickly or
    // if Captain app already triggered a print on another device
    if (billPrintingRef.current) return;
    billPrintingRef.current = true;
    const tableId = selectedTableId;
    const order   = orders[tableId];
    if (!order?.items?.length) { billPrintingRef.current = false; showToast("No items to print"); return; }

    // Get / assign bill number from server
    let printOrder = { ...order };
    try {
      const result = await api.post("/operations/assign-bill-no", {
        outletId: outlet?.id,
        tableId,
      });
      if (result?.billNo != null) {
        printOrder = { ...printOrder, billNo: result.billNo, billNoMode: result.billNoMode, billNoFY: result.billNoFY };
        mutateOrder(tableId, o => { o.billNo = result.billNo; return o; });
      }
    } catch (err) {
      console.warn("[POS] assign-bill-no failed:", err.message);
    }

    // ── Race-condition guard ──────────────────────────────────────────────────
    // The await above suspends this function. If the cashier opened the payment
    // sheet and clicked "Settle & Close" while assign-bill-no was in flight,
    // the order is already closed by the time we resume here.
    // Printing now would produce a duplicate receipt — abort instead.
    if (ordersRef.current[tableId]?.isClosed) {
      billPrintingRef.current = false;
      return;
    }

    // Mark bill as requested — changes table to blue on POS + notifies Captain
    mutateOrder(tableId, (o) => {
      o.billRequested   = true;
      o.billRequestedAt = new Date().toISOString();
      return o;
    });

    const assignedWaiter = printOrder.assignedWaiter || null;
    // Trust whatever the captain app assigned — same as KOT printing does
    const validWaiter = assignedWaiter;

    printBill(printOrder, printOrder.items, outlet || branchConfig?.outletName, {
      cashierName,
      captainName: printOrder.captainName || null,
      waiterName:  validWaiter,
    });

    // Log every bill print (1st print + reprints) for Owner Console audit trail
    api.post("/operations/reprint-log", {
      source:      "pos",
      cashier:     cashierName,
      outletName:  outlet?.name,
      tableLabel:  printOrder.tableNumber || printOrder.tableId,
      orderNumber: printOrder.orderNumber,
      billNo:      printOrder.billNo || null,
    }).catch(() => {});

    showToast("🖨️ Bill printed · Collect payment");

    setSelectedTableId(null);

    // Release the guard after a 3-second window — long enough to block accidental
    // double-click but short enough to allow a genuine reprint if needed.
    setTimeout(() => { billPrintingRef.current = false; }, 3000);

    // Persist billRequested to backend (fire-and-forget)
    if (!tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
      api.post("/operations/bill-request", { outletId: outlet?.id, tableId })
        .catch(err => console.warn("[POS] bill-request after print failed:", err.message));
    }
  }

  // ── Counter-only checkout shortcut ──────────────────────────────────────
  // Takeaway/Delivery/Self-Service/Bakery/Sweet-Counter orders (order.isCounter)
  // pick a payment method first, then this single action prints the bill AND
  // settles + closes the order. Table-order billing (handlePrintBill +
  // PaymentSheet) is untouched — this is an additive, counter-scoped shortcut.
  async function handleCounterPrintAndSettle(method) {
    if (!selectedTableId) return;
    if (billPrintingRef.current) return;
    const tableId = selectedTableId;
    const order   = orders[tableId];
    if (!order?.isCounter) return;
    if (!order?.items?.length) { showToast("No items to print"); return; }
    billPrintingRef.current = true;

    let billNo = null, billNoMode = null, billNoFY = null;
    try {
      const result = await api.post("/operations/assign-bill-no", { outletId: outlet?.id, tableId });
      if (result?.billNo != null) {
        billNo     = result.billNo;
        billNoMode = result.billNoMode;
        billNoFY   = result.billNoFY;
      }
    } catch (err) {
      console.warn("[POS] assign-bill-no failed:", err.message);
    }

    // Same race-condition guard as handlePrintBill — bail if settled meanwhile.
    if (ordersRef.current[tableId]?.isClosed) { billPrintingRef.current = false; return; }

    const fin     = getFinancials(order, { gstTreatment: outlet?.gstTreatment || "exclusive" });
    const amount  = fin.balance > 0 ? fin.balance : fin.total;
    const payment = { method, amount };
    const printOrder = { ...order, billNo, billNoMode, billNoFY, payments: [...(order.payments || []), payment] };

    printBill(printOrder, printOrder.items, outlet || branchConfig?.outletName, {
      cashierName,
      captainName: printOrder.captainName || null,
      waiterName:  null,
    });

    api.post("/operations/reprint-log", {
      source:      "pos",
      cashier:     cashierName,
      outletName:  outlet?.name,
      tableLabel:  printOrder.tableNumber || printOrder.tableId,
      orderNumber: printOrder.orderNumber,
      billNo:      billNo || null,
    }).catch(() => {});

    setTimeout(() => { billPrintingRef.current = false; }, 3000);

    await handleSettle(payment);
  }

  // ── Waitlist auto-suggest ─────────────────────────────────────────────────
  // Called when a table frees — checks if any waiting party fits, shows popup.
  async function checkWaitlistSuggest(tableId) {
    if (!outlet?.id) return;
    try {
      const queue = await api.get(`/operations/waitlist?outletId=${outlet.id}`);
      if (!Array.isArray(queue) || !queue.length) return;
      // Find the table's seat count from tableAreas
      let tableSeats = 4;
      let tableLabel = tableId;
      for (const area of tableAreas) {
        const t = area.tables.find(t => t.id === tableId);
        if (t) { tableSeats = t.seats || 4; tableLabel = t.number || t.name || tableId; break; }
      }
      // Best match: oldest waiting party whose size fits the freed table
      const match = queue.find(p => p.partySize <= tableSeats);
      if (!match) return;
      setWaitlistSuggest({ party: match, tableId, tableLabel, tableSeats });
    } catch (_) {}
  }

  async function handleWaitlistSeat(party, tableId, tableLabel) {
    setWaitlistSuggest(null);
    try {
      await api.patch(`/operations/waitlist/${party.id}/seat`, {
        assignedTableId:    tableId,
        assignedTableLabel: String(tableLabel),
      });
      showToast(`✓ ${party.name} seated at ${tableLabel}`);
    } catch (_) {}
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

  // ── Void item (PIN already verified by OrderPanel before this is called) ──
  function handleVoidItem(idx, reason) {
    if (!selectedTableId) return;
    const tableId = selectedTableId;
    const item = orders[tableId]?.items?.[idx];
    const wasNeverSentToKot = item && !item.sentToKot;

    // Apply void immediately in memory so UI updates at once
    mutateOrder(tableId, o => {
      if (o.items[idx]) {
        o.items[idx].isVoided    = true;
        o.items[idx].voidReason  = reason;
        o.items[idx].sentToKot   = true;
        if (wasNeverSentToKot) o.items[idx].isGhostVoid = true;
      }
      return o;
    });

    // 5-second undo window — API calls fire only after window expires
    const timerId = setTimeout(() => {
      setUndoBanner(null);
      api.post("/operations/void-log", {
        type:        "void_item",
        cashier:     cashierName || "POS",
        outletName:  outlet?.name || "",
        tableId,
        tableLabel:  orders[tableId]?.tableNumber
                       ? `T${orders[tableId].tableNumber}`
                       : tableId,
        orderNumber: orders[tableId]?.orderNumber || "",
        items:       [{ name: item?.name, qty: item?.quantity || 1, price: item?.price || 0, reason: reason || "Voided" }],
      }).catch(() => {});

      if (item?.id &&
          !tableId.startsWith("counter-") &&
          !tableId.startsWith("online-")) {
        const sec = JSON.parse(localStorage.getItem("pos_security") || "{}");
        api.patch("/operations/order/item", {
          tableId,
          itemId:      item.id,
          isGhostVoid: wasNeverSentToKot || false,
          voidReason:  reason || "Voided by POS",
          managerPin:  sec.managerPin || ""
        }).catch(err => console.warn("[POS] item-void to backend failed:", err.message));
      }
    }, 5000);

    setUndoBanner({
      label: `"${item?.name || "Item"}" voided — tap Undo within 5s`,
      onUndo: () => {
        clearTimeout(timerId);
        setUndoBanner(null);
        mutateOrder(tableId, o => {
          if (o.items[idx]) {
            o.items[idx].isVoided   = false;
            o.items[idx].voidReason = "";
            if (wasNeverSentToKot) {
              o.items[idx].sentToKot  = false;
              o.items[idx].isGhostVoid = false;
            }
          }
          return o;
        });
        showToast("Void undone");
      },
    });
  }

  // ── Cancel entire order (PIN + confirmation already verified by OrderPanel) ─
  function handleCancelOrder() {
    if (!selectedTableId) return;
    const order = orders[selectedTableId];
    if (!order?.items?.length) return;

    const tableId = selectedTableId;
    const savedItems   = order.items.map(i => ({ ...i })); // snapshot for undo
    const cancelledItems = order.items
      .filter(i => !i.isVoided)
      .map(i => ({ name: i.name, qty: i.quantity, price: i.price, reason: "Order cancelled" }));

    // Void all items immediately in memory so UI clears at once
    mutateOrder(tableId, o => {
      o.items = o.items.map(i => i.isVoided ? i : {
        ...i, isVoided: true, voidReason: "Order cancelled", sentToKot: true,
        isGhostVoid: !i.sentToKot,
      });
      return o;
    });
    setSelectedTableId(null);

    // 5-second undo window — backend calls fire only after window expires
    const timerId = setTimeout(() => {
      setUndoBanner(null);
      api.post("/operations/void-log", {
        type:        "cancel_order",
        cashier:     cashierName || "POS",
        outletName:  outlet?.name || "",
        tableId,
        tableLabel:  order.tableNumber ? `T${order.tableNumber}` : tableId,
        orderNumber: order.orderNumber || "",
        items:       cancelledItems,
      }).catch(() => {});

      if (!tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
        api.delete("/operations/order", { tableId, outletId: outlet?.id })
          .catch(err => console.warn("[POS] cancel-order backend failed:", err.message));
      }
    }, 5000);

    setUndoBanner({
      label: `Order cancelled — tap Undo within 5s`,
      onUndo: () => {
        clearTimeout(timerId);
        setUndoBanner(null);
        // Restore all items from the pre-cancel snapshot
        mutateOrder(tableId, o => {
          o.items = savedItems;
          return o;
        });
        setSelectedTableId(tableId);
        showToast("Cancellation undone");
      },
    });
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
    setShowCloseShift(false);
    if (closedShift) {
      api.post("/shifts/close", { shift: closedShift }).catch(err => console.error("Shift close sync failed:", err.message));
    }
    // Always open Day End after shift close — cashier can Skip if mid-day.
    // Keep shift alive in state so Day End has outlet/cashier info.
    // Shift is nulled when Day End modal closes.
    setDayEndPostShift(true);
    setShowDayEnd(true);
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
    return <PosLogin outletName={outlet?.name || branchConfig.outletName} onLogin={(name, pin) => { setCashierName(name); setCashierPin(pin || ""); }} />;
  }

  // ── Shift Gate (cashier logged in, no active shift) ────────────────────────
  if (!activeShift) {
    return (
      <ShiftGate
        outletName={outlet?.name}
        cashierName={cashierName}
        onShiftStarted={handleShiftStarted}
        onEndPreviousShift={(staleShift) => {
          setActiveShift(staleShift);
          setShowCloseShift(true);
        }}
      />
    );
  }

  // ── Quick stats ───────────────────────────────────────────────────────────
  const openTables = Object.values(orders).filter(o => o.items?.length && !o.isClosed && !o.isOnHold).length;
  const pendingKOT = Object.values(orders).reduce((s, o) => s + (o.items || []).filter(i => !i.sentToKot && !i.isVoided).length, 0);
  const _isDineIn  = serviceMode === "dine-in";
  const heldCount  = Object.values(orders).filter(o => isHeldOrder(o) && (_isDineIn ? !o.isCounter : !!o.isCounter)).length;

  // Jump straight to a held order — also flips serviceMode for counter
  // tickets so the table/ticket label renders correctly after the jump.
  function handleJumpToHeldOrder(tableId) {
    const o = orders[tableId];
    if (!o) return;
    if (o.isCounter) {
      setServiceMode(o.areaName === "Delivery" || o.onlinePlatform ? "delivery" : "takeaway");
    } else {
      setServiceMode("dine-in");
    }
    setSelectedTableId(tableId);
  }

  // ─── Main POS UI ──────────────────────────────────────────────────────────
  return (
    <div className={`pos-shell${darkMode ? " pos-dark" : ""}`}>

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

      {/* ── Row 1: Brand bar ─────────────────────────────────────────────── */}
      <div className="pos-brand-bar">
        {/* Hamburger */}
        <button type="button" className="pbb-hamburger" onClick={() => setShowDrawer(true)}>☰</button>

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

        {/* Right: KOT badge + cashier + clock */}
        <div className="pbb-right">
          {pendingKOT > 0 && (
            <button type="button" className="pbb-kot-badge" onClick={() => {
              const tableWithKot = tableAreas.flatMap(a => a.tables).find(t => {
                const o = orders[t.id];
                return (o?.items || []).some(i => !i.sentToKot && !i.isVoided);
              });
              if (tableWithKot) setSelectedTableId(tableWithKot.id);
            }}>
              KOT · {pendingKOT}
            </button>
          )}
          <div className="pbb-cashier-chip">
            <div className="pbb-avatar">{cashierName?.[0]}</div>
            <div>
              <div className="pbb-cashier-name">{activeShift.cashier}</div>
              <div className="pbb-session">{activeShift.session}</div>
            </div>
          </div>
          <span className="pbb-ver-pill">v{APP_VERSION}</span>
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
          <button type="button" className="pab-btn emerald"
            onClick={() => setPendingQRCount(0)}
            title="QR table orders from customers — handled by Captain App">
            <span className="pab-label">📲 QR Orders</span>
            {pendingQRCount > 0 && (
              <span className="pab-badge">{pendingQRCount}</span>
            )}
          </button>
          <button type="button" className="pab-btn blue"
            onClick={() => setShowPastOrders(true)}>
            <span className="pab-label">Past Orders</span>
          </button>
          <button type="button" className="pab-btn amber"
            onClick={() => setShowHeldOrders(true)}
            title="Paused or KOT-sent orders not yet billed">
            <span className="pab-label">⏳ Held</span>
            {heldCount > 0 && <span className="pab-badge">{heldCount}</span>}
          </button>
          <button type="button" className="pab-btn indigo"
            onClick={() => setShowCreditPanel(true)}
            title="Settle outstanding credit bills — collect payment from credit customers">
            <span className="pab-label">💳 Credits</span>
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

        {/* Center: pending KOT — clickable, jumps to first table with unsent items */}
        <div className="pab-stats">
          <button
            type="button"
            className={`pab-stat pab-stat-btn${pendingKOT > 0 ? " pab-stat-warn" : ""}`}
            onClick={() => {
              if (pendingKOT === 0) return;
              const tableWithKot = tableAreas.flatMap(a => a.tables).find(t => {
                const o = orders[t.id];
                return (o?.items || []).some(i => !i.sentToKot && !i.isVoided);
              });
              if (tableWithKot) setSelectedTableId(tableWithKot.id);
            }}
          >
            <span className="pab-stat-val">{pendingKOT}</span>
            <span className="pab-stat-lbl">Pending KOT</span>
          </button>
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
          <button type="button" className="pab-btn teal"
            onClick={() => setShowWaitlist(true)}
            title="Manage table waitlist — add walk-in parties, seat when table is free">
            <span className="pab-label">🪑 Waitlist</span>
          </button>
          <button type="button" className="pab-btn rose"
            onClick={() => setShowWastage(true)}
            title="Log production wastage — spoilage, overcooked, dropped items">
            <span className="pab-label">🗑 Wastage</span>
          </button>
          <button type="button" className="pab-btn lime"
            onClick={() => setShowStock(true)}
            title="View and update stock counts for tracked items">
            <span className="pab-label">📦 Stock</span>
          </button>
          <button type="button" className={`pab-btn cyan${isSyncing ? " syncing" : ""}`}
            onClick={() => syncMenuData()}
            title={lastSyncedAt ? `Last synced: ${lastSyncedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })} — syncs menu, tables & outlet` : "Master Sync — pulls menu, tables & outlet from Owner Console"}
            disabled={isSyncing}>
            <span className="pab-label">{isSyncing ? "Syncing…" : "Sync"}</span>
          </button>
          <button type="button" className="pab-btn amber"
            onClick={() => setShowBatchLabel(true)}
            title="Batch print barcode stickers for bakery / packaged items">
            <span className="pab-label">🏷️ Labels</span>
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
            onClick={() => {
              if (activeShift) { showToast("End your shift before exiting"); setShowCloseShift(true); return; }
              setCashierName(null); setCashierPin(""); setSelectedTableId(null);
            }}
            title="Logout">
            <span className="pab-label">Exit</span>
          </button>
        </div>
      </div>

      {/* ── Side Drawer ──────────────────────────────────────────────────── */}
      {showDrawer && (
        <div className="pos-drawer-mask" onClick={() => setShowDrawer(false)}>
          <div className="pos-drawer" onClick={e => e.stopPropagation()}>
            <div className="pos-drawer-head">
              <span className="pos-drawer-title">Menu</span>
              <button type="button" className="pos-drawer-close" onClick={() => setShowDrawer(false)}>✕</button>
            </div>
            <div className="pos-drawer-sec">
              <div className="pos-drawer-sec-label">Orders</div>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowOnlineOrders(true); setPendingOnlineCount(0); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">🌐</span><span>Online Orders</span>
                {pendingOnlineCount > 0 && onlineOrdersEnabled && <span className="pab-badge">{pendingOnlineCount}</span>}
              </button>
              <button type="button" className={`pos-drawer-item pos-drawer-toggle${onlineOrdersEnabled ? " on" : " off"}`} onClick={handleToggleOnlineOrders}>
                <span className="pos-drawer-ico">{onlineOrdersEnabled ? "✅" : "⏸"}</span>
                <span>{onlineOrdersEnabled ? "Online ON" : "Online OFF"}</span>
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowPastOrders(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">📋</span><span>Past Orders</span>
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowHeldOrders(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">⏳</span><span>Held Orders</span>
                {heldCount > 0 && <span className="pab-badge">{heldCount}</span>}
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowAdvancePanel(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">⏰</span><span>Advance Orders</span>
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowCreditPanel(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">💳</span><span>Credits</span>
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowWaitlist(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">🪑</span><span>Waitlist</span>
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { selectedTableId ? setShowCustomerForm(true) : showToast("Select a table first"); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">👤</span><span>Customer</span>
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { setPendingQRCount(0); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">📲</span><span>QR Orders</span>
                {pendingQRCount > 0 && <span className="pab-badge">{pendingQRCount}</span>}
              </button>
            </div>
            <div className="pos-drawer-sec">
              <div className="pos-drawer-sec-label">Cash</div>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowCashIn(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">💵</span><span>Cash In</span>
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowCashOut(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">💸</span><span>Cash Out</span>
              </button>
            </div>
            <div className="pos-drawer-sec">
              <div className="pos-drawer-sec-label">Operations</div>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowWastage(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">🗑</span><span>Wastage</span>
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowStock(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">📦</span><span>Stock Check</span>
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowBatchLabel(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">🏷</span><span>Print Labels</span>
              </button>
              <button type="button" className={`pos-drawer-item${isSyncing ? " syncing" : ""}`} onClick={() => { syncMenuData(); setShowDrawer(false); }} disabled={isSyncing}>
                <span className="pos-drawer-ico">🔄</span><span>{isSyncing ? "Syncing…" : "Sync Data"}</span>
              </button>
            </div>
            <div className="pos-drawer-sec">
              <div className="pos-drawer-sec-label">Settings</div>
              <button type="button" className="pos-drawer-item" onClick={() => {
                const next = !darkMode;
                setDarkMode(next);
                localStorage.setItem("pos_dark_mode", String(next));
                setShowDrawer(false);
              }}>
                <span className="pos-drawer-ico">{darkMode ? "☀️" : "🌙"}</span>
                <span>{darkMode ? "Light Mode" : "Dark Mode"}</span>
              </button>
              <button type="button" className="pos-drawer-item" onClick={() => { setShowSettings(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">⚙️</span><span>POS Settings</span>
              </button>
              <button type="button" className="pos-drawer-item pos-drawer-danger" onClick={() => { setShowCloseShift(true); setShowDrawer(false); }}>
                <span className="pos-drawer-ico">🔒</span><span>End Shift</span>
              </button>
              <button type="button" className="pos-drawer-item pos-drawer-danger" onClick={() => {
                if (activeShift) { showToast("End your shift before exiting"); setShowCloseShift(true); setShowDrawer(false); return; }
                setCashierName(null); setCashierPin(""); setSelectedTableId(null); setShowDrawer(false);
              }}>
                <span className="pos-drawer-ico">🚪</span><span>Exit POS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Left: Category Sidebar ───────────────────────────────────────── */}
      <div className="pos-left">
        <CategorySidebar
          categories={visibleCategories}
          menuItems={visibleMenuItems}
          activeCategory={activeCategory || visibleCategories[0]?.name}
          onSelect={setActiveCategory}
          outletName={outlet?.name}
        />
      </div>

      {/* ── Center: Menu Items ───────────────────────────────────────────── */}
      <div className="pos-center">
        <MenuPanel
          categories={visibleCategories}
          menuItems={visibleMenuItems}
          activeCategory={activeCategory || visibleCategories[0]?.name}
          onCategoryChange={setActiveCategory}
          onAddItem={handleAddItem}
          onToggleAvailability={handleToggleAvailability}
          onToggleCategoryAvailability={handleToggleCategoryAvailability}
          quantities={menuQuantities}
          onDecrement={handleDecrementItem}
          stockSnapshot={stockSnapshot}
          favouriteItemIds={favouriteItemIds}
          onSkuLookup={(sku) => {
            if (!selectedTableId) { showToast("Select a table first"); return; }
            api.get(`/menu/sku-lookup?sku=${encodeURIComponent(sku)}&outletId=${outlet?.id || ""}`)
              .then(item => { handleAddItem(item); showToast(`✅ ${item.name} added`); })
              .catch(err => {
                const notFound = err?.message?.includes("SKU_NOT_FOUND") || err?.message?.toLowerCase().includes("not found");
                showToast(notFound ? `❌ Item #${sku} not found` : `❌ Lookup error — try again`);
              });
          }}
        />
      </div>

      {/* ── Right: Table Picker or Order Panel ───────────────────────────── */}
      <div className="pos-right">

        {/* Tab bar — shown whenever a table / counter order is active */}
        {selectedTableId && (
          <div className="pos-order-tabs">
            <div className="pos-order-tab active">
              <span className="pot-label">{tableLabel}</span>
              {activeOrderItemCount > 0 && (
                <span className="pot-badge">{activeOrderItemCount}</span>
              )}
            </div>
            <button
              type="button"
              className="pos-order-tab new-order"
              onClick={() => setSelectedTableId(null)}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              New Order
            </button>
          </div>
        )}

        {!selectedTableId ? (
          isCounterMode ? null : (
          <TablePickerPanel
            tableAreas={workAreaScopedTableAreas}
            orders={orders}
            mirrorOrders={mirrorOrders}
            onSelectTable={handleSelectTable}
            onSelectMirrorOrder={handleSelectMirrorOrder}
            serviceMode={serviceMode}
            onNewCounterOrder={handleNewCounterOrder}
            onDeleteCounterOrder={handleDeleteCounterOrder}
            gstTreatment={outlet?.gstTreatment || "exclusive"}
          />
          )
        ) : selectedOrder?.isSplitBill && selectedOrder?.splitBills?.length > 0 ? (
          <SplitSettlementPanel
            order={selectedOrder}
            onMarkPaid={handleSplitMarkPaid}
            onBack={() => setSelectedTableId(null)}
          />
        ) : (
        <OrderPanel
          order={selectedOrder}
          tableLabel={tableLabel}
          tableAreas={tableAreas}
          orders={orders}
          gstTreatment={outlet?.gstTreatment || "exclusive"}
          discountRules={discountRules}
          canApplyDiscount={
            activeStaff.find(s => s.name === cashierName || s.fullName === cashierName)
              ?.canApplyDiscount === true
          }
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
          onCustomerForm={() => setShowCustomerForm(true)}
          onTransferTable={handleTransferTable}
          onOrderNoteChange={handleOrderNoteChange}
          onCompToggle={handleCompToggle}
          onVoidItem={handleVoidItem}
          onCancelOrder={handleCancelOrder}
          onReprintKOT={handleReprintKOT}
          onPrintBill={handlePrintBill}
          onCounterPrintBill={handleCounterPrintAndSettle}
          onShowHeld={() => setShowHeldOrders(true)}
          heldCount={heldCount}
          cashierName={cashierName}
          cashierPin={cashierPin}
        />
        )}
      </div>

      {/* ── Payment sheet ─────────────────────────────────────────────────── */}
      {showPayment && (selectedMirrorOrder || selectedOrder) && (
        <PaymentSheet
          order={selectedMirrorOrder || selectedOrder}
          tableLabel={tableLabel}
          gstTreatment={outlet?.gstTreatment || "exclusive"}
          outletId={outlet?.id || branchConfig?.outletId}
          onClose={() => { setShowPayment(false); setSelectedMirrorOrder(null); }}
          onSettle={handleSettle}
          onPhonePeQR={() => { setShowPayment(false); setShowPhonePeQR(true); setSelectedMirrorOrder(null); }}
        />
      )}

      {/* ── PhonePe QR payment modal ──────────────────────────────────────── */}
      {showPhonePeQR && (selectedMirrorOrder || selectedOrder) && (
        <PhonePeQRModal
          order={selectedMirrorOrder || selectedOrder}
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
          onConfirmSplit={handleConfirmSplit}
          gstTreatment={outlet?.gstTreatment || "exclusive"}
          defaultTaxRate={outlet?.defaultTaxRate ?? 0}
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
              const ticketNum  = nextCounterTicketNumber();
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
                  taxRate:    menuItem?.taxRate != null ? Number(menuItem.taxRate) : null,
                };
              });

              counterOrder.items = enriched;

              setOrders((prev) => ({ ...prev, [ticketId]: counterOrder }));
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

      {/* ── Day End modal ────────────────────────────────────────────────── */}
      {showDayEnd && (
        <DayEndModal
          orders={orders}
          outlet={outlet}
          onClose={() => {
            setShowDayEnd(false);
            if (dayEndPostShift) {
              setDayEndPostShift(false);
              setActiveShift(null);
              setSelectedTableId(null);
            }
          }}
          onPrint={async (report) => {
            // Build printable HTML for day end report
            const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
            const payRows = Object.entries(report.paymentTotals || {})
              .map(([m, a]) => `<tr><td>${m.charAt(0).toUpperCase()+m.slice(1)}</td><td class="r">${Number(a).toLocaleString("en-IN",{minimumFractionDigits:2})}</td></tr>`)
              .join("");
            const topRows = (report.top5 || [])
              .map((it, i) => `<tr><td>#${i+1} ${it.name} ×${it.qty}</td><td class="r">${Number(it.revenue).toLocaleString("en-IN",{minimumFractionDigits:2})}</td></tr>`)
              .join("");
            const catRows = (report.categories || [])
              .map(c => `<tr><td>${c.name}</td><td class="r">${Number(c.revenue).toLocaleString("en-IN",{minimumFractionDigits:2})}</td></tr>`)
              .join("");
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  @page{size:80mm auto;margin:0}
  body.de-rpt{font-family:Arial,sans-serif;width:78mm;font-size:9pt;padding:2mm}
  h2{text-align:center;font-size:11pt;margin:0 0 2mm}
  .center{text-align:center;font-size:8pt;color:#555;margin:0 0 3mm}
  hr{border:none;border-top:1px dashed #999;margin:3mm 0}
  table{width:100%;border-collapse:collapse}
  td{padding:1.5mm 0;font-size:8.5pt}
  .r{text-align:right;font-weight:700}
  .section{font-weight:800;font-size:9pt;margin:3mm 0 1mm;text-transform:uppercase;letter-spacing:0.05em}
  .total td{font-weight:900;border-top:1px solid #000;padding-top:2mm}
</style></head><body class="de-rpt">
<h2>${outlet?.name || "OUTLET"}</h2>
<p class="center">DAY END REPORT — ${report.date}<br/>${now}</p>
<hr/>
<table>
  <tr><td>Total Bills</td><td class="r">${report.totalBills}</td></tr>
  <tr><td>Total Sales</td><td class="r">${Number(report.totalSales).toLocaleString("en-IN",{minimumFractionDigits:2})}</td></tr>
  <tr><td>Discounts</td><td class="r">${Number(report.totalDiscount).toLocaleString("en-IN",{minimumFractionDigits:2})}</td></tr>
  <tr><td>Void / Comp</td><td class="r">${Number(report.totalVoidComp).toLocaleString("en-IN",{minimumFractionDigits:2})}</td></tr>
</table>
<hr/>
<div class="section">Payment Breakdown</div>
<table>${payRows}</table>
<hr/>
<div class="section">Top 5 Items</div>
<table>${topRows}</table>
<hr/>
<div class="section">Category Sales</div>
<table>
  ${catRows}
  <tr class="total"><td>TOTAL</td><td class="r">${Number(report.totalSales).toLocaleString("en-IN",{minimumFractionDigits:2})}</td></tr>
</table>
<hr/>
<p class="center">*** END OF DAY ***</p>
</body></html>`;
            // Use default bill printer
            if (window.electronAPI?.printHTML) {
              const printers = JSON.parse(localStorage.getItem("pos_printers") || "[]");
              const def = printers.find(p => p.isDefault) || printers[0];
              await window.electronAPI.printHTML({
                html,
                printerName: def?.winName || null,
                printerIp:   def?.ip      || null,
                paperWidthMm: 80,
              });
            } else {
              const w = window.open("","_blank","width=400,height=600");
              if (w) { w.document.write(html); w.document.close(); w.print(); }
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
          outletId={outlet?.id || branchConfig?.outletId}
          gstTreatment={outlet?.gstTreatment || "exclusive"}
        />
      )}

      {/* ── Held Orders modal ─────────────────────────────────────────────── */}
      {showHeldOrders && (
        <HeldOrdersModal
          orders={orders}
          onSelect={handleJumpToHeldOrder}
          onClose={() => setShowHeldOrders(false)}
          gstTreatment={outlet?.gstTreatment || "exclusive"}
          serviceMode={serviceMode}
        />
      )}

      {/* ── Batch Label Print modal ──────────────────────────────────────── */}
      {showBatchLabel && (
        <BatchLabelModal
          menuItems={menuItems}
          onClose={() => setShowBatchLabel(false)}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {/* ── Credit Settlement panel ───────────────────────────────────────── */}
      {showCreditPanel && (
        <CreditSettlePanel
          activeShift={activeShift}
          outletId={outlet?.id || branchConfig?.outletId}
          onClose={() => setShowCreditPanel(false)}
        />
      )}

      {/* ── Single Label Print modal (kept for direct item access) ────────── */}
      {showLabelPrint && (
        <LabelPrintModal
          menuItems={menuItems}
          onClose={() => setShowLabelPrint(false)}
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
      {showWastage && (
        <WastageModal
          shift={activeShift}
          cashierName={cashierName}
          outletId={branchConfig?.outletId}
          menuItems={menuItems}
          onClose={() => setShowWastage(false)}
        />
      )}

      {/* Stock panel */}
      {showStock && (
        <StockPanel
          outlet={outlet}
          menuItems={menuItems}
          stockSnapshot={stockSnapshot}
          onClose={() => setShowStock(false)}
          onStockUpdated={(itemId, newStock) =>
            setStockSnapshot(prev => ({
              ...prev,
              [itemId]: { ...(prev[itemId] || {}), currentStock: newStock }
            }))
          }
        />
      )}

      {/* Waitlist panel */}
      {showWaitlist && (
        <WaitlistPanel
          outlet={outlet}
          orders={orders}
          onClose={() => setShowWaitlist(false)}
          onSeatParty={(party) => showToast(`✓ ${party.name} marked as seated`)}
        />
      )}

      {/* Waitlist auto-suggest — shown when a table frees and a waiting party fits */}
      {waitlistSuggest && (
        <div className="wl-suggest-overlay" onClick={() => setWaitlistSuggest(null)}>
          <div className="wl-suggest-card" onClick={e => e.stopPropagation()}>
            <p className="wl-suggest-title">Table {waitlistSuggest.tableLabel} is free!</p>
            <p className="wl-suggest-body">
              <strong>{waitlistSuggest.party.name}</strong> (party of {waitlistSuggest.party.partySize}) has been waiting
              {" "}{Math.floor((Date.now() - new Date(waitlistSuggest.party.joinedAt).getTime()) / 60000)} mins — fits this table ({waitlistSuggest.tableSeats} seats).
            </p>
            <div className="wl-suggest-btns">
              <button className="wl-seat-btn"
                onClick={() => handleWaitlistSeat(waitlistSuggest.party, waitlistSuggest.tableId, waitlistSuggest.tableLabel)}>
                Seat Now
              </button>
              <button className="wl-dismiss-btn" onClick={() => setWaitlistSuggest(null)}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* What's New — shown once per version after login */}
      {cashierName && showWhatsNew && (
        <WhatsNewModal onClose={dismissWhatsNew} />
      )}

      {showSettings && (
        <PosSettingsModal
          cashierName={cashierName}
          activeShift={activeShift}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ── Undo banner (void / cancel) ───────────────────────────────────── */}
      {undoBanner && (
        <div className="pos-undo-banner" role="alert">
          <span>{undoBanner.label}</span>
          <button type="button" onClick={undoBanner.onUndo}>Undo</button>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="pos-toast" role="status">{toast}</div>
      )}
    </div>
  );
}
