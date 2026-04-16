import { useEffect, useMemo, useState } from "react";

import { areas, categories, kitchenInstructions, menuItems, serviceModes, tableOrders } from "./data/pos.seed";
import {
  applyInventoryConsumption,
  buildAuditEntry,
  createDemoOrder,
  loadRestaurantState,
  subscribeRestaurantState,
  updateRestaurantOrders
} from "../../../packages/shared-types/src/mockRestaurantStore.js";
import { api } from "./lib/api";

const paymentMethods = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" }
];

const reprintReasons = ["Customer copy", "Paper jam", "Audit copy"];
const voidReasons = ["Wrong table", "Duplicate bill", "Manager cancellation"];

const defaultBusinessProfile = {
  name: "Saisangeet",
  address: "Thyagaraya Nagar, Chennai",
  gstin: "33ABCDE1234F1Z5"
};
const defaultOutletName = "Indiranagar";

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePriceLabel(value) {
  if (typeof value === "number") {
    return value;
  }

  return Number(String(value || "").replace(/[^0-9.]/g, "")) || 0;
}

function tableClass(status, isSelected) {
  return `table-card ${status} ${isSelected ? "selected" : ""}`;
}

function currency(value) {
  return `Rs ${value.toFixed(2)}`;
}

function calculateSubtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function calculatePaid(payments = []) {
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
}

function getOrderFinancials(order) {
  const subtotal = calculateSubtotal(order.items);
  const discountAmount = Math.min(order.discountAmount || 0, subtotal);
  const discountedSubtotal = Math.max(subtotal - discountAmount, 0);
  const serviceChargeRate = order.serviceChargeEnabled ? order.serviceChargeRate || 0 : 0;
  const serviceCharge = discountedSubtotal * serviceChargeRate;
  const taxableBase = discountedSubtotal + serviceCharge;
  const tax = taxableBase * 0.05;
  const totalBeforeRound = taxableBase + tax;
  const roundedTotal = totalBeforeRound > 0 ? Math.round(totalBeforeRound) : 0;
  const roundOff = roundedTotal - totalBeforeRound;
  const total = roundedTotal;
  const paidAmount = calculatePaid(order.payments);
  const remainingAmount = Math.max(total - paidAmount, 0);
  const splitAmount = order.billSplitCount > 0 ? total / order.billSplitCount : total;

  return {
    subtotal,
    discountAmount,
    discountedSubtotal,
    serviceCharge,
    tax,
    roundOff,
    total,
    paidAmount,
    remainingAmount,
    splitAmount
  };
}

function appendAudit(order, entry) {
  order.auditTrail = [entry, ...(order.auditTrail || [])].slice(0, 6);
}

function appendAlert(order, message) {
  order.controlAlerts = [message, ...(order.controlAlerts || [])].slice(0, 4);
}

function appendDeletedBill(order) {
  order.deletedBillLog = [
    {
      id: `deleted-${Date.now()}`,
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      reason: order.voidReason,
      approvedBy: order.voidApprovedBy
    },
    ...(order.deletedBillLog || [])
  ].slice(0, 4);
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
  ].slice(0, 4);
}

function finalizeVoidApproval(order, approverLabel) {
  order.voidRequested = false;
  order.voidApprovedBy = approverLabel;
  order.notes = approverLabel === "Cashier Anita" ? "Void completed within cashier limit" : "Void approved via OTP";
  appendDeletedBill(order);
  appendAudit(order, buildAuditEntry("Void approved", approverLabel, "Now"));
}

function finalizeDiscountApproval(order, approverLabel) {
  order.discountOverrideRequested = false;
  order.discountApprovalStatus = "Approved";
  order.discountApprovedBy = approverLabel;
  order.notes = "Discount approved by manager/owner";
  appendAudit(order, buildAuditEntry("Discount approved", approverLabel, "Now"));
}

function buildInitialOrders() {
  const sharedState = loadRestaurantState();
  const orders = JSON.parse(JSON.stringify({ ...tableOrders, ...sharedState.orders }));

  Object.values(orders).forEach((order) => {
    order.payments = order.payments || [];
    order.billSplitCount = order.billSplitCount || 1;
    order.isClosed = order.isClosed || false;
    order.closedAt = order.closedAt || null;
    order.printCount = order.printCount || 0;
    order.lastPrintLabel = order.lastPrintLabel || "Not printed yet";
    order.serviceChargeEnabled = order.serviceChargeEnabled || false;
    order.serviceChargeRate = order.serviceChargeRate || 0.1;
    order.discountAmount = order.discountAmount || 0;
    order.cashierName = order.cashierName || "Anita";
    order.billTimestamp = order.billTimestamp || "11 Apr 2026, 5:15 PM";
    order.reprintReason = order.reprintReason || "Not requested";
    order.reprintApprovedBy = order.reprintApprovedBy || "Not needed";
    order.reprintLog = order.reprintLog || [];
    order.voidReason = order.voidReason || "Not requested";
    order.voidApprovedBy = order.voidApprovedBy || "Pending";
    order.voidRequested = order.voidRequested || false;
    order.discountApprovalStatus = order.discountApprovalStatus || "Within limit";
    order.discountApprovedBy = order.discountApprovedBy || "Not needed";
    order.discountOverrideRequested = order.discountOverrideRequested || false;
    order.deletedBillLog = order.deletedBillLog || [];
    order.controlAlerts = order.controlAlerts || [];
  });

  return orders;
}

function normalizeOrderMap(orders) {
  const normalized = structuredClone(orders);

  Object.values(normalized).forEach((order) => {
    order.items = (order.items || []).map((item) => ({
      ...item,
      menuItemId: item.menuItemId || item.id
    }));
    order.payments = order.payments || [];
    order.billSplitCount = order.billSplitCount || 1;
    order.isClosed = order.isClosed || false;
    order.closedAt = order.closedAt || null;
    order.printCount = order.printCount || 0;
    order.lastPrintLabel = order.lastPrintLabel || "Not printed yet";
    order.serviceChargeEnabled = order.serviceChargeEnabled || false;
    order.serviceChargeRate = order.serviceChargeRate || 0.1;
    order.discountAmount = order.discountAmount || 0;
    order.cashierName = order.cashierName || "Anita";
    order.billTimestamp = order.billTimestamp || "11 Apr 2026, 5:15 PM";
    order.reprintReason = order.reprintReason || "Not requested";
    order.reprintApprovedBy = order.reprintApprovedBy || "Not needed";
    order.reprintLog = order.reprintLog || [];
    order.voidReason = order.voidReason || "Not requested";
    order.voidApprovedBy = order.voidApprovedBy || "Pending";
    order.voidRequested = order.voidRequested || false;
    order.discountApprovalStatus = order.discountApprovalStatus || "Within limit";
    order.discountApprovedBy = order.discountApprovedBy || "Not needed";
    order.discountOverrideRequested = order.discountOverrideRequested || false;
    order.deletedBillLog = order.deletedBillLog || [];
    order.controlAlerts = order.controlAlerts || [];
  });

  return normalized;
}

function mapOrderArrayToRecord(orders = []) {
  return Object.fromEntries((orders || []).map((order) => [order.tableId, order]));
}

function buildTableAreasFromOutlet(outlet) {
  if (!outlet?.tables?.length) {
    return areas;
  }

  return (outlet.workAreas || [])
    .map((workArea) => {
      const tables = (outlet.tables || [])
        .filter((table) => table.workArea === workArea)
        .map((table) => ({
          id: table.id,
          number: table.name,
          seats: table.seats,
          seatLabels:
            table.seatLabels || Array.from({ length: Number(table.seats || 0) }, (_, index) => `${table.name}S${index + 1}`),
          status: "available",
          captain: "Open",
          guests: 0
        }));

      return tables.length
        ? {
            id: `${slugify(outlet.name)}-${slugify(workArea)}`,
            name: workArea,
            tables
          }
        : null;
    })
    .filter(Boolean);
}

function pickOperationsOutlet(outlets = []) {
  if (!outlets.length) {
    return null;
  }

  return outlets.find((outlet) => (outlet.tables || []).length > 0) || outlets[0];
}

function buildBlankOrder(table, areaName, outletName, fallbackOrderNumber = 10050) {
  return {
    tableId: table.id,
    tableNumber: table.number,
    orderNumber: fallbackOrderNumber,
    kotNumber: `KOT-${fallbackOrderNumber}`,
    outletName,
    areaName,
    captain: table.captain || "Open",
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
    notes: "Open table",
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
    items: [],
    seatLabels: table.seatLabels || []
  };
}

function ensureOrdersForAreas(currentOrders, tableAreas, outletName) {
  const next = normalizeOrderMap(currentOrders);
  let fallbackOrderNumber = Math.max(10040, ...Object.values(next).map((order) => order.orderNumber || 10040)) + 1;

  tableAreas.forEach((area) => {
    area.tables.forEach((table) => {
      if (!next[table.id]) {
        next[table.id] = buildBlankOrder(table, area.name, outletName, fallbackOrderNumber);
        fallbackOrderNumber += 1;
      } else {
        next[table.id] = {
          ...next[table.id],
          tableId: table.id,
          tableNumber: table.number,
          areaName: area.name,
          outletName,
          seatLabels: table.seatLabels || next[table.id].seatLabels || []
        };
      }
    });
  });

  return next;
}

function findNextEmptyTableId(currentTableId, ordersByTable, tableAreas) {
  const tableIds = tableAreas.flatMap((area) => area.tables.map((table) => table.id));
  return tableIds.find((tableId) => tableId !== currentTableId && (ordersByTable[tableId]?.items || []).length === 0);
}

export function App() {
  const [tableAreas, setTableAreas] = useState(areas);
  const [selectedTableId, setSelectedTableId] = useState("t1");
  const [selectedCategoryId, setSelectedCategoryId] = useState("starters");
  const [selectedLineId, setSelectedLineId] = useState("line-2");
  const [ordersByTable, setOrdersByTable] = useState(buildInitialOrders);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [discountInput, setDiscountInput] = useState("0");
  const [selectedReprintReason, setSelectedReprintReason] = useState(reprintReasons[0]);
  const [selectedVoidReason, setSelectedVoidReason] = useState(voidReasons[0]);
  const [closingLocked, setClosingLocked] = useState(loadRestaurantState().closingState?.approved || false);
  const [permissionPolicies, setPermissionPolicies] = useState(loadRestaurantState().permissionPolicies || {});
  const [inventoryState, setInventoryState] = useState(loadRestaurantState().inventory || { diningItems: [] });
  const [menuControls, setMenuControls] = useState(loadRestaurantState().menuControls || {});
  const [approvalModal, setApprovalModal] = useState({
    type: null,
    approverRole: "Manager",
    otp: "",
    error: ""
  });
  const [posBusinessProfile, setPosBusinessProfile] = useState(defaultBusinessProfile);
  const [posCategories, setPosCategories] = useState(categories);
  const [posMenuItems, setPosMenuItems] = useState(menuItems);
  const [activeOutletName, setActiveOutletName] = useState(defaultOutletName);

  const currentOrder = ordersByTable[selectedTableId] || Object.values(ordersByTable)[0];
  const currentFinancials = getOrderFinancials(currentOrder);
  const cashierTableSetupEnabled = permissionPolicies["cashier-table-setup"] !== false;
  const cashierDiscountLimitPercent = Number(permissionPolicies["cashier-discount-limit-percent"] || 5);
  const cashierVoidLimitAmount = Number(permissionPolicies["cashier-void-limit-amount"] || 200);

  const visibleMenuItems = useMemo(
    () =>
      posMenuItems.filter(
        (item) => item.categoryId === selectedCategoryId && menuControls[item.id]?.outletAvailability?.[activeOutletName] !== false
      ),
    [activeOutletName, menuControls, posMenuItems, selectedCategoryId]
  );
  const diningInventoryById = useMemo(
    () => Object.fromEntries((inventoryState.diningItems || []).map((item) => [item.id, item])),
    [inventoryState]
  );

  const closedOrders = useMemo(
    () =>
      Object.values(ordersByTable)
        .filter((order) => order.isClosed)
        .sort((left, right) => right.orderNumber - left.orderNumber),
    [ordersByTable]
  );

  const canCloseOrder = currentFinancials.total > 0 && currentFinancials.remainingAmount === 0 && !currentOrder.voidRequested;
  const billRequestedOrders = useMemo(
    () =>
      Object.values(ordersByTable)
        .filter((order) => order.billRequested && !order.isClosed)
        .sort((left, right) => (left.billRequestedAt || "").localeCompare(right.billRequestedAt || "")),
    [ordersByTable]
  );

  useEffect(() => {
    return subscribeRestaurantState((nextState) => {
      setClosingLocked(nextState.closingState?.approved || false);
      setPermissionPolicies(nextState.permissionPolicies || {});
      setInventoryState(nextState.inventory || { diningItems: [] });
      setMenuControls(nextState.menuControls || {});
      setOrdersByTable((current) => {
        const merged = structuredClone(current);

        Object.entries(nextState.orders).forEach(([key, order]) => {
          const existing = merged[key] || {};
          merged[key] = {
            ...existing,
            ...order,
            items: order.items.map((item) => ({
              ...item,
              menuItemId: item.menuItemId || item.id
            })),
            payments: existing.payments || [],
            billSplitCount: existing.billSplitCount || 1,
            isClosed: existing.isClosed || false,
            closedAt: existing.closedAt || null,
            printCount: existing.printCount || 0,
            lastPrintLabel: existing.lastPrintLabel || "Not printed yet",
            serviceChargeEnabled: existing.serviceChargeEnabled || false,
            serviceChargeRate: existing.serviceChargeRate || 0.1,
            discountAmount: existing.discountAmount || 0,
            cashierName: existing.cashierName || "Anita",
            billTimestamp: existing.billTimestamp || "11 Apr 2026, 5:15 PM",
            reprintReason: existing.reprintReason || "Not requested",
            reprintApprovedBy: existing.reprintApprovedBy || "Not needed",
            reprintLog: existing.reprintLog || [],
            voidReason: existing.voidReason || "Not requested",
            voidApprovedBy: existing.voidApprovedBy || "Pending",
            voidRequested: existing.voidRequested || false,
            discountApprovalStatus: existing.discountApprovalStatus || "Within limit",
            discountApprovedBy: existing.discountApprovedBy || "Not needed",
            discountOverrideRequested: existing.discountOverrideRequested || false,
            deletedBillLog: existing.deletedBillLog || [],
            controlAlerts: existing.controlAlerts || []
          };
        });

        return merged;
      });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFromApi() {
      try {
        const [summary, orders, appConfig] = await Promise.all([
          api.get("/operations/summary"),
          api.get("/operations/orders"),
          api.get("/setup/app-config")
        ]);

        if (cancelled) {
          return;
        }

        setClosingLocked(summary.closingState?.approved || false);
        setPermissionPolicies(summary.permissionPolicies || {});
        const configuredOutlet = pickOperationsOutlet(appConfig.outlets || []);
        const firstOutlet = configuredOutlet?.name || defaultOutletName;
        const nextAreas = buildTableAreasFromOutlet(configuredOutlet);
        setTableAreas(nextAreas);
        setOrdersByTable((current) =>
          ensureOrdersForAreas(
            {
              ...current,
              ...mapOrderArrayToRecord(orders)
            },
            nextAreas,
            firstOutlet
          )
        );
        setPosBusinessProfile({
          name: appConfig.businessProfile?.tradeName || appConfig.businessProfile?.legalName || defaultBusinessProfile.name,
          address:
            [appConfig.businessProfile?.addressLine1, appConfig.businessProfile?.city]
              .filter(Boolean)
              .join(", ") || defaultBusinessProfile.address,
          gstin: appConfig.businessProfile?.gstin || defaultBusinessProfile.gstin
        });
        setActiveOutletName(firstOutlet);
        const nextCategories =
          appConfig.menu?.categories?.map((category) => ({
            id: category.id,
            name: category.name
          })) || categories;
        const nextMenuItems =
          appConfig.menu?.items?.map((item) => ({
            id: item.id,
            name: item.name,
            price: parsePriceLabel(item.pricing?.[0]?.dineIn),
            station: item.station || "Main kitchen",
            stationId: slugify(item.station || "main-kitchen"),
            categoryId: item.categoryId
          })) || menuItems;
        setPosCategories(nextCategories);
        setPosMenuItems(nextMenuItems);
        const firstTableId = nextAreas[0]?.tables[0]?.id;
        if (firstTableId) {
          setSelectedTableId((current) =>
            nextAreas.some((area) => area.tables.some((table) => table.id === current)) ? current : firstTableId
          );
        }
        if (nextCategories[0]) {
          setSelectedCategoryId((current) =>
            nextCategories.some((category) => category.id === current) ? current : nextCategories[0].id
          );
        }
      } catch {
        // Keep the current local mock flow if backend is not reachable.
      }
    }

    loadFromApi();

    return () => {
      cancelled = true;
    };
  }, []);

  function selectTable(tableId) {
    const nextOrder = ordersByTable[tableId];

    setSelectedTableId(tableId);
    setSelectedLineId(nextOrder.items[0]?.id || null);
    setPaymentAmount("");
    setSelectedPaymentMethod("cash");
    setDiscountInput(String(nextOrder.discountAmount || 0));
    setSelectedReprintReason(reprintReasons[0]);
    setSelectedVoidReason(voidReasons[0]);
  }

  function addItem(menuItem) {
    if (currentOrder.isClosed || currentOrder.voidRequested || closingLocked) {
      return;
    }

    const inventoryItem = diningInventoryById[menuItem.id];
    const isTracked = inventoryItem?.trackingEnabled !== false;
    const isSoldOut = menuControls[menuItem.id]?.salesAvailability === "Sold Out";

    if (isSoldOut || (isTracked && inventoryItem?.status === "Out of Stock")) {
      return;
    }

    const newLineId = `line-${Date.now()}-${menuItem.id}`;

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      const existingLine = order.items.find((item) => item.menuItemId === menuItem.id && !item.note);

      if (existingLine) {
        existingLine.quantity += 1;
        existingLine.sentToKot = false;
        setSelectedLineId(existingLine.id);
        return next;
      }

      const newItem = {
        id: newLineId,
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: 1,
        price: menuItem.price,
        note: "Add kitchen note",
        sentToKot: false
      };

      order.items.push(newItem);
      order.isClosed = false;
      order.closedAt = null;
      order.voidRequested = false;
      order.voidReason = "Not requested";
      order.voidApprovedBy = "Pending";

      if (order.guests === 0) {
        order.guests = 1;
        order.captain = "Captain Pending";
        order.notes = "Running order started";
      }

      setSelectedLineId(newItem.id);
      return next;
    });

    api
      .post(`/operations/orders/${selectedTableId}/items`, {
        id: newLineId,
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: 1,
        price: menuItem.price,
        note: "Add kitchen note",
        sentToKot: false,
        stationId: menuItem.stationId,
        stationName: menuItem.station,
        actorName: "Cashier Anita",
        actorRole: "Cashier"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrderMap({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});
  }

  function applyInstruction(instruction) {
    if (!selectedLineId || currentOrder.isClosed || currentOrder.voidRequested || closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const line = next[selectedTableId].items.find((item) => item.id === selectedLineId);

      if (line) {
        line.note = instruction;
        line.sentToKot = false;
      }

      return next;
    });

    api
      .patch(`/operations/orders/${selectedTableId}/items/${selectedLineId}`, {
        note: instruction,
        sentToKot: false,
        actorName: "Cashier Anita",
        actorRole: "Cashier"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrderMap({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});
  }

  function sendKot() {
    if (currentOrder.isClosed || currentOrder.voidRequested || closingLocked) {
      return;
    }

    const unsentItems = currentOrder.items
      .filter((item) => !item.sentToKot)
      .map((item) => ({
        menuItemId: item.menuItemId || item.id,
        quantity: item.quantity
      }));

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[selectedTableId].items.forEach((item) => {
        item.sentToKot = true;
      });
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        next[selectedTableId].items = currentOrder.items.map((item) => ({
          ...item,
          sentToKot: true
        }));
        next[selectedTableId].pickupStatus = "ready";
        next[selectedTableId].notes = "KOT sent from POS";
        appendAudit(next[selectedTableId], buildAuditEntry("KOT sent from POS", "Cashier Anita", "Now"));
      }
      return next;
    });

    if (unsentItems.length > 0) {
      applyInventoryConsumption(unsentItems);
    }

    api
      .post(`/operations/orders/${selectedTableId}/kot`, {
        actorName: "Cashier Anita",
        actorRole: "Cashier"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrderMap({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});
  }

  function splitBill() {
    if (currentOrder.items.length === 0 || currentOrder.isClosed || currentOrder.voidRequested || closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      const maxSplits = Math.min(Math.max(order.guests, 2), 4);
      order.billSplitCount = order.billSplitCount >= maxSplits ? 1 : order.billSplitCount + 1;
      return next;
    });

    api
      .post(`/operations/orders/${selectedTableId}/split-bill`, {
        actorName: "Cashier Anita",
        actorRole: "Cashier"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrderMap({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});
  }

  function addPayment() {
    const rawAmount = Number(paymentAmount);

    if (!rawAmount || rawAmount < 0.01 || currentOrder.isClosed || currentOrder.items.length === 0 || currentOrder.voidRequested || closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      const orderFinancials = getOrderFinancials(order);
      const normalizedAmount = Math.min(rawAmount, orderFinancials.remainingAmount);

      if (normalizedAmount <= 0) {
        return next;
      }

      order.payments.push({
        id: `payment-${Date.now()}-${selectedPaymentMethod}`,
        method: selectedPaymentMethod,
        label: paymentMethods.find((method) => method.id === selectedPaymentMethod)?.label || selectedPaymentMethod,
        amount: normalizedAmount
      });

      return next;
    });

    setPaymentAmount("");

    api
      .post(`/operations/orders/${selectedTableId}/payments`, {
        method: selectedPaymentMethod,
        label: paymentMethods.find((method) => method.id === selectedPaymentMethod)?.label || selectedPaymentMethod,
        amount: rawAmount,
        actorName: "Cashier Anita",
        actorRole: "Cashier"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrderMap({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});
  }

  function fillRemainingAmount() {
    if (currentFinancials.remainingAmount <= 0 || currentOrder.isClosed || currentOrder.voidRequested || closingLocked) {
      return;
    }

    setPaymentAmount(currentFinancials.remainingAmount.toFixed(2));
  }

  function applyDiscount() {
    if (currentOrder.items.length === 0 || currentOrder.isClosed || currentOrder.voidRequested || closingLocked) {
      return;
    }

    const nextDiscount = Number(discountInput) || 0;
    const cashierLimitAmount = currentFinancials.subtotal * (cashierDiscountLimitPercent / 100);
    const requiresOverride = nextDiscount > cashierLimitAmount;

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[selectedTableId].discountAmount = Math.max(nextDiscount, 0);
      next[selectedTableId].discountOverrideRequested = requiresOverride;
      next[selectedTableId].discountApprovalStatus = requiresOverride ? "Manager/Owner approval pending" : "Within cashier 5% limit";
      next[selectedTableId].discountApprovedBy = requiresOverride ? "Pending manager" : "Not needed";

      if (requiresOverride) {
        next[selectedTableId].notes = `Discount above ${cashierDiscountLimitPercent}% needs manager/owner approval`;
        appendAlert(next[selectedTableId], `Discount above ${cashierDiscountLimitPercent}% requested`);
        appendAudit(next[selectedTableId], buildAuditEntry("Discount override requested", "Cashier Anita", "Now"));
      }
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        next[selectedTableId].discountAmount = Math.max(nextDiscount, 0);
        next[selectedTableId].discountOverrideRequested = requiresOverride;
        next[selectedTableId].discountApprovalStatus = requiresOverride ? "Manager/Owner approval pending" : "Within cashier 5% limit";
        next[selectedTableId].discountApprovedBy = requiresOverride ? "Pending manager" : "Not needed";

        if (requiresOverride) {
          next[selectedTableId].notes = `Discount above ${cashierDiscountLimitPercent}% needs manager/owner approval`;
          appendAlert(next[selectedTableId], `Discount above ${cashierDiscountLimitPercent}% requested`);
          appendAudit(next[selectedTableId], buildAuditEntry("Discount override requested", "Cashier Anita", "Now"));
        }
      }
      return next;
    });
  }

  function approveDiscountOverride() {
    if (!currentOrder.discountOverrideRequested || closingLocked) {
      return;
    }
    setApprovalModal({
      type: "discount",
      approverRole: "Manager",
      otp: "",
      error: ""
    });
  }

  function confirmDiscountApproval(approverLabel) {
    setOrdersByTable((current) => {
      const next = structuredClone(current);
      finalizeDiscountApproval(next[selectedTableId], approverLabel);
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        finalizeDiscountApproval(next[selectedTableId], approverLabel);
      }
      return next;
    });

    api
      .post(`/operations/orders/${selectedTableId}/discount-approval`, {
        actorRole: approvalModal.approverRole,
        otpVerified: true
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrderMap({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});
  }

  function toggleServiceCharge() {
    if (currentOrder.isClosed || currentOrder.voidRequested || closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[selectedTableId].serviceChargeEnabled = !next[selectedTableId].serviceChargeEnabled;
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        next[selectedTableId].serviceChargeEnabled = !next[selectedTableId].serviceChargeEnabled;
      }
      return next;
    });
  }

  function markPrinted(printMode) {
    if (currentOrder.items.length === 0 || closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      order.printCount += 1;
      order.lastPrintLabel = printMode === "reprint" ? "Reprinted just now" : "Printed just now";

      if (printMode === "reprint") {
        order.reprintReason = selectedReprintReason;
        order.reprintApprovedBy = "Manager Placeholder";
        appendReprintLog(order, "Manager Placeholder", selectedReprintReason);
      }

      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        next[selectedTableId].lastPrintLabel = printMode === "reprint" ? "Reprinted just now" : "Printed just now";
        if (printMode === "reprint") {
          next[selectedTableId].reprintReason = selectedReprintReason;
          next[selectedTableId].reprintApprovedBy = "Manager Placeholder";
          appendReprintLog(next[selectedTableId], "Manager Placeholder", selectedReprintReason);
          appendAudit(next[selectedTableId], buildAuditEntry("Bill reprinted", "Cashier Anita", "Now"));
        }
      }
      return next;
    });

    if (printMode === "reprint") {
      api
        .post(`/operations/orders/${selectedTableId}/reprint`, {
          reason: selectedReprintReason,
          actorName: "Cashier Anita",
          actorRole: "Manager"
        })
        .then((nextOrder) => {
          setOrdersByTable((current) =>
            normalizeOrderMap({
              ...current,
              [selectedTableId]: nextOrder
            })
          );
        })
        .catch(() => {});
    }
  }

  function requestVoid() {
    if (currentOrder.items.length === 0 || currentOrder.isClosed || closingLocked) {
      return;
    }

    const requiresOtpApproval = currentFinancials.total > cashierVoidLimitAmount;

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      order.voidReason = selectedVoidReason;

      if (requiresOtpApproval) {
        order.voidRequested = true;
        order.voidApprovedBy = "Pending OTP";
        order.notes = "Void above cashier limit needs manager/owner OTP approval";
        appendAlert(order, `Void above Rs ${cashierVoidLimitAmount} requested`);
        appendAudit(order, buildAuditEntry("Void requested", "Cashier Anita", "Now"));
      } else {
        finalizeVoidApproval(order, "Cashier Anita");
      }
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        next[selectedTableId].voidReason = selectedVoidReason;

        if (requiresOtpApproval) {
          next[selectedTableId].voidRequested = true;
          next[selectedTableId].voidApprovedBy = "Pending OTP";
          next[selectedTableId].notes = "Void above cashier limit needs manager/owner OTP approval";
          appendAlert(next[selectedTableId], `Void above Rs ${cashierVoidLimitAmount} requested`);
          appendAudit(next[selectedTableId], buildAuditEntry("Void requested", "Cashier Anita", "Now"));
        } else {
          finalizeVoidApproval(next[selectedTableId], "Cashier Anita");
        }
      }
      return next;
    });

    if (requiresOtpApproval) {
      api
        .post(`/operations/orders/${selectedTableId}/void-request`, {
          reason: selectedVoidReason,
          actorName: "Cashier Anita",
          actorRole: "Cashier"
        })
        .then((nextOrder) => {
          setOrdersByTable((current) =>
            normalizeOrderMap({
              ...current,
              [selectedTableId]: nextOrder
            })
          );
        })
        .catch(() => {});
    }
  }

  function approveVoid() {
    if (!currentOrder.voidRequested || closingLocked) {
      return;
    }
    setApprovalModal({
      type: "void",
      approverRole: "Manager",
      otp: "",
      error: ""
    });
  }

  function confirmVoidApproval(approverLabel) {
    setOrdersByTable((current) => {
      const next = structuredClone(current);
      finalizeVoidApproval(next[selectedTableId], approverLabel);
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        finalizeVoidApproval(next[selectedTableId], approverLabel);
      }
      return next;
    });

    api
      .post(`/operations/orders/${selectedTableId}/void-approval`, {
        actorRole: approvalModal.approverRole,
        otpVerified: true
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrderMap({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});
  }

  function closeOrder() {
    if (!canCloseOrder || closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      order.isClosed = true;
      order.closedAt = "Closed just now";
      order.notes = "Invoice ready and settled";
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        next[selectedTableId].billRequested = false;
        next[selectedTableId].notes = "Invoice ready and settled";
        appendAudit(next[selectedTableId], buildAuditEntry("Order settled", "Cashier Anita", "Now"));
      }
      return next;
    });

    api
      .post(`/operations/orders/${selectedTableId}/close`, {
        actorName: "Cashier Anita",
        actorRole: "Cashier"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrderMap({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});
  }

  function moveCurrentTable() {
    if (!cashierTableSetupEnabled || closingLocked) {
      return;
    }

    const targetTableId = findNextEmptyTableId(selectedTableId, ordersByTable, tableAreas);
    if (!targetTableId) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const movingOrder = structuredClone(next[selectedTableId]);
      const targetSeed = next[targetTableId];

      next[targetTableId] = {
        ...movingOrder,
        tableId: targetTableId,
        tableNumber: targetSeed.tableNumber,
        areaName: targetSeed.areaName,
        notes: `Moved from ${movingOrder.tableNumber} to ${targetSeed.tableNumber}`
      };
      next[selectedTableId] = {
        ...targetSeed,
        items: [],
        guests: 0,
        billRequested: false,
        billRequestedAt: null,
        notes: "Ready for new guests",
        auditTrail: []
      };

      return next;
    });

    api
      .post(`/operations/orders/${selectedTableId}/move-table`, {
        targetTableId,
        actorName: "Cashier Anita",
        actorRole: "Cashier"
      })
      .then((movedOrder) => {
        setOrdersByTable((current) =>
          normalizeOrderMap({
            ...current,
            [targetTableId]: movedOrder
          })
        );
      })
      .catch(() => {});

    selectTable(targetTableId);
  }

  function handleCreateDemoOrder() {
    const result = createDemoOrder();

    if (result.tableId) {
      selectTable(result.tableId);
    }

    api
      .post("/operations/orders/demo", {
        actorName: "Cashier Anita",
        actorRole: "Cashier"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrderMap({
            ...current,
            [nextOrder.tableId]: nextOrder
          })
        );
        selectTable(nextOrder.tableId);
      })
      .catch(() => {});
  }

  function closeApprovalModal() {
    setApprovalModal({
      type: null,
      approverRole: "Manager",
      otp: "",
      error: ""
    });
  }

  function submitApprovalOtp() {
    if (approvalModal.otp !== "2468") {
      setApprovalModal((current) => ({
        ...current,
        error: "Enter valid OTP"
      }));
      return;
    }

    const approverLabel = approvalModal.approverRole === "Owner" ? "Owner OTP" : "Manager OTP";

    if (approvalModal.type === "discount") {
      confirmDiscountApproval(approverLabel);
    }

    if (approvalModal.type === "void") {
      confirmVoidApproval(approverLabel);
    }

    closeApprovalModal();
  }

  return (
    <div className="pos-shell">
      <header className="pos-topbar">
        <div>
          <p className="eyebrow">Operations POS</p>
          <h1>Service Floor</h1>
        </div>

        <div className="service-mode-group" role="tablist" aria-label="Service mode">
          {serviceModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`mode-chip ${mode.active ? "active" : ""}`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <button type="button" className="ghost-btn" onClick={handleCreateDemoOrder}>
          Create Demo Order
        </button>
      </header>

      <section className="pos-grid">
        <aside className="pos-panel floor-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Area and Table</p>
              <h2>Select Table</h2>
            </div>
            <button type="button" className="ghost-btn" disabled={!cashierTableSetupEnabled} onClick={moveCurrentTable}>
              {cashierTableSetupEnabled ? "Move Table" : "Table Setup Locked"}
            </button>
          </div>

          {tableAreas.map((area) => (
            <section key={area.id} className="area-section">
              <div className="area-header">
                <h3>{area.name}</h3>
                <span>{area.tables.length} tables</span>
              </div>

              <div className="table-grid">
                {area.tables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    className={tableClass(table.status, table.id === selectedTableId)}
                    onClick={() => selectTable(table.id)}
                  >
                    <strong>{table.number}</strong>
                    <span>{table.seats} seats</span>
                    <span>{table.guests ? `${table.guests} guests` : "Open table"}</span>
                    <em>{table.captain}</em>
                    <em>
                      {(table.seatLabels || []).slice(0, 3).join(", ")}
                      {(table.seatLabels || []).length > 3 ? " ..." : ""}
                    </em>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <main className="pos-panel order-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Running Order</p>
              <h2>
                {currentOrder.areaName} • {currentOrder.tableNumber}
              </h2>
            </div>
            <div className="order-meta">
              <span>Captain: {currentOrder.captain}</span>
              <span>Guests: {currentOrder.guests}</span>
              <span>Seats: {(currentOrder.seatLabels || []).length}</span>
            </div>
          </div>

          <div className={`order-note-banner ${currentOrder.isClosed ? "closed" : ""} ${currentOrder.voidRequested ? "void" : ""}`}>
            {currentOrder.voidRequested ? "Void requested • Manager/Owner OTP approval pending" : currentOrder.isClosed ? "Order closed • Invoice ready" : currentOrder.notes}
          </div>

          {closingLocked ? <div className="order-note-banner closed">Daily closing approved • Risky cashier actions are locked</div> : null}

          {billRequestedOrders.length > 0 ? (
            <div className="order-note-banner">
              Bill Requests: {billRequestedOrders.map((order) => order.tableNumber).join(", ")}
            </div>
          ) : null}

          <div className="bill-request-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Audit Trail</p>
                <h3>Order Activity</h3>
              </div>
            </div>

            <div className="closed-history-list">
              {(currentOrder.auditTrail || []).length === 0 ? (
                <div className="empty-order-card">No activity yet. Actions from captain, kitchen, waiter, and cashier will appear here.</div>
              ) : (
                currentOrder.auditTrail.map((entry) => (
                  <div key={entry.id} className="history-card">
                    <div>
                      <strong>{entry.label}</strong>
                      <span>{entry.actor}</span>
                    </div>
                    <div className="history-meta">
                      <span>{entry.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="order-lines">
            {currentOrder.items.length === 0 ? (
              <div className="empty-order-card">No items yet. Pick items from the menu to start this order.</div>
            ) : (
              currentOrder.items.map((item) => (
                <article
                  key={item.id}
                  className={`order-line-card ${item.id === selectedLineId ? "selected" : ""}`}
                  onClick={() => setSelectedLineId(item.id)}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      Qty {item.quantity} • {currency(item.price)}
                    </span>
                    <p>{item.seatLabel || "Whole table"}</p>
                    <p>{item.note}</p>
                  </div>
                  <div className="line-actions">
                    <span className={`kot-status ${item.sentToKot ? "sent" : "pending"}`}>
                      {item.sentToKot ? "KOT Sent" : "Pending KOT"}
                    </span>
                    <button type="button" className="ghost-chip">
                      Edit
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="kitchen-note-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Kitchen Instructions</p>
                <h3>Add Instruction</h3>
              </div>
            </div>

            <div className="instruction-chip-group">
              {kitchenInstructions.map((instruction) => (
                <button
                  key={instruction}
                  type="button"
                  className="instruction-chip"
                  onClick={() => applyInstruction(instruction)}
                  disabled={currentOrder.isClosed || currentOrder.voidRequested || closingLocked}
                >
                  {instruction}
                </button>
              ))}
            </div>
          </div>

          <div className="billing-rules-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Bill Controls</p>
                <h3>Discount, Service Charge, and Round-Off</h3>
              </div>
            </div>

            <div className="billing-rules-grid">
              <label className="payment-input-group">
                <span>Bill Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountInput}
                  onChange={(event) => setDiscountInput(event.target.value)}
                  placeholder="Enter discount"
                />
              </label>
              <button type="button" className="secondary-btn" onClick={applyDiscount} disabled={currentOrder.isClosed || currentOrder.voidRequested || closingLocked}>
                Apply Discount
              </button>
              <button type="button" className={`ghost-btn ${currentOrder.serviceChargeEnabled ? "toggle-on" : ""}`} onClick={toggleServiceCharge} disabled={currentOrder.isClosed || currentOrder.voidRequested || closingLocked}>
                {currentOrder.serviceChargeEnabled ? "Service Charge On" : "Enable Service Charge"}
              </button>
            </div>
            
            <div className="bill-adjustment-list">
              <div className="payment-row">
                <span>Discount Applied</span>
                <strong>{currency(currentFinancials.discountAmount)}</strong>
              </div>
              <div className="payment-row">
                <span>Discount Approval</span>
                <strong>{currentOrder.discountApprovalStatus}</strong>
              </div>
              <div className="payment-row">
                <span>Approved By</span>
                <strong>{currentOrder.discountApprovedBy}</strong>
              </div>
              <div className="payment-row">
                <span>Service Charge</span>
                <strong>{currency(currentFinancials.serviceCharge)}</strong>
              </div>
              <div className="payment-row">
                <span>Round-Off</span>
                <strong>{currency(currentFinancials.roundOff)}</strong>
              </div>
            </div>

            <div className="approval-actions">
              <button type="button" className="ghost-btn" onClick={approveDiscountOverride} disabled={!currentOrder.discountOverrideRequested || closingLocked}>
                Manager/Owner Approve Discount
              </button>
            </div>

          </div>

          <div className="settlement-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Cashier Settlement</p>
                <h3>Split Bill and Collect Payment</h3>
              </div>
              <span className={`settlement-state ${currentOrder.isClosed ? "closed" : currentFinancials.remainingAmount === 0 && currentFinancials.total > 0 ? "paid" : "open"}`}>
                {currentOrder.isClosed ? "Invoice Ready" : currentFinancials.remainingAmount === 0 && currentFinancials.total > 0 ? "Paid" : "Open Bill"}
              </span>
            </div>

            <div className="settlement-summary">
              <div>
                <span>Split Count</span>
                <strong>{currentOrder.billSplitCount} bill(s)</strong>
              </div>
              <div>
                <span>Each Split</span>
                <strong>{currency(currentFinancials.splitAmount)}</strong>
              </div>
              <div>
                <span>Paid</span>
                <strong>{currency(currentFinancials.paidAmount)}</strong>
              </div>
              <div>
                <span>Balance</span>
                <strong>{currency(currentFinancials.remainingAmount)}</strong>
              </div>
            </div>

            <div className="payment-method-row" role="tablist" aria-label="Payment methods">
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  className={`category-pill ${selectedPaymentMethod === method.id ? "active" : ""}`}
                  onClick={() => setSelectedPaymentMethod(method.id)}
                >
                  {method.label}
                </button>
              ))}
            </div>

            <div className="payment-entry-row">
              <label className="payment-input-group">
                <span>Payment Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  placeholder="Enter amount"
                />
              </label>

              <button type="button" className="ghost-btn" onClick={fillRemainingAmount} disabled={currentFinancials.remainingAmount === 0 || currentOrder.isClosed || currentOrder.voidRequested || closingLocked}>
                Fill Balance
              </button>
              <button type="button" className="primary-btn" onClick={addPayment} disabled={currentOrder.isClosed || currentOrder.voidRequested || closingLocked}>
                Add Payment
              </button>
            </div>

            <div className="payment-list">
              {currentOrder.payments.length === 0 ? (
                <div className="empty-order-card">No payments added yet. Collect cash, UPI, or card to settle this order.</div>
              ) : (
                currentOrder.payments.map((payment) => (
                  <div key={payment.id} className="payment-row">
                    <span>{payment.label}</span>
                    <strong>{currency(payment.amount)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="approval-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Controls</p>
                <h3>Manager Control Rules</h3>
              </div>
            </div>

            <div className="approval-grid">
              <label className="payment-input-group">
                <span>Reprint Reason</span>
                <select value={selectedReprintReason} onChange={(event) => setSelectedReprintReason(event.target.value)}>
                  {reprintReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>

              <label className="payment-input-group">
                <span>Void Reason</span>
                <select value={selectedVoidReason} onChange={(event) => setSelectedVoidReason(event.target.value)}>
                  {voidReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="approval-actions">
              <button type="button" className="secondary-btn" onClick={requestVoid} disabled={currentOrder.isClosed || currentOrder.items.length === 0 || closingLocked}>
                Request Void
              </button>
              <button type="button" className="ghost-btn" onClick={approveVoid} disabled={!currentOrder.voidRequested || closingLocked}>
                Manager/Owner OTP Approve Void
              </button>
            </div>

            <div className="bill-adjustment-list">
              <div className="payment-row">
                <span>Reprint Approval</span>
                <strong>{currentOrder.reprintApprovedBy}</strong>
              </div>
              <div className="payment-row">
                <span>Void Approval</span>
                <strong>{currentOrder.voidApprovedBy}</strong>
              </div>
            </div>

            <div className="closed-history-list">
              {(currentOrder.controlAlerts || []).length === 0 ? (
                <div className="empty-order-card">No unauthorized actions right now. Control alerts will appear here.</div>
              ) : (
                currentOrder.controlAlerts.map((alert) => (
                  <div key={alert} className="alert-card">
                    <strong>Unauthorized Action Alert</strong>
                    <span>{alert}</span>
                  </div>
                ))
              )}
            </div>

            <div className="closed-history-list">
              {(currentOrder.deletedBillLog || []).length === 0 ? (
                <div className="empty-order-card">Deleted bill tracking is empty. Approved voids will appear here.</div>
              ) : (
                currentOrder.deletedBillLog.map((deletedBill) => (
                  <div key={deletedBill.id} className="history-card">
                    <div>
                      <strong>
                        Deleted Bill #{deletedBill.orderNumber}
                      </strong>
                      <span>
                        {deletedBill.tableNumber} • {deletedBill.reason}
                      </span>
                    </div>
                    <div className="history-meta">
                      <span>{deletedBill.approvedBy}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="order-footer">
            <div className="totals-card">
              <div>
                <span>Subtotal</span>
                <strong>{currency(currentFinancials.subtotal)}</strong>
              </div>
              <div>
                <span>Discount</span>
                <strong>{currency(currentFinancials.discountAmount)}</strong>
              </div>
              <div>
                <span>Service Charge</span>
                <strong>{currency(currentFinancials.serviceCharge)}</strong>
              </div>
              <div>
                <span>GST</span>
                <strong>{currency(currentFinancials.tax)}</strong>
              </div>
              <div>
                <span>Round-Off</span>
                <strong>{currency(currentFinancials.roundOff)}</strong>
              </div>
              <div className="total-row">
                <span>Total</span>
                <strong>{currency(currentFinancials.total)}</strong>
              </div>
            </div>

            <div className="footer-actions">
              <button type="button" className="secondary-btn" onClick={splitBill} disabled={closingLocked}>
                Split Bill
              </button>
              <button type="button" className="secondary-btn" onClick={closeOrder} disabled={!canCloseOrder || currentOrder.isClosed || closingLocked}>
                Close Order
              </button>
              <button type="button" className="primary-btn" onClick={sendKot} disabled={currentOrder.isClosed || currentOrder.voidRequested || closingLocked}>
                Send KOT
              </button>
            </div>
          </div>
        </main>

        {approvalModal.type ? (
          <div className="otp-modal-backdrop" role="presentation">
            <div className="otp-modal-card" role="dialog" aria-modal="true" aria-labelledby="otp-approval-title">
              <div className="panel-header compact">
                <div>
                  <p className="eyebrow">Approval Required</p>
                  <h3 id="otp-approval-title">
                    {approvalModal.type === "discount" ? "Discount OTP Approval" : "Void OTP Approval"}
                  </h3>
                </div>
                <span className="thermal-badge">
                  {approvalModal.type === "discount" ? "Discount Control" : "Void Control"}
                </span>
              </div>

              <p className="otp-modal-copy">
                {approvalModal.type === "discount"
                  ? "Discount above cashier limit needs manager or owner verification."
                  : `Void above Rs ${cashierVoidLimitAmount} needs manager or owner verification.`}
              </p>

              <div className="approval-grid">
                <label className="payment-input-group">
                  <span>Approver Role</span>
                  <select
                    value={approvalModal.approverRole}
                    onChange={(event) =>
                      setApprovalModal((current) => ({
                        ...current,
                        approverRole: event.target.value,
                        error: ""
                      }))
                    }
                  >
                    <option value="Manager">Manager</option>
                    <option value="Owner">Owner</option>
                  </select>
                </label>

                <div className="otp-meta-card">
                  <span>OTP Status</span>
                  <strong>{approvalModal.error ? "Invalid" : "Waiting"}</strong>
                  <small>Resend placeholder: 00:30</small>
                </div>
              </div>

              <label className="payment-input-group">
                <span>Enter OTP</span>
                <input
                  type="password"
                  value={approvalModal.otp}
                  onChange={(event) =>
                    setApprovalModal((current) => ({
                      ...current,
                      otp: event.target.value,
                      error: ""
                    }))
                  }
                  placeholder="Enter OTP"
                />
              </label>

              <div className="otp-boxes" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, index) => {
                  const character = approvalModal.otp[index] || "";
                  return (
                    <span key={index} className={`otp-box ${character ? "filled" : ""}`}>
                      {character ? "•" : ""}
                    </span>
                  );
                })}
              </div>

              {approvalModal.error ? <div className="order-note-banner void">{approvalModal.error}</div> : null}

              <div className="approval-actions">
                <button type="button" className="ghost-btn" onClick={closeApprovalModal}>
                  Cancel OTP
                </button>
                <button type="button" className="secondary-btn" onClick={submitApprovalOtp}>
                  Confirm OTP Approval
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <aside className="pos-panel menu-panel">
          <div className="bill-request-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Cashier Queue</p>
                <h3>Bill Requested</h3>
              </div>
              <span className="thermal-badge">{billRequestedOrders.length} tables</span>
            </div>

            <div className="closed-history-list">
              {billRequestedOrders.length === 0 ? (
                <div className="empty-order-card">No bill requests right now. Requested tables will appear here for cashier action.</div>
              ) : (
                billRequestedOrders.map((order) => (
                  <button
                    key={order.tableId}
                    type="button"
                    className={`history-card ${order.tableId === selectedTableId ? "selected" : ""}`}
                    onClick={() => selectTable(order.tableId)}
                  >
                    <div>
                      <strong>
                        {order.tableNumber} • #{order.orderNumber}
                      </strong>
                      <span>{order.billRequestedAt || "Requested from service floor"}</span>
                    </div>
                    <div className="history-meta">
                      <span>{order.assignedWaiter}</span>
                      <span>Open Bill</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="panel-header">
            <div>
              <p className="eyebrow">Menu</p>
              <h2>Add Items</h2>
            </div>
            <button type="button" className="ghost-btn">
              Search
            </button>
          </div>

          <div className="category-strip">
            {posCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`category-pill ${category.id === selectedCategoryId ? "active" : ""}`}
                onClick={() => setSelectedCategoryId(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          <div className="menu-item-stack">
              {visibleMenuItems.map((item) => (
                (() => {
                  const inventoryItem = diningInventoryById[item.id];
                  const isTracked = inventoryItem?.trackingEnabled !== false;
                  const isSoldOut = menuControls[item.id]?.salesAvailability === "Sold Out";
                  const isBlocked = isSoldOut || (isTracked && inventoryItem?.status === "Out of Stock");
                  const statusLabel = isSoldOut ? "Sold Out" : isTracked ? inventoryItem?.status || "Available" : "Not tracked";
                  const helperLabel = isBlocked ? "Out of stock" : "";

                  return (
              <button
                key={item.id}
                type="button"
                className="menu-pick-card"
                onClick={() => addItem(item)}
                disabled={
                  currentOrder.isClosed ||
                  currentOrder.voidRequested ||
                  closingLocked ||
                  isBlocked
                }
              >
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.station}</span>
                  <span>{statusLabel}</span>
                </div>
                <div>
                  <strong>{currency(item.price)}</strong>
                  <span>{helperLabel}</span>
                </div>
              </button>
                  );
                })()
            ))}
          </div>

          <div className="thermal-preview-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Receipt</p>
                <h3>3-inch Thermal Preview</h3>
              </div>
              <span className="thermal-badge">80mm</span>
            </div>

            <div className="thermal-paper" aria-label="Bill preview">
              <div className="thermal-header">
                <strong>{posBusinessProfile.name}</strong>
                <span>{posBusinessProfile.address}</span>
                <span>GSTIN {posBusinessProfile.gstin}</span>
              </div>

              <div className="thermal-meta">
                <div>
                  <span>Bill</span>
                  <strong>#{currentOrder.orderNumber}</strong>
                </div>
                <div>
                  <span>Table</span>
                  <strong>{currentOrder.tableNumber}</strong>
                </div>
                <div>
                  <span>Cashier</span>
                  <strong>{currentOrder.cashierName}</strong>
                </div>
                <div>
                  <span>Time</span>
                  <strong>{currentOrder.billTimestamp}</strong>
                </div>
                <div>
                  <span>Captain</span>
                  <strong>{currentOrder.captain}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{currentOrder.voidRequested ? "Void Requested" : currentOrder.isClosed ? "Closed" : "Open"}</strong>
                </div>
              </div>

              <div className="thermal-items">
                {currentOrder.items.length === 0 ? (
                  <div className="thermal-empty">Receipt preview will appear after items are added.</div>
                ) : (
                  currentOrder.items.map((item) => (
                    <div key={item.id} className="thermal-line">
                      <div>
                        <strong>{item.name}</strong>
                        <span>
                          {item.quantity} x {currency(item.price)}
                        </span>
                        <span>{item.note}</span>
                      </div>
                      <strong>{currency(item.quantity * item.price)}</strong>
                    </div>
                  ))
                )}
              </div>

              <div className="thermal-totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{currency(currentFinancials.subtotal)}</strong>
                </div>
                <div>
                  <span>Discount</span>
                  <strong>{currency(currentFinancials.discountAmount)}</strong>
                </div>
                <div>
                  <span>Service Charge</span>
                  <strong>{currency(currentFinancials.serviceCharge)}</strong>
                </div>
                <div>
                  <span>GST</span>
                  <strong>{currency(currentFinancials.tax)}</strong>
                </div>
                <div>
                  <span>Round-Off</span>
                  <strong>{currency(currentFinancials.roundOff)}</strong>
                </div>
                <div className="thermal-grand-total">
                  <span>Total</span>
                  <strong>{currency(currentFinancials.total)}</strong>
                </div>
              </div>

              <div className="thermal-payments">
                <strong>Payments</strong>
                {currentOrder.payments.length === 0 ? (
                  <span>Pending settlement</span>
                ) : (
                  currentOrder.payments.map((payment) => (
                    <div key={payment.id} className="thermal-payment-line">
                      <span>{payment.label}</span>
                      <strong>{currency(payment.amount)}</strong>
                    </div>
                  ))
                )}
                <div className="thermal-payment-line">
                  <span>Balance</span>
                  <strong>{currency(currentFinancials.remainingAmount)}</strong>
                </div>
              </div>

              <div className="thermal-payments">
                <strong>Control Log</strong>
                <div className="thermal-payment-line">
                  <span>Reprint Reason</span>
                  <strong>{currentOrder.reprintReason}</strong>
                </div>
                <div className="thermal-payment-line">
                  <span>Reprint Approval</span>
                  <strong>{currentOrder.reprintApprovedBy}</strong>
                </div>
                <div className="thermal-payment-line">
                  <span>Void Reason</span>
                  <strong>{currentOrder.voidReason}</strong>
                </div>
                <div className="thermal-payment-line">
                  <span>Void Approval</span>
                  <strong>{currentOrder.voidApprovedBy}</strong>
                </div>
              </div>

              <div className="thermal-footer">
                <span>{currentOrder.lastPrintLabel}</span>
                <span>{currentOrder.printCount > 1 ? "Reprint copy" : "Customer copy"}</span>
              </div>
            </div>

            <div className="thermal-actions">
              <button type="button" className="secondary-btn" onClick={() => markPrinted("print")} disabled={currentOrder.items.length === 0 || closingLocked}>
                Print Bill
              </button>
              <button type="button" className="ghost-btn" onClick={() => markPrinted("reprint")} disabled={!currentOrder.isClosed || closingLocked}>
                Reprint Last Bill
              </button>
            </div>
          </div>

          <div className="pos-side-note">
            <strong>KOT Flow</strong>
            <span>Unsynced items stay pending until `Send KOT` is pressed.</span>
          </div>

          <div className="closed-history-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Closed Bills</p>
                <h3>Today History</h3>
              </div>
            </div>

            <div className="closed-history-list">
              {closedOrders.length === 0 ? (
                <div className="empty-order-card">No closed bills yet. Closed orders will appear here for quick reprint.</div>
              ) : (
                closedOrders.map((order) => {
                  const orderFinancials = getOrderFinancials(order);

                  return (
                    <button
                      key={order.orderNumber}
                      type="button"
                      className={`history-card ${order.tableId === selectedTableId ? "selected" : ""}`}
                      onClick={() => selectTable(order.tableId)}
                    >
                      <div>
                        <strong>
                          {order.tableNumber} • #{order.orderNumber}
                        </strong>
                        <span>{order.closedAt}</span>
                      </div>
                      <div className="history-meta">
                        <span>{currency(orderFinancials.total)}</span>
                        <span>{order.printCount > 1 ? "Reprinted" : "Ready"}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
