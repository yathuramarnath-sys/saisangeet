import { useMemo, useState } from "react";

import { areas, categories, kitchenInstructions, menuItems, serviceModes, tableOrders } from "./data/pos.seed";

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

function buildInitialOrders() {
  const orders = JSON.parse(JSON.stringify(tableOrders));

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

  const currentOrder = ordersByTable[selectedTableId];
  const currentFinancials = getOrderFinancials(currentOrder);

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
    if (currentOrder.isClosed || currentOrder.voidRequested) {
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
    if (!selectedLineId || currentOrder.isClosed || currentOrder.voidRequested) {
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
    if (currentOrder.isClosed || currentOrder.voidRequested) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[selectedTableId].items.forEach((item) => {
        item.sentToKot = true;
      });
      return next;
    });
  }

  function splitBill() {
    if (currentOrder.items.length === 0 || currentOrder.isClosed || currentOrder.voidRequested) {
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

    if (!rawAmount || rawAmount < 0.01 || currentOrder.isClosed || currentOrder.items.length === 0 || currentOrder.voidRequested) {
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
    if (currentFinancials.remainingAmount <= 0 || currentOrder.isClosed || currentOrder.voidRequested) {
      return;
    }

    setPaymentAmount(currentFinancials.remainingAmount.toFixed(2));
  }

  function applyDiscount() {
    if (currentOrder.items.length === 0 || currentOrder.isClosed || currentOrder.voidRequested) {
      return;
    }

    const nextDiscount = Number(discountInput) || 0;

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[selectedTableId].discountAmount = Math.max(nextDiscount, 0);
      return next;
    });
  }

  function toggleServiceCharge() {
    if (currentOrder.isClosed || currentOrder.voidRequested) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[selectedTableId].serviceChargeEnabled = !next[selectedTableId].serviceChargeEnabled;
      return next;
    });
  }

  function markPrinted(printMode) {
    if (currentOrder.items.length === 0) {
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
  }

  function requestVoid() {
    if (currentOrder.items.length === 0 || currentOrder.isClosed) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      order.voidRequested = true;
      order.voidReason = selectedVoidReason;
      order.voidApprovedBy = "Pending manager";
      order.notes = "Void requested";
      return next;
    });
  }

  function approveVoid() {
    if (!currentOrder.voidRequested) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      order.voidApprovedBy = "Manager Placeholder";
      order.notes = "Void approved placeholder";
      return next;
    });
  }

  function closeOrder() {
    if (!canCloseOrder) {
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
      </header>

      <section className="pos-grid">
        <aside className="pos-panel floor-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Area and Table</p>
              <h2>Select Table</h2>
            </div>
            <button type="button" className="ghost-btn">
              Move Table
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
                  disabled={currentOrder.isClosed || currentOrder.voidRequested}
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
              <button type="button" className="secondary-btn" onClick={applyDiscount} disabled={currentOrder.isClosed || currentOrder.voidRequested}>
                Apply Discount
              </button>
              <button type="button" className={`ghost-btn ${currentOrder.serviceChargeEnabled ? "toggle-on" : ""}`} onClick={toggleServiceCharge} disabled={currentOrder.isClosed || currentOrder.voidRequested}>
                {currentOrder.serviceChargeEnabled ? "Service Charge On" : "Enable Service Charge"}
              </button>
            </div>

            <div className="bill-adjustment-list">
              <div className="payment-row">
                <span>Discount Applied</span>
                <strong>{currency(currentFinancials.discountAmount)}</strong>
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

              <button type="button" className="ghost-btn" onClick={fillRemainingAmount} disabled={currentFinancials.remainingAmount === 0 || currentOrder.isClosed || currentOrder.voidRequested}>
                Fill Balance
              </button>
              <button type="button" className="primary-btn" onClick={addPayment} disabled={currentOrder.isClosed || currentOrder.voidRequested}>
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
                <h3>Reprint and Void Approval</h3>
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
              <button type="button" className="secondary-btn" onClick={requestVoid} disabled={currentOrder.isClosed || currentOrder.items.length === 0}>
                Request Void
              </button>
              <button type="button" className="ghost-btn" onClick={approveVoid} disabled={!currentOrder.voidRequested}>
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
              <button type="button" className="secondary-btn" onClick={splitBill}>
                Split Bill
              </button>
              <button type="button" className="secondary-btn" onClick={closeOrder} disabled={!canCloseOrder || currentOrder.isClosed}>
                Close Order
              </button>
              <button type="button" className="primary-btn" onClick={sendKot} disabled={currentOrder.isClosed || currentOrder.voidRequested}>
                Send KOT
              </button>
            </div>
          </div>
        </main>

        <aside className="pos-panel menu-panel">
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
                disabled={currentOrder.isClosed || currentOrder.voidRequested}
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
              <button type="button" className="secondary-btn" onClick={() => markPrinted("print")} disabled={currentOrder.items.length === 0}>
                Print Bill
              </button>
              <button type="button" className="ghost-btn" onClick={() => markPrinted("reprint")} disabled={!currentOrder.isClosed}>
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
