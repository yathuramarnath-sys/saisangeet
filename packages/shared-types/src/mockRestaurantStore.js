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
  "kitchen-kot-control": true,
  "cashier-discount-limit-percent": 5,
  "cashier-void-limit-amount": 200
};
const defaultMenuControls = {
  "paneer-tikka": {
    salesAvailability: "Available",
    outletAvailability: {
      Indiranagar: true,
      Koramangala: true,
      "HSR Layout": false
    }
  },
  "chicken-lollipop": {
    salesAvailability: "Available",
    outletAvailability: {
      Indiranagar: true,
      Koramangala: true,
      "HSR Layout": true
    }
  },
  "masala-papad": {
    salesAvailability: "Sold Out",
    outletAvailability: {
      Indiranagar: false,
      Koramangala: true,
      "HSR Layout": false
    }
  },
  "corn-cheese-balls": {
    salesAvailability: "Available",
    outletAvailability: {
      Indiranagar: true,
      Koramangala: false,
      "HSR Layout": true
    }
  },
  "veg-biryani": {
    salesAvailability: "Available",
    outletAvailability: {
      Indiranagar: true,
      Koramangala: true,
      "HSR Layout": true
    }
  },
  "butter-naan": {
    salesAvailability: "Sold Out",
    outletAvailability: {
      Indiranagar: true,
      Koramangala: true,
      "HSR Layout": true
    }
  },
  "sweet-lime": {
    salesAvailability: "Available",
    outletAvailability: {
      Indiranagar: true,
      Koramangala: true,
      "HSR Layout": true
    }
  }
};
const defaultInventory = {
  diningItems: [
    {
      id: "paneer-tikka",
      name: "Paneer Tikka",
      trackingEnabled: true,
      trackingMode: "Item wise",
      outlet: "Indiranagar",
      quantity: 14,
      threshold: 4,
      status: "Available",
      quantityLabel: "14 portions",
      alert: "Normal sale flow",
      access: "Cashier + Manager"
    },
    {
      id: "crispy-corn",
      name: "Crispy Corn",
      trackingEnabled: false,
      trackingMode: "Optional later",
      outlet: "Koramangala",
      quantity: 5,
      threshold: 5,
      status: "Low Stock",
      quantityLabel: "5 portions left",
      alert: "Captain should push alternate starter if needed",
      access: "Cashier + Manager"
    },
    {
      id: "veg-biryani",
      name: "Veg Biryani",
      trackingEnabled: true,
      trackingMode: "Category wise",
      outlet: "HSR Layout",
      quantity: 3,
      threshold: 4,
      status: "Low Stock",
      quantityLabel: "3 portions left",
      alert: "Show low-stock alert on captain mobile",
      access: "Cashier + Manager"
    },
    {
      id: "butter-naan",
      name: "Butter Naan",
      trackingEnabled: true,
      trackingMode: "Item wise",
      outlet: "Whitefield",
      quantity: 0,
      threshold: 5,
      status: "Out of Stock",
      quantityLabel: "0 portions",
      alert: "Hide from captain quick-add flow",
      access: "Cashier + Manager"
    },
    {
      id: "sweet-lime",
      name: "Sweet Lime",
      trackingEnabled: false,
      trackingMode: "Optional later",
      outlet: "Indiranagar",
      quantity: 22,
      threshold: 6,
      status: "Available",
      quantityLabel: "22 glasses",
      alert: "Normal sale flow",
      access: "Cashier + Manager"
    }
  ],
  productionItems: [
    {
      id: "rice",
      name: "Rice",
      unit: "kg",
      quantity: 42,
      threshold: 12,
      status: "Healthy",
      quantityLabel: "42 kg",
      alert: "Enough for lunch and dinner production",
      access: "Store Incharge + Manager"
    },
    {
      id: "paneer",
      name: "Paneer",
      unit: "kg",
      quantity: 6,
      threshold: 8,
      status: "Low Stock",
      quantityLabel: "6 kg",
      alert: "Refill needed before evening rush",
      access: "Store Incharge + Manager"
    },
    {
      id: "cooking-oil",
      name: "Cooking Oil",
      unit: "ltr",
      quantity: 28,
      threshold: 8,
      status: "Healthy",
      quantityLabel: "28 ltr",
      alert: "Normal kitchen production stock",
      access: "Store Incharge + Manager"
    },
    {
      id: "sugar",
      name: "Sugar",
      unit: "kg",
      quantity: 2,
      threshold: 4,
      status: "Critical",
      quantityLabel: "2 kg",
      alert: "Store incharge should issue stock immediately",
      access: "Store Incharge + Manager"
    }
  ],
  wasteLog: [
    {
      id: "waste-sugar-1",
      itemName: "Sugar",
      amount: "0.5 kg",
      reason: "Spillage",
      actor: "Store Incharge",
      time: "Today"
    }
  ],
  issueLog: [
    {
      id: "issue-paneer-1",
      itemName: "Paneer",
      amount: "2 kg",
      from: "Store",
      to: "Main Kitchen",
      actor: "Store Incharge",
      time: "Today"
    }
  ],
  purchaseLog: [
    {
      id: "purchase-rice-1",
      itemName: "Rice",
      amount: "25 kg",
      vendor: "A1 Traders",
      actor: "Manager",
      time: "Today"
    }
  ],
  countLog: [
    {
      id: "count-paneer-1",
      itemName: "Paneer Tikka",
      category: "Dining",
      systemQuantity: "14 portions",
      countedQuantity: "13 portions",
      variance: "-1 portions",
      actor: "Manager",
      time: "Today"
    }
  ],
  varianceLog: [
    {
      id: "variance-paneer-1",
      itemName: "Paneer Tikka",
      category: "Dining",
      variance: "-1 portions",
      severity: "Missing",
      note: "Physical count is below system stock. Review leakage, wastage, or missed billing.",
      actor: "Manager",
      time: "Today"
    }
  ]
};

const productionRecipes = {
  "paneer-tikka": [
    { itemId: "paneer", amount: 0.25 },
    { itemId: "cooking-oil", amount: 0.05 }
  ],
  "crispy-corn": [{ itemId: "cooking-oil", amount: 0.04 }],
  "veg-biryani": [
    { itemId: "rice", amount: 0.3 },
    { itemId: "cooking-oil", amount: 0.03 }
  ],
  "butter-naan": [{ itemId: "cooking-oil", amount: 0.01 }],
  "sweet-lime": [{ itemId: "sugar", amount: 0.03 }]
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatDiningQuantity(value) {
  return `${value} portions`;
}

function formatProductionQuantity(value, unit) {
  return `${value} ${unit}`;
}

function getDiningStatus(quantity, threshold) {
  if (quantity <= 0) {
    return "Out of Stock";
  }

  if (quantity <= threshold) {
    return "Low Stock";
  }

  return "Available";
}

function getProductionStatus(quantity, threshold) {
  if (quantity <= Math.max(1, threshold / 2)) {
    return "Critical";
  }

  if (quantity <= threshold) {
    return "Low Stock";
  }

  return "Healthy";
}

function refreshDiningItem(item) {
  if (item.trackingEnabled === false) {
    return {
      ...item,
      status: "Not tracked",
      quantityLabel: item.quantityLabel || "Tracking off",
      alert: item.alert || "Inventory tracking is disabled for this item"
    };
  }

  return {
    ...item,
    status: getDiningStatus(Number(item.quantity || 0), Number(item.threshold || 0)),
    quantityLabel: formatDiningQuantity(Number(item.quantity || 0))
  };
}

function refreshProductionItem(item) {
  return {
    ...item,
    status: getProductionStatus(Number(item.quantity || 0), Number(item.threshold || 0)),
    quantityLabel: formatProductionQuantity(Number(item.quantity || 0), item.unit)
  };
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
    inventory: clone(defaultInventory),
    permissionPolicies: clone(defaultPermissionPolicies),
    menuControls: clone(defaultMenuControls),
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
      inventory: {
        diningItems: (parsed.inventory?.diningItems || clone(defaultInventory.diningItems)).map(refreshDiningItem),
        productionItems: (parsed.inventory?.productionItems || clone(defaultInventory.productionItems)).map(refreshProductionItem),
        wasteLog: parsed.inventory?.wasteLog || clone(defaultInventory.wasteLog),
        issueLog: parsed.inventory?.issueLog || clone(defaultInventory.issueLog),
        purchaseLog: parsed.inventory?.purchaseLog || clone(defaultInventory.purchaseLog),
        countLog: parsed.inventory?.countLog || clone(defaultInventory.countLog),
        varianceLog: parsed.inventory?.varianceLog || clone(defaultInventory.varianceLog)
      },
      permissionPolicies: {
        ...clone(defaultPermissionPolicies),
        ...(parsed.permissionPolicies || {})
      },
      menuControls: {
        ...clone(defaultMenuControls),
        ...(parsed.menuControls || {})
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

export function updateMenuControls(updater) {
  const currentState = loadRestaurantState();
  const nextMenuControls = updater(clone(currentState.menuControls || defaultMenuControls));
  return saveRestaurantState({
    ...currentState,
    menuControls: {
      ...clone(defaultMenuControls),
      ...nextMenuControls
    }
  });
}

export function updateInventoryState(updater) {
  const currentState = loadRestaurantState();
  const nextInventory = updater(
    clone(
      currentState.inventory || {
        diningItems: defaultInventory.diningItems,
        productionItems: defaultInventory.productionItems
      }
    )
  );

  return saveRestaurantState({
    ...currentState,
    inventory: {
      diningItems: (nextInventory.diningItems || []).map(refreshDiningItem),
      productionItems: (nextInventory.productionItems || []).map(refreshProductionItem),
      wasteLog: nextInventory.wasteLog || [],
      issueLog: nextInventory.issueLog || [],
      purchaseLog: nextInventory.purchaseLog || [],
      countLog: nextInventory.countLog || [],
      varianceLog: nextInventory.varianceLog || []
    }
  });
}

export function applyInventoryConsumption(items = []) {
  return updateInventoryState((current) => {
    const next = clone(current);

    items.forEach((orderItem) => {
      const diningItem = next.diningItems.find((item) => item.id === orderItem.menuItemId);

      if (diningItem) {
        if (diningItem.trackingEnabled === false) {
          return;
        }

        diningItem.quantity = Math.max(0, Number(diningItem.quantity || 0) - Number(orderItem.quantity || 0));
        diningItem.alert =
          diningItem.quantity <= 0
            ? "Blocked from captain quick-add flow"
            : diningItem.quantity <= Number(diningItem.threshold || 0)
              ? "Captain mobile should warn before item goes out of stock"
              : "Normal sale flow";
      }
    });

    return next;
  });
}

export function recordInventoryWaste(itemId, amount, reason = "Waste entry", actor = "Store Incharge") {
  return updateInventoryState((current) => {
    const next = clone(current);
    const productionItem = next.productionItems.find((item) => item.id === itemId);

    if (!productionItem) {
      return next;
    }

    productionItem.quantity = Math.max(0, Number(productionItem.quantity || 0) - Number(amount || 0));
    productionItem.quantity = Number(productionItem.quantity.toFixed(2));
    productionItem.alert = "Waste recorded and stock reduced";
    next.wasteLog = [
      {
        id: `waste-${itemId}-${Date.now()}`,
        itemName: productionItem.name,
        amount: `${amount} ${productionItem.unit}`,
        reason,
        actor,
        time: "Now"
      },
      ...(next.wasteLog || [])
    ].slice(0, 6);

    return next;
  });
}

export function issueProductionInventory(itemId, amount, destination = "Main Kitchen", actor = "Store Incharge") {
  return updateInventoryState((current) => {
    const next = clone(current);
    const productionItem = next.productionItems.find((item) => item.id === itemId);

    if (!productionItem) {
      return next;
    }

    productionItem.quantity = Math.max(0, Number(productionItem.quantity || 0) - Number(amount || 0));
    productionItem.quantity = Number(productionItem.quantity.toFixed(2));
    productionItem.alert = "Issued to kitchen production";
    next.issueLog = [
      {
        id: `issue-${itemId}-${Date.now()}`,
        itemName: productionItem.name,
        amount: `${amount} ${productionItem.unit}`,
        from: "Store",
        to: destination,
        actor,
        time: "Now"
      },
      ...(next.issueLog || [])
    ].slice(0, 6);

    return next;
  });
}

export function addPurchaseInventory(itemId, amount, vendor = "Vendor", actor = "Manager") {
  return updateInventoryState((current) => {
    const next = clone(current);
    const productionItem = next.productionItems.find((item) => item.id === itemId);

    if (!productionItem) {
      return next;
    }

    productionItem.quantity = Number(Number(productionItem.quantity || 0) + Number(amount || 0));
    productionItem.quantity = Number(productionItem.quantity.toFixed(2));
    productionItem.alert = "Fresh inward stock added";
    next.purchaseLog = [
      {
        id: `purchase-${itemId}-${Date.now()}`,
        itemName: productionItem.name,
        amount: `${amount} ${productionItem.unit}`,
        vendor,
        actor,
        time: "Now"
      },
      ...(next.purchaseLog || [])
    ].slice(0, 6);

    return next;
  });
}

export function recordInventoryCount(itemId, countedQuantity, actor = "Manager") {
  return updateInventoryState((current) => {
    const next = clone(current);
    const diningItem = next.diningItems.find((item) => item.id === itemId);
    const productionItem = next.productionItems.find((item) => item.id === itemId);
    const targetItem = diningItem || productionItem;

    if (!targetItem) {
      return next;
    }

    const category = diningItem ? "Dining" : "Production";
    const unit = diningItem ? "portions" : targetItem.unit;
    const systemQuantity = Number(targetItem.quantity || 0);
    const counted = Number(countedQuantity || 0);
    const variance = Number((counted - systemQuantity).toFixed(2));
    const varianceLabel = `${variance > 0 ? "+" : ""}${variance} ${unit}`;

    next.countLog = [
      {
        id: `count-${itemId}-${Date.now()}`,
        itemName: targetItem.name,
        category,
        systemQuantity: `${systemQuantity} ${unit}`,
        countedQuantity: `${counted} ${unit}`,
        variance: varianceLabel,
        actor,
        time: "Now"
      },
      ...(next.countLog || [])
    ].slice(0, 8);

    if (variance !== 0) {
      targetItem.alert =
        variance < 0
          ? "Missing stock alert should be reviewed before daily closing"
          : "Extra stock found during physical count";

      next.varianceLog = [
        {
          id: `variance-${itemId}-${Date.now()}`,
          itemName: targetItem.name,
          category,
          variance: varianceLabel,
          severity: variance < 0 ? "Missing" : "Excess",
          note:
            variance < 0
              ? "Physical count is below system stock. Review leakage, wastage, or missed billing."
              : "Physical count is above system stock. Review inward entries and manual adjustments.",
          actor,
          time: "Now"
        },
        ...(next.varianceLog || [])
      ].slice(0, 8);
    }

    return next;
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
