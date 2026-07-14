import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import toast, { Toaster } from "react-hot-toast";
import { UpdateBanner } from "./components/UpdateBanner";

import { api }        from "./lib/api";
import { printBill }  from "./lib/printBill";
import { isNativeAndroid } from "./lib/thermalPrint";
import { getDeviceLocalIp } from "./lib/deviceIp";
import {
  ACTION as SYNC_ACTION,
  enqueue       as syncEnqueue,
  flushQueue    as syncFlushQueue,
  startRetryWorker,
  getFailedCount as syncFailedCount,
} from "./lib/syncQueue";
import {
  startPrintWorker,
  flushQueue     as printFlushQueue,
  getFailedCount as printFailedCount,
} from "./lib/printQueue";
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
import { MoreScreen }          from "./components/MoreScreen";
import { LogoutModal }         from "./components/LogoutModal";
import { IncomingOrdersSheet } from "./components/IncomingOrdersSheet";
import { KotProgressOverlay }  from "./components/KotProgressOverlay";
import { FailedKotsScreen }    from "./components/FailedKotsScreen";
import { ConfirmDialog }       from "./components/ConfirmDialog";

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

const FALLBACK_STAFF = [];

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
  const [activeTab,       setActiveTab]        = useState("floor"); // "floor"|"kots"|"more"
  const [showLogout,      setShowLogout]       = useState(false);
  const [autoOpenAction,  setAutoOpenAction]   = useState(null); // "transfer"|"merge"|"split"
  const [updateInfo,      setUpdateInfo]       = useState(null); // update available for drawer badge
  const [deviceIp,        setDeviceIp]         = useState(null); // this tablet's own LAN IP, for drawer footer
  // KOT queue — failed sends stored here so staff can retry from the drawer
  const [pendingKots, setPendingKots] = useState(() => {
    try { return JSON.parse(localStorage.getItem("captain_pending_kots") || "[]"); } catch { return []; }
  });
  const [socketConnected,  setSocketConnected]  = useState(false);
  const [confirmFreeTable,  setConfirmFreeTable]  = useState(null); // null | { tableId, tableNumber, amount }
  const [confirmRemoveItem, setConfirmRemoveItem] = useState(null); // null | { itemId, itemName, isSent }
  const socketRef             = useRef(null);
  const localSocketRef        = useRef(null);
  const connectLocalSocketRef = useRef(null);  // allows handleFindPOS to reconnect socket
  const kotInFlightRef        = useRef(new Set()); // tableIds with KOT request in flight
  const addItemInFlightRef    = useRef({});        // tableId → in-flight add-item count
  const [localConn,      setLocalConn]      = useState(false);
  const [syncFailed,   setSyncFailed]   = useState(() => syncFailedCount());
  const [printFailed,  setPrintFailed]  = useState(() => printFailedCount());
  // Waiter assignment picker — shown before every KOT send
  const [showWaiterPick,    setShowWaiterPick]    = useState(false);
  const [kotPendingTableId, setKotPendingTableId] = useState(null);
  const [pickedWaiter,      setPickedWaiter]      = useState(null);
  // KOT progress overlay (sending → success) and transfer success modal
  const [kotState,        setKotState]        = useState(null);
  // null | { phase: 'sending'|'success', tableLabel, itemCount, kotNumber }
  const [transferSuccess,    setTransferSuccess]    = useState(null);
  const [billRequestedLabel, setBillRequestedLabel] = useState(null);
  // null | { fromNum, toNum }

  // Incoming customer (QR) orders
  const [customerOrders,     setCustomerOrders]    = useState([]);
  const [showIncoming,       setShowIncoming]      = useState(false);

  // Staff lists — filtered by role
  const WAITER_ROLES  = ["waiter", "server", "steward"];
  const CAPTAIN_ROLES = ["captain"];
  const allStaff    = branchConfig?.staff?.length ? branchConfig.staff : FALLBACK_STAFF;
  const branchStaff = allStaff.filter(
    (s) => CAPTAIN_ROLES.includes((s.role || "").toLowerCase())
  );
  // Waiter picker shows only waiters/servers — not captains
  const waiterStaff = allStaff.filter(
    (s) => WAITER_ROLES.includes((s.role || "").toLowerCase())
  );

  // ── Detect this device's own LAN IP for the drawer's Device IP footer ─────
  useEffect(() => {
    getDeviceLocalIp().then(setDeviceIp);
  }, []);

  // ── Refresh staff from backend on every boot ──────────────────────────────
  // Also updates loggedInStaff so the printed name is always from owner console,
  // not from a stale cached entry (e.g. fallback "Priya" instead of real "Sundar")
  useEffect(() => {
    if (!branchConfig) return;
    api.get("/devices/staff")
      .then((res) => {
        if (Array.isArray(res.staff) && res.staff.length) {
          const updated = { ...branchConfig, staff: res.staff };
          setBranchConfig(updated);
          saveCaptainBranchConfig(updated);
          // Refresh already-logged-in staff record from server data
          setLoggedInStaff(prev => {
            if (!prev) return prev;
            const fresh = res.staff.find(s => s.pin === prev.pin || s.id === prev.id);
            return fresh ? { ...fresh } : prev;
          });
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

        // Re-fetch orders on reconnect so table state is fresh after power cut.
        // Also flush the sync queue immediately — server is reachable again.
        let wasOffline = false;
        socket.on("connect", () => {
          setSocketConnected(true);
          if (wasOffline) {
            api.get(`/operations/orders?outletId=${target.id}`)
              .then((orders) => {
                if (orders.length) setOrders(Object.fromEntries(orders.map((o) => [o.tableId, o])));
              })
              .catch(() => {});
            flushSyncQueue();  // replay queued ADD_ITEM / REMOVE_ITEM / BILL_REQUEST
            flushPrints();     // retry any queued print jobs
          }
          wasOffline = false;
        });
        socket.on("disconnect",    () => { wasOffline = true; setSocketConnected(false); });
        socket.on("connect_error", () => { wasOffline = true; setSocketConnected(false); });

        socket.on("order:updated", (o) => setOrders((p) => {
          // Block all socket updates while a KOT request is in flight for this table.
          // Prevents the server's markKotSent broadcast (which has a higher server-clock
          // timestamp) from overwriting the captain's optimistic state before the HTTP
          // response arrives with the properly reconciled order.
          if (kotInFlightRef.current.has(o.tableId)) return p;
          if ((addItemInFlightRef.current[o.tableId] || 0) > 0) return p;
          if (!o.items?.length || o.isClosed) {
            const { [o.tableId]: _removed, ...rest } = p;
            return rest;
          }
          // Stale-write guard: ignore events older than our current local copy
          const current = p[o.tableId];
          if (current && (current.updatedAt || 0) > (o.updatedAt || 0)) {
            return p; // our version is newer — discard
          }
          // Concurrent-edit merge: preserve local unsent items not in the incoming order
          let merged = o;
          if (current) {
            const incomingIds = new Set((o.items || []).map(i => i.id));
            const localOnly   = (current.items || []).filter(
              i => !i.sentToKot && !i.isVoided && !i.isGhostVoid && !incomingIds.has(i.id)
            );
            if (localOnly.length > 0) {
              merged = { ...o, items: [...(o.items || []), ...localOnly] };
            }
          }
          return { ...p, [o.tableId]: merged };
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

        // ── QR customer orders: listen + initial fetch ───────────────────────
        socket.on("customer:order:new", (order) => {
          if (order.outletId !== target.id) return;
          setCustomerOrders((prev) => {
            if (prev.some((o) => o.id === order.id)) return prev; // dedupe
            return [order, ...prev];
          });
          toast("📲 New table order received!", {
            duration: 5000,
            style: { background: "#059669", color: "#fff" },
          });
        });
        // Fetch any pending orders that came in before app launch
        api.get(`/operations/customer-order?outletId=${target.id}`)
          .then((data) => { if (Array.isArray(data) && data.length) setCustomerOrders(data); })
          .catch(() => {});

        // ── Waiter called from customer QR page ─────────────────────────────
        socket.on("waiter:called", ({ tableLabel, tableId, customerName }) => {
          toast(`🛎️ Table ${tableLabel || tableId} needs assistance${customerName ? ` — ${customerName}` : ""}`, {
            duration: 6000,
            style: { background: "#2563eb", color: "#fff" },
          });
        });

        // ── Local POS WiFi server — auto-reconnect + auto-scan ───────────────
        // Scans 192.168.1/0 and 10.0.0 subnets when saved IP stops responding,
        // updates the saved IP, and reconnects silently. No manual steps needed
        // after router restart even if DHCP assigns a new IP to the POS machine.

        async function findPosOnNetwork() {
          const ownIp     = await getDeviceLocalIp();
          const ownSubnet = ownIp ? ownIp.split(".").slice(0, 3).join(".") : null;
          const subnets   = [...new Set([ownSubnet, "192.168.1", "192.168.0", "10.0.0"].filter(Boolean))];
          for (const subnet of subnets) {
            // Scan all 254 hosts in parallel — first responder wins.
            // Takes ~1.5 s max regardless of where the POS sits in the subnet.
            const ips  = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
            const found = await new Promise(resolve => {
              let done = false, remaining = ips.length;
              ips.forEach(ip => {
                fetch(`http://${ip}:4001/plato-pos`, { signal: AbortSignal.timeout(1500) })
                  .then(r => { if (r.ok && !done) { done = true; resolve(ip); } })
                  .catch(() => {})
                  .finally(() => { remaining--; if (remaining === 0 && !done) resolve(null); });
              });
            });
            if (found) return found;
          }
          return null;
        }

        function connectLocalSocket(ip) {
          connectLocalSocketRef.current = connectLocalSocket; // expose for handleFindPOS
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
            if (kotInFlightRef.current.has(o.tableId)) return p;
            if ((addItemInFlightRef.current[o.tableId] || 0) > 0) return p;
            if (!o.items?.length || o.isClosed) {
              const { [o.tableId]: _r, ...rest } = p;
              return rest;
            }
            const current = p[o.tableId];
            if (current && (current.updatedAt || 0) > (o.updatedAt || 0)) return p;
            // Concurrent-edit merge: preserve local unsent items not in the incoming order
            let merged = o;
            if (current) {
              const incomingIds = new Set((o.items || []).map(i => i.id));
              const localOnly   = (current.items || []).filter(
                i => !i.sentToKot && !i.isVoided && !i.isGhostVoid && !incomingIds.has(i.id)
              );
              if (localOnly.length > 0) {
                merged = { ...o, items: [...(o.items || []), ...localOnly] };
              }
            }
            return { ...p, [o.tableId]: merged };
          }));
        }

        const savedLocalIp = localStorage.getItem("captain_local_server_ip")?.trim();
        if (savedLocalIp) {
          connectLocalSocket(savedLocalIp);
        } else {
          // No POS IP saved yet (skipped during setup) — scan silently in the
          // background so the drawer's Device IP footer populates on its own
          // instead of staying blank until the captain finds "Find Server IP".
          findPosOnNetwork().then(foundIp => {
            if (!foundIp) return;
            localStorage.setItem("captain_local_server_ip", foundIp);
            connectLocalSocket(foundIp);
          });
        }
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

    // ── Sync queue flush function ────────────────────────────────────────────
    // Retries any ADD_ITEM / REMOVE_ITEM / BILL_REQUEST entries that failed
    // while the device was offline.  Called on reconnect and every 30 s.
    async function flushSyncQueue() {
      const currentOutletId = outlet?.id || branchConfig?.outletId;
      await syncFlushQueue(async (entry) => {
        if (entry.action === SYNC_ACTION.ADD_ITEM) {
          // Check server first — item may have arrived via a later socket update.
          // Re-add only if it's genuinely missing from the server order.
          const serverOrder = await api.get(
            `/operations/order?tableId=${entry.payload.tableId}&outletId=${entry.payload.outletId || currentOutletId}`
          ).catch(() => null);
          const alreadyThere = (serverOrder?.items || []).some(
            i => i.id === entry.payload.item.id
          );
          if (!alreadyThere) {
            await api.post("/operations/order/item", entry.payload);
          }
        } else if (entry.action === SYNC_ACTION.REMOVE_ITEM) {
          await api.delete("/operations/order/item", entry.payload);
        } else if (entry.action === SYNC_ACTION.BILL_REQUEST) {
          await api.post("/operations/bill-request", entry.payload);
        }
      });
      // Refresh the failed-count badge in the drawer
      setSyncFailed(syncFailedCount());
    }

    // ── Print queue flush function ───────────────────────────────────────────
    // Passes sendToThermalPrinter (Capacitor TCP) lazily so printQueue.js stays
    // free of Capacitor imports.  Retries failed prints every 10 s.
    async function flushPrints() {
      const { sendToThermalPrinter } = await import("./lib/thermalPrint.js");
      await printFlushQueue(sendToThermalPrinter);
      setPrintFailed(printFailedCount());
    }

    bootstrap();

    // Start background retry workers
    const stopWorker      = startRetryWorker(flushSyncQueue);   // sync mutations every 30 s
    const stopPrintWorker = startPrintWorker(flushPrints);      // print queue retries every 10 s

    // Immediate flush on print: kotPrint / printBill dispatch this event right after
    // enqueue() so the first attempt fires NOW (same timing as before), while the
    // 10 s worker only handles retries after failure.
    window.addEventListener("dinex:flush-prints", flushPrints);

    // When user manually saves POS IP in Settings, reconnect the local socket immediately
    // so live order sync works without an app restart.
    function onPosIpChanged(e) {
      const ip = e.detail?.ip;
      if (ip) connectLocalSocketRef.current?.(ip);
    }
    window.addEventListener("dinex:pos-ip-changed", onPosIpChanged);

    return () => {
      socketRef.current?.disconnect();
      localSocketRef.current?.disconnect();
      stopWorker();
      stopPrintWorker();
      window.removeEventListener("dinex:flush-prints", flushPrints);
      window.removeEventListener("dinex:pos-ip-changed", onPosIpChanged);
    };
  }, [branchConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check for Captain app updates (shown in drawer, not top banner) ──────
  useEffect(() => {
    const APP_VERSION_CAPTAIN = "1.30";
    const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://api.dinexpos.in/api/v1");
    function checkUpdate() {
      fetch(`${API_BASE}/app-versions`, { cache: "no-store" })
        .then(r => r.json())
        .then(data => {
          const latest = data?.captain;
          if (!latest?.version) return;
          const pa = APP_VERSION_CAPTAIN.split(".").map(Number);
          const pb = latest.version.split(".").map(Number);
          const newer = pb.some((v, i) => v > (pa[i] || 0));
          if (newer) setUpdateInfo(latest);
        })
        .catch(() => {});
    }
    checkUpdate();
    const t = setInterval(checkUpdate, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // ── Select table ──────────────────────────────────────────────────────────
  // TAP → always open order screen first (so user can see the table state before acting)
  async function handleSelectTable(tableId, area) {
    const existingOrder = orders[tableId];
    const isOccupied = (existingOrder?.items || []).filter(i => !i.isVoided && !i.isComp).length > 0;
    await openOrderScreen(tableId, area, null);
  }

  // LONG PRESS on occupied table → show action sheet (Merge/Transfer/Split/Print Bill)
  function handleLongPressTable(tableId, area) {
    const existingOrder = orders[tableId];
    const isOccupied = (existingOrder?.items || []).filter(i => !i.isVoided && !i.isComp).length > 0;
    if (isOccupied) {
      setActionTableId(tableId);
      setActionArea(area);
    }
  }

  // Extracted so both direct-tap and "Edit Order" from action sheet call the same logic
  // autoOpen: null | "menu" | "transfer" | "merge" | "split" — immediately opens the relevant screen/modal
  async function openOrderScreen(tableId, area, autoOpen = null) {
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
    setAutoOpenAction(autoOpen);
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
          [tableId]: {
            ...serverOrder,
            // Preserve local assignedWaiter if server response doesn't include one
            assignedWaiter: serverOrder.assignedWaiter || prev[tableId]?.assignedWaiter || null,
            items: [...(serverOrder.items || []), ...localOnlyUnsent],
          },
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

  // ── Mark table as free (optimistic clear from confirm dialog) ────────────
  function handleMarkFree(tableId) {
    setOrders(prev => { const { [tableId]: _, ...rest } = prev; return rest; });
    socketRef.current?.emit("order:update", {
      outletId: outlet?.id,
      order: { tableId, items: [], isClosed: false },
    });
    localSocketRef.current?.emit("order:update", { order: { tableId, items: [], isClosed: false } });
    setActionTableId(null);
    setConfirmFreeTable(null);
  }

  // ── Update order (local + cloud socket + local socket) ───────────────────
  function handleUpdateOrder(nextOrder) {
    // Stamp current time so stale server echoes (older updatedAt) are rejected by the order:updated guard.
    // Must be Date.now() (number) — backend also uses Date.now() and the guard compares with >.
    // Mixing ISO strings and numbers in the comparison always yields NaN > number = false.
    const stamped = { ...nextOrder, updatedAt: Date.now() };
    setOrders((p) => ({ ...p, [stamped.tableId]: stamped }));
    socketRef.current?.emit("order:update",      { outletId: outlet?.id, order: stamped });
    localSocketRef.current?.emit("order:update", { order: stamped });
  }

  // ── Persist guest count to backend so it survives syncs ──────────────────
  async function handleUpdateGuests(tableId, guests) {
    const order = orders[tableId];
    if (!order) return;
    const updated = { ...order, guests };
    setOrders((p) => ({ ...p, [tableId]: updated }));
    try {
      await api.post(`/operations/orders/${tableId}/guests`, {
        outletId: outlet?.id || branchConfig?.outletId,
        guests,
      });
    } catch (err) {
      console.warn("[captain] updateGuests failed:", err.message);
    }
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
      const deletedIds = [...(order._deletedItemIds || []), itemId].slice(-50);
      const next = {
        ...order,
        items: order.items.filter((i) => i.id !== itemId),
        _deletedItemIds: deletedIds,
        updatedAt: Date.now(),
      };
      socketRef.current?.emit("order:update",      { outletId: outlet?.id, order: next });
      localSocketRef.current?.emit("order:update", { order: next });
      return { ...prev, [tableId]: next };
    });

    // Persist removal to backend — prevents item ghosting on POS after sync
    const removePayload = {
      tableId,
      outletId:  outlet?.id || branchConfig?.outletId,
      itemId,
      actorName: loggedInStaff?.name || "Captain",
    };
    try {
      await api.delete(`/operations/order/item`, removePayload);
    } catch (err) {
      console.warn("[captain] removeItem sync failed — queuing for retry:", err.message);
      syncEnqueue(SYNC_ACTION.REMOVE_ITEM, removePayload);
    }
  }

  // ── Add item (POST to backend, reconcile) ─────────────────────────────────
  async function handleAddItem(item) {
    const tableId = selectedTableId;
    if (!tableId) return;
    // Snapshot which unsent menuItemIds exist in local state RIGHT NOW (before the REST call).
    // If a server item is missing from local when the response arrives AND it was here before
    // the call, the captain removed it while the call was in flight — suppress it from the merge.
    const preCallUnsentMenuItemIds = new Set(
      ((orders[tableId]?.items) || [])
        .filter(li => !li.sentToKot && li.menuItemId)
        .map(li => li.menuItemId)
    );
    // Resolve station: match by category ID first, then fall back to category name
    // (handles ID type mismatches between Owner Console and menu API).
    const itemCatName = (item.category || item.categoryName || "").trim().toLowerCase();
    const rawStation = item.station || item.stationName ||
      kitchenStations.find(s =>
        (Array.isArray(s.categories) && s.categories.some(cid => String(cid) === String(item.categoryId))) ||
        (Array.isArray(s.categoryNames) && s.categoryNames.some(n => n.trim().toLowerCase() === itemCatName))
      )?.name || "";
    // Don't persist fallback station names — they break KDS routing
    const resolvedStation = (rawStation === "Main Kitchen" || rawStation === "Main kitchen" || rawStation === "Unassigned") ? "" : rawStation;
    // Block order:updated socket events for this table while REST call is in flight.
    // Server echoes back order:updated after processing the add — without this guard,
    // the echo (with server qty) overwrites the captain's local qty adjustments.
    addItemInFlightRef.current[tableId] = (addItemInFlightRef.current[tableId] || 0) + 1;
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
          taxRate:      item.taxRate != null ? Number(item.taxRate) : null,
        },
        actorName: loggedInStaff?.name || "Captain",
      });
      // Reconcile server response into local state (ID resolution: temp-ID → server UUID).
      // handleUpdateOrder (called by MenuBrowser's onUpdateOrder before this REST call) already
      // broadcast the captain's correct qty to POS. We must NOT broadcast again here —
      // mergedForBroadcast = serverOrder runs before React's async setOrders updater fires,
      // so any post-REST broadcast would carry the server's stale qty and overwrite POS.
      // Stamp updatedAt: Date.now() on the merged state so the stale-write guard in
      // socket.on("order:updated") blocks the server's echo (which has an older timestamp).
      let mergedForBroadcast = null;
      setOrders((prev) => {
        const local = prev[tableId];
        if (!local) return prev;
        const serverItemIds = new Set((serverOrder.items || []).map((i) => i.id));
        // Also exclude local items whose menuItemId is already present in the server's
        // unsent items — prevents temp-ID items (item-${Date.now()}-random) from
        // surviving as duplicates alongside the real server item with the same menuItemId.
        const serverUnsentMenuItemIds = new Set(
          (serverOrder.items || []).filter(i => !i.sentToKot).map(i => i.menuItemId)
        );
        const localOnlyUnsent = (local.items || []).filter(
          (li) => !li.sentToKot && !serverItemIds.has(li.id) && !serverUnsentMenuItemIds.has(li.menuItemId)
        );
        // Captain may have tapped − on Order Screen while this REST call was in flight.
        // Preserve local unsent qty so the server's stale (higher) count doesn't overwrite.
        const localUnsentQty = new Map();
        (local.items || []).forEach(li => {
          if (!li.sentToKot) {
            localUnsentQty.set(li.id, li.quantity);
            if (li.menuItemId) localUnsentQty.set(`m:${li.menuItemId}`, li.quantity);
          }
        });
        const mergedServerItems = (serverOrder.items || []).map(si => {
          if (!si.sentToKot) {
            const localQty = localUnsentQty.get(si.id) ?? localUnsentQty.get(`m:${si.menuItemId}`);
            if (localQty != null) return { ...si, quantity: localQty };
            // localQty is null — item is absent from current local state.
            // If it was present before this REST call, captain removed it while call was in flight.
            // Suppress it so it doesn't jump back into the menu browser stepper.
            if (si.menuItemId && preCallUnsentMenuItemIds.has(si.menuItemId)) return null;
          }
          return si;
        }).filter(Boolean);
        const newTableState = {
          ...serverOrder,
          // Preserve local assignedWaiter if server response doesn't include one
          assignedWaiter: serverOrder.assignedWaiter || local.assignedWaiter || null,
          items: [...mergedServerItems, ...localOnlyUnsent],
          // Fresh timestamp so the stale-write guard rejects any server order:updated
          // echo that arrives after this REST response (server timestamp is older).
          updatedAt: Date.now(),
        };
        mergedForBroadcast = newTableState;
        return { ...prev, [tableId]: newTableState };
      });
      // Re-broadcast the captain's merged (authoritative) state to POS.
      // The server emits order:updated to POS with accumulated server qty after each REST call.
      // That overwrites the captain's local qty reduction on POS. Broadcasting the merged state
      // here corrects POS — the updater runs synchronously so mergedForBroadcast is set.
      if (mergedForBroadcast) {
        socketRef.current?.emit("order:update", { outletId: outlet?.id, order: mergedForBroadcast });
        localSocketRef.current?.emit("order:update", { order: mergedForBroadcast });
      }
      // Unblock after a short delay to absorb any late-arriving server echo.
      // The reconciled state is already set above; the delay just ensures the echo
      // (which may be in transit) is discarded rather than overwriting our merged state.
      setTimeout(() => {
        addItemInFlightRef.current[tableId] = Math.max(0, (addItemInFlightRef.current[tableId] || 1) - 1);
      }, 300);
    } catch (err) {
      console.warn("[captain] addItem sync failed — queuing for retry:", err.message);
      // Decrement immediately on error — no server echo will arrive
      addItemInFlightRef.current[tableId] = Math.max(0, (addItemInFlightRef.current[tableId] || 1) - 1);
      syncEnqueue(SYNC_ACTION.ADD_ITEM, {
        tableId,
        outletId:  outlet?.id || branchConfig?.outletId,
        item: {
          id:           item.id,
          menuItemId:   item.menuItemId || item.id,
          name:         item.name,
          price:        item.price,
          quantity:     1,
          note:         item.note || "",
          stationName:  (() => {
            const raw = item.station || item.stationName ||
              kitchenStations.find(s =>
                (Array.isArray(s.categories) && s.categories.some(cid => String(cid) === String(item.categoryId))) ||
                (Array.isArray(s.categoryNames) && s.categoryNames.some(n => n.trim().toLowerCase() === (item.category || item.categoryName || "").trim().toLowerCase()))
              )?.name || "";
            return (raw === "Main Kitchen" || raw === "Main kitchen" || raw === "Unassigned") ? "" : raw;
          })(),
          categoryId:   item.categoryId || "",
          categoryName: item.categoryName || item.category || "",
          taxRate:      item.taxRate != null ? Number(item.taxRate) : null,
        },
        actorName: loggedInStaff?.name || "Captain",
      });
    }
  }

  // ── Send KOT — step 1: show waiter picker ─────────────────────────────────
  // tableId is optional — falls back to selectedTableId (existing call sites unaffected)
  function handleSendKOT(tableId) {
    const tid   = tableId || selectedTableId;
    const order = orders[tid];
    if (!order) return;
    const unsent = (order.items || []).filter((i) => !i.sentToKot);
    if (!unsent.length) return;
    // Pre-select the order's current waiter if they're still in the waiter list,
    // otherwise start with no selection (captain is NOT a default waiter)
    const currentWaiter = order.assignedWaiter || null;
    const stillValid = waiterStaff.some((s) => s.name === currentWaiter);
    setPickedWaiter(stillValid ? currentWaiter : null);
    setKotPendingTableId(tid);
    setShowWaiterPick(true);
  }

  // ── Send KOT — step 2: actually send after waiter is confirmed ─────────────
  // waiterName = the staff member assigned to serve this table's order
  async function doSendKOT(tableId, waiterName) {
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

    const actorName    = loggedInStaff?.name || "Captain";
    // waiterName comes from the picker. If picker returned null (e.g. "None" selected or
    // no waiter-role staff configured), fall back to the order's already-assigned waiter
    // so the name persists across multiple KOTs on the same table.
    const waiterToShow = waiterName || order.assignedWaiter || null;

    // Block ALL socket order:updated events for this table for the entire KOT flow.
    // Must be set BEFORE handleUpdateOrder (which emits order:update and can trigger a
    // server-side order:updated echo) and BEFORE the assign-waiter await (whose REST
    // handler can also emit order:updated with a server-clock timestamp that would pass
    // the stale-write guard and overwrite captain's locally-adjusted quantities).
    kotInFlightRef.current.add(tid);

    // Stamp assignedWaiter on the order so it persists until the next KOT
    handleUpdateOrder({ ...order, assignedWaiter: waiterToShow || "",
      items: order.items.map((i) => ({ ...i, sentToKot: true })) });

    // Persist to backend so it survives POS reconnects (socket-only update is lost on reconnect)
    try {
      await api.post(`/operations/orders/${tid}/assign-waiter`, {
        waiterName: waiterToShow || "",
        actorName,
      });
    } catch (_) { /* non-critical — socket update already broadcast */ }

    // Send ALL items in ONE request — backend splits by station and assigns ONE KOT number
    // to all station-splits. This guarantees the printed slip and every KDS ticket share
    // the same KOT number. (Previous approach sent one request per station → each got a
    // different sequential number → print said #36 but North Indian KDS showed #35.)
    const kotTableLabel = `Table ${order.tableNumber}`;
    setKotState({ phase: "sending", tableLabel: kotTableLabel, itemCount: unsent.length });
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
        actorName:   actorName,
        waiterName:  waiterToShow || "",
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
        actorName:   actorName,
        failedAt:    new Date().toISOString(),
      };
      setPendingKots((prev) => {
        const next = [...prev, failedKot];
        savePendingKots(next);
        return next;
      });
      toast.error("KOT queued — retry from menu when back online");
    }

    const serverKotNumber = serverKots.length ? serverKots[0].kotNumber : null;

    // ── Print KOT slips ────────────────────────────────────────────────────
    // POS-as-Server mode: when Captain knows the local POS IP, delegate ALL
    // KOT printing to POS. POS uses its own pos_printers config (single source
    // of truth) to print waiter copy + per-station copies. Falls back to local
    // printing if POS is unreachable.
    try {
      const { printKOT, getWaiterKotPrinter, getKotPrinterForStation, kotAutoSendEnabled } =
        await import("./lib/kotPrint.js");
      if (kotAutoSendEnabled()) {
        const localPosIp = localStorage.getItem("captain_local_server_ip");

        if (localPosIp) {
          try {
            const res = await fetch(`http://${localPosIp}:4001/print-kot`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                order,
                kots:     serverKots,
                allItems: unsent,
                kotSeq:   serverKotNumber,
                sentBy:   actorName,
                waiter:   waiterToShow,
              }),
            });
            if (res.ok) posDelegated = true;
          } catch (err) {
            console.warn("[captain] POS /print-kot failed, falling back to local print:", err.message);
          }
        }

        if (!posDelegated) {
          // Fallback: print locally (Electron desktop or Android direct TCP)
          const waiterPrinter = getWaiterKotPrinter();
          const kotNumber     = serverKotNumber;
          printKOT(order, unsent, waiterPrinter, kotNumber, { sentBy: actorName, waiter: waiterToShow });
          serverKots.forEach(kot => {
            const st = (kot.station || "").trim();
            if (!st || st.toLowerCase() === "main kitchen") return;
            const stPrinter = getKotPrinterForStation(st);
            if (stPrinter && stPrinter.name !== waiterPrinter?.name) {
              const kotItemIds = new Set((kot.items || []).map(i => i.id));
              const stItems    = unsent.filter(i => kotItemIds.has(i.id));
              printKOT(order, stItems.length ? stItems : kot.items, stPrinter, kotNumber, { sentBy: actorName, waiter: waiterToShow });
            }
          });
        }
      }
    } catch (_) { /* printer not configured — KDS still receives it */ }

    // ── Local WiFi path: emit kot:send to POS/KDS ─────────────────────────
    localSocketRef.current?.emit("kot:send", {
      outletId:     effectiveOutletId,
      tableId:      order.tableId,
      tableNumber:  order.tableNumber,
      areaName:     order.areaName,
      items:        unsent,
      stationGroups: serverKots
        .filter(k => {
          const st = (k.station || "").trim();
          return st && st.toLowerCase() !== "main kitchen" && st.toLowerCase() !== "unassigned";
        })
        .map(k => {
          const kotItemIds = new Set((k.items || []).map(i => i.id));
          const stItems = unsent.filter(i => kotItemIds.has(i.id));
          return { station: k.station, items: stItems.length ? stItems : (k.items || []) };
        }),
      actorName:         actorName,
      waiterName:        waiterToShow || "",
      skipPrint:         posDelegated,
      backendKotNumber:  serverKotNumber,
    });

    // Show KOT success screen — replaces toast, gives captain a clean confirmation
    setKotState({
      phase:      "success",
      kotNumber:  serverKotNumber,
      tableLabel: kotTableLabel,
      itemCount:  unsent.length,
    });

    if (lastServerOrder) {
      // Build qty map from captain's local unsent items — these are what was actually
      // sent to the kitchen. Backend's in-memory qty can be stale (higher) when captain
      // decremented without a full-remove (decrements only update local + socket, not REST).
      const unsentQtyMap = {};
      unsent.forEach(i => { unsentQtyMap[i.id] = i.quantity; });
      const serverItemIds = new Set((lastServerOrder.items || []).map(i => i.id));
      // Preserve any captain-local unsent items the backend doesn't know about yet
      const localNow = orders[tid];
      const localOnlyUnsent = localNow
        ? (localNow.items || []).filter(li => !li.sentToKot && !serverItemIds.has(li.id))
        : [];
      // Override server quantities with captain's actual sent quantities
      const reconciledItems = (lastServerOrder.items || []).map(si => {
        const captainQty = unsentQtyMap[si.id];
        return captainQty != null ? { ...si, quantity: captainQty } : si;
      });
      // Use lastServerOrder.updatedAt + 1 so the reconciled order is always exactly
      // 1ms newer than the backend's own timestamp — regardless of server/client clock
      // skew. Both the captain guard and the POS guard will then correctly reject the
      // stale backend echo (which carries lastServerOrder.updatedAt).
      const reconciledOrder = {
        ...lastServerOrder,
        assignedWaiter: waiterToShow,
        items: [...reconciledItems, ...localOnlyUnsent],
        updatedAt: (lastServerOrder.updatedAt || 0) + 1,
      };

      setOrders((prev) => prev[tid] ? { ...prev, [tid]: reconciledOrder } : prev);

      // Broadcast corrected quantities to POS immediately — without this, POS only
      // receives the backend's stale order:updated (wrong qty) and captain's decrement
      // never reaches POS after KOT. The +1 updatedAt ensures POS's guard rejects
      // the subsequent stale echo.
      socketRef.current?.emit("order:update",      { outletId: effectiveOutletId, order: reconciledOrder });
      localSocketRef.current?.emit("order:update", { order: reconciledOrder });
    }
    kotInFlightRef.current.delete(tid);

    setActionTableId(null);    // close action sheet if it was open
    // Note: setSelectedTableId(null) is deferred to KotProgressOverlay onClose / onAddMore
  }

  // ── Request bill ──────────────────────────────────────────────────────────
  // tableId is optional — falls back to selectedTableId
  async function handleRequestBill(tableId) {
    const tid   = tableId || selectedTableId;
    const order = orders[tid];
    if (!order) return;
    handleUpdateOrder({ ...order, billRequested: true });
    if (tableId) setActionTableId(null);   // close action sheet when called from it
    // Compute short label, e.g. "Table 5" from "TABLE 5"
    const tNum = order.tableNumber || "";
    const tMatch = String(tNum).trim().match(/(\d+)\s*$/);
    const tLabel = tMatch ? `Table ${tMatch[1]}` : (String(tNum) || "the table");
    setBillRequestedLabel(tLabel);
    const billReqPayload = { outletId: outlet?.id, tableId: tid };
    try {
      await api.post("/operations/bill-request", billReqPayload);
    } catch (err) {
      console.warn("[captain] bill-request sync failed — queuing for retry:", err.message);
      syncEnqueue(SYNC_ACTION.BILL_REQUEST, billReqPayload);
    }
  }

  // ── Print bill (works from OrderScreen inline or from long-press action sheet)
  async function handlePrintBill(tableId) {
    const tid   = tableId || selectedTableId;
    const order = orders[tid];
    if (!order?.items?.length) { toast.error("No items to print"); return; }

    // Assign bill number from server (FY or daily, per owner-console setting).
    // Idempotent: if POS already printed and assigned a number, returns the same one.
    let printOrder = { ...order };
    try {
      const result = await api.post("/operations/assign-bill-no", {
        outletId: outlet?.id || branchConfig?.outletId,
        tableId:  tid,
      });
      if (result?.billNo != null) {
        printOrder = { ...printOrder, billNo: result.billNo, billNoMode: result.billNoMode, billNoFY: result.billNoFY };
      }
    } catch (err) {
      console.warn("[captain] assign-bill-no failed:", err.message);
    }

    // Delegate bill printing to POS (POS has the printer config).
    // Falls back to local printBill() if POS is unreachable.
    const localPosIp = localStorage.getItem("captain_local_server_ip")?.trim();
    let posBillDelegated = false;
    if (localPosIp) {
      try {
        const res = await fetch(`http://${localPosIp}:4001/print-bill`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order:       printOrder,
            items:       printOrder.items,
            outletData:  outlet || { name: branchConfig?.outletName || "Restaurant" },
            cashierName: printOrder.cashierName    || null,
            captainName: printOrder.captainName    || null,
            waiterName:  printOrder.assignedWaiter || null,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) posBillDelegated = true;
      } catch (err) {
        console.warn("[captain] POS /print-bill failed, falling back to local print:", err.message);
      }
    }

    // Socket delegation — works when Captain is connected to POS via local WiFi
    // but /print-bill HTTP endpoint is not reachable (old POS exe or no POS IP saved).
    // POS handles printing with its own printer config — Captain needs zero printer setup.
    if (!posBillDelegated && localSocketRef.current?.connected) {
      localSocketRef.current.emit("bill:print", {
        order:       printOrder,
        items:       printOrder.items,
        outletData:  outlet || { name: branchConfig?.outletName || "Restaurant" },
        cashierName: printOrder.cashierName    || null,
        captainName: printOrder.captainName    || null,
        waiterName:  printOrder.assignedWaiter || null,
      });
      posBillDelegated = true;
    }

    if (!posBillDelegated) {
      // Last resort: local printBill() — needs captain_printers[0].ip set in Settings
      printBill(
        printOrder,
        printOrder.items,
        outlet || { name: branchConfig?.outletName || "Restaurant" },
        {
          cashierName: printOrder.cashierName    || null,
          captainName: printOrder.captainName    || null,
          waiterName:  printOrder.assignedWaiter || null,
        }
      );
    }

    // Log every bill print from Captain App for Owner Console audit trail
    api.post("/operations/reprint-log", {
      source:      "captain",
      cashier:     printOrder.captainName || printOrder.cashierName || null,
      outletName:  outlet?.name || branchConfig?.outletName,
      tableLabel:  printOrder.tableNumber || tid,
      orderNumber: printOrder.orderNumber,
      billNo:      printOrder.billNo || null,
    }).catch(() => {});

    // Mark billRequested: true — table turns blue on POS floor plan
    handleUpdateOrder({ ...printOrder, billRequested: true });
    api.post("/operations/bill-request", { outletId: outlet?.id, tableId: tid }).catch(() => {});
    toast("Printing bill…", { icon: "🖨️" });
    if (tid === selectedTableId) setSelectedTableId(null);
    setActionTableId(null);
  }

  // ── Split bill print ──────────────────────────────────────────────────────
  // Called from SplitBill component when user taps "Print Person N" or "Print Full Bill".
  // Awaits bill-number assignment BEFORE printing so every slip has a number.
  // Each person tap gets its own unique bill number (correct behaviour).
  async function handlePrintSplitBill(tableId, items, seatLabel) {
    const tid   = tableId || selectedTableId;
    const order = orders[tid];
    if (!order || !items?.length) return;

    // 1. Assign a new bill number first — MUST complete before printing
    let printOrder = { ...order };
    try {
      const result = await api.post("/operations/assign-bill-no", {
        outletId: outlet?.id || branchConfig?.outletId,
        tableId:  tid,
      });
      if (result?.billNo != null) {
        printOrder = {
          ...printOrder,
          billNo:     result.billNo,
          billNoMode: result.billNoMode,
          billNoFY:   result.billNoFY,
        };
      }
    } catch (err) {
      console.warn("[captain] assign-bill-no (split) failed:", err.message);
    }

    // 2. Print with bill number
    printBill(
      printOrder,
      items,
      outlet || { name: branchConfig?.outletName || "Restaurant" },
      {
        cashierName: printOrder.cashierName    || null,   // POS shift cashier, not the captain
        seatLabel,
        captainName: printOrder.captainName    || null,
        waiterName:  printOrder.assignedWaiter || null,
      }
    );
    toast("Printing split bill…", { icon: "🖨️" });

    // 3. Mark billRequested + notify POS
    const now = Date.now();
    const updatedOrder = { ...printOrder, billRequested: true, isSplitBill: true, updatedAt: now };
    handleUpdateOrder(updatedOrder);

    // 4. Send split bill record to backend → POS shows settlement panel
    const billableItems = (items || []).filter(i => !i.isVoided && !i.isComp);
    const subtotal = billableItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const tax = billableItems.reduce((s, i) => {
      const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
      return s + Math.round(i.price * i.quantity * rate / 100);
    }, 0);
    api.post("/operations/split-bill-record", {
      outletId:  outlet?.id || branchConfig?.outletId,
      tableId:   tid,
      seatLabel: seatLabel || "Person",
      billNo:    printOrder.billNo,
      items:     billableItems,
      subtotal,
      tax,
      total:     subtotal + tax,
    }).catch(() => {});

    api.post("/operations/bill-request", { outletId: outlet?.id, tableId: tid, isSplit: true }).catch(() => {});
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

  // ── Sign out — clear staff login only, keep branch config (device stays linked)
  // Returns to the staff PIN selection screen, not the setup/sync code screen.
  function handleSignOut() {
    setLoggedInStaff(null);   // goes back to PIN login (branchConfig stays intact)
  }

  // ── Sync data (called from MoreScreen) ──────────────────────────────────
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
    } catch (_) {
      toast.error("Sync failed — check connection");
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
  async function handleTableTransfer(fromId, toId) {
    const fromOrder = orders[fromId];
    if (!fromOrder) return;

    let toTable = null, toArea = null;
    for (const area of areas) {
      const t = area.tables.find((x) => x.id === toId);
      if (t) { toTable = t; toArea = area; break; }
    }
    if (!toTable || !toArea) return;

    const fromArea  = areas.find((a) => a.tables.some((t) => t.id === fromId));
    const fromTable = fromArea?.tables.find((t) => t.id === fromId);

    // ── Call backend FIRST so we know it succeeded before touching local state ──
    // This avoids the race condition where openOrderScreen fetches server state
    // before the move is processed, overwriting the optimistic update with stale data.
    const tid = toast.loading(`Moving to Table ${toTable.number}…`);
    try {
      await api.post(`/operations/orders/${fromId}/move-table`, {
        targetTableId: toId,
        actorName:     loggedInStaff?.name,
        actorRole:     loggedInStaff?.role,
      });
    } catch (err) {
      const msg = err.message || "Move failed";
      toast.error(`Could not move: ${msg}`, { id: tid });
      console.warn("move-table API failed:", err.message);
      return; // don't touch local state if backend rejected
    }

    // Backend confirmed — update local state and navigate
    const now            = Date.now();
    const movedOrder     = { ...fromOrder, tableId: toId, tableNumber: toTable.number, areaName: toArea.name, updatedAt: now };
    const blankFromOrder = fromTable && fromArea ? { ...buildBlankOrder(fromTable, fromArea), updatedAt: now + 1 } : null;
    handleUpdateOrder(movedOrder);
    if (blankFromOrder) handleUpdateOrder(blankFromOrder);

    setSelectedTableId(toId);
    setSelectedArea(toArea);
    toast.dismiss(tid);

    const activeItems = (fromOrder.items || []).filter(i => !i.isVoided && !i.isComp);
    const sub   = activeItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
    const tax   = activeItems.reduce((s, i) => {
      const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
      return s + Math.round((i.price || 0) * (i.quantity || 0) * rate / 100);
    }, 0);
    const tsmLabel = (num) => { const m = String(num || "").trim().match(/(\d+)\s*$/); return m ? `Table ${m[1]}` : String(num || ""); };
    setTransferSuccess({
      fromLabel: tsmLabel(fromTable?.number),
      toLabel:   tsmLabel(toTable.number),
      itemCount: activeItems.length,
      total:     sub + tax,
      areaName:  toArea.name,
    });
  }

  // ── Table merge ───────────────────────────────────────────────────────────
  async function handleTableMerge(currentId, mergeFromId) {
    const current   = orders[currentId];
    const mergeFrom = orders[mergeFromId];
    if (!current || !mergeFrom) return;

    let mfTable = null, mfArea = null;
    for (const area of areas) {
      const t = area.tables.find((x) => x.id === mergeFromId);
      if (t) { mfTable = t; mfArea = area; break; }
    }

    const fromNum = mergeFrom.tableNumber || mergeFromId;

    // ── Call backend FIRST so we know it succeeded before touching local state ──
    const tid = toast.loading(`Merging Table ${fromNum}…`);
    try {
      await api.post(`/operations/orders/${currentId}/merge-from`, {
        sourceTableId: mergeFromId,
        actorName:     loggedInStaff?.name,
        actorRole:     loggedInStaff?.role,
      });
    } catch (err) {
      const msg = err.message || "Merge failed";
      toast.error(`Could not merge: ${msg}`, { id: tid });
      console.warn("merge-from API failed:", err.message);
      return; // don't touch local state if backend rejected
    }

    // Backend confirmed — update local state
    const mergedOrder = {
      ...current,
      items:  [...(current.items || []), ...(mergeFrom.items || [])],
      guests: (current.guests || 0) + (mergeFrom.guests || 0),
    };
    const now            = Date.now();
    const blankMergeFrom = mfTable && mfArea ? { ...buildBlankOrder(mfTable, mfArea), updatedAt: now + 1 } : null;

    handleUpdateOrder({ ...mergedOrder, updatedAt: now });
    if (blankMergeFrom) handleUpdateOrder(blankMergeFrom);

    toast.success(`Table ${fromNum} merged into this order`, { id: tid });
  }

  // ── Handle customer order accepted/rejected ───────────────────────────────
  function handleCustomerOrderHandled(orderId) {
    setCustomerOrders((prev) => prev.filter((o) => o.id !== orderId));
    if (customerOrders.length <= 1) setShowIncoming(false);
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
          outletCode={outlet?.code || ""}
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
      {/* App header — visible on floor + order screen */}
      {activeTab === "floor" && (
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
              {customerOrders.length > 0 && (
                <button
                  className="captain-incoming-btn"
                  onClick={() => setShowIncoming(true)}
                  aria-label="Incoming orders"
                >
                  📲
                  <span className="captain-incoming-count">{customerOrders.length}</span>
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Main content */}
      <main className="app-main">
        {selectedTableId ? (
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
            staff={branchStaff}
            autoOpen={autoOpenAction}
            onBack={() => { setSelectedTableId(null); setAutoOpenAction(null); }}
            onSendKOT={handleSendKOT}
            onRequestBill={handleRequestBill}
            onPrintBill={handlePrintBill}
            onPrintSplitBill={handlePrintSplitBill}
            onToggleHold={handleToggleHold}
            onUpdateOrder={handleUpdateOrder}
            onUpdateGuests={handleUpdateGuests}
            onRemoveItem={handleRemoveItem}
            onRequestRemoveItem={(item) => setConfirmRemoveItem(item)}
            onAddItem={handleAddItem}
            onTransfer={handleTableTransfer}
            onMerge={handleTableMerge}
            onForceClear={() => handleForceClearTable(selectedTableId)}
            onCustomerInfo={() => setShowCustomerInfo(true)}
          />
        ) : activeTab === "floor" ? (
          <TableFloor
            areas={areas}
            orders={orders}
            onSelectTable={handleSelectTable}
            onLongPressTable={handleLongPressTable}
            loggedInStaff={loggedInStaff}
            isOffline={!socketConnected}
          />
        ) : activeTab === "kots" ? (
          <FailedKotsScreen
            pendingKots={pendingKots}
            outletName={outlet?.name || branchConfig?.outletName}
            onRetry={handleRetryKot}
            onRetryAll={handleRetryAllKots}
            onClear={handleClearKot}
            onClose={() => setActiveTab("floor")}
          />
        ) : (
          <MoreScreen
            loggedInStaff={loggedInStaff}
            outletName={outlet?.name || branchConfig?.outletName}
            serverId={branchConfig?.outletCode || null}
            localPosIp={localStorage.getItem("captain_local_server_ip") || null}
            deviceIp={deviceIp}
            serverUrl={(import.meta.env.VITE_API_BASE_URL || "").replace("/api/v1", "")}
            updateInfo={updateInfo}
            onSync={handleSync}
            onSignOut={() => setShowLogout(true)}
          />
        )}
      </main>

      {/* Bottom tab bar — hidden when order screen is open or overlay active */}
      {!selectedTableId && !kotState && (
        <nav className="btab-bar">
          <button
            className={`btab-item${activeTab === "floor" ? " btab-active" : ""}`}
            onClick={() => setActiveTab("floor")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span className="btab-label">Floor</span>
          </button>
          <button
            className={`btab-item btab-kots-item${activeTab === "kots" ? " btab-active" : ""}`}
            onClick={() => setActiveTab("kots")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
            {pendingKots.length > 0 && (
              <span className="btab-badge">{pendingKots.length}</span>
            )}
            <span className="btab-label">KOTs</span>
          </button>
          <button
            className={`btab-item${activeTab === "more" ? " btab-active" : ""}`}
            onClick={() => setActiveTab("more")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5"  r="1" fill="currentColor"/>
              <circle cx="12" cy="12" r="1" fill="currentColor"/>
              <circle cx="12" cy="19" r="1" fill="currentColor"/>
            </svg>
            {updateInfo && <span className="btab-update-dot" />}
            <span className="btab-label">More</span>
          </button>
        </nav>
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
            onMoveTable={() => openOrderScreen(actionTableId, actionArea, "transfer")}
            onMerge={() => openOrderScreen(actionTableId, actionArea, "merge")}
            onSplitBill={() => openOrderScreen(actionTableId, actionArea, "split")}
            onPrintBill={() => handlePrintBill(actionTableId)}
            onCustomerInfo={() => { setShowCustomerInfo(true); }}
            onMarkFree={() => {
              const tbl = actionArea?.tables?.find(t => t.id === actionTableId);
              const ord = orders[actionTableId];
              const items = (ord?.items || []).filter(i => !i.isVoided && !i.isComp);
              const sub = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
              const tax = items.reduce((s, i) => {
                const r = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
                return s + Math.round((i.price || 0) * (i.quantity || 0) * r / 100);
              }, 0);
              setConfirmFreeTable({ tableId: actionTableId, tableNumber: tbl?.number || actionTableId, amount: sub + tax });
              setActionTableId(null);
            }}
          />
        );
      })()}

      {/* Customer Info Sheet — optional; reachable from the action sheet (occupied
          tables, long-press) or directly from the order screen (before KOT too) */}
      {showCustomerInfo && (actionTableId || selectedTableId) && (() => {
        const infoTableId = actionTableId || selectedTableId;
        const infoOrder   = orders[infoTableId];
        return (
          <CustomerInfoSheet
            tableNumber={infoOrder?.tableNumber || infoTableId}
            guestInfo={infoOrder?.guestInfo || {}}
            onSave={(info) => handleCustomerInfoSave(infoTableId, info)}
            onClose={() => setShowCustomerInfo(false)}
          />
        );
      })()}

      {/* ── Waiter assignment picker — shown before every KOT send ────────────── */}
      {showWaiterPick && (
        <div className="wp2-backdrop" onClick={() => setShowWaiterPick(false)}>
          <div className="wp2-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wp2-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>Assign Waiter</span>
            </div>
            <div className="wp2-list">
              <label className="wp2-row" onClick={() => setPickedWaiter(null)}>
                <div className="wp2-row-left">
                  <span className="wp2-avatar wp2-avatar-none">—</span>
                  <span className="wp2-sname wp2-none-label">None</span>
                </div>
                <input
                  type="radio"
                  name="waiter-pick"
                  readOnly
                  checked={pickedWaiter === null}
                  onChange={() => setPickedWaiter(null)}
                />
              </label>
              {waiterStaff.map((s) => (
                <label key={s.id} className="wp2-row" onClick={() => setPickedWaiter(s.name)}>
                  <div className="wp2-row-left">
                    <span className="wp2-avatar" style={{ background: avatarBg(s.name) }}>
                      {s.name?.[0]?.toUpperCase() || "?"}
                    </span>
                    <div>
                      <span className="wp2-sname">{s.name}</span>
                      <span className="wp2-role">{s.role}</span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="waiter-pick"
                    readOnly
                    checked={pickedWaiter === s.name}
                    onChange={() => setPickedWaiter(s.name)}
                  />
                </label>
              ))}
            </div>
            <div className="wp2-actions">
              <button
                className="wp2-cancel"
                onClick={() => { setShowWaiterPick(false); setKotPendingTableId(null); }}
              >
                Cancel
              </button>
              <button
                className="wp2-done"
                onClick={() => {
                  setShowWaiterPick(false);
                  doSendKOT(kotPendingTableId, pickedWaiter);
                }}
              >
                Send to Kitchen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout confirmation modal */}
      {showLogout && (
        <LogoutModal
          onConfirm={() => { setShowLogout(false); handleSignOut(); }}
          onCancel={() => setShowLogout(false)}
        />
      )}

      {/* KOT progress overlay — sending spinner + success screen */}
      {kotState && (
        <KotProgressOverlay
          kotState={kotState}
          onClose={() => { setKotState(null); setSelectedTableId(null); }}
          onAddMore={() => setKotState(null)}
        />
      )}

      {/* Transfer success modal */}
      {transferSuccess && (
        <div className="tsm-overlay">
          <div className="tsm-card">
            <div className="tsm-icon-wrap">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
                stroke="#0C831F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 4l4 4-4 4"/>
                <path d="M3 12V8a4 4 0 0 1 4-4h14"/>
                <path d="M7 20l-4-4 4-4"/>
                <path d="M21 12v4a4 4 0 0 1-4 4H3"/>
              </svg>
            </div>
            <h2 className="tsm-title">Table moved</h2>
            <p className="tsm-subtitle">
              {transferSuccess.fromLabel}'s running order has been moved to {transferSuccess.toLabel}.
            </p>
            <div className="tsm-info-box">
              <div className="tsm-transfer-row">
                <span>{transferSuccess.fromLabel}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#6B6B6B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
                <span>{transferSuccess.toLabel}</span>
              </div>
              <div className="tsm-transfer-meta">
                {[
                  transferSuccess.itemCount > 0 ? `${transferSuccess.itemCount} item${transferSuccess.itemCount !== 1 ? "s" : ""}` : null,
                  transferSuccess.total > 0 ? `₹${transferSuccess.total.toLocaleString("en-IN")}` : null,
                  transferSuccess.areaName,
                ].filter(Boolean).join(" · ")}
              </div>
            </div>
            <button className="tsm-done-btn" onClick={() => setTransferSuccess(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Bill requested success modal */}
      {billRequestedLabel && (
        <div className="brm-overlay">
          <div className="brm-card">
            <div className="brm-icon-wrap">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                stroke="#0C831F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 className="brm-title">Bill requested</h2>
            <p className="brm-body">
              The cashier has been notified to prepare the bill for {billRequestedLabel}.
            </p>
            <button className="brm-done-btn" onClick={() => setBillRequestedLabel(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Confirm: Remove Item */}
      {confirmRemoveItem && (
        <ConfirmDialog
          variant="light"
          icon="trash"
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          title="Remove item?"
          body={`${confirmRemoveItem.itemName} will be removed from this order. ${confirmRemoveItem.isSent ? "It has already been sent to the kitchen." : "It hasn't been sent to the kitchen yet."}`}
          confirmLabel="Remove"
          confirmDanger
          onCancel={() => setConfirmRemoveItem(null)}
          onConfirm={() => { handleRemoveItem(confirmRemoveItem.itemId); setConfirmRemoveItem(null); }}
        />
      )}

      {/* Confirm: Free Table */}
      {confirmFreeTable && (
        <ConfirmDialog
          variant="dark"
          icon="calendar-x"
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          title={`Free up Table T${confirmFreeTable.tableNumber}?`}
          body={`This clears the running order of ₹${confirmFreeTable.amount.toLocaleString("en-IN")}. Only do this if the guests have left or the table was opened by mistake.`}
          confirmLabel="Mark as free"
          confirmDanger
          onCancel={() => setConfirmFreeTable(null)}
          onConfirm={() => handleMarkFree(confirmFreeTable.tableId)}
        />
      )}

      {/* Incoming Customer Orders Sheet */}
      {showIncoming && (
        <IncomingOrdersSheet
          orders={customerOrders}
          outletId={outlet?.id || branchConfig?.outletId}
          onClose={() => setShowIncoming(false)}
          onOrderHandled={handleCustomerOrderHandled}
        />
      )}

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
