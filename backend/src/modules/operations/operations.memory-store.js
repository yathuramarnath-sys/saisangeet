const { ApiError } = require("../../utils/api-error");

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

function buildInitialState() {
  return {
    closingState: {
      approved: false,
      approvedAt: null,
      approvedBy: null,
      approvedRole: null,
      status: "Pending review"
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

function getState() {
  return clone(state);
}

function resetState() {
  state = buildInitialState();
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
  const nextItem = {
    id: payload.id || `line-${Date.now()}`,
    menuItemId: payload.menuItemId || payload.id || `item-${Date.now()}`,
    name: payload.name,
    quantity: payload.quantity || 1,
    price: payload.price || 0,
    note: payload.note || "",
    sentToKot: payload.sentToKot || false,
    stationId: payload.stationId || "main",
    stationName: payload.stationName || "Main Kitchen"
  };

  order.items.push(nextItem);
  order.notes = "Items added";
  appendAudit(order, buildAuditEntry("Item added", actor, "Now"));
  return clone(order);
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

  order.notes = payload.note ? `Instruction added: ${payload.note}` : "Order updated";
  appendAudit(
    order,
    buildAuditEntry(payload.note ? "Kitchen note added" : "Order item updated", actor, "Now")
  );
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
  listOrders,
  getOrder,
  getSummary,
  markKotSent,
  requestBill,
  assignWaiter,
  addOrderItem,
  updateOrderItem,
  approveDiscount,
  approveVoid,
  updateOrderStatus
};
