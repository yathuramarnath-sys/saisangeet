import { useEffect, useMemo, useState } from "react";

import { areas, categories, kitchenInstructions, menuItems, serviceModes, tableOrders } from "./data/pos.seed";
import {
  buildAuditEntry,
  createDemoOrder,
  loadRestaurantState,
  subscribeRestaurantState,
  updateRestaurantOrders
} from "../../../packages/shared-types/src/mockRestaurantStore.js";

const paymentMethods = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" }
];

const reprintReasons = ["Customer copy", "Paper jam", "Audit copy"];
const voidReasons = ["Wrong table", "Duplicate bill", "Manager cancellation"];

const businessProfile = {
  name: "Saisangeet",
  address: "Thyagaraya Nagar, Chennai",
  gstin: "33ABCDE1234F1Z5"
};

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

export function App() {
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

  const currentOrder = ordersByTable[selectedTableId];
  const currentFinancials = getOrderFinancials(currentOrder);
  const cashierTableSetupEnabled = permissionPolicies["cashier-table-setup"] !== false;

  const visibleMenuItems = useMemo(
    () => menuItems.filter((item) => item.categoryId === selectedCategoryId),
    [selectedCategoryId]
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
        id: `line-${Date.now()}-${menuItem.id}`,
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
  }

  function sendKot() {
    if (currentOrder.isClosed || currentOrder.voidRequested || closingLocked) {
      return;
    }

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
    const requiresOverride = nextDiscount > 100;

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[selectedTableId].discountAmount = Math.max(nextDiscount, 0);
      next[selectedTableId].discountOverrideRequested = requiresOverride;
      next[selectedTableId].discountApprovalStatus = requiresOverride ? "Manager approval pending" : "Within limit";
      next[selectedTableId].discountApprovedBy = requiresOverride ? "Pending manager" : "Not needed";

      if (requiresOverride) {
        next[selectedTableId].notes = "High discount needs manager approval";
        appendAlert(next[selectedTableId], "High discount override requested");
        appendAudit(next[selectedTableId], buildAuditEntry("Discount override requested", "Cashier Anita", "Now"));
      }
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        next[selectedTableId].discountAmount = Math.max(nextDiscount, 0);
        next[selectedTableId].discountOverrideRequested = requiresOverride;
        next[selectedTableId].discountApprovalStatus = requiresOverride ? "Manager approval pending" : "Within limit";
        next[selectedTableId].discountApprovedBy = requiresOverride ? "Pending manager" : "Not needed";

        if (requiresOverride) {
          next[selectedTableId].notes = "High discount needs manager approval";
          appendAlert(next[selectedTableId], "High discount override requested");
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

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[selectedTableId].discountOverrideRequested = false;
      next[selectedTableId].discountApprovalStatus = "Approved";
      next[selectedTableId].discountApprovedBy = "Manager Rakesh";
      next[selectedTableId].notes = "Discount approved by manager";
      appendAudit(next[selectedTableId], buildAuditEntry("Discount approved", "Manager Rakesh", "Now"));
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        next[selectedTableId].discountOverrideRequested = false;
        next[selectedTableId].discountApprovalStatus = "Approved";
        next[selectedTableId].discountApprovedBy = "Manager Rakesh";
        next[selectedTableId].notes = "Discount approved by manager";
        appendAudit(next[selectedTableId], buildAuditEntry("Discount approved", "Manager Rakesh", "Now"));
      }
      return next;
    });
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
          appendAudit(next[selectedTableId], buildAuditEntry("Bill reprinted", "Cashier Anita", "Now"));
        }
      }
      return next;
    });
  }

  function requestVoid() {
    if (currentOrder.items.length === 0 || currentOrder.isClosed || closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      order.voidRequested = true;
      order.voidReason = selectedVoidReason;
      order.voidApprovedBy = "Pending manager";
      order.notes = "Void requested";
      appendAlert(order, `Void requested: ${selectedVoidReason}`);
      appendAudit(order, buildAuditEntry("Void requested", "Cashier Anita", "Now"));
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        next[selectedTableId].voidRequested = true;
        next[selectedTableId].voidReason = selectedVoidReason;
        next[selectedTableId].voidApprovedBy = "Pending manager";
        next[selectedTableId].notes = "Void requested";
        appendAlert(next[selectedTableId], `Void requested: ${selectedVoidReason}`);
        appendAudit(next[selectedTableId], buildAuditEntry("Void requested", "Cashier Anita", "Now"));
      }
      return next;
    });
  }

  function approveVoid() {
    if (!currentOrder.voidRequested || closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      order.voidApprovedBy = "Manager Placeholder";
      order.notes = "Void approved placeholder";
      appendDeletedBill(order);
      appendAudit(order, buildAuditEntry("Void approved", "Manager Placeholder", "Now"));
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      if (next[selectedTableId]) {
        next[selectedTableId].voidApprovedBy = "Manager Placeholder";
        next[selectedTableId].notes = "Void approved placeholder";
        appendDeletedBill(next[selectedTableId]);
        appendAudit(next[selectedTableId], buildAuditEntry("Void approved", "Manager Placeholder", "Now"));
      }
      return next;
    });
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
  }

  function handleCreateDemoOrder() {
    const result = createDemoOrder();

    if (result.tableId) {
      selectTable(result.tableId);
    }
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
            <button type="button" className="ghost-btn" disabled={!cashierTableSetupEnabled}>
              {cashierTableSetupEnabled ? "Move Table" : "Table Setup Locked"}
            </button>
          </div>

          {areas.map((area) => (
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
            </div>
          </div>

          <div className={`order-note-banner ${currentOrder.isClosed ? "closed" : ""} ${currentOrder.voidRequested ? "void" : ""}`}>
            {currentOrder.voidRequested ? "Void requested • Manager approval pending" : currentOrder.isClosed ? "Order closed • Invoice ready" : currentOrder.notes}
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
                Manager Approve Discount
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
                Manager Approve Void
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
            {categories.map((category) => (
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
              <button
                key={item.id}
                type="button"
                className="menu-pick-card"
                onClick={() => addItem(item)}
                disabled={currentOrder.isClosed || currentOrder.voidRequested || closingLocked}
              >
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.station}</span>
                </div>
                <strong>{currency(item.price)}</strong>
              </button>
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
                <strong>{businessProfile.name}</strong>
                <span>{businessProfile.address}</span>
                <span>GSTIN {businessProfile.gstin}</span>
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
