import { useEffect, useMemo, useState } from "react";

import { kotTickets, stations } from "./data/kds.seed";
import {
  buildAuditEntry,
  createDemoOrder,
  loadRestaurantState,
  subscribeRestaurantState,
  updateRestaurantOrders
} from "../../../packages/shared-types/src/mockRestaurantStore.js";

const statusColumns = [
  { id: "new", label: "New" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" }
];

function buildInitialTickets() {
  const sharedOrders = loadRestaurantState().orders;
  return JSON.parse(JSON.stringify(syncTicketsFromOrders(sharedOrders)));
}

function formatElapsed(ageMinutes = 0) {
  return `${String(ageMinutes).padStart(2, "0")}:00`;
}

function getPriorityLevel(ageMinutes = 0) {
  if (ageMinutes >= 6) {
    return "urgent";
  }

  if (ageMinutes >= 4) {
    return "attention";
  }

  return "normal";
}

function syncTicketsFromOrders(orders) {
  const orderMap = orders || {};
  const sourceTickets = Object.values(orderMap)
    .filter((order) => order.items.length > 0)
    .map((order) => ({
      id: order.kotNumber.toLowerCase(),
      kotNumber: order.kotNumber,
      tableId: order.tableId,
      tableNumber: order.tableNumber,
      areaName: order.areaName,
      stationId: order.items[0].stationId,
      stationName: order.items[0].stationName,
      captain: order.captain,
      waiter: order.assignedWaiter,
      status:
        order.pickupStatus === "preparing"
          ? "preparing"
          : order.pickupStatus === "ready"
            ? "ready"
            : order.pickupStatus === "delivered"
              ? "ready"
              : "new",
      ageMinutes: order.ageMinutes || 0,
      elapsed: formatElapsed(order.ageMinutes || 0),
      priority: getPriorityLevel(order.ageMinutes || 0),
      items: order.items.map((item, index) => ({
        id: `${order.kotNumber}-item-${index + 1}`,
        name: item.name,
        quantity: item.quantity,
        note: item.note
      }))
    }));

  return sourceTickets.length > 0 ? sourceTickets : JSON.parse(JSON.stringify(kotTickets));
}

function ticketClass(status, selected) {
  return `ticket-card ${status} ${selected ? "selected" : ""}`;
}

function appendAudit(order, entry) {
  order.auditTrail = [entry, ...(order.auditTrail || [])].slice(0, 6);
}

export function App() {
  const [selectedStationId, setSelectedStationId] = useState("all");
  const [selectedTicketId, setSelectedTicketId] = useState("kot-10031");
  const [tickets, setTickets] = useState(buildInitialTickets);
  const [banner, setBanner] = useState("Kitchen queue is live");
  const [closingLocked, setClosingLocked] = useState(loadRestaurantState().closingState?.approved || false);
  const [permissionPolicies, setPermissionPolicies] = useState(loadRestaurantState().permissionPolicies || {});

  const visibleTickets = useMemo(
    () =>
      tickets.filter((ticket) => selectedStationId === "all" || ticket.stationId === selectedStationId),
    [selectedStationId, tickets]
  );

  const selectedTicket = visibleTickets.find((ticket) => ticket.id === selectedTicketId) || visibleTickets[0] || tickets[0];
  const selectedOrderAudit = useMemo(() => {
    if (!selectedTicket) {
      return [];
    }

    return (loadRestaurantState().orders[selectedTicket.tableId]?.auditTrail || []).slice(0, 4);
  }, [selectedTicket, tickets]);
  const urgentCount = useMemo(
    () => visibleTickets.filter((ticket) => ticket.priority === "urgent").length,
    [visibleTickets]
  );
  const kitchenKotControlEnabled = permissionPolicies["kitchen-kot-control"] !== false;

  useEffect(() => {
    return subscribeRestaurantState((nextState) => {
      setClosingLocked(nextState.closingState?.approved || false);
      setPermissionPolicies(nextState.permissionPolicies || {});
      const nextTickets = syncTicketsFromOrders(nextState.orders);
      setTickets(nextTickets);
      if (nextTickets[0] && !nextTickets.some((ticket) => ticket.id === selectedTicketId)) {
        setSelectedTicketId(nextTickets[0].id);
      }
    });
  }, [selectedTicketId]);

  function filterByStation(stationId) {
    setSelectedStationId(stationId);
    const nextVisible = tickets.filter((ticket) => stationId === "all" || ticket.stationId === stationId);
    if (nextVisible[0]) {
      setSelectedTicketId(nextVisible[0].id);
    }
  }

  function updateTicketStatus(ticketId, status) {
    if (closingLocked || !kitchenKotControlEnabled) {
      return;
    }

    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              status
            }
          : ticket
      )
    );

    setSelectedTicketId(ticketId);

    if (status === "preparing") {
      setBanner("KOT moved to preparing");
    } else if (status === "ready") {
      setBanner("KOT ready for waiter pickup");
    } else {
      setBanner("KOT moved back to new");
    }

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      const selected = Object.values(next).find((order) => order.kotNumber.toLowerCase() === ticketId);
      if (selected) {
        selected.pickupStatus = status === "preparing" ? "preparing" : status === "ready" ? "ready" : "new";
        selected.notes =
          status === "preparing"
            ? "KOT accepted by kitchen"
            : status === "ready"
              ? "Ready for pickup"
              : "KOT moved back to new";
        appendAudit(
          selected,
          buildAuditEntry(
            status === "preparing" ? "Accepted in kitchen" : status === "ready" ? "Marked ready" : "Moved to new",
            "Chef Manoj",
            "Now"
          )
        );
      }
      return next;
    });
  }

  function markPickedUp(ticketId) {
    if (closingLocked || !kitchenKotControlEnabled) {
      return;
    }

    setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
    setBanner("Waiter pickup completed");
    const nextTicket = tickets.find((ticket) => ticket.id !== ticketId);
    if (nextTicket) {
      setSelectedTicketId(nextTicket.id);
    }

    updateRestaurantOrders((current) => {
      const next = structuredClone(current);
      const selected = Object.values(next).find((order) => order.kotNumber.toLowerCase() === ticketId);
      if (selected) {
        selected.pickupStatus = "picked";
        selected.notes = "Picked from kitchen";
        appendAudit(selected, buildAuditEntry("Waiter pickup confirmed", "Chef Manoj", "Now"));
      }
      return next;
    });
  }

  function handleCreateDemoOrder() {
    if (closingLocked || !kitchenKotControlEnabled) {
      return;
    }

    const result = createDemoOrder();

    if (result.orderNumber) {
      setBanner(`Demo KOT created: KOT-${result.orderNumber}`);
      setSelectedTicketId(`kot-${result.orderNumber}`);
    }
  }

  return (
    <div className="kds-shell">
      <header className="kds-topbar">
        <div>
          <p className="eyebrow">Kitchen Display</p>
          <h1>KOT Board</h1>
        </div>
        <div className="kds-station-strip" role="tablist" aria-label="Kitchen stations">
          {stations.map((station) => (
            <button
              key={station.id}
              type="button"
              className={`station-chip ${station.id === selectedStationId ? "active" : ""}`}
              onClick={() => filterByStation(station.id)}
            >
              {station.name}
            </button>
          ))}
        </div>
        <button type="button" className="secondary-btn" onClick={handleCreateDemoOrder} disabled={closingLocked || !kitchenKotControlEnabled}>
          Create Demo Order
        </button>
      </header>

      <div className="kds-banner">{banner}</div>
      {closingLocked ? <div className="kds-banner">Day closed • Kitchen queue is view-only now</div> : null}
      {!closingLocked && !kitchenKotControlEnabled ? <div className="kds-banner">Kitchen KOT control disabled by owner • Queue is view-only now</div> : null}

      <section className="kds-summary-row">
        {statusColumns.map((column) => (
          <div key={column.id} className="summary-card">
            <span>{column.label}</span>
            <strong>{visibleTickets.filter((ticket) => ticket.status === column.id).length}</strong>
          </div>
        ))}
        <div className="summary-card urgent">
          <span>Urgent</span>
          <strong>{urgentCount}</strong>
        </div>
      </section>

      <section className="kds-grid">
        {statusColumns.map((column) => (
          <section key={column.id} className="kds-column">
            <div className="column-head">
              <h2>{column.label}</h2>
              <span>{visibleTickets.filter((ticket) => ticket.status === column.id).length} KOTs</span>
            </div>

            <div className="ticket-stack">
              {visibleTickets.filter((ticket) => ticket.status === column.id).map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  className={`${ticketClass(ticket.status, ticket.id === selectedTicketId)} ${ticket.priority}`}
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <div className="ticket-head">
                    <strong>{ticket.kotNumber}</strong>
                    <span>{ticket.elapsed}</span>
                  </div>
                  <span>
                    {ticket.tableNumber} • {ticket.areaName}
                  </span>
                  <span>{ticket.stationName}</span>
                  <span className={`priority-tag ${ticket.priority}`}>{ticket.priority === "urgent" ? "Urgent" : ticket.priority === "attention" ? "Watch" : "On Time"}</span>
                  <em>{ticket.waiter}</em>
                </button>
              ))}
            </div>
          </section>
        ))}
      </section>

      <section className="kds-detail-card">
        <div className="column-head">
          <div>
            <p className="eyebrow">Selected KOT</p>
            <h2>{selectedTicket?.kotNumber || "No ticket selected"}</h2>
          </div>
          {selectedTicket ? <span className={`status-pill ${selectedTicket.status}`}>{selectedTicket.status}</span> : null}
        </div>

        {selectedTicket ? (
          <>
            <div className="detail-meta">
              <div>
                <span>Table</span>
                <strong>{selectedTicket.tableNumber}</strong>
              </div>
              <div>
                <span>Captain</span>
                <strong>{selectedTicket.captain}</strong>
              </div>
              <div>
                <span>Waiter</span>
                <strong>{selectedTicket.waiter}</strong>
              </div>
              <div>
                <span>Station</span>
                <strong>{selectedTicket.stationName}</strong>
              </div>
              <div>
                <span>Age</span>
                <strong>{selectedTicket.elapsed}</strong>
              </div>
              <div>
                <span>Priority</span>
                <strong>{selectedTicket.priority}</strong>
              </div>
            </div>

            <div className="detail-items">
              <div className="detail-audit-list">
                {selectedOrderAudit.map((entry) => (
                  <article key={entry.id} className="detail-item-card">
                    <div>
                      <strong>{entry.label}</strong>
                      <span>{entry.actor}</span>
                    </div>
                    <p>{entry.time}</p>
                  </article>
                ))}
              </div>
              {selectedTicket.items.map((item) => (
                <article key={item.id} className="detail-item-card">
                  <div>
                    <strong>{item.name}</strong>
                    <span>Qty {item.quantity}</span>
                  </div>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>

            <div className="detail-actions">
              <button type="button" className="secondary-btn" onClick={() => updateTicketStatus(selectedTicket.id, "new")} disabled={closingLocked || !kitchenKotControlEnabled}>
                Back to New
              </button>
              <button type="button" className="secondary-btn" onClick={() => updateTicketStatus(selectedTicket.id, "preparing")} disabled={closingLocked || !kitchenKotControlEnabled}>
                Start Preparing
              </button>
              <button type="button" className="primary-btn" onClick={() => updateTicketStatus(selectedTicket.id, "ready")} disabled={closingLocked || !kitchenKotControlEnabled}>
                Mark Ready
              </button>
              <button type="button" className="ghost-btn" onClick={() => markPickedUp(selectedTicket.id)} disabled={closingLocked || !kitchenKotControlEnabled}>
                Waiter Picked Up
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">No KOT in this station right now.</div>
        )}
      </section>
    </div>
  );
}
