import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import toast, { Toaster } from "react-hot-toast";
import { UpdateBanner } from "./components/UpdateBanner";

import { api }        from "./lib/api";
import { printBill }  from "./lib/printBill";
import {
  mobileAreas      as seedAreas,
  mobileCategories as seedCategories,
  mobileMenuItems  as seedMenuItems,
} from "./data/mobile.seed";

import { SetupScreen }        from "./components/SetupScreen";
import { LoginScreen, avatarBg } from "./components/LoginScreen";
import { TableFloor }          from "./components/TableFloor";
import { OrderScreen }         from "./components/OrderScreen";
import { TableActionsSheet }   from "./components/TableActionsSheet";
import { CustomerInfoSheet }   from "./components/CustomerInfoSheet";
import { SideDrawer }         from "./components/SideDrawer";

// ─── Build areas from outlet tables ──────────────────────────────────────────

function buildAreasFromOutlet(outlet) {
  if (!outlet?.tables?.length) return null;
  const areaNames = [...new Set(outlet.tables.map((t) => t.workArea || t.area_name).filter(Boolean))];
  if (!areaNames.length) areaNames.push("Main");
  return areaNames.map((areaName) => {
    const tables = outlet.tables
      .filter((t) => (t.workArea || t.area_name || "Main") === areaName)
      .map((t) => ({
        id:     t.id,
        number: t.table_number || t.tableNumber || t.name,
        seats:  t.seats || 4,
      }));
    return {
      id:     `area-${areaName.toLowerCase().replace(/\s+/g, "-")}`,
      name:   areaName,
      tables,
    };
  });
}

// ─── Branch config (localStorage) ────────────────────────────────────────────

const CAPTAIN_LS_KEY = "captain_branch_config";

function loadCaptainBranchConfig() {
  try { return JSON.parse(localStorage.getItem(CAPTAIN_LS_KEY) || "null"); }
  catch { return null; }
}
function saveCaptainBranchConfig(cfg) {
  localStorage.setItem(CAPTAIN_LS_KEY, JSON.stringify(cfg));
}
function clearCaptainBranchConfig() {
  localStorage.removeItem(CAPTAIN_LS_KEY);
  localStorage.removeItem("captain_token");
}

// ─── KOT queue helpers ────────────────────────────────────────────────────────

function savePendingKots(kots) {
  try { localStorage.setItem("captain_pending_kots", JSON.stringify(kots)); } catch (_) {}
}

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
    isOnHold:      false,
  };
}

const FALLBACK_STAFF = [
  { id: "s1", name: "Karthik", role: "Captain", pin: "1234", avatar: "K" },
  { id: "s2", name: "Priya",   role: "Waiter",  pin: "2345", avatar: "P" },
  { id: "s3", name: "Rahul",   role: "Waiter",  pin: "3456", avatar: "R" },
  { id: "s4", name: "Devi",    role: "Waiter",  pin: "4567", avatar: "D" },
  { id: "s5", name: "Ravi",    role: "Waiter",  pin: "5678", avatar: "V" },
];

// ─── App root ─────────────────────────────────────────────────────────────────

export function App() {
  const [branchConfig,    setBranchConfig]    = useState(() => loadCaptainBranchConfig());
  const [loggedInStaff,   setLoggedInStaff]   = useState(null);
  const [areas,           setAreas]           = useState(seedAreas);
  const [categories,      setCategories]      = useState(seedCategories);
  const [menuItems,       setMenuItems]       = useState(seedMenuItems);
  const [kitchenStations, setKitchenStations] = useState(() => {
    try { return JSON.parse(localStorage.getItem("captain_kitchen_stations") || "[]"); } catch { return []; }
  });
  const [orders,          setOrders]          = useState({});
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedArea,    setSelectedArea]    = useState(null);
  const [outlet,          setOutlet]          = useState(null);
  // Table action sheet state
  const [actionTableId,   setActionTableId]   = useState(null);
  const [actionArea,      setActionArea]       = useState(null);
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [showDrawer,      setShowDrawer]       = useState(false);
  const [scanning,        setScanning]         = useState(false);
  // KOT queue — failed sends stored here so staff can retry from the drawer
  const [pendingKots, setPendingKots] = useState(() => {
    try { return JSON.parse(localStorage.getItem("captain_pending_kots") || "[]"); } catch { return []; }
  });
  const socketRef      = useRef(null);
  const localSocketRef = useRef(null);
  const [localConn, setLocalConn] = useState(false);

  // Staff: from branch config or fallback — Captain app only shows Captain/Waiter roles
  const CAPTAIN_ROLES = ["captain", "waiter", "server", "steward"];
  const allStaff  = branchConfig?.staff?.length ? branchConfig.staff : FALLBACK_STAFF;
  const branchStaff = allStaff.filter(
    (s) => CAPTAIN_ROLES.includes((s.role || "").toLowerCase())
  );

  // ── Refresh staff from backend on every boot ──────────────────────────────
  useEffect(() => {
    if (!branchConfig) return;
    api.get("/devices/staff")
      .then((res) => {
        if (Array.isArray(res.staff) && res.staff.length) {
          const updated = { ...branchConfig, staff: res.staff };
          setBranchConfig(updated);
          saveCaptainBranchConfig(updated);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Offline config cache helpers ─────────────────────────────────────────
  function saveCaptainCache({ outlet, categories, menuItems, areas }) {
    try {
      if (outlet)           localStorage.setItem("captain_cache_outlet",     JSON.stringify(outlet));
      if (categories?.length) localStorage.setItem("captain_cache_categories", JSON.stringify(categories));
      if (menuItems?.length)  localStorage.setItem("captain_cache_menu_items", JSON.stringify(menuItems));
      if (areas?.length)      localStorage.setItem("captain_cache_areas",      JSON.stringify(areas));
    } catch (_) {}
  }

  function loadCaptainCache() {
    const p = (key, fb) => { try { return JSON.parse(localStorage.getItem(key) || "null") || fb; } catch { return fb; } };
    return {
      outlet:     p("captain_cache_outlet",     null),
      categories: p("captain_cache_categories", []),
      menuItems:  p("captain_cache_menu_items",  []),
      areas:      p("captain_cache_areas",       null),
    };
  }

  // ── Bootstrap: load outlet, menu, orders, open socket ────────────────────
  useEffect(() => {
    if (!branchConfig) return;

    async function bootstrap() {
      try {
        const outlets = await api.get("/outlets");
        const target  = outlets.find((o) => o.id === branchConfig.outletId) || outlets[0];
        if (!target) return;
        setOutlet(target);

        const builtAreas = buildAreasFromOutlet(target);
        if (builtAreas) setAreas(builtAreas);

        const [cats, items, kStations] = await Promise.all([
          api.get(`/menu/categories?outletId=${target.id}`).catch(() => []),
          api.get(`/menu/items?outletId=${target.id}`).catch(() => []),
          api.get("/kitchen-stations").catch(() => []),
        ]);
        if (cats.length)  setCategories(cats);
        if (items.length) setMenuItems(items.map((i) => ({ ...i, price: parsePriceNumber(i.basePrice || i.price) })));
        if (kStations.length) {
          // Enrich stations with category names as fallback for ID-type mismatches
          const catIdToName = {};
          cats.forEach(c => { catIdToName[String(c.id)] = c.name; });
          const enriched = kStations.map(s => ({
            ...s,
            categoryNames: (s.categories || [])
              .map(id => catIdToName[String(id)])
              .filter(Boolean)
          }));
          localStorage.setItem("captain_kitchen_stations", JSON.stringify(enriched));
          setKitchenStations(enriched);
        }

        // Save full config to offline cache for power-cut / no-internet starts
        saveCaptainCache({
          outlet:     target,
          categories: cats,
          menuItems:  items,
          areas:      builtAreas,
        });

        const liveOrders = await api.get(`/operations/orders?outletId=${target.id}`).catch(() => []);
        if (liveOrders.length) {
          setOrders(Object.fromEntries(liveOrders.map((o) => [o.tableId, o])));
        }

        // Open socket
        const socketUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1")
          .replace("/api/v1", "");
        const socket = io(socketUrl, {
          query: { outletId: target.id },
          reconnection:         true,
          reconnectionDelay:    1000,
          reconnectionDelayMax: 10000,
          reconnectionAttempts: Infinity,
        });
        socketRef.current = socket;

        // Re-fetch orders on reconnect so table state is fresh after power cut
        let wasOffline = false;
        socket.on("connect", () => {
          if (wasOffline) {
            api.get(`/operations/orders?outletId=${target.id}`)
              .then((orders) => {
                if (orders.length) setOrders(Object.fromEntries(orders.map((o) => [o.tableId, o])));
              })
              .catch(() => {});
          }
          wasOffline = false;
        });
        socket.on("disconnect",    () => { wasOffline = true; });
        socket.on("connect_error", () => { wasOffline = true; });

        socket.on("order:updated", (o) => setOrders((p) => {
          if (!o.items?.length || o.isClosed) {
            const { [o.tableId]: _removed, ...rest } = p;
            return rest;
          }
          // Stale-write guard: ignore events older than our current local copy
          const current = p[o.tableId];
          if (current && (current.updatedAt || 0) > (o.updatedAt || 0)) {
            return p; // our version is newer — discard
          }
          return { ...p, [o.tableId]: o };
        }));

        socket.on("kot:sent", ({ tableId }) =>
          setOrders((p) => {
            if (!p[tableId]) return p;
            return { ...p, [tableId]: { ...p[tableId], items: p[tableId].items.map((i) => ({ ...i, sentToKot: true })) } };
          })
        );

        socket.on("sync:config", async () => {
          try {
            const [cats, items] = await Promise.all([
              api.get(`/menu/categories?outletId=${target.id}`).catch(() => null),
              api.get(`/menu/items?outletId=${target.id}`).catch(() => null),
            ]);
            if (cats)  setCategories(cats);
            if (items) setMenuItems(items);
          } catch (_) { /* non-critical */ }
        });

        // ── Local POS WiFi server — auto-reconnect + auto-scan ───────────────
        // Scans 192.168.1/0 and 10.0.0 subnets when saved IP stops responding,
        // updates the saved IP, and reconnects silently. No manual steps needed
        // after router restart even if DHCP assigns a new IP to the POS machine.

        async function findPosOnNetwork() {
          const subnets = ["192.168.1", "192.168.0", "10.0.0"];
          for (const subnet of subnets) {
            for (let i = 1; i <= 50; i++) {
              const ip = `${subnet}.${i}`;
              try {
                const r = await fetch(`http://${ip}:4001/plato-pos`, { signal: AbortSignal.timeout(400) });
                if (r.ok) return ip;
              } catch (_) {}
            }
          }
          return null;
        }

        function connectLocalSocket(ip) {
          if (localSocketRef.current) {
            localSocketRef.current.removeAllListeners();
            localSocketRef.current.disconnect();
            localSocketRef.current = null;
          }
          setLocalConn(false);

          const lSock = io(`http://${ip}:4001`, {
            query:                { role: "captain", outletId: target.id },
            reconnection:         true,
            reconnectionDelay:    1000,
            reconnectionDelayMax: 6000,
            reconnectionAttempts: Infinity,
            timeout:              4000,
          });
          localSocketRef.current = lSock;

          let errorCount = 0;
          let scanning   = false;

          lSock.on("connect", () => {
            errorCount = 0;
            setLocalConn(true);
            lSock.emit("request:orders", { outletId: target.id });
          });
          lSock.on("disconnect", () => setLocalConn(false));
          lSock.on("connect_error", () => {
            setLocalConn(false);
            errorCount++;
            if (errorCount >= 5 && !scanning) {
              scanning = true;
              findPosOnNetwork().then(newIp => {
                scanning = false;
                errorCount = 0;
                if (!newIp) return; // not found — socket.io keeps retrying saved IP
                localStorage.setItem("captain_local_server_ip", newIp);
                connectLocalSocket(newIp);
              });
            }
          });
          lSock.on("order:updated", (o) => setOrders((p) => {
            if (!o.items?.length || o.isClosed) {
              const { [o.tableId]: _r, ...rest } = p;
              return rest;
            }
            const current = p[o.tableId];
            if (current && (current.updatedAt || 0) > (o.updatedAt || 0)) return p;
            return { ...p, [o.tableId]: o };
          }));
        }

        const savedLocalIp = localStorage.getItem("captain_local_server_ip")?.trim();
        if (savedLocalIp) connectLocalSocket(savedLocalIp);
      } catch (err) {
        console.error("Captain App bootstrap failed (offline?) — loading from cache:", err.message);
        // Restore from offline cache so waiters can take orders even without internet
        const cache = loadCaptainCache();
        if (cache.outlet)           setOutlet(cache.outlet);
        if (cache.categories.length) setCategories(cache.categories);
        if (cache.menuItems.length)  setMenuItems(cache.menuItems.map(i => ({
          ...i, price: parsePriceNumber(i.basePrice || i.price)
        })));
        if (cache.areas)            setAreas(cache.areas);

        // Retry when server becomes available — socket reconnects automatically
        const socketUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1")
          .replace("/api/v1", "");
        const socket = io(socketUrl, {
          query: { outletId: branchConfig.outletId },
          reconnection:         true,
          reconnectionDelay:    2000,
          reconnectionDelayMax: 15000,
          reconnectionAttempts: Infinity,
        });
        socketRef.current = socket;
        socket.on("connect", () => {
          bootstrap(); // server is back — re-run full bootstrap
          socket.disconnect();
        });
      }
    }

    bootstrap();
    return () => {
      socketRef.current?.disconnect();
      localSocketRef.current?.disconnect();
    };
  }, [branchConfig]);

  // ── Select table ──────────────────────────────────────────────────────────
  async function handleSelectTable(tableId, area) {
    const existingOrder = orders[tableId];
    const isOccupied = (existingOrder?.items || []).filter(i => !i.isVoided && !i.isComp).length > 0;

    // Occupied table → show action sheet first
    if (isOccupied) {
      setActionTableId(tableId);
      setActionArea(area);
      return;
    }

    // Free table → go directly to OrderScreen (existing behaviour, unchanged)
    await openOrderScreen(tableId, area);
  }

  // Extracted so both direct-tap and "Edit Order" from action sheet call the same logic
  async function openOrderScreen(tableId, area) {
    // Capture the local items synchronously BEFORE the async server fetch.
    // A socket event may clear orders[tableId] while the fetch is in flight —
    // using a closure variable avoids losing items that only existed locally.
    let capturedLocalItems = [];
    setOrders((prev) => {
      if (prev[tableId]) {
        capturedLocalItems = [...(prev[tableId].items || [])];
        return prev;
      }
      const t = area.tables.find((x) => x.id === tableId);
      if (!t) return prev;
      return { ...prev, [tableId]: buildBlankOrder(t, area) };
    });
    setActionTableId(null);   // close action sheet if open
    setSelectedTableId(tableId);
    setSelectedArea(area);

    try {
      const serverOrder = await api.get(`/operations/order?tableId=${tableId}${outlet?.id ? `&outletId=${outlet.id}` : ""}`);
      setOrders((prev) => {
        // Merge: keep server-side items + any local unsent items not yet on server
        const serverItemIds = new Set((serverOrder.items || []).map((i) => i.id));
        const localOnlyUnsent = capturedLocalItems.filter(
          (li) => !li.sentToKot && !serverItemIds.has(li.id)
        );
        return {
          ...prev,
          [tableId]: { ...serverOrder, items: [...(serverOrder.items || []), ...localOnlyUnsent] },
        };
      });
    } catch (err) {
      console.warn(`[captain] open table failed for ${tableId}:`, err.message);
    }
  }

  // ── Force-clear a stuck table (no items, but floor shows occupied) ─────────
  function handleForceClearTable(tableId) {
    setOrders((prev) => {
      const { [tableId]: _removed, ...rest } = prev;
      return rest;
    });
    socketRef.current?.emit("order:update", {
      outletId: outlet?.id,
      order: { tableId, items: [], isClosed: false },
    });
    setSelectedTableId(null);
  }

  // ── Update order (local + cloud socket + local socket) ───────────────────
  function handleUpdateOrder(nextOrder) {
    setOrders((p) => ({ ...p, [nextOrder.tableId]: nextOrder }));
    socketRef.current?.emit("order:update",      { outletId: outlet?.id, order: nextOrder });
    localSocketRef.current?.emit("order:update", { order: nextOrder });
  }

  // ── Remove unsent item from order (DELETE to backend so it doesn't ghost) ──
  // Root cause of the "stuck item" bug: socket order:update only relays to other
  // devices but never updates the backend memory store. So a removed item stays
  // on the server and comes back on next sync. This calls DELETE /order/item to
  // remove it from the backend store properly.
  async function handleRemoveItem(itemId) {
    const tableId = selectedTableId;
    if (!tableId || !itemId) return;

    // Optimistic local remove immediately
    setOrders((prev) => {
      const order = prev[tableId];
      if (!order) return prev;
      const next = { ...order, items: order.items.filter((i) => i.id !== itemId) };
      socketRef.current?.emit("order:update",      { outletId: outlet?.id, order: next });
      localSocketRef.current?.emit("order:update", { order: next });
      return { ...prev, [tableId]: next };
    });

    // Persist removal to backend — prevents item ghosting on POS after sync
    try {
      await api.delete(`/operations/order/item`, {
        tableId,
        outletId: outlet?.id || branchConfig?.outletId,
        itemId,
        actorName: loggedInStaff?.name || "Captain",
      });
    } catch (err) {
      console.warn("[captain] removeItem sync failed:", err.message);
    }
  }

  // ── Add item (POST to backend, reconcile) ─────────────────────────────────
  async function handleAddItem(item) {
    const tableId = selectedTableId;
    if (!tableId) return;
    // Resolve station: match by category ID first, then fall back to category name
    // (handles ID type mismatches between Owner Console and menu API).
    const itemCatName = (item.category || item.categoryName || "").trim().toLowerCase();
    const rawStation = item.station || item.stationName ||
      kitchenStations.find(s =>
        (Array.isArray(s.categories) && s.categories.some(cid => String(cid) === String(item.categoryId))) ||
        (Array.isArray(s.categoryNames) && s.categoryNames.some(n => n.trim().toLowerCase() === itemCatName))
      )?.name || "";
    // Don't persist "Main Kitchen" — it's a generic fallback that breaks KDS routing
    const resolvedStation = (rawStation === "Main Kitchen" || rawStation === "Main kitchen") ? "" : rawStation;
    try {
      const serverOrder = await api.post("/operations/order/item", {
        tableId,
        outletId: outlet?.id || branchConfig?.outletId,
        item: {
          id:           item.id,
          menuItemId:   item.menuItemId || item.id,
          name:         item.name,
          price:        item.price,
          quantity:     1,
          note:         item.note || "",
          stationName:  resolvedStation,
          categoryId:   item.categoryId || "",
          categoryName: item.categoryName || item.category || "",  // for backend name-based routing
        },
        actorName: loggedInStaff?.name || "Captain",
      });
      setOrders((prev) => {
        const local = prev[tableId];
        if (!local) return prev;
        const serverItemIds = new Set((serverOrder.items || []).map((i) => i.id));
        const localOnlyUnsent = (local.items || []).filter(
          (li) => !li.sentToKot && !serverItemIds.has(li.id)
        );
        return {
          ...prev,
          [tableId]: { ...serverOrder, items: [...(serverOrder.items || []), ...localOnlyUnsent] },
        };
      });
    } catch (err) {
      console.warn("[captain] addItem sync failed:", err.message);
    }
  }

  // ── Send KOT ──────────────────────────────────────────────────────────────
  // tableId is optional — falls back to selectedTableId (existing call sites unaffected)
  async function handleSendKOT(tableId) {
    const tid    = tableId || selectedTableId;
    const order  = orders[tid];
    if (!order) return;
    // Ensure selectedTableId is set so post-KOT state updates work correctly
    if (tid !== selectedTableId) setSelectedTableId(tid);
    const unsent = (order.items || []).filter((i) => !i.sentToKot);
    if (!unsent.length) return;

    // Guard: outletId must be present — KOT API rejects without it (no KDS delivery)
    const effectiveOutletId = outlet?.id || branchConfig?.outletId;
    if (!effectiveOutletId) {
      console.error("[captain] KOT blocked — outletId missing from both outlet state and branchConfig");
      toast.error("Setup error: outlet not configured. Please re-open the app.");
      return;
    }

    // Optimistic UI — mark items sent immediately so screen feels instant
    handleUpdateOrder({ ...order, items: order.items.map((i) => ({ ...i, sentToKot: true })) });

    // Send ALL items in ONE request — backend splits by station and assigns ONE KOT number
    // to all station-splits. This guarantees the printed slip and every KDS ticket share
    // the same KOT number. (Previous approach sent one request per station → each got a
    // different sequential number → print said #36 but North Indian KDS showed #35.)
    let serverKots = [];
    let lastServerOrder;
    try {
      const result = await api.post("/operations/kot", {
        outletId:    effectiveOutletId,
        tableId:     order.tableId,
        tableNumber: order.tableNumber,
        areaName:    order.areaName,
        // No stationName — backend splits by menu-item station / category / Owner config
        items:       unsent,
        orderId:     order.id,
        actorName:   loggedInStaff?.name || "Captain",
        source:      "captain",
      });
      if (result?.kots?.length)  serverKots = result.kots;
      else if (result?.kot)      serverKots = [result.kot];
      if (result?.order) lastServerOrder = result.order;
    } catch (e) {
      console.error("[captain] KOT send failed:", e.message);
      // Queue the KOT for manual retry from the drawer
      const failedKot = {
        id:          `kot-${Date.now()}`,
        tableId:     order.tableId,
        tableNumber: order.tableNumber,
        areaName:    order.areaName,
        outletId:    effectiveOutletId,
        orderId:     order.id,
        items:       unsent,
        actorName:   loggedInStaff?.name || "Captain",
        failedAt:    new Date().toISOString(),
      };
      setPendingKots((prev) => {
        const next = [...prev, failedKot];
        savePendingKots(next);
        return next;
      });
      toast.error("KOT queued — retry from menu when back online");
    }

    // ── Local WiFi path: emit kot:send to POS directly ────────────────────
    // POS relays to KDS via local socket. Works even when cloud is unreachable.
    localSocketRef.current?.emit("kot:send", {
      outletId:    effectiveOutletId,
      tableId:     order.tableId,
      tableNumber: order.tableNumber,
      areaName:    order.areaName,
      items:       unsent,
      actorName:   loggedInStaff?.name || "Captain",
    });

    const serverKotNumber = serverKots.length ? serverKots[0].kotNumber : null;

    // ── Print KOT slips ────────────────────────────────────────────────────
    // Printer logic:
    //   • Waiter KOT printer  → prints ALL items (1 full slip, always)
    //   • Kitchen station printer → prints only that station's items
    //                               (only if a DEDICATED printer is configured for that station)
    try {
      const { printKOT, getKotPrinter, getKotPrinterForStation, kotAutoSendEnabled } =
        await import("./lib/kotPrint.js");
      if (kotAutoSendEnabled()) {
        const waiterPrinter = getKotPrinter();
        const kotNumber     = serverKotNumber;
        const actorName     = loggedInStaff?.name || "Captain";

        // 1. Waiter slip — ALL items on the default/waiter KOT printer
        printKOT(order, unsent, waiterPrinter, kotNumber, { sentBy: actorName });

        // 2. Kitchen station slips — one per station, only if a dedicated printer is configured
        serverKots.forEach(kot => {
          const st = (kot.station || "").trim();
          if (!st || st.toLowerCase() === "main kitchen") return;
          const stPrinter = getKotPrinterForStation(st);
          // Only print if the station printer is DIFFERENT from the waiter printer
          // (avoids printing the same physical printer twice)
          if (stPrinter && stPrinter.name !== waiterPrinter?.name) {
            // Use original unsent items (have price/note) matched by id; fall back to kot.items
            const kotItemIds = new Set((kot.items || []).map(i => i.id));
            const stItems    = unsent.filter(i => kotItemIds.has(i.id));
            printKOT(order, stItems.length ? stItems : kot.items, stPrinter, kotNumber, { sentBy: actorName });
          }
        });
      }
    } catch (_) { /* printer not configured — KDS still receives it */ }

    // Show the server-assigned KOT number — same number on all station slips
    toast.success(serverKotNumber != null ? `KOT #${serverKotNumber} sent to kitchen` : "KOT sent to kitchen");

    if (lastServerOrder) {
      setOrders((prev) => {
        const local = prev[tid];
        if (!local) return prev;
        const serverItemIds = new Set((lastServerOrder.items || []).map((i) => i.id));
        const localOnlyUnsent = (local.items || []).filter(
          (li) => !li.sentToKot && !serverItemIds.has(li.id)
        );
        return {
          ...prev,
          [tid]: {
            ...lastServerOrder,
            items: [...(lastServerOrder.items || []), ...localOnlyUnsent],
          },
        };
      });
    }

    setActionTableId(null);    // close action sheet if it was open
    setSelectedTableId(null);
  }

  // ── Request bill ──────────────────────────────────────────────────────────
  // tableId is optional — falls back to selectedTableId
  async function handleRequestBill(tableId) {
    const tid   = tableId || selectedTableId;
    const order = orders[tid];
    if (!order) return;
    handleUpdateOrder({ ...order, billRequested: true });
    toast.success("Bill requested — cashier notified");
    if (tableId) setActionTableId(null);   // close action sheet when called from it
    try {
      await api.post("/operations/bill-request", { outletId: outlet?.id, tableId: tid });
    } catch (_) {}
  }

  // ── Print bill ────────────────────────────────────────────────────────────
  function handlePrintBill() {
    const order = orders[selectedTableId];
    if (!order?.items?.length) { toast.error("No items to print"); return; }
    printBill(
      order,
      order.items,
      outlet?.name || branchConfig?.outletName,
      { cashierName: loggedInStaff?.name || "Waiter" }
    );
    toast("Printing bill…", { icon: "🖨️" });
    setSelectedTableId(null);
  }

  // ── Toggle hold ───────────────────────────────────────────────────────────
  // tableId is optional — falls back to selectedTableId
  function handleToggleHold(tableId) {
    const tid   = tableId || selectedTableId;
    const order = orders[tid];
    if (!order) return;
    const next = { ...order, isOnHold: !order.isOnHold };
    handleUpdateOrder(next);
    toast(next.isOnHold ? "Order placed on hold" : "Order resumed", {
      icon: next.isOnHold ? "⏸" : "▶",
    });
    if (tableId) setActionTableId(null);   // close action sheet when called from it
  }

  // ── Save guest info ───────────────────────────────────────────────────────
  function handleCustomerInfoSave(tableId, info) {
    const tid   = tableId || selectedTableId;
    const order = orders[tid];
    if (!order) return;
    handleUpdateOrder({ ...order, guestInfo: info });
    toast.success("Guest info saved");
  }

  // ── Drawer: Sync data ────────────────────────────────────────────────────
  async function handleSync() {
    if (!outlet?.id) return;
    try {
      const [liveOrders, cats, items] = await Promise.all([
        api.get(`/operations/orders?outletId=${outlet.id}`).catch(() => null),
        api.get(`/menu/categories?outletId=${outlet.id}`).catch(() => null),
        api.get(`/menu/items?outletId=${outlet.id}`).catch(() => null),
      ]);
      if (liveOrders) setOrders(Object.fromEntries(liveOrders.map((o) => [o.tableId, o])));
      if (cats)  setCategories(cats);
      if (items) setMenuItems(items.map((i) => ({ ...i, price: parsePriceNumber(i.basePrice || i.price) })));
      toast.success("Data synced");
    } catch (_) {
      toast.error("Sync failed — check connection");
    }
  }

  // ── Drawer: Find POS on network ──────────────────────────────────────────
  async function handleFindPOS() {
    setScanning(true);
    try {
      const subnets = ["192.168.1", "192.168.0", "10.0.0"];
      for (const subnet of subnets) {
        for (let i = 1; i <= 50; i++) {
          const ip = `${subnet}.${i}`;
          try {
            const r = await fetch(`http://${ip}:4001/plato-pos`, { signal: AbortSignal.timeout(400) });
            if (r.ok) {
              localStorage.setItem("captain_local_server_ip", ip);
              toast.success(`POS found at ${ip}`);
              setScanning(false);
              return;
            }
          } catch (_) {}
        }
      }
      toast("POS not found on this network", { icon: "📡" });
    } finally {
      setScanning(false);
    }
  }

  // ── Drawer: Retry a pending KOT ──────────────────────────────────────────
  async function handleRetryKot(kot) {
    try {
      await api.post("/operations/kot", {
        outletId:    kot.outletId,
        tableId:     kot.tableId,
        tableNumber: kot.tableNumber,
        areaName:    kot.areaName,
        items:       kot.items,
        orderId:     kot.orderId,
        actorName:   kot.actorName,
        source:      "captain",
      });
      setPendingKots((prev) => {
        const next = prev.filter((k) => k.id !== kot.id);
        savePendingKots(next);
        return next;
      });
      toast.success(`KOT for Table ${kot.tableNumber} sent`);
    } catch (_) {
      toast.error("Retry failed — still offline");
    }
  }

  async function handleRetryAllKots() {
    const results = await Promise.allSettled(pendingKots.map(handleRetryKot));
    const failed  = results.filter((r) => r.status === "rejected").length;
    if (!failed) toast.success("All pending KOTs sent");
    else toast(`${results.length - failed} sent, ${failed} still failed`, { icon: "⚠️" });
  }

  function handleClearKot(kotId) {
    setPendingKots((prev) => {
      const next = prev.filter((k) => k.id !== kotId);
      savePendingKots(next);
      return next;
    });
  }

  // ── Table transfer ────────────────────────────────────────────────────────
  function handleTableTransfer(fromId, toId) {
    const fromOrder = orders[fromId];
    if (!fromOrder) return;

    let toTable = null, toArea = null;
    for (const area of areas) {
      const t = area.tables.find((x) => x.id === toId);
      if (t) { toTable = t; toArea = area; break; }
    }
    if (!toTable || !toArea) return;

    const movedOrder = { ...fromOrder, tableId: toId, tableNumber: toTable.number, areaName: toArea.name };

    setOrders((prev) => {
      const next = { ...prev };
      const fromArea = areas.find((a) => a.tables.some((t) => t.id === fromId));
      const fromTable = fromArea?.tables.find((t) => t.id === fromId);
      next[fromId] = fromTable && fromArea ? buildBlankOrder(fromTable, fromArea) : undefined;
      if (!next[fromId]) delete next[fromId];
      next[toId] = movedOrder;
      return next;
    });

    setSelectedTableId(toId);
    setSelectedArea(toArea);
    toast.success(`Order moved to Table ${toTable.number}`);
  }

  // ── Table merge ───────────────────────────────────────────────────────────
  function handleTableMerge(currentId, mergeFromId) {
    const current   = orders[currentId];
    const mergeFrom = orders[mergeFromId];
    if (!current || !mergeFrom) return;

    const mergedOrder = {
      ...current,
      items:  [...(current.items || []), ...(mergeFrom.items || [])],
      guests: (current.guests || 0) + (mergeFrom.guests || 0),
    };

    let mfTable = null, mfArea = null;
    for (const area of areas) {
      const t = area.tables.find((x) => x.id === mergeFromId);
      if (t) { mfTable = t; mfArea = area; break; }
    }

    setOrders((prev) => ({
      ...prev,
      [currentId]:   mergedOrder,
      [mergeFromId]: mfTable && mfArea ? buildBlankOrder(mfTable, mfArea) : prev[mergeFromId],
    }));

    const fromNum = mergeFrom.tableNumber || mergeFromId;
    toast.success(`Table ${fromNum} merged into this order`);
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const selectedOrder = selectedTableId ? orders[selectedTableId] : null;
  const selectedTable = selectedTableId && selectedArea
    ? selectedArea.tables.find((t) => t.id === selectedTableId) : null;
  const tableLabel = selectedTable ? `Table ${selectedTable.number}` : "";

  // ── Render ─────────────────────────────────────────────────────────────────

  // 1. Device not linked yet
  if (!branchConfig) {
    return (
      <>
        <SetupScreen onComplete={(cfg) => setBranchConfig(cfg)} />
        <Toaster position="top-center" toastOptions={{ duration: 2500 }} />
      </>
    );
  }

  // 2. No staff logged in
  if (!loggedInStaff) {
    return (
      <>
        <LoginScreen
          outletName={outlet?.name || branchConfig.outletName}
          staff={branchStaff}
          onLogin={setLoggedInStaff}
          onForgetDevice={() => {
            clearCaptainBranchConfig();
            setBranchConfig(null);
          }}
        />
        <Toaster position="top-center" toastOptions={{ duration: 2500 }} />
      </>
    );
  }

  // 3. Main app
  return (
    <div className="captain-app">
      <UpdateBanner />
      {localConn && (
        <div className="captain-local-banner">
          &#x1F4F6; Local · Connected to POS directly
        </div>
      )}
      {/* App header */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="header-brand">
            <span className="header-avatar" style={{ background: avatarBg(loggedInStaff.name) }}>
              {loggedInStaff.avatar || loggedInStaff.name?.[0]?.toUpperCase()}
            </span>
            <div>
              <p className="header-name">{loggedInStaff.name}</p>
              <p className="header-sub">{loggedInStaff.role} · {outlet?.name || branchConfig.outletName || "Restaurant"}</p>
            </div>
          </div>
          <div className="header-right">
            {pendingKots.length > 0 && (
              <span className="header-kot-dot">{pendingKots.length}</span>
            )}
            <button
              className="drawer-open-btn"
              onClick={() => setShowDrawer(true)}
              aria-label="Menu"
            >
              <span className="drawer-open-icon">☰</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="app-main">
        {!selectedTableId ? (
          <TableFloor
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
            areas={areas}
            categories={categories}
            menuItems={menuItems}
            outletName={outlet?.name}
            orders={orders}
            outletId={outlet?.id}
            socket={socketRef.current}
            onBack={() => setSelectedTableId(null)}
            onSendKOT={handleSendKOT}
            onRequestBill={handleRequestBill}
            onPrintBill={handlePrintBill}
            onToggleHold={handleToggleHold}
            onUpdateOrder={handleUpdateOrder}
            onRemoveItem={handleRemoveItem}
            onAddItem={handleAddItem}
            onTransfer={handleTableTransfer}
            onMerge={handleTableMerge}
            onForceClear={() => handleForceClearTable(selectedTableId)}
          />
        )}
      </main>

      {/* Side Drawer */}
      {showDrawer && (
        <SideDrawer
          outletName={outlet?.name || branchConfig?.outletName}
          serverUrl={(import.meta.env.VITE_API_BASE_URL || "").replace("/api/v1", "")}
          localPosIp={localStorage.getItem("captain_local_server_ip") || null}
          pendingKots={pendingKots}
          scanning={scanning}
          onClose={() => setShowDrawer(false)}
          onSync={async () => { setShowDrawer(false); await handleSync(); }}
          onFindPOS={() => { setShowDrawer(false); handleFindPOS(); }}
          onRetryKot={handleRetryKot}
          onRetryAll={handleRetryAllKots}
          onClearKot={handleClearKot}
        />
      )}

      {/* Table Action Sheet — slides up when captain taps an OCCUPIED table */}
      {actionTableId && !selectedTableId && (() => {
        const actionOrder = orders[actionTableId];
        const actionTable = actionArea?.tables?.find((t) => t.id === actionTableId);
        return (
          <TableActionsSheet
            tableNumber={actionTable?.number || actionTableId}
            areaName={actionArea?.name || ""}
            order={actionOrder}
            onClose={() => { setActionTableId(null); setActionArea(null); }}
            onEditOrder={() => openOrderScreen(actionTableId, actionArea)}
            onSendKOT={() => handleSendKOT(actionTableId)}
            onRequestBill={() => handleRequestBill(actionTableId)}
            onHoldToggle={() => handleToggleHold(actionTableId)}
            onMoveTable={() => openOrderScreen(actionTableId, actionArea)}
            onMerge={() => openOrderScreen(actionTableId, actionArea)}
            onCustomerInfo={() => { setShowCustomerInfo(true); }}
          />
        );
      })()}

      {/* Customer Info Sheet — optional, layered on top of action sheet */}
      {showCustomerInfo && actionTableId && (() => {
        const actionOrder = orders[actionTableId];
        return (
          <CustomerInfoSheet
            tableNumber={actionOrder?.tableNumber || actionTableId}
            guestInfo={actionOrder?.guestInfo || {}}
            onSave={(info) => handleCustomerInfoSave(actionTableId, info)}
            onClose={() => setShowCustomerInfo(false)}
          />
        );
      })()}

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2500,
          style: {
            background: "#1C1C1E",
            color: "#F9FAFB",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: "500",
            padding: "12px 16px",
          },
        }}
      />
    </div>
  );
}
