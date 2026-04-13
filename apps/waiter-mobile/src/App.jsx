import { useEffect, useMemo, useState } from "react";

import {
  mobileAreas,
  mobileCategories,
  mobileInstructions,
  mobileMenuItems,
  mobileOrders,
  staffProfiles,
  waiterTeam
} from "./data/mobile.seed";
import {
  buildAuditEntry,
  createDemoOrder,
  loadRestaurantState,
  subscribeRestaurantState,
  updateRestaurantOrders
} from "../../../packages/shared-types/src/mockRestaurantStore.js";
import { api } from "./lib/api";

function currency(value) {
  return `Rs ${value.toFixed(2)}`;
}

function buildInitialOrders() {
  const sharedState = loadRestaurantState();
  return JSON.parse(JSON.stringify({ ...mobileOrders, ...sharedState.orders }));
}

function normalizeOrders(orders) {
  const nextOrders = structuredClone(orders);

  Object.values(nextOrders).forEach((order) => {
    order.items = order.items || [];
    order.auditTrail = order.auditTrail || [];
    order.statusNote = order.statusNote || order.notes || "Table active";
    order.assignedWaiter = order.assignedWaiter || "Waiter Priya";
  });

  return nextOrders;
}

function mapOrderArrayToRecord(orders = []) {
  return Object.fromEntries((orders || []).map((order) => [order.tableId, order]));
}

function tableClass(status, selected) {
  return `mobile-table-card ${status} ${selected ? "selected" : ""}`;
}

function pickupLabel(status) {
  if (status === "ready") {
    return "Ready Pickup";
  }

  if (status === "delivered") {
    return "Delivered";
  }

  if (status === "preparing") {
    return "Preparing";
  }

  return "New";
}

function appendAudit(order, entry) {
  order.auditTrail = [entry, ...(order.auditTrail || [])].slice(0, 6);
}

export function App() {
  const [selectedRoleId, setSelectedRoleId] = useState("captain");
  const [selectedAreaId, setSelectedAreaId] = useState("ac-hall-1");
  const [selectedCategoryId, setSelectedCategoryId] = useState("starters");
  const [selectedTableId, setSelectedTableId] = useState("t1");
  const [selectedLineId, setSelectedLineId] = useState("line-1");
  const [ordersByTable, setOrdersByTable] = useState(buildInitialOrders);
  const [mobileBanner, setMobileBanner] = useState("Captain controls table orders");
  const [closingLocked, setClosingLocked] = useState(loadRestaurantState().closingState?.approved || false);
  const [permissionPolicies, setPermissionPolicies] = useState(loadRestaurantState().permissionPolicies || {});

  const profile = staffProfiles.find((item) => item.id === selectedRoleId);
  const selectedArea = mobileAreas.find((area) => area.id === selectedAreaId);
  const currentOrder = ordersByTable[selectedTableId];

  const visibleItems = useMemo(
    () => mobileMenuItems.filter((item) => item.categoryId === selectedCategoryId),
    [selectedCategoryId]
  );

  const currentTotal = currentOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const captainMoveTableEnabled = permissionPolicies["captain-move-table"] !== false;
  const waiterRequestBillEnabled = permissionPolicies["waiter-request-bill"] !== false;
  const canRequestBill = selectedRoleId === "captain" ? true : waiterRequestBillEnabled;
  const waiterAssignments = useMemo(
    () => Object.values(ordersByTable).filter((order) => order.assignedWaiter === "Waiter Priya"),
    [ordersByTable]
  );
  const waiterPickupQueue = useMemo(
    () => waiterAssignments.filter((order) => order.pickupStatus === "ready" || order.pickupStatus === "preparing"),
    [waiterAssignments]
  );
  const readyCount = useMemo(
    () => waiterAssignments.filter((order) => order.pickupStatus === "ready").length,
    [waiterAssignments]
  );
  const preparingCount = useMemo(
    () => waiterAssignments.filter((order) => order.pickupStatus === "preparing").length,
    [waiterAssignments]
  );
  const deliveredCount = useMemo(
    () => waiterAssignments.filter((order) => order.pickupStatus === "delivered").length,
    [waiterAssignments]
  );
  const billRequestCount = useMemo(
    () => Object.values(ordersByTable).filter((order) => order.billRequested).length,
    [ordersByTable]
  );

  useEffect(() => {
    return subscribeRestaurantState((nextState) => {
      setClosingLocked(nextState.closingState?.approved || false);
      setPermissionPolicies(nextState.permissionPolicies || {});
      setOrdersByTable((current) => ({
        ...current,
        ...JSON.parse(JSON.stringify(nextState.orders))
      }));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFromApi() {
      try {
        const [summary, orders] = await Promise.all([
          api.get("/operations/summary"),
          api.get("/operations/orders")
        ]);

        if (cancelled) {
          return;
        }

        setClosingLocked(summary.closingState?.approved || false);
        setPermissionPolicies(summary.permissionPolicies || {});
        setOrdersByTable((current) =>
          normalizeOrders({
            ...current,
            ...mapOrderArrayToRecord(orders)
          })
        );
      } catch {
        // Keep local mock flow when backend is not available.
      }
    }

    loadFromApi();

    return () => {
      cancelled = true;
    };
  }, []);

  function selectRole(roleId) {
    setSelectedRoleId(roleId);
    setMobileBanner(roleId === "captain" ? "Captain controls table orders" : "Waiter handles pickup and delivery");
  }

  function selectArea(areaId) {
    setSelectedAreaId(areaId);
    const firstTableId = mobileAreas.find((area) => area.id === areaId)?.tables[0]?.id;

    if (firstTableId) {
      setSelectedTableId(firstTableId);
      setSelectedLineId(ordersByTable[firstTableId].items[0]?.id || null);
    }
  }

  function selectTable(tableId) {
    setSelectedTableId(tableId);
    setSelectedLineId(ordersByTable[tableId].items[0]?.id || null);
    setMobileBanner(`Working on ${ordersByTable[tableId].tableNumber}`);
  }

  function addItem(item) {
    if (selectedRoleId !== "captain" || closingLocked) {
      return;
    }

    const lineId = `line-${Date.now()}-${item.id}`;

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      const newLine = {
        id: lineId,
        name: item.name,
        price: item.price,
        quantity: 1,
        note: "",
        sentToKot: false
      };

      order.items.push(newLine);
      order.statusNote = "Items added by captain";
      order.pickupStatus = "new";

      if (order.guests === 0) {
        order.guests = 1;
      }

      setSelectedLineId(newLine.id);
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      const order = next[selectedTableId];
      const newLine = {
        id: lineId,
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        note: "",
        sentToKot: false,
        stationId: item.stationId,
        stationName: item.stationName
      };

      order.items.push(newLine);
      order.notes = "Items added by captain";
      order.pickupStatus = "new";
      appendAudit(order, buildAuditEntry("Item added", "Captain Karthik", "Now"));

      if (order.guests === 0) {
        order.guests = 1;
      }

      return next;
    });

    api
      .post(`/operations/orders/${selectedTableId}/items`, {
        id: lineId,
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        note: "",
        sentToKot: false,
        stationId: item.stationId,
        stationName: item.stationName,
        actorName: "Captain Karthik",
        actorRole: "Captain"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrders({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});

    setMobileBanner(`${item.name} added`);
  }

  function applyInstruction(instruction) {
    if (!selectedLineId || selectedRoleId !== "captain" || closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      const line = next[selectedTableId].items.find((item) => item.id === selectedLineId);

      if (line) {
        line.note = instruction;
        line.sentToKot = false;
      }

      next[selectedTableId].statusNote = `Instruction added: ${instruction}`;
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      const line = next[selectedTableId].items.find((item) => item.id === selectedLineId);

      if (line) {
        line.note = instruction;
        line.sentToKot = false;
      }

      next[selectedTableId].notes = `Instruction added: ${instruction}`;
      appendAudit(next[selectedTableId], buildAuditEntry("Kitchen note added", "Captain Karthik", "Now"));
      return next;
    });

    api
      .patch(`/operations/orders/${selectedTableId}/items/${selectedLineId}`, {
        note: instruction,
        sentToKot: false,
        actorName: "Captain Karthik",
        actorRole: "Captain"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrders({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});

    setMobileBanner(`Instruction added: ${instruction}`);
  }

  function sendKot() {
    if (selectedRoleId !== "captain" || closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[selectedTableId].items.forEach((item) => {
        item.sentToKot = true;
      });
      next[selectedTableId].pickupStatus = "ready";
      next[selectedTableId].statusNote = "KOT sent and ready for waiter pickup";
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      next[selectedTableId].items.forEach((item) => {
        item.sentToKot = true;
      });
      next[selectedTableId].pickupStatus = "ready";
      next[selectedTableId].notes = "KOT sent and ready for waiter pickup";
      appendAudit(next[selectedTableId], buildAuditEntry("KOT sent", "Captain Karthik", "Now"));
      return next;
    });

    api
      .post(`/operations/orders/${selectedTableId}/kot`, {
        actorName: "Captain Karthik",
        actorRole: "Captain"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrders({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});

    setMobileBanner("KOT sent");
  }

  function requestBill() {
    if (closingLocked || !canRequestBill) {
      return;
    }

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      next[selectedTableId].billRequested = true;
      next[selectedTableId].billRequestedAt = "Requested from mobile";
      next[selectedTableId].notes = "Bill requested for cashier";
      appendAudit(next[selectedTableId], buildAuditEntry("Bill requested", profile.name, "Now"));
      return next;
    });

    api
      .post(`/operations/orders/${selectedTableId}/request-bill`, {
        actorName: profile.name,
        actorRole: profile.role
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrders({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});

    setMobileBanner("Bill requested for cashier");
  }

  function assignWaiter(waiterName) {
    if (closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[selectedTableId].assignedWaiter = waiterName;
      next[selectedTableId].statusNote = `${waiterName} assigned`;
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      next[selectedTableId].assignedWaiter = waiterName;
      next[selectedTableId].notes = `${waiterName} assigned`;
      appendAudit(next[selectedTableId], buildAuditEntry("Waiter assigned", "Captain Karthik", "Now"));
      return next;
    });

    api
      .post(`/operations/orders/${selectedTableId}/assign-waiter`, {
        waiterName,
        actorName: "Captain Karthik",
        actorRole: "Captain"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrders({
            ...current,
            [selectedTableId]: nextOrder
          })
        );
      })
      .catch(() => {});

    setMobileBanner(`${waiterName} assigned to ${currentOrder.tableNumber}`);
  }

  function markPickedUp(tableId) {
    if (closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[tableId].pickupStatus = "picked";
      next[tableId].statusNote = "Picked from kitchen";
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      next[tableId].pickupStatus = "picked";
      next[tableId].notes = "Picked from kitchen";
      appendAudit(next[tableId], buildAuditEntry("Picked from kitchen", "Waiter Priya", "Now"));
      return next;
    });

    api
      .post(`/operations/orders/${tableId}/status`, {
        pickupStatus: "picked",
        actorName: "Waiter Priya",
        actorRole: "Waiter"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrders({
            ...current,
            [tableId]: nextOrder
          })
        );
      })
      .catch(() => {});

    setMobileBanner(`Picked up for ${ordersByTable[tableId].tableNumber}`);
  }

  function markDelivered(tableId) {
    if (closingLocked) {
      return;
    }

    setOrdersByTable((current) => {
      const next = structuredClone(current);
      next[tableId].pickupStatus = "delivered";
      next[tableId].statusNote = "Delivered to table";
      return next;
    });

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      next[tableId].pickupStatus = "delivered";
      next[tableId].notes = "Delivered to table";
      appendAudit(next[tableId], buildAuditEntry("Delivered to table", "Waiter Priya", "Now"));
      return next;
    });

    api
      .post(`/operations/orders/${tableId}/status`, {
        pickupStatus: "delivered",
        actorName: "Waiter Priya",
        actorRole: "Waiter"
      })
      .then((nextOrder) => {
        setOrdersByTable((current) =>
          normalizeOrders({
            ...current,
            [tableId]: nextOrder
          })
        );
      })
      .catch(() => {});

    setMobileBanner(`Delivered to ${ordersByTable[tableId].tableNumber}`);
  }

  function handleCreateDemoOrder() {
    if (closingLocked) {
      return;
    }

    const result = createDemoOrder();

    if (result.tableId) {
      const demoArea = mobileAreas.find((area) => area.tables.some((table) => table.id === result.tableId));
      if (demoArea) {
        setSelectedAreaId(demoArea.id);
      }
      setSelectedTableId(result.tableId);
      setMobileBanner(`Demo order created for ${ordersByTable[result.tableId]?.tableNumber || result.tableId.toUpperCase()}`);
    }
  }

  return (
    <div className="mobile-shell">
      <header className="mobile-topbar">
        <div>
          <p className="eyebrow">Operations Mobile</p>
          <h1>Waiter and Captain</h1>
        </div>
        <div className="role-toggle" role="tablist" aria-label="Staff role">
          {staffProfiles.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`role-chip ${item.id === selectedRoleId ? "active" : ""}`}
              onClick={() => selectRole(item.id)}
            >
              {item.role}
            </button>
          ))}
        </div>
      </header>

      <div className="mobile-banner">{mobileBanner}</div>
      {closingLocked ? <div className="mobile-banner">Day closed • Ordering, assignment, pickup, and billing actions are locked</div> : null}

      <section className="mobile-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Logged In</p>
            <h2>{profile.name}</h2>
          </div>
          <div className="permission-note">
            {closingLocked
              ? "Owner has approved daily closing. Mobile operations are now view-only."
              : selectedRoleId === "captain"
                ? "Own 4 to 6 tables and assign waiter"
                : "Pickup food and deliver assigned tables"}
          </div>
        </div>
      </section>

      <section className="mobile-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Live Floor</p>
            <h2>Delivery Pulse</h2>
          </div>
          <button type="button" className="secondary-action" onClick={handleCreateDemoOrder} disabled={closingLocked}>
            Create Demo Order
          </button>
        </div>

        <div className="mobile-stats-grid">
          <div className="mobile-stat-card">
            <span>Assigned Tables</span>
            <strong>{waiterAssignments.length}</strong>
          </div>
          <div className="mobile-stat-card">
            <span>Ready Pickup</span>
            <strong>{readyCount}</strong>
          </div>
          <div className="mobile-stat-card">
            <span>Preparing</span>
            <strong>{preparingCount}</strong>
          </div>
          <div className="mobile-stat-card">
            <span>Delivered</span>
            <strong>{deliveredCount}</strong>
          </div>
          <div className="mobile-stat-card">
            <span>Bill Requests</span>
            <strong>{billRequestCount}</strong>
          </div>
        </div>
      </section>

      {selectedRoleId === "captain" ? (
        <>
          <section className="mobile-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Captain Floor</p>
                <h2>Owned Tables</h2>
              </div>
            </div>

            <div className="area-tabs">
              {mobileAreas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  className={`area-chip ${area.id === selectedAreaId ? "active" : ""}`}
                  onClick={() => selectArea(area.id)}
                >
                  {area.name}
                </button>
              ))}
            </div>

            <div className="mobile-table-grid">
              {selectedArea.tables.map((table) => {
                const order = ordersByTable[table.id];

                return (
                  <button
                    key={table.id}
                    type="button"
                    className={tableClass(table.status, table.id === selectedTableId)}
                    onClick={() => selectTable(table.id)}
                  >
                    <strong>{table.number}</strong>
                    <span>{table.guests ? `${table.guests} guests` : "Open table"}</span>
                    <span>{table.seats} seats</span>
                    <em>{order.assignedWaiter}</em>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mobile-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Assignment</p>
                <h2>Assign Waiter</h2>
              </div>
              <div className="permission-note">Table {currentOrder.tableNumber}</div>
            </div>

            <div className="category-tabs">
              {waiterTeam.map((waiterName) => (
                <button
                  key={waiterName}
                  type="button"
                  className={`category-chip ${currentOrder.assignedWaiter === waiterName ? "active" : ""}`}
                  onClick={() => assignWaiter(waiterName)}
                  disabled={closingLocked}
                >
                  {waiterName}
                </button>
              ))}
            </div>
          </section>

          <section className="mobile-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Table Order</p>
                <h2>
                  {currentOrder.areaName} • {currentOrder.tableNumber}
                </h2>
              </div>
              <div className="permission-note">{currentOrder.statusNote}</div>
            </div>

            <div className="table-summary">
              <div>
                <span>Guests</span>
                <strong>{currentOrder.guests}</strong>
              </div>
              <div>
                <span>Assigned Waiter</span>
                <strong>{currentOrder.assignedWaiter}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{currency(currentTotal)}</strong>
              </div>
            </div>

            <div className="audit-stack">
              {(currentOrder.auditTrail || []).slice(0, 3).map((entry) => (
                <div key={entry.id} className="audit-row">
                  <strong>{entry.label}</strong>
                  <span>
                    {entry.actor} • {entry.time}
                  </span>
                </div>
              ))}
            </div>

            <div className="order-stack">
              {currentOrder.items.length === 0 ? (
                <div className="empty-state">No items yet. Tap from the menu to start this table.</div>
              ) : (
                currentOrder.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`order-line ${item.id === selectedLineId ? "selected" : ""}`}
                    onClick={() => setSelectedLineId(item.id)}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        Qty {item.quantity} • {currency(item.price)}
                      </span>
                      <p>{item.note || "Add kitchen note"}</p>
                    </div>
                    <em>{item.sentToKot ? "KOT Sent" : "Pending"}</em>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="mobile-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Menu</p>
                <h2>Quick Add</h2>
              </div>
            </div>

            <div className="category-tabs">
              {mobileCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`category-chip ${category.id === selectedCategoryId ? "active" : ""}`}
                  onClick={() => setSelectedCategoryId(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <div className="menu-stack">
              {visibleItems.map((item) => (
                <button key={item.id} type="button" className="menu-item-card" onClick={() => addItem(item)} disabled={closingLocked}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{currency(item.price)}</span>
                  </div>
                  <span>Add</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mobile-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Kitchen Notes</p>
                <h2>Instruction Picker</h2>
              </div>
            </div>

            <div className="instruction-grid">
              {mobileInstructions.map((instruction) => (
                <button key={instruction} type="button" className="instruction-card" onClick={() => applyInstruction(instruction)} disabled={closingLocked}>
                  {instruction}
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="mobile-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Waiter Tables</p>
                <h2>Assigned Tables</h2>
              </div>
            </div>

            <div className="mobile-table-grid">
              {waiterAssignments.map((order) => (
                <button
                  key={order.tableId}
                  type="button"
                  className={tableClass(order.pickupStatus === "delivered" ? "open" : "running", order.tableId === selectedTableId)}
                  onClick={() => selectTable(order.tableId)}
                >
                  <strong>{order.tableNumber}</strong>
                  <span>{order.areaName}</span>
                  <span>{pickupLabel(order.pickupStatus)}</span>
                  <em>{order.statusNote}</em>
                </button>
              ))}
            </div>
          </section>

          <section className="mobile-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Kitchen Pickup</p>
                <h2>Pickup Queue</h2>
              </div>
            </div>

            <div className="menu-stack">
              {waiterPickupQueue.map((order) => (
                <div key={order.tableId} className="queue-card">
                  <div>
                    <strong>
                      {order.tableNumber} • {order.areaName}
                    </strong>
                    <span>{pickupLabel(order.pickupStatus)}</span>
                  </div>
                  <div className="queue-actions">
                    <button type="button" className="secondary-action" onClick={() => markPickedUp(order.tableId)} disabled={closingLocked}>
                      Mark Picked Up
                    </button>
                    <button type="button" className="primary-action" onClick={() => markDelivered(order.tableId)} disabled={closingLocked}>
                      Delivered to Table
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mobile-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Current Delivery</p>
                <h2>
                  {currentOrder.areaName} • {currentOrder.tableNumber}
                </h2>
              </div>
              <div className="permission-note">{pickupLabel(currentOrder.pickupStatus)}</div>
            </div>

            <div className="order-stack">
              <div className="audit-stack">
                {(currentOrder.auditTrail || []).slice(0, 3).map((entry) => (
                  <div key={entry.id} className="audit-row">
                    <strong>{entry.label}</strong>
                    <span>
                      {entry.actor} • {entry.time}
                    </span>
                  </div>
                ))}
              </div>
              {currentOrder.items.length === 0 ? (
                <div className="empty-state">No KOT assigned yet for this table.</div>
              ) : (
                currentOrder.items.map((item) => (
                  <div key={item.id} className="order-line selected">
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        Qty {item.quantity} • {currency(item.price)}
                      </span>
                      <p>{item.note || "No instruction"}</p>
                    </div>
                    <em>{pickupLabel(currentOrder.pickupStatus)}</em>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      <footer className="mobile-sticky-bar">
        <button
          type="button"
          className="secondary-action"
          disabled={selectedRoleId === "captain" && (!captainMoveTableEnabled || closingLocked)}
        >
          {selectedRoleId === "captain" && !captainMoveTableEnabled ? "Move Table Locked" : selectedRoleId === "captain" ? "Move Table" : "Assigned Tables"}
        </button>
        <button type="button" className="secondary-action" onClick={requestBill} disabled={closingLocked || !canRequestBill}>
          {selectedRoleId === "waiter" && !waiterRequestBillEnabled ? "Bill Request Locked" : "Request Bill"}
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={selectedRoleId === "captain" ? sendKot : () => markDelivered(selectedTableId)}
          disabled={closingLocked}
        >
          {selectedRoleId === "captain" ? "Send KOT" : "Delivered"}
        </button>
      </footer>
    </div>
  );
}
