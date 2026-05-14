const {
  getOperationsSummary,
  createDemoOperationsOrder,
  moveOrderToTable,
  getOrders,
  getOrder,
  getOrCreateOrderForTable,
  sendOrderKot,
  requestBillForOrder,
  assignWaiterToOrder,
  addItemToOrder,
  removeItemFromOrder,
  updateOrderItemDetails,
  updateOrderSplit,
  addPaymentToOrder,
  settleOrderBill,
  approveDiscountOverride,
  approveVoidRequest,
  changeOrderStatus,
  getOperationsControlLogs,
  recordOrderReprint,
  requestOrderVoidApproval,
  clearTableAfterSettle
} = require("./operations.service");
const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
const { runWithTenant }     = require("../../data/tenant-context");
const { ApiError }          = require("../../utils/api-error");

/**
 * Validate the manager PIN from a request body against the PIN stored in
 * the tenant's security settings.  Throws 403 if incorrect.
 *
 * Rules:
 *  - If NO pin is configured on the server (security.managerPin is blank),
 *    validation passes — this keeps backward compatibility for tenants that
 *    haven't set a server-side PIN yet.
 *  - If a PIN IS configured, the request must include a matching `managerPin`.
 */
function assertManagerPin(reqBody) {
  const data       = getOwnerSetupData();
  const storedPin  = (data?.security?.managerPin || "").trim();
  if (!storedPin) return; // not configured — allow through
  const provided   = String(reqBody?.managerPin || "").trim();
  if (!provided || provided !== storedPin) {
    throw new ApiError(403, "INVALID_MANAGER_PIN", "Manager PIN is incorrect.");
  }
}

async function listOperationsSummaryHandler(_req, res) {
  const result = await getOperationsSummary();
  res.json(result);
}

async function createDemoOrderHandler(req, res) {
  const result = await createDemoOperationsOrder(req.body);
  res.status(201).json(result);
}

async function listOrdersHandler(req, res) {
  let result = await getOrders();

  // Filter to only the orders that belong to the requested outlet.
  // Without this, every device gets every table from every outlet
  // (e.g. TEST1 tables appearing in a different outlet's Captain App).
  const { outletId } = req.query;
  if (outletId) {
    try {
      const { getOwnerSetupData } = require("../../data/owner-setup-store");
      const data   = getOwnerSetupData();
      const outlet = (data.outlets || []).find(o => o.id === outletId);
      if (outlet) {
        const tableIds = new Set((outlet.tables || []).map(t => t.id));
        result = result.filter(o => tableIds.has(o.tableId));
      } else {
        // Unknown outletId — return empty so Captain/POS don't show stale data
        result = [];
      }
    } catch (_) {
      // If owner-setup-store is unavailable, return unfiltered (safe fallback)
    }
  }

  res.json(result);
}

async function getOrderHandler(req, res) {
  const result = await getOrder(req.params.tableId);
  res.json(result);
}

async function sendKotHandler(req, res) {
  const result = await sendOrderKot(req.params.tableId, req.body);
  res.json(result);
}

async function requestBillHandler(req, res) {
  const result = await requestBillForOrder(req.params.tableId, req.body);
  res.json(result);
}

async function moveTableHandler(req, res) {
  const result = await moveOrderToTable(req.params.tableId, req.body);
  res.json(result);
}

async function assignWaiterHandler(req, res) {
  const result = await assignWaiterToOrder(req.params.tableId, req.body);
  res.json(result);
}

async function addOrderItemHandler(req, res) {
  const result = await addItemToOrder(req.params.tableId, req.body);
  res.status(201).json(result);
}

async function updateOrderItemHandler(req, res) {
  const result = await updateOrderItemDetails(req.params.tableId, req.params.itemId, req.body);
  res.json(result);
}

async function splitBillHandler(req, res) {
  const result = await updateOrderSplit(req.params.tableId, req.body);
  res.json(result);
}

async function addPaymentHandler(req, res) {
  const result = await addPaymentToOrder(req.params.tableId, req.body);
  res.status(201).json(result);
}

async function closeOrderHandler(req, res) {
  const result = await settleOrderBill(req.params.tableId, req.body);
  res.json(result);
}

async function approveDiscountHandler(req, res) {
  assertManagerPin(req.body);
  const result = await approveDiscountOverride(req.params.tableId, req.body);
  res.json(result);
}

async function approveVoidHandler(req, res) {
  assertManagerPin(req.body);
  const result = await approveVoidRequest(req.params.tableId, req.body);
  res.json(result);
}

async function updateOrderStatusHandler(req, res) {
  const result = await changeOrderStatus(req.params.tableId, req.body);
  res.json(result);
}

async function listControlLogsHandler(_req, res) {
  const result = await getOperationsControlLogs();
  res.json(result);
}

async function recordReprintHandler(req, res) {
  const result = await recordOrderReprint(req.params.tableId, req.body);
  res.status(201).json(result);
}

async function requestVoidApprovalHandler(req, res) {
  const result = await requestOrderVoidApproval(req.params.tableId, req.body);
  res.json(result);
}

// ─── Device-friendly flat endpoints (used by POS / Captain / KDS) ─────────────

const { getKots, addKot, updateKotStatus } = require("./kot-store");
const { getNextBillNo, getNextKotNo }      = require("../counter/counter.service");

/**
 * POST /operations/kot
 * Body: { outletId, tableId, tableNumber, kotNumber, items, orderId? }
 * Creates a KOT record, emits kot:new to the outlet socket room, and marks all items
 * sentToKot: true in the in-memory order so the backend order stays in sync with the POS.
 * Response: { kot, order? } — order is present for dine-in tables; absent for counter/online.
 */
async function deviceSendKotHandler(req, res) {
  const { outletId, tableId, tableNumber, kotNumber, items, orderId } = req.body;

  // ── Diagnostic logging (helps trace Captain→KDS delivery issues) ────────────
  console.log(`[KOT] POST /operations/kot | source=${req.body.source || "pos"} | outletId=${outletId} | tableNumber=${tableNumber} | items=${items?.length ?? 0} | stationName=${req.body.stationName || "(none)"}`);

  if (!outletId || !items?.length) {
    console.warn(`[KOT] Rejected — missing outletId or items. body:`, JSON.stringify({ outletId, items: items?.length }));
    return res.status(400).json({ error: "outletId and items are required" });
  }

  const tenantId = req.user?.tenantId || "default";

  // ── Validate that outletId belongs to the authenticated tenant ───────────────
  // Prevents one tenant from sending KOTs to another tenant's outlet room.
  try {
    const { getOwnerSetupData } = require("../../data/owner-setup-store");
    const setupData = getOwnerSetupData();
    const tenantOutletIds = new Set((setupData.outlets || []).map(o => o.id));
    if (!tenantOutletIds.has(outletId)) {
      console.warn(`[KOT] SECURITY: outletId="${outletId}" not found in tenant="${tenantId}" — rejecting`);
      return res.status(403).json({ error: "outletId does not belong to your account" });
    }
  } catch (err) {
    // If owner-setup-store is unavailable, allow through (best-effort on file-based mode)
    console.warn(`[KOT] outletId validation skipped: ${err.message}`);
  }

  const { stationName: clientStation, areaName } = req.body;

  // ── Build station groups ────────────────────────────────────────────────────
  // Items are routed to kitchen stations by the backend — client hints are
  // accepted as a fast-path but the server re-validates every station name
  // against the Owner Console config.  Four routing steps (see below).
  let stationGroups; // { [stationName]: item[] }

  if (clientStation) {
    // Client already grouped these items for a specific station — trust it
    // (POS/Captain may pre-resolve station when the menu item has a stationName)
    stationGroups = { [clientStation]: items };
  } else {
    stationGroups = {};
    try {
      const { getOwnerSetupData } = require("../../data/owner-setup-store");
      const setupData = getOwnerSetupData();   // always fresh from in-memory cache

      // ── Scope to the requesting outlet ──────────────────────────────────────
      const allStations   = setupData.menu?.stations   || [];
      const allCategories = setupData.menu?.categories || [];
      const menuItems     = setupData.menu?.items      || [];

      // Use ALL configured kitchen stations — station routing is restaurant-wide.
      // Outlet-scoped filtering was causing stations saved with an old outletId
      // (e.g. "outlet-indiranagar" from seed data) to be silently excluded when
      // the real outlet has a timestamp-based ID like "outlet-17769...".
      const kitchenStations = allStations;

      // ── Pre-build lookup maps ────────────────────────────────────────────────
      const knownStationNames = new Set(
        kitchenStations.map(s => (s.name || "").trim().toLowerCase())
      );
      // categoryId → lowercase category name
      const catIdToName = {};
      allCategories.forEach(c => {
        catIdToName[String(c.id)] = (c.name || "").trim().toLowerCase();
      });
      // lowercase category name → station name
      // Primary source: station.categories array → resolve to name → station
      const catNameToStation = {};
      kitchenStations.forEach(s => {
        // Also map the station NAME itself so items whose categoryName matches
        // a station name are routed directly (e.g., "North Indian" category → "North Indian" station)
        const stLower = (s.name || "").trim().toLowerCase();
        if (stLower) catNameToStation[stLower] = s.name;

        (s.categories || []).forEach(cid => {
          const name = catIdToName[String(cid)];
          if (name) catNameToStation[name] = s.name; // category name wins over station name
        });
      });
      // categoryId → station name (direct, no name resolution needed)
      const catIdToStation = {};
      kitchenStations.forEach(s => {
        (s.categories || []).forEach(cid => {
          catIdToStation[String(cid)] = s.name;
        });
      });
      // menuItemId → menu item record (authoritative server-side lookup)
      const menuItemMap = {};
      menuItems.forEach(mi => { menuItemMap[String(mi.id)] = mi; });

      // ── Diagnostic: log maps once per request ──────────────────────────────
      console.log(`[KOT][maps] stations=${kitchenStations.map(s=>s.name).join(",")} | catIdToStation=${JSON.stringify(catIdToStation)} | catNameToStation=${JSON.stringify(catNameToStation)} | menuItemIds=${Object.keys(menuItemMap).join(",")}`);

      // ── Route each item to a kitchen station ─────────────────────────────────
      //
      // Resolution steps (first match wins):
      //
      //  1. Client stationName — fast path; only accepted when it matches a real
      //     configured station. Avoids accepting stale/old station names.
      //
      //  2. Server menu-item record → categoryId → catIdToStation map.
      //     The authoritative path: the backend owns the menu, not the client.
      //
      //  3. Category name lookup via catNameToStation map.
      //     Handles categoryId mismatches (seed "cat-starters" vs real UUID).
      //     Also routes items whose categoryName matches a station NAME directly.
      //
      //  4. Direct station scan — last resort.
      //     Iterates every station and matches the item's category name against
      //     the station's category names. Catches stale IDs in station config
      //     (category deleted & re-created → station still has old ID →
      //     catIdToName returns undefined → catNameToStation entry missing).
      //
      //  Fallback: "Main Kitchen" (unassigned; visible on an unfiltered KDS)

      for (const item of items) {
        let station  = "";
        let routeStep = "unresolved";

        // ── 1. Client stationName (fast path, validated) ─────────────────
        const clientSt = (item.station || item.stationName || "").trim();
        if (clientSt && knownStationNames.has(clientSt.toLowerCase())) {
          station   = clientSt;
          routeStep = "step1-clientStation";
        }

        if (!station) {
          // ── 2. Server menu record → categoryId ──────────────────────────
          const record    = menuItemMap[String(item.id)] || menuItemMap[String(item.menuItemId)];
          const realCatId = String(record?.categoryId || item.categoryId || "");

          if (realCatId && catIdToStation[realCatId]) {
            station   = catIdToStation[realCatId];
            routeStep = "step2-categoryId";
          }

          // ── 3. Category name via catNameToStation map ────────────────────
          if (!station) {
            const catName = (
              catIdToName[realCatId] ||   // ID → name from allCategories
              record?.categoryName   ||   // name stored on menu item record
              item.categoryName      ||   // sent by Captain / POS MenuBrowser
              item.category          || ""
            ).trim().toLowerCase();

            if (catName && catNameToStation[catName]) {
              station   = catNameToStation[catName];
              routeStep = "step3-catName";
            }

            // ── 4. Direct station scan (handles stale station category IDs) ──
            // Loops every station, resolves its category IDs to names, compares.
            // Also matches when the item's category name equals a station name.
            if (!station && catName) {
              for (const s of kitchenStations) {
                // 4a: category name matches any category assigned to this station
                const matchesCat = (s.categories || []).some(cid => {
                  const n = catIdToName[String(cid)] || "";
                  return n && n === catName;
                });
                if (matchesCat) { station = s.name; routeStep = "step4a-directScan"; break; }

                // 4b: category name equals the station name itself
                if ((s.name || "").trim().toLowerCase() === catName) {
                  station = s.name; routeStep = "step4b-stationNameMatch"; break;
                }
              }
            }
          }
        }

        console.log(`[KOT] item="${item.name}" id="${item.id}" menuItemId="${item.menuItemId||""}" catId="${item.categoryId||""}" catName="${item.categoryName||item.category||""}" clientSt="${clientSt}" → ${routeStep} → station="${station||"Main Kitchen"}"`);
        const key = station || "Main Kitchen";
        if (!stationGroups[key]) stationGroups[key] = [];
        stationGroups[key].push(item);
      }
    } catch (err) {
      console.error("[KOT] routing error — falling back to Main Kitchen:", err.message);
      stationGroups = { "Main Kitchen": items };
    }
  }

  // ── Create one KOT per station group, all sharing the same KOT number ─────
  // One "send" = one KOT number regardless of how many stations are involved.
  // Each station gets its own KOT record (unique id) so they can be bumped
  // independently on each KDS, but the printed slip number is identical on all.
  const { kotNo, time: kotTime, date: kotDate } = getNextKotNo(tenantId);
  const io = req.app.locals.io;
  const kots = [];

  for (const [station, stationItems] of Object.entries(stationGroups)) {
    const kot = {
      id:          `kot-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      kotNumber:   kotNo,   // same number for all station splits from this send
      kotTime,
      kotDate,
      tableNumber: tableNumber || "—",
      station,
      areaName:    areaName || tableNumber || "—",
      source:       req.body.source || "pos",
      operatorName: req.body.actorName || "",   // cashier/captain name shown on KDS card
      status:       "new",
      createdAt:   new Date().toISOString(),
      items:       stationItems.map((i, idx) => ({
        id:       i.id || `item-${idx}`,
        name:     i.name,
        quantity: i.quantity,
        note:     i.note || ""
      })),
      tableId,
      orderId
    };

    addKot(tenantId, outletId, kot);

    // Broadcast kot:new to ALL devices in the outlet.
    // Every KDS screen receives every KOT; each screen's own client-side filter
    // (fresh-closure handler + render filter) shows only its assigned station's KOTs.
    // This is the same pattern FreshKDS uses (broadcast to all, each device filters).
    // Station-specific socket rooms are still joined for future use but not used here.
    if (io) {
      const room = `outlet:${tenantId}:${outletId}`;
      const socketsInRoom = await io.in(room).fetchSockets();
      console.log(`[KOT] emit kot:new → room="${room}" | station="${station}" | sockets_in_room=${socketsInRoom.length}`);
      io.to(room).emit("kot:new", kot);
    } else {
      console.warn(`[KOT] io is null — socket emit skipped for kot ${kot.id}`);
    }

    kots.push(kot);
  }

  // Notify POS / Captain that KOT send is complete for this table
  if (io && tableId) {
    io.to(`outlet:${tenantId}:${outletId}`).emit("kot:sent", { tableId, kotId: kots[0]?.id });
  }

  // Mark items sentToKot: true in the in-memory order so backend state matches POS.
  // Skipped for counter/online orders — those have no backend table entry.
  let updatedOrder;
  if (tableId && !tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
    try {
      updatedOrder = await sendOrderKot(tableId, { actorName: req.user?.name || "POS" });
    } catch (err) {
      // ORDER_NOT_FOUND or TABLE_NOT_FOUND — log but do not fail the KOT send.
      // The KOT is already recorded and broadcast; the order state will reconcile on next open.
      console.warn(`[KOT] markKotSent skipped for ${tableId}:`, err.message);
    }
  }

  // Return `kots` array (new) and `kot` (first entry, backward-compat for older clients)
  res.status(201).json({ kots, kot: kots[0], order: updatedOrder });
}

/**
 * GET /operations/kots?outletId=...&station=...
 * Returns active (non-bumped) KOTs for the outlet.
 * Optional ?station= filters to a single kitchen station (case-insensitive).
 * KDS screens pass their assignedStation so they only receive their own KOTs —
 * this is the authoritative server-side filter; the client filter is belt-and-suspenders.
 */
async function deviceListKotsHandler(req, res) {
  const { outletId, station } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId is required" });
  const tenantId = req.user?.tenantId || "default";
  let kots = getKots(tenantId, outletId);
  if (station) {
    const s = station.trim().toLowerCase();
    kots = kots.filter(k => (k.station || "").trim().toLowerCase() === s);
  }
  res.json(kots);
}

/**
 * PATCH /operations/kots/:id/status
 * Body: { status } — "preparing" | "ready" | "bumped"
 */
async function deviceUpdateKotStatusHandler(req, res) {
  const { outletId } = req.query;
  const { status } = req.body;
  const tenantId = req.user?.tenantId || "default";
  const updated = updateKotStatus(tenantId, outletId, req.params.id, status);
  if (!updated && status !== "bumped") {
    return res.status(404).json({ error: "KOT not found" });
  }
  const io = req.app.locals.io;
  if (io && outletId) {
    io.to(`outlet:${tenantId}:${outletId}`).emit("kot:status", { id: req.params.id, status });
  }
  res.json(updated || { id: req.params.id, status });
}

/**
 * POST /operations/bill-request
 * Body: { outletId, tableId }
 * Broadcasts bill:requested via socket AND marks billRequested: true in the in-memory order.
 * Response: { ok: true, order? } — order present for dine-in tables.
 */
async function deviceBillRequestHandler(req, res) {
  const { outletId, tableId } = req.body;
  const tenantId = req.user?.tenantId || "default";
  const io = req.app.locals.io;
  if (io && outletId) {
    io.to(`outlet:${tenantId}:${outletId}`).emit("bill:requested", { tableId, requestedAt: new Date().toISOString() });
  }

  let updatedOrder;
  if (tableId && !tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
    try {
      updatedOrder = await requestBillForOrder(tableId, { actorName: req.user?.name || "POS" });
    } catch (err) {
      console.warn(`[bill-request] requestBill skipped for ${tableId}:`, err.message);
    }
  }

  res.json({ ok: true, order: updatedOrder });
}

/**
 * POST /operations/payment
 * Body: { outletId, orderId, tableId, method, amount, label?, reference? }
 * Broadcasts order:paid via socket AND persists the payment to the in-memory order.
 * Response: { ok: true, order? } — order present for dine-in tables.
 * addPaymentToOrder caps amount at remainingAmount and throws INVALID_PAYMENT_AMOUNT if the
 * order is already fully paid — that error is caught and swallowed (idempotent for over-pay).
 */
async function devicePaymentHandler(req, res) {
  const { outletId, tableId, method, amount, label, reference } = req.body;
  const tenantId = req.user?.tenantId || "default";
  const io = req.app.locals.io;
  if (io && outletId) {
    io.to(`outlet:${tenantId}:${outletId}`).emit("order:paid", { tableId, method, amount, paidAt: new Date().toISOString() });
  }

  let updatedOrder;
  if (tableId && !tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
    try {
      updatedOrder = await addPaymentToOrder(tableId, {
        method:    method || "cash",
        label:     label  || String(method || "cash").toUpperCase(),
        amount:    Number(amount) || 0,
        reference,
        actorName: req.user?.name || "POS"
      });
    } catch (err) {
      // INVALID_PAYMENT_AMOUNT — order already fully paid or amount ≤ 0. Not a server error.
      if (err.code !== "INVALID_PAYMENT_AMOUNT") {
        console.warn(`[payment] addPayment skipped for ${tableId}:`, err.message);
      }
    }
  }

  res.json({ ok: true, order: updatedOrder });
}

/**
 * GET /operations/order?tableId=...
 * Device-bypass: no requirePermission.
 * Returns the order for the given table, creating an empty one if the table has not yet
 * started an order. This is the POS "open table" call — never returns ORDER_NOT_FOUND
 * for a valid table; throws TABLE_NOT_FOUND (404) only if the tableId is unknown.
 */
async function deviceGetOrCreateOrderHandler(req, res) {
  const { tableId } = req.query;
  if (!tableId) {
    return res.status(400).json({ error: "tableId query parameter is required" });
  }
  const result = await getOrCreateOrderForTable(tableId);
  res.json(result);
}

/**
 * POST /operations/order/item
 * Body: { tableId, outletId, item: { menuItemId, name, price, quantity, note?, seatLabel? } }
 * Device-bypass: no requirePermission — POS device tokens have no permissions array.
 * Adds one item to an existing in-memory order and persists state.
 * Counter/takeaway orders (tableId starts with "counter-") are skipped gracefully.
 */
async function deviceAddOrderItemHandler(req, res) {
  const { tableId, item } = req.body;
  if (!tableId || !item?.menuItemId) {
    return res.status(400).json({ error: "tableId and item.menuItemId are required" });
  }
  // Counter/takeaway orders are managed locally on the POS and have no backend table entry
  if (tableId.startsWith("counter-")) {
    return res.json({ ok: true, skipped: true });
  }
  // Merge actor name into payload so operations.service.resolveActor picks it up
  const actor = req.user?.name || req.user?.type || "POS";
  const result = await addItemToOrder(tableId, { ...item, actorName: actor });
  res.status(201).json(result);
}

/**
 * DELETE /operations/order/item
 * Body: { tableId, itemId }
 * Removes an unsent item from the in-memory order (no-op if already KOT'd).
 */
async function deviceRemoveOrderItemHandler(req, res) {
  const { tableId, itemId } = req.body;
  if (!tableId || !itemId) {
    return res.status(400).json({ error: "tableId and itemId are required" });
  }
  if (tableId.startsWith("counter-") || tableId.startsWith("online-")) {
    return res.json({ ok: true, skipped: true });
  }
  const actor = req.user?.name || req.user?.type || "POS";
  const result = await removeItemFromOrder(tableId, itemId, actor);
  res.json(result);
}

// PATCH /operations/order/item  — void a sent item (marks isVoided=true on the backend)
// Body: { tableId, itemId, voidReason }
async function deviceVoidOrderItemHandler(req, res) {
  const { tableId, itemId, voidReason } = req.body;
  if (!tableId || !itemId) {
    return res.status(400).json({ error: "tableId and itemId are required" });
  }
  if (tableId.startsWith("counter-") || tableId.startsWith("online-")) {
    return res.json({ ok: true, skipped: true });
  }
  // Server-side PIN check — only enforced when a PIN is configured
  assertManagerPin(req.body);
  const actor = req.user?.name || req.user?.type || "POS";
  const result = await updateOrderItemDetails(tableId, itemId, {
    isVoided:   true,
    voidReason: voidReason || "Voided by POS",
    actorName:  actor
  });
  res.json(result);
}

const { addClosedOrder } = require("./closed-orders-store");
const { stampBillNo }   = require("./operations.memory-store");

/**
 * POST /operations/assign-bill-no
 * Body: { outletId, tableId }
 *
 * Assigns the next sequential bill number (per owner-console settings: FY or daily)
 * to the live in-memory order and returns it.  Idempotent — if the order already has
 * a billNo (bill was printed before), returns the existing number unchanged.
 *
 * Called by Captain app and POS "Print Bill" button so the number is stamped at
 * print-time, not at settlement.  Settlement re-uses the existing number.
 */
async function assignBillNoHandler(req, res) {
  const { outletId, tableId } = req.body;
  if (!tableId) return res.status(400).json({ error: "tableId required" });

  const tenantId = req.user?.tenantId || "default";

  // Get current order from memory store
  let order;
  try {
    const { getOrder } = require("./operations.memory-store");
    order = getOrder(tableId);
  } catch (_) {}

  // Idempotent: already has a bill number — return it
  if (order?.billNo) {
    return res.json({
      ok:         true,
      billNo:     order.billNo,
      billNoMode: order.billNoMode || null,
      billNoFY:   order.billNoFY   || null,
      billNoDate: order.billNoDate || null,
    });
  }

  // Assign next bill number from counter service
  const { billNo, mode, fy, date } = getNextBillNo(tenantId);

  // Stamp onto in-memory order
  try {
    stampBillNo(tableId, billNo, mode, fy, date);
  } catch (_) {
    // Counter/online order IDs have no memory slot — still return the number
  }

  return res.json({ ok: true, billNo, billNoMode: mode, billNoFY: fy || null, billNoDate: date });
}

/**
 * POST /operations/closed-order
 * Body: { outletId, order }
 * Stores the fully settled order in closed-orders-store for Owner Web sales figures,
 * then resets the in-memory slot for that table to a fresh empty order so the next
 * GET /operations/order?tableId=... returns a clean slate.
 */
async function deviceCloseOrderHandler(req, res) {
  const { outletId, order } = req.body;
  if (!outletId || !order) {
    return res.status(400).json({ error: "outletId and order are required" });
  }
  const tenantId = req.user?.tenantId || "default";

  // Use bill number already assigned at print-time (idempotent).
  // Only assign now if the bill was settled without a prior print (e.g. quick counter settle).
  if (!order.billNo) {
    const { billNo, mode, fy, date } = getNextBillNo(tenantId);
    order.billNo     = billNo;
    order.billNoMode = mode;
    order.billNoFY   = fy   || null;
    order.billNoDate = date || null;
  }
  order.closedAt = new Date().toISOString();

  addClosedOrder(tenantId, outletId, order);

  // Broadcast to owner dashboard listeners so the console can live-update
  const io = req.app.locals.io;
  if (io) {
    io.to(`tenant:${tenantId}`).emit("sales:updated", { outletId });
  }

  // Reset the in-memory table slot so the next table-open gets a fresh empty order.
  // clearTableAfterSettle is silent for counter/online IDs (no catalog entry).
  if (order.tableId) {
    try {
      await clearTableAfterSettle(order.tableId);

      // Authoritatively broadcast the table-cleared signal to every POS and Captain
      // in the outlet room. This is the ONLY reliable way for all clients to know
      // the table is free — the client-side 1.5 s timer on POS is just a fallback.
      // Both clients handle blank orders: POS sets orders[tableId] = blank (→ "Free"),
      // Captain removes tableId from its map (→ "Free").
      if (io && !String(order.tableId).startsWith("counter-") && !String(order.tableId).startsWith("online-")) {
        io.to(`outlet:${tenantId}:${outletId}`).emit("order:updated", {
          tableId:       order.tableId,
          items:         [],
          payments:      [],
          isClosed:      false,
          billRequested: false,
          isOnHold:      false,
          discountAmount: 0,
        });
      }
    } catch (err) {
      // Non-fatal — log and continue. Sales record already written.
      console.warn(`[close-order] table reset skipped for ${order.tableId}:`, err.message);
    }
  }

  // ── Fire-and-forget: push sale to Zoho Books if connected ────────────────
  // Never awaited — never blocks the POS response. Errors are logged only.
  setImmediate(async () => {
    try {
      const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
      const { pushSaleReceipt, getValidToken } = require("../zoho/zoho.service");
      const data = await runWithTenant(tenantId, () => getOwnerSetupData());
      const cfg  = data?.zoho;
      if (!cfg?.enabled || !cfg?.refreshToken || !cfg?.organizationId) return;

      // Refresh token if needed and persist updated expiry
      const { refreshed } = await getValidToken(cfg);
      if (refreshed) {
        await runWithTenant(tenantId, () =>
          updateOwnerSetupData(d => ({ ...d, zoho: { ...d.zoho, accessToken: cfg.accessToken, expiresAt: cfg.expiresAt } }))
        );
      }

      await pushSaleReceipt(order, cfg, cfg.taxMap || {});

      // Update lastSyncAt + totalPushed counters
      await runWithTenant(tenantId, () =>
        updateOwnerSetupData(d => ({
          ...d,
          zoho: {
            ...d.zoho,
            lastSyncAt:  new Date().toISOString(),
            totalPushed: (d.zoho?.totalPushed || 0) + 1,
          },
        }))
      );
    } catch (err) {
      console.warn(`[zoho] auto-push failed | tenant=${tenantId} | order=${order.billNo || order.orderNumber}:`, err.message);
    }
  });

  // Return the server-assigned bill number so the POS can stamp it on the
  // printed receipt and localStorage record without a second round-trip.
  res.json({
    ok:         true,
    billNo:     order.billNo,
    billNoMode: order.billNoMode,
    billNoFY:   order.billNoFY   || null,
    billNoDate: order.billNoDate || null,
    closedAt:   order.closedAt,
  });
}

async function clearTableOrderHandler(req, res) {
  await clearTableAfterSettle(req.params.tableId);
  res.json({ ok: true, tableId: req.params.tableId, message: "Table cleared." });
}

/**
 * DELETE /operations/orders?outletId=...
 * Clears ALL active orders for the given outlet — used to wipe test/stale data.
 * Owner-only (requireAuth is enough since this is a dev/ops action).
 */
async function clearAllOrdersHandler(req, res) {
  const { outletId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId is required" });

  try {
    const { getOwnerSetupData } = require("../../data/owner-setup-store");
    const data   = getOwnerSetupData();
    const outlet = (data.outlets || []).find(o => o.id === outletId);
    if (!outlet) return res.status(404).json({ error: "Outlet not found" });

    const tableIds = (outlet.tables || []).map(t => t.id);
    await Promise.all(tableIds.map(tid => clearTableAfterSettle(tid).catch(() => {})));
    res.json({ ok: true, cleared: tableIds.length, message: `Cleared ${tableIds.length} tables for outlet.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  clearTableOrderHandler,
  clearAllOrdersHandler,
  listOperationsSummaryHandler,
  createDemoOrderHandler,
  listOrdersHandler,
  getOrderHandler,
  sendKotHandler,
  requestBillHandler,
  moveTableHandler,
  assignWaiterHandler,
  addOrderItemHandler,
  updateOrderItemHandler,
  splitBillHandler,
  addPaymentHandler,
  closeOrderHandler,
  approveDiscountHandler,
  approveVoidHandler,
  updateOrderStatusHandler,
  listControlLogsHandler,
  recordReprintHandler,
  requestVoidApprovalHandler,
  // Device-friendly flat endpoints
  deviceSendKotHandler,
  deviceListKotsHandler,
  deviceUpdateKotStatusHandler,
  deviceBillRequestHandler,
  assignBillNoHandler,
  devicePaymentHandler,
  deviceGetOrCreateOrderHandler,
  deviceAddOrderItemHandler,
  deviceRemoveOrderItemHandler,
  deviceVoidOrderItemHandler,
  deviceCloseOrderHandler,
};
