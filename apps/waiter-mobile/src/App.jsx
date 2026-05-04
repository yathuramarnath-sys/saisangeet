import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import toast, { Toaster } from "react-hot-toast";

import { api }        from "./lib/api";
import { printBill }  from "./lib/printBill";
import {
  mobileAreas      as seedAreas,
  mobileCategories as seedCategories,
  mobileMenuItems  as seedMenuItems,
} from "./data/mobile.seed";

import { SetupScreen }  from "./components/SetupScreen";
import { LoginScreen, avatarBg }  from "./components/LoginScreen";
import { TableFloor }   from "./components/TableFloor";
import { OrderScreen }  from "./components/OrderScreen";

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
  const [orders,          setOrders]          = useState({});
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedArea,    setSelectedArea]    = useState(null);
  const [outlet,          setOutlet]          = useState(null);
  const socketRef = useRef(null);

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

        const [cats, items] = await Promise.all([
          api.get(`/menu/categories?outletId=${target.id}`).catch(() => []),
          api.get(`/menu/items?outletId=${target.id}`).catch(() => []),
        ]);
        if (cats.length)  setCategories(cats);
        if (items.length) setMenuItems(items.map((i) => ({ ...i, price: parsePriceNumber(i.basePrice || i.price) })));

        const liveOrders = await api.get(`/operations/orders?outletId=${target.id}`).catch(() => []);
        if (liveOrders.length) {
          setOrders(Object.fromEntries(liveOrders.map((o) => [o.tableId, o])));
        }

        // Open socket
        const socketUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1")
          .replace("/api/v1", "");
        const socket = io(socketUrl, { query: { outletId: target.id } });
        socketRef.current = socket;

        socket.on("order:updated", (o) => setOrders((p) => {
          if (!o.items?.length || o.isClosed) {
            const { [o.tableId]: _removed, ...rest } = p;
            return rest;
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
      } catch (err) {
        console.error("Captain App bootstrap failed:", err.message);
      }
    }

    bootstrap();
    return () => socketRef.current?.disconnect();
  }, [branchConfig]);

  // ── Select table ──────────────────────────────────────────────────────────
  async function handleSelectTable(tableId, area) {
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

  // ── Update order (local + socket) ─────────────────────────────────────────
  function handleUpdateOrder(nextOrder) {
    setOrders((p) => ({ ...p, [nextOrder.tableId]: nextOrder }));
    socketRef.current?.emit("order:update", { outletId: outlet?.id, order: nextOrder });
  }

  // ── Add item (POST to backend, reconcile) ─────────────────────────────────
  async function handleAddItem(item) {
    const tableId = selectedTableId;
    if (!tableId) return;
    try {
      const serverOrder = await api.post("/operations/order/item", {
        tableId,
        outletId: outlet?.id,
        item: {
          id:          item.id,
          menuItemId:  item.menuItemId,
          name:        item.name,
          price:       item.price,
          quantity:    1,
          note:        item.note || "",
          stationName: item.station || "",
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
  async function handleSendKOT() {
    const order  = orders[selectedTableId];
    if (!order) return;
    const unsent = (order.items || []).filter((i) => !i.sentToKot);
    if (!unsent.length) return;

    // Optimistic UI — mark items sent immediately so screen feels instant
    handleUpdateOrder({ ...order, items: order.items.map((i) => ({ ...i, sentToKot: true })) });

    // Group by kitchen station
    const stationGroups = {};
    for (const item of unsent) {
      const key = item.station || "__default__";
      if (!stationGroups[key]) stationGroups[key] = [];
      stationGroups[key].push(item);
    }

    // Server assigns the authoritative sequential KOT number
    let serverKotNumber = null;
    let lastServerOrder;
    for (const [stationKey, stItems] of Object.entries(stationGroups)) {
      try {
        const result = await api.post("/operations/kot", {
          outletId:    outlet?.id,
          tableId:     order.tableId,
          tableNumber: order.tableNumber,
          areaName:    order.areaName,
          stationName: stationKey === "__default__" ? undefined : stationKey,
          items:       stItems,
          orderId:     order.id,
          actorName:   loggedInStaff?.name || "Captain",
        });
        if (result?.kot?.kotNumber) serverKotNumber = result.kot.kotNumber;
        if (result?.order) lastServerOrder = result.order;
      } catch (e) {
        console.error(`[captain] KOT send (${stationKey}):`, e.message);
      }
    }

    // Show the server-assigned KOT number in the confirmation toast
    toast.success(serverKotNumber != null ? `KOT #${serverKotNumber} sent to kitchen` : "KOT sent to kitchen");

    if (lastServerOrder) {
      setOrders((prev) => {
        const local = prev[selectedTableId];
        if (!local) return prev;
        const serverItemIds = new Set((lastServerOrder.items || []).map((i) => i.id));
        const localOnlyUnsent = (local.items || []).filter(
          (li) => !li.sentToKot && !serverItemIds.has(li.id)
        );
        return {
          ...prev,
          [selectedTableId]: {
            ...lastServerOrder,
            items: [...(lastServerOrder.items || []), ...localOnlyUnsent],
          },
        };
      });
    }

    setSelectedTableId(null);
  }

  // ── Request bill ──────────────────────────────────────────────────────────
  async function handleRequestBill() {
    const order = orders[selectedTableId];
    if (!order) return;
    handleUpdateOrder({ ...order, billRequested: true });
    toast.success("Bill requested — cashier notified");
    try {
      await api.post("/operations/bill-request", { outletId: outlet?.id, tableId: selectedTableId });
    } catch (_) {}
  }

  // ── Print bill ────────────────────────────────────────────────────────────
  function handlePrintBill() {
    const order = orders[selectedTableId];
    if (!order?.items?.length) { toast.error("No items to print"); return; }
    printBill(order, order.items, outlet?.name);
    toast("Printing bill…", { icon: "🖨️" });
    setSelectedTableId(null);
  }

  // ── Toggle hold ───────────────────────────────────────────────────────────
  function handleToggleHold() {
    const order = orders[selectedTableId];
    if (!order) return;
    const next = { ...order, isOnHold: !order.isOnHold };
    handleUpdateOrder(next);
    toast(next.isOnHold ? "Order placed on hold" : "Order resumed", {
      icon: next.isOnHold ? "⏸" : "▶",
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
          <button
            className="signout-btn"
            onClick={() => { setLoggedInStaff(null); setSelectedTableId(null); }}
          >
            Sign out
          </button>
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
            onBack={() => setSelectedTableId(null)}
            onSendKOT={handleSendKOT}
            onRequestBill={handleRequestBill}
            onPrintBill={handlePrintBill}
            onToggleHold={handleToggleHold}
            onUpdateOrder={handleUpdateOrder}
            onAddItem={handleAddItem}
            onTransfer={handleTableTransfer}
            onMerge={handleTableMerge}
            onForceClear={() => handleForceClearTable(selectedTableId)}
          />
        )}
      </main>

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
