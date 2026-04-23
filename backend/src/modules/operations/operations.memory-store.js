const { ApiError } = require("../../utils/api-error");
const { getOwnerSetupData } = require("../../data/owner-setup-store");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildAuditEntry(label, actor, time) {
  return {
    id: `${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label,
    actor,
    time
  };
}

function appendAudit(order, entry) {
  order.auditTrail = [entry, ...(order.auditTrail || [])].slice(0, 10);
}

function appendDeletedBill(order, actor) {
  order.deletedBillLog = [
    {
      id: `deleted-${Date.now()}`,
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      reason: order.voidReason,
      approvedBy: actor
    },
    ...(order.deletedBillLog || [])
  ].slice(0, 5);
}

function appendReprintLog(order, actor, reason) {
  order.reprintLog = [
    {
      id: `reprint-${Date.now()}`,
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      reason,
      approvedBy: actor
    },
    ...(order.reprintLog || [])
  ].slice(0, 5);
}

const defaultTableCatalog = [
  { tableId: "t1", tableNumber: "T1", areaName: "AC Hall 1", outletName: "Indiranagar", captain: "Captain Karthik" },
  { tableId: "t2", tableNumber: "T2", areaName: "AC Hall 1", outletName: "Koramangala", captain: "Captain Karthik" },
  { tableId: "t3", tableNumber: "T3", areaName: "Non-AC Hall", outletName: "HSR Layout", captain: "Captain Karthik" },
  { tableId: "f1", tableNumber: "F1", areaName: "Family Hall", outletName: "Whitefield", captain: "Captain Karthik" },
  { tableId: "f2", tableNumber: "F2", areaName: "Family Hall", outletName: "Whitefield", captain: "Captain Karthik" },
  { tableId: "s3", tableNumber: "S3", areaName: "Self Service", outletName: "Indiranagar", captain: "Open" },
  { tableId: "s4", tableNumber: "S4", areaName: "Self Service", outletName: "Indiranagar", captain: "Captain Karthik" }
];

function buildOwnerTableCatalog() {
  const data = getOwnerSetupData();
  const outlets = data.outlets || [];
  const ownerTables = outlets.flatMap((outlet) =>
    (outlet.tables || []).map((table) => ({
      tableId: table.id,
      tableNumber: table.name,
      areaName: table.workArea,
      outletName: outlet.name,
      captain: "Open",
      seatLabels:
        table.seatLabels ||
        Array.from({ length: Number(table.seats || 0) }, (_, index) => `${table.name}S${index + 1}`)
    }))
  );

  return ownerTables.length ? ownerTables : defaultTableCatalog;
}

function getTableCatalog() {
  return buildOwnerTableCatalog();
}

function getTableMeta(tableId) {
  return getTableCatalog().find((table) => table.tableId === tableId);
}

function buildEmptyOrder(tableId, fallbackOrderNumber = 10030) {
  const tableMeta = getTableMeta(tableId);

  if (!tableMeta) {
    throw new ApiError(404, "TABLE_NOT_FOUND", `Table not found: ${tableId}`);
  }

  return {
    tableId: tableMeta.tableId,
    tableNumber: tableMeta.tableNumber,
    orderNumber: fallbackOrderNumber,
    kotNumber: `KOT-${fallbackOrderNumber}`,
    outletName: tableMeta.outletName,
    areaName: tableMeta.areaName,
    captain: tableMeta.captain,
    seatLabels: tableMeta.seatLabels || [],
    assignedWaiter: "Waiter Priya",
    guests: 0,
    pickupStatus: "new",
    payments: [],
    billSplitCount: 1,
    printCount: 0,
    lastPrintLabel: "Not printed yet",
    isClosed: false,
    closedAt: null,
    serviceChargeEnabled: false,
    serviceChargeRate: 0.1,
    billRequested: false,
    billRequestedAt: null,
    notes: "Ready for new guests",
    discountAmount: 0,
    discountOverrideRequested: false,
    discountApprovalStatus: "Within cashier 5% limit",
    discountApprovedBy: "Not needed",
    voidRequested: false,
    voidReason: "Not requested",
    voidApprovedBy: "Pending",
    reprintReason: "Not requested",
    reprintApprovedBy: "Not needed",
    reprintLog: [],
    deletedBillLog: [],
    controlAlerts: [],
    auditTrail: [],
    items: []
  };
}

function buildInitialState() {
  return {
    closingState: {
      approved: false,
      approvedAt: null,
      approvedBy: null,
      approvedRole: null,
      status: "Pending review"
    },
    cashShifts: {
      shifts: [
        {
          id: "arjun-koramangala",
          cashier: "Arjun",
          outlet: "Koramangala",
          openingCash: "Rs 5,000",
          expectedClose: "Rs 21,450",
          varianceAmount: 0,
          status: "Open"
        },
        {
          id: "priya-indiranagar",
          cashier: "Priya",
          outlet: "Indiranagar",
          openingCash: "Rs 8,000",
          expectedClose: "Rs 32,200",
          varianceAmount: 0,
          status: "Open"
        },
        {
          id: "ramesh-hsr",
          cashier: "Ramesh",
          outlet: "HSR Layout",
          openingCash: "Rs 7,000",
          expectedClose: "Rs 26,300",
          varianceAmount: -1200,
          status: "Mismatch",
          warning: true
        },
        {
          id: "manoj-whitefield",
          cashier: "Manoj",
          outlet: "Whitefield",
          openingCash: "Rs 8,000",
          expectedClose: "Rs 28,110",
          varianceAmount: 0,
          status: "Closed"
        }
      ],
      movements: [
        {
          id: "cash-in-1",
          cashier: "Arjun",
          type: "Cash In",
          amount: "Rs 500",
          reason: "Change refill",
          status: "Approved"
        },
        {
          id: "cash-out-1",
          cashier: "Priya",
          type: "Cash Out",
          amount: "Rs 850",
          reason: "Petty expense",
          status: "Manager check",
          warning: true
        },
        {
          id: "cash-out-2",
          cashier: "Ramesh",
          type: "Cash Out",
          amount: "Rs 300",
          reason: "Courier payout",
          status: "Approved"
        }
      ],
      alerts: [
        {
          id: "hsr-short",
          title: "HSR Layout shift short by Rs 1,200",
          description: "Manager must review before final closing"
        },
        {
          id: "petty-range",
          title: "2 cash-out entries exceed normal petty range",
          description: "Check approval and reason entries"
        },
        {
          id: "not-closed",
          title: "One cashier has not closed shift",
          description: "Prompt closing before end-of-day report generation"
        }
      ]
    },
    permissionPolicies: {
      "cashier-discount-limit-percent": 5,
      "cashier-void-limit-amount": 200
    },
    orders: {
      t1: {
        tableId: "t1",
        tableNumber: "T1",
        orderNumber: 10031,
        kotNumber: "KOT-10031",
        outletName: "Indiranagar",
        areaName: "AC Hall 1",
        captain: "Captain Karthik",
        assignedWaiter: "Waiter Priya",
        guests: 3,
        pickupStatus: "ready",
        payments: [],
        billSplitCount: 1,
        printCount: 0,
        lastPrintLabel: "Not printed yet",
        isClosed: false,
        closedAt: null,
        serviceChargeEnabled: false,
        serviceChargeRate: 0.1,
        billRequested: false,
        billRequestedAt: null,
        notes: "Ready for pickup",
        discountAmount: 0,
        discountOverrideRequested: false,
        discountApprovalStatus: "Within cashier 5% limit",
        discountApprovedBy: "Not needed",
        voidRequested: false,
        voidReason: "Not requested",
        voidApprovedBy: "Pending",
        reprintReason: "Not requested",
        reprintApprovedBy: "Not needed",
        reprintLog: [],
        deletedBillLog: [],
        controlAlerts: [],
        auditTrail: [
          buildAuditEntry("KOT sent", "Captain Karthik", "7:28 PM"),
          buildAuditEntry("Marked ready", "Chef Manoj", "7:31 PM")
        ],
        items: [
          {
            id: "line-1",
            name: "Paneer Tikka",
            quantity: 1,
            price: 220,
            sentToKot: true
          }
        ]
      },
      t2: {
        tableId: "t2",
        tableNumber: "T2",
        orderNumber: 10032,
        kotNumber: "KOT-10032",
        outletName: "Koramangala",
        areaName: "AC Hall 1",
        captain: "Captain Karthik",
        assignedWaiter: "Waiter Rahul",
        guests: 4,
        pickupStatus: "preparing",
        payments: [],
        billSplitCount: 1,
        printCount: 0,
        lastPrintLabel: "Not printed yet",
        isClosed: false,
        closedAt: null,
        serviceChargeEnabled: false,
        serviceChargeRate: 0.1,
        billRequested: false,
        billRequestedAt: null,
        notes: "Discount above cashier limit needs manager approval",
        discountAmount: 25,
        discountOverrideRequested: true,
        discountApprovalStatus: "Manager/Owner approval pending",
        discountApprovedBy: "Pending manager",
        voidRequested: false,
        voidReason: "Not requested",
        voidApprovedBy: "Pending",
        reprintReason: "Not requested",
        reprintApprovedBy: "Not needed",
        reprintLog: [],
        deletedBillLog: [],
        controlAlerts: ["Discount above 5% requested"],
        auditTrail: [buildAuditEntry("Discount override requested", "Cashier Anita", "7:42 PM")],
        items: [
          {
            id: "line-2",
            name: "Veg Biryani",
            quantity: 1,
            price: 240,
            sentToKot: true
          }
        ]
      },
      t3: {
        tableId: "t3",
        tableNumber: "T3",
        orderNumber: 10033,
        kotNumber: "KOT-10033",
        outletName: "HSR Layout",
        areaName: "Non-AC Hall",
        captain: "Captain Karthik",
        assignedWaiter: "Waiter Devi",
        guests: 2,
        pickupStatus: "delivered",
        payments: [],
        billSplitCount: 1,
        printCount: 0,
        lastPrintLabel: "Not printed yet",
        isClosed: false,
        closedAt: null,
        serviceChargeEnabled: false,
        serviceChargeRate: 0.1,
        billRequested: true,
        billRequestedAt: "7:48 PM",
        notes: "Void above cashier limit needs manager/owner OTP approval",
        discountAmount: 0,
        discountOverrideRequested: false,
        discountApprovalStatus: "Within cashier 5% limit",
        discountApprovedBy: "Not needed",
        voidRequested: true,
        voidReason: "Duplicate bill",
        voidApprovedBy: "Pending OTP",
        reprintReason: "Not requested",
        reprintApprovedBy: "Not needed",
        reprintLog: [],
        deletedBillLog: [],
        controlAlerts: ["Void above Rs 200 requested"],
        auditTrail: [buildAuditEntry("Void requested", "Cashier Anita", "7:51 PM")],
        items: [
          {
            id: "line-3",
            name: "Paneer Tikka",
            quantity: 2,
            price: 220,
            sentToKot: true
          }
        ]
      }
    }
  };
}

let state = buildInitialState();
getTableCatalog().forEach((table, index) => {
  if (!state.orders[table.tableId]) {
    state.orders[table.tableId] = buildEmptyOrder(table.tableId, 10040 + index);
  }
});

function getState() {
  return clone(state);
}

function resetState() {
  state = buildInitialState();
  getTableCatalog().forEach((table, index) => {
    if (!state.orders[table.tableId]) {
      state.orders[table.tableId] = buildEmptyOrder(table.tableId, 10040 + index);
    }
  });
  return getState();
}

function hydrateState(nextState) {
  state = clone(nextState);
  getTableCatalog().forEach((table, index) => {
    if (!state.orders[table.tableId]) {
      state.orders[table.tableId] = buildEmptyOrder(table.tableId, 10040 + index);
    }
  });

  return getState();
}

function findOrder(tableId) {
  const order = state.orders[tableId];

  if (!order) {
    throw new ApiError(404, "ORDER_NOT_FOUND", `Order not found for table: ${tableId}`);
  }

  return order;
}

function listOrders() {
  return Object.values(getState().orders);
}

function getOrder(tableId) {
  return clone(findOrder(tableId));
}

function getSummary() {
  const orders = Object.values(state.orders);
  const billRequested = orders.filter((order) => order.billRequested).length;
  const discountApprovalsPending = orders.filter((order) => order.discountOverrideRequested).length;
  const voidApprovalsPending = orders.filter((order) => order.voidRequested).length;
  const kitchenActive = orders.filter((order) => ["new", "preparing", "ready"].includes(order.pickupStatus)).length;

  return {
    closingState: clone(state.closingState),
    permissionPolicies: clone(state.permissionPolicies),
    totals: {
      openOrders: orders.length,
      billRequested,
      discountApprovalsPending,
      voidApprovalsPending,
      kitchenActive
    },
    queues: {
      cashier: orders.filter((order) => order.billRequested).map((order) => ({
        tableId: order.tableId,
        tableNumber: order.tableNumber,
        orderNumber: order.orderNumber
      })),
      approvals: orders
        .filter((order) => order.discountOverrideRequested || order.voidRequested)
        .map((order) => ({
          tableId: order.tableId,
          tableNumber: order.tableNumber,
          orderNumber: order.orderNumber,
          discountApprovalPending: order.discountOverrideRequested,
          voidApprovalPending: order.voidRequested
        }))
    }
  };
}

function getCashShifts() {
  return clone(state.cashShifts);
}

function markCashMismatchUnderReview() {
  state.cashShifts.shifts = state.cashShifts.shifts.map((shift) =>
    shift.id === "ramesh-hsr"
      ? {
          ...shift,
          status: "Manager check"
        }
      : shift
  );

  state.cashShifts.alerts = state.cashShifts.alerts.map((alert) =>
    alert.id === "hsr-short"
      ? {
          ...alert,
          title: "HSR Layout mismatch under manager review",
          description: "Owner report should stay open until closing approval is complete"
        }
      : alert
  );

  return clone(state.cashShifts);
}

function approveClosingState(actorName = "Owner", actorRole = "Owner") {
  state.closingState = {
    approved: true,
    approvedAt: "11:32 PM",
    approvedBy: actorName,
    approvedRole: actorRole,
    reopenedAt: null,
    reopenedBy: null,
    reopenedRole: null,
    status: "Approved and queued"
  };

  return clone(state.closingState);
}

function reopenClosingState(actorName = "Owner", actorRole = "Owner") {
  state.closingState = {
    approved: false,
    approvedAt: null,
    approvedBy: null,
    approvedRole: null,
    reopenedAt: "6:00 AM",
    reopenedBy: actorName,
    reopenedRole: actorRole,
    status: "Open for operations"
  };

  return clone(state.closingState);
}

function nextOrderNumber() {
  return Math.max(...Object.values(state.orders).map((order) => order.orderNumber), 10030) + 1;
}

function createDemoOrder(actor = "System") {
  const tableCatalog = getTableCatalog();
  const targetTable =
    tableCatalog.find((table) => {
      const order = state.orders[table.tableId];
      return !order || (order.items || []).length === 0;
    }) || tableCatalog[0];

  const orderNumber = nextOrderNumber();
  state.orders[targetTable.tableId] = {
    ...buildEmptyOrder(targetTable.tableId, orderNumber),
    orderNumber,
    kotNumber: `KOT-${orderNumber}`,
    guests: 2,
    assignedWaiter: "Waiter Priya",
    pickupStatus: "new",
    notes: "Demo order created",
    items: [
      {
        id: `line-${orderNumber}-1`,
        menuItemId: "paneer-tikka",
        name: "Paneer Tikka",
        quantity: 1,
        price: 220,
        note: "Demo order",
        sentToKot: false,
        stationId: "grill",
        stationName: "Grill"
      }
    ],
    auditTrail: [buildAuditEntry("Demo order created", actor, "Now")]
  };

  return clone(state.orders[targetTable.tableId]);
}

function moveTable(sourceTableId, targetTableId, actor = "System") {
  if (sourceTableId === targetTableId) {
    throw new ApiError(409, "TABLE_MOVE_INVALID", "Source and target table cannot be the same");
  }

  const sourceOrder = findOrder(sourceTableId);
  const targetMeta = getTableMeta(targetTableId);

  if (!targetMeta) {
    throw new ApiError(404, "TABLE_NOT_FOUND", `Target table not found: ${targetTableId}`);
  }

  const targetOrder = state.orders[targetTableId];
  if (targetOrder && (targetOrder.items || []).length > 0) {
    throw new ApiError(409, "TABLE_OCCUPIED", `Target table already has an active order: ${targetTableId}`);
  }

  const movedOrder = {
    ...clone(sourceOrder),
    tableId: targetMeta.tableId,
    tableNumber: targetMeta.tableNumber,
    areaName: targetMeta.areaName,
    outletName: targetMeta.outletName,
    notes: `Moved from ${sourceOrder.tableNumber} to ${targetMeta.tableNumber}`
  };
  appendAudit(movedOrder, buildAuditEntry("Table moved", actor, "Now"));

  state.orders[targetTableId] = movedOrder;
  state.orders[sourceTableId] = buildEmptyOrder(sourceTableId, nextOrderNumber());
  return clone(movedOrder);
}

function markKotSent(tableId, actor = "Captain") {
  const order = findOrder(tableId);
  order.items = order.items.map((item) => ({ ...item, sentToKot: true }));
  order.pickupStatus = "new";
  order.notes = "KOT sent to kitchen";
  appendAudit(order, buildAuditEntry("KOT sent", actor, "Now"));
  return clone(order);
}

function requestBill(tableId, actor = "Waiter") {
  const order = findOrder(tableId);
  order.billRequested = true;
  order.billRequestedAt = "Now";
  order.notes = "Bill requested from service floor";
  appendAudit(order, buildAuditEntry("Bill requested", actor, "Now"));
  return clone(order);
}

function assignWaiter(tableId, waiterName, actor = "Captain") {
  const order = findOrder(tableId);
  order.assignedWaiter = waiterName;
  order.notes = `${waiterName} assigned`;
  appendAudit(order, buildAuditEntry("Waiter assigned", actor, "Now"));
  return clone(order);
}

function addOrderItem(tableId, payload, actor = "System") {
  const order = findOrder(tableId);
  const incomingMenuItemId = payload.menuItemId || payload.id || `item-${Date.now()}`;

  // Consolidate: if the same menu item already has an unsent, non-voided line, increment its
  // quantity rather than pushing a second line. This keeps backend state consistent with the
  // POS UI, which also consolidates by menuItemId for unsent items.
  const existingIdx = order.items.findIndex(
    (i) => i.menuItemId === incomingMenuItemId && !i.sentToKot && !i.isVoided
  );

  if (existingIdx >= 0) {
    order.items[existingIdx].quantity += (payload.quantity || 1);
    if (payload.note) order.items[existingIdx].note = payload.note;
  } else {
    const nextItem = {
      id:          payload.id || `line-${Date.now()}`,
      menuItemId:  incomingMenuItemId,
      name:        payload.name,
      quantity:    payload.quantity || 1,
      price:       payload.price || 0,
      seatLabel:   payload.seatLabel || "",
      note:        payload.note || "",
      sentToKot:   payload.sentToKot || false,
      stationId:   payload.stationId || "main",
      stationName: payload.stationName || "Main Kitchen"
    };
    order.items.push(nextItem);
  }

  order.notes = "Items added";
  appendAudit(order, buildAuditEntry("Item added", actor, "Now"));
  return clone(order);
}

// Returns the existing order for tableId, or creates and stores an empty order if the table
// is in the catalog but has not started an order yet. Throws TABLE_NOT_FOUND if the tableId
// is unknown (not in the catalog). Used by the device-bypass GET /operations/order endpoint
// so the POS never gets ORDER_NOT_FOUND on first open.
function getOrCreateOrder(tableId) {
  if (state.orders[tableId]) {
    return clone(state.orders[tableId]);
  }
  const meta = getTableMeta(tableId);
  if (!meta) {
    throw new ApiError(404, "TABLE_NOT_FOUND", `Table not found: ${tableId}`);
  }
  // Table exists in catalog but has no active order — initialise an empty one and store it
  // so subsequent reads are consistent. runWrite in the repository will persist it.
  const newOrder = buildEmptyOrder(tableId, 10000 + Object.keys(state.orders).length);
  state.orders[tableId] = newOrder;
  return clone(newOrder);
}

function updateOrderItem(tableId, itemId, payload, actor = "System") {
  const order = findOrder(tableId);
  const item = order.items.find((entry) => entry.id === itemId);

  if (!item) {
    throw new ApiError(404, "ORDER_ITEM_NOT_FOUND", `Order item not found: ${itemId}`);
  }

  if (payload.note !== undefined) {
    item.note = payload.note;
  }

  if (payload.quantity !== undefined) {
    item.quantity = payload.quantity;
  }

  if (payload.sentToKot !== undefined) {
    item.sentToKot = payload.sentToKot;
  }

  if (payload.seatLabel !== undefined) {
    item.seatLabel = payload.seatLabel;
  }

  order.notes = payload.note ? `Instruction added: ${payload.note}` : "Order updated";
  appendAudit(
    order,
    buildAuditEntry(payload.note ? "Kitchen note added" : "Order item updated", actor, "Now")
  );
  return clone(order);
}

function calculateOrderTotals(order) {
  const subtotal = (order.items || []).reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );
  const discountAmount = Math.min(Number(order.discountAmount || 0), subtotal);
  const discountedSubtotal = Math.max(subtotal - discountAmount, 0);
  const serviceChargeRate = order.serviceChargeEnabled ? Number(order.serviceChargeRate || 0.1) : 0;
  const serviceCharge = discountedSubtotal * serviceChargeRate;
  const tax = (discountedSubtotal + serviceCharge) * 0.05;
  const total = Math.round(discountedSubtotal + serviceCharge + tax);
  const paidAmount = (order.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return {
    subtotal,
    discountAmount,
    serviceCharge,
    tax,
    total,
    paidAmount,
    remainingAmount: Math.max(total - paidAmount, 0)
  };
}

function splitOrderBill(tableId, actor = "System") {
  const order = findOrder(tableId);
  const maxSplits = Math.min(Math.max(Number(order.guests || 0), 2), 4);
  order.billSplitCount = order.billSplitCount >= maxSplits ? 1 : (order.billSplitCount || 1) + 1;
  order.notes = `Bill split updated to ${order.billSplitCount}`;
  appendAudit(order, buildAuditEntry("Split bill updated", actor, "Now"));
  return clone(order);
}

function addOrderPayment(tableId, payload, actor = "System") {
  const order = findOrder(tableId);
  const totals = calculateOrderTotals(order);
  const requestedAmount = Number(payload.amount || 0);
  const amount = Math.min(requestedAmount, totals.remainingAmount);

  if (amount <= 0) {
    throw new ApiError(400, "INVALID_PAYMENT_AMOUNT", "Payment amount must be greater than zero");
  }

  order.payments = order.payments || [];
  order.payments.push({
    id: payload.id || `payment-${Date.now()}`,
    method: payload.method || "cash",
    label: payload.label || String(payload.method || "cash").toUpperCase(),
    amount
  });
  order.notes = "Payment collected";
  appendAudit(order, buildAuditEntry("Payment added", actor, "Now"));
  return clone(order);
}

function closeOrder(tableId, actor = "System") {
  const order = findOrder(tableId);
  const totals = calculateOrderTotals(order);

  if (totals.total <= 0 || totals.remainingAmount > 0) {
    throw new ApiError(409, "ORDER_NOT_SETTLED", "Order must be fully paid before closing");
  }

  order.isClosed = true;
  order.closedAt = "Closed just now";
  order.billRequested = false;
  order.notes = "Invoice ready and settled";
  appendAudit(order, buildAuditEntry("Order settled", actor, "Now"));
  return clone(order);
}

function approveDiscount(tableId, actor = "Manager OTP") {
  const order = findOrder(tableId);

  if (!order.discountOverrideRequested) {
    throw new ApiError(409, "DISCOUNT_APPROVAL_NOT_PENDING", "Discount approval is not pending");
  }

  order.discountOverrideRequested = false;
  order.discountApprovalStatus = "Approved";
  order.discountApprovedBy = actor;
  order.notes = "Discount approved by manager/owner";
  appendAudit(order, buildAuditEntry("Discount approved", actor, "Now"));
  return clone(order);
}

function approveVoid(tableId, actor = "Manager OTP") {
  const order = findOrder(tableId);

  if (!order.voidRequested) {
    throw new ApiError(409, "VOID_APPROVAL_NOT_PENDING", "Void approval is not pending");
  }

  order.voidRequested = false;
  order.voidApprovedBy = actor;
  order.notes = "Void approved via OTP";
  appendDeletedBill(order, actor);
  appendAudit(order, buildAuditEntry("Void approved", actor, "Now"));
  return clone(order);
}

function recordReprint(tableId, reason, actor = "Manager") {
  const order = findOrder(tableId);
  order.printCount = Number(order.printCount || 0) + 1;
  order.lastPrintLabel = "Reprinted just now";
  order.reprintReason = reason || "Audit copy";
  order.reprintApprovedBy = actor;
  appendReprintLog(order, actor, order.reprintReason);
  appendAudit(order, buildAuditEntry("Bill reprinted", actor, "Now"));
  return clone(order);
}

function requestVoidApproval(tableId, reason, actor = "Cashier") {
  const order = findOrder(tableId);
  order.voidRequested = true;
  order.voidReason = reason || "Manager cancellation";
  order.voidApprovedBy = "Pending OTP";
  order.notes = "Void above cashier limit needs manager/owner OTP approval";
  order.controlAlerts = [
    `Void above Rs ${state.permissionPolicies["cashier-void-limit-amount"] || 200} requested`,
    ...(order.controlAlerts || []).filter((message) => !message.startsWith("Void above Rs "))
  ].slice(0, 4);
  appendAudit(order, buildAuditEntry("Void requested", actor, "Now"));
  return clone(order);
}

function getControlLogs() {
  const orders = Object.values(state.orders);

  return {
    reprints: orders.flatMap((order) =>
      (order.reprintLog || []).map((entry) => ({
        id: `${order.tableId}-${entry.id}`,
        outlet: order.outletName || order.areaName,
        tableId: order.tableId,
        tableNumber: entry.tableNumber,
        orderNumber: entry.orderNumber,
        reason: entry.reason,
        actor: entry.approvedBy,
        time: "Now",
        type: "reprint"
      }))
    ),
    deletedBills: orders.flatMap((order) =>
      (order.deletedBillLog || []).map((entry) => ({
        id: `${order.tableId}-${entry.id}`,
        outlet: order.outletName || order.areaName,
        tableId: order.tableId,
        tableNumber: entry.tableNumber,
        orderNumber: entry.orderNumber,
        reason: entry.reason,
        actor: entry.approvedBy,
        time: "Now",
        type: "deleted-bill"
      }))
    ),
    voidRequests: orders
      .filter((order) => order.voidRequested)
      .map((order) => ({
        id: `${order.tableId}-void-request`,
        outlet: order.outletName || order.areaName,
        tableId: order.tableId,
        tableNumber: order.tableNumber,
        orderNumber: order.orderNumber,
        reason: order.voidReason,
        actor: order.voidApprovedBy || "Pending OTP",
        time: order.billRequestedAt || "Now",
        type: "void-request",
        status: "Pending OTP"
      }))
  };
}

function updateOrderStatus(tableId, pickupStatus, actor = "System") {
  const order = findOrder(tableId);
  const statusMap = {
    new: {
      note: "KOT moved back to new",
      auditLabel: "Moved to new"
    },
    preparing: {
      note: "KOT accepted by kitchen",
      auditLabel: "Accepted in kitchen"
    },
    ready: {
      note: "Ready for pickup",
      auditLabel: "Marked ready"
    },
    picked: {
      note: "Picked from kitchen",
      auditLabel: "Picked from kitchen"
    },
    delivered: {
      note: "Delivered to table",
      auditLabel: "Delivered to table"
    }
  };
  const nextStatus = statusMap[pickupStatus];

  if (!nextStatus) {
    throw new ApiError(400, "INVALID_ORDER_STATUS", `Unsupported pickup status: ${pickupStatus}`);
  }

  order.pickupStatus = pickupStatus;
  order.notes = nextStatus.note;
  appendAudit(order, buildAuditEntry(nextStatus.auditLabel, actor, "Now"));
  return clone(order);
}

module.exports = {
  getState,
  resetState,
  hydrateState,
  listOrders,
  getOrder,
  getSummary,
  getCashShifts,
  markCashMismatchUnderReview,
  approveClosingState,
  reopenClosingState,
  createDemoOrder,
  moveTable,
  markKotSent,
  requestBill,
  assignWaiter,
  addOrderItem,
  getOrCreateOrder,
  updateOrderItem,
  splitOrderBill,
  addOrderPayment,
  closeOrder,
  approveDiscount,
  approveVoid,
  updateOrderStatus,
  recordReprint,
  requestVoidApproval,
  getControlLogs
};
