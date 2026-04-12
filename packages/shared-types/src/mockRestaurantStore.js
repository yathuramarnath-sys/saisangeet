import { sharedAreas, sharedMenuItems, sharedOrders, sharedWaiterTeam } from "./restaurantFlow.js";

const STORAGE_KEY = "restaurant-flow-state";
const EVENT_NAME = "restaurant-flow-updated";
let memoryState = null;
const demoMenuSets = [
  ["paneer-tikka", "sweet-lime"],
  ["veg-biryani", "sweet-lime"],
  ["crispy-corn", "butter-naan"]
];
const defaultCashShifts = {
  shifts: [
    {
      id: "arjun-koramangala",
      cashier: "Arjun",
      outlet: "Koramangala",
      openingCash: "Rs 5,000",
      expectedClose: "Rs 21,450",
      status: "Open"
    },
    {
      id: "priya-indiranagar",
      cashier: "Priya",
      outlet: "Indiranagar",
      openingCash: "Rs 8,000",
      expectedClose: "Rs 32,200",
      status: "Open"
    },
    {
      id: "ramesh-hsr",
      cashier: "Ramesh",
      outlet: "HSR Layout",
      openingCash: "Rs 7,000",
      expectedClose: "Rs 26,300",
      status: "Mismatch",
      warning: true
    },
    {
      id: "manoj-whitefield",
      cashier: "Manoj",
      outlet: "Whitefield",
      openingCash: "Rs 8,000",
      expectedClose: "Rs 28,110",
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
};
const defaultPermissionPolicies = {
  "cashier-table-setup": true,
  "manager-close-day": true,
  "captain-move-table": true,
  "waiter-request-bill": true,
  "kitchen-kot-control": true
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeOrders(orders) {
  return Object.fromEntries(
    Object.entries(orders).map(([key, order]) => [
      key,
      {
        ...order,
        auditTrail: clone(order.auditTrail || [])
      }
    ])
  );
}

function buildDefaultState() {
  return {
    orders: normalizeOrders(clone(sharedOrders)),
    cashShifts: clone(defaultCashShifts),
    permissionPolicies: clone(defaultPermissionPolicies),
    closingState: {
      approved: false,
      approvedAt: null,
      approvedBy: null,
      approvedRole: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenedRole: null,
      status: "Pending review"
    }
  };
}

function getTableCatalog() {
  return sharedAreas.flatMap((area) =>
    area.tables.map((table) => ({
      ...table,
      areaId: area.id,
      areaName: area.name
    }))
  );
}

function buildDemoItems(orderNumber) {
  const recipe = demoMenuSets[orderNumber % demoMenuSets.length];

  return recipe.map((menuItemId, index) => {
    const menuItem = sharedMenuItems.find((item) => item.id === menuItemId);

    return {
      id: `line-${orderNumber}-${index + 1}`,
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity: index === 0 ? 1 : 2,
      price: menuItem.price,
      note: index === 0 ? "Demo order" : "Fast service",
      sentToKot: false,
      stationId: menuItem.stationId,
      stationName: menuItem.stationName
    };
  });
}

function hasBrowserStorage() {
  return (
    typeof window !== "undefined" &&
    window.localStorage &&
    typeof window.localStorage.getItem === "function" &&
    typeof window.localStorage.setItem === "function"
  );
}

export function loadRestaurantState() {
  if (!hasBrowserStorage()) {
    if (!memoryState) {
      memoryState = buildDefaultState();
    }
    return clone(memoryState);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const initialState = buildDefaultState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
    return initialState;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      orders: normalizeOrders({
        ...clone(sharedOrders),
        ...(parsed.orders || {})
      }),
      cashShifts: parsed.cashShifts || clone(defaultCashShifts),
      permissionPolicies: {
        ...clone(defaultPermissionPolicies),
        ...(parsed.permissionPolicies || {})
      },
      closingState:
        parsed.closingState || {
          approved: false,
          approvedAt: null,
          approvedBy: null,
          approvedRole: null,
          reopenedAt: null,
          reopenedBy: null,
          reopenedRole: null,
          status: "Pending review"
        }
    };
  } catch {
    const fallbackState = buildDefaultState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackState));
    return fallbackState;
  }
}

export function saveRestaurantState(nextState) {
  if (!hasBrowserStorage()) {
    memoryState = clone(nextState);
    return nextState;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: nextState }));
  return nextState;
}

export function updateRestaurantOrders(updater) {
  const currentState = loadRestaurantState();
  const nextOrders = updater(clone(currentState.orders));
  return saveRestaurantState({
    ...currentState,
    orders: normalizeOrders(nextOrders)
  });
}

export function updateCashShifts(updater) {
  const currentState = loadRestaurantState();
  const nextCashShifts = updater(clone(currentState.cashShifts || defaultCashShifts));
  return saveRestaurantState({
    ...currentState,
    cashShifts: nextCashShifts
  });
}

export function updatePermissionPolicies(updater) {
  const currentState = loadRestaurantState();
  const nextPolicies = updater(clone(currentState.permissionPolicies || defaultPermissionPolicies));
  return saveRestaurantState({
    ...currentState,
    permissionPolicies: {
      ...clone(defaultPermissionPolicies),
      ...nextPolicies
    }
  });
}

export function updateClosingState(updater) {
  const currentState = loadRestaurantState();
  const nextClosingState = updater(
    clone(
      currentState.closingState || {
        approved: false,
        approvedAt: null,
        approvedBy: null,
        approvedRole: null,
        reopenedAt: null,
        reopenedBy: null,
        reopenedRole: null,
        status: "Pending review"
      }
    )
  );
  return saveRestaurantState({
    ...currentState,
    closingState: nextClosingState
  });
}

export function subscribeRestaurantState(callback) {
  if (!hasBrowserStorage()) {
    return () => {};
  }

  function handleStorage(event) {
    if (event.key === STORAGE_KEY) {
      callback(loadRestaurantState());
    }
  }

  function handleCustomEvent(event) {
    callback(event.detail || loadRestaurantState());
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(EVENT_NAME, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(EVENT_NAME, handleCustomEvent);
  };
}

export function resetRestaurantState() {
  const resetState = buildDefaultState();
  memoryState = clone(resetState);
  return saveRestaurantState(resetState);
}

export function createDemoOrder() {
  const currentState = loadRestaurantState();
  const nextOrders = clone(currentState.orders);
  const tableCatalog = getTableCatalog();
  const targetTable =
    tableCatalog.find((table) => (nextOrders[table.id]?.items || []).length === 0) ||
    tableCatalog.find((table) => table.id === "t2") ||
    tableCatalog[0];

  if (!targetTable) {
    return { state: currentState, tableId: null, orderNumber: null };
  }

  const nextOrderNumber = Math.max(...Object.values(nextOrders).map((order) => order.orderNumber || 10030)) + 1;
  const waiterName = sharedWaiterTeam[nextOrderNumber % sharedWaiterTeam.length];

  nextOrders[targetTable.id] = {
    ...nextOrders[targetTable.id],
    orderNumber: nextOrderNumber,
    kotNumber: `KOT-${nextOrderNumber}`,
    tableId: targetTable.id,
    tableNumber: targetTable.number,
    areaId: targetTable.areaId,
    areaName: targetTable.areaName,
    guests: Math.min(targetTable.seats, 2 + (nextOrderNumber % 3)),
    captain: "Captain Karthik",
    assignedWaiter: waiterName,
    pickupStatus: "new",
    ageMinutes: 0,
    billRequested: false,
    billRequestedAt: null,
    notes: "Demo order created",
    auditTrail: [buildAuditEntry("Demo order created", "System", `${nextOrderNumber}`)],
    items: buildDemoItems(nextOrderNumber)
  };

  return {
    state: saveRestaurantState({
      ...currentState,
      orders: nextOrders
    }),
    tableId: targetTable.id,
    orderNumber: nextOrderNumber
  };
}

export function buildAuditEntry(label, actor, time) {
  return {
    id: `${label}-${actor}-${time}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    actor,
    time
  };
}
