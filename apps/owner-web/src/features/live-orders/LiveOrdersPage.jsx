import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../lib/api";

function fmt(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }

function inferType(tableId) {
  if (!tableId) return "dinein";
  const id = String(tableId).toLowerCase();
  if (id.startsWith("counter")) return "pickup";
  if (id.startsWith("online"))  return "online";
  return "dinein";
}

function orderTotal(order) {
  return (order.items || []).reduce((s, it) => {
    return s + Number(it.price || it.basePrice || 0) * Number(it.quantity || it.qty || 1);
  }, 0);
}

function Icon({ name, size = 20 }) {
  return (
    <span className="material-symbols-rounded" style={{ fontSize: size, lineHeight: 1 }}>
      {name}
    </span>
  );
}

function RunningPanel({ dinein, pickup, online }) {
  const dineAmt = dinein.reduce((s, o) => s + orderTotal(o), 0);
  const pickAmt = pickup.reduce((s, o) => s + orderTotal(o), 0);
  const onlAmt  = online.reduce((s, o) => s + (o.total || 0), 0);
  const total   = dinein.length + pickup.length + online.length;

  return (
    <div className="lo-panel">
      <div className="lo-panel-header">
        <span className="lo-dot lo-dot--green" />
        <span className="lo-panel-title">Running Orders</span>
      </div>
      <div className="lo-totals">
        <div>
          <div className="lo-total-label">Total Orders</div>
          <div className="lo-total-value">{total}</div>
        </div>
        <div>
          <div className="lo-total-label">Total Amount</div>
          <div className="lo-total-value">{fmt(dineAmt + pickAmt + onlAmt)}</div>
        </div>
      </div>
      <div className="lo-rows">
        <LoRow iconName="table_restaurant" label="Dine In"        count={dinein.length} amount={dineAmt} />
        <LoRow iconName="shopping_bag"     label="Pick Up"         count={pickup.length} amount={pickAmt} />
        <LoRow iconName="delivery_dining"  label="Online Delivery" count={online.length} amount={onlAmt} />
      </div>
    </div>
  );
}

function PendingPanel({ online }) {
  const pending   = online.filter(o => o.status === "pending");
  const inPrep    = online.filter(o => o.status === "accepted");
  const waiting   = online.filter(o => o.status === "food_ready");
  const total     = online.length;
  const totalAmt  = online.reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="lo-panel">
      <div className="lo-panel-header">
        <span className="lo-dot lo-dot--blue" />
        <span className="lo-panel-title">Pending Orders</span>
      </div>
      <div className="lo-totals">
        <div>
          <div className="lo-total-label">Total Orders</div>
          <div className="lo-total-value">{total}</div>
        </div>
        <div>
          <div className="lo-total-label">Total Amount</div>
          <div className="lo-total-value">{fmt(totalAmt)}</div>
        </div>
      </div>
      <div className="lo-rows">
        <LoStatusRow dot="lo-status--yellow" label="Pending Acceptance" orders={pending} />
        <LoStatusRow dot="lo-status--blue"   label="In Preparation"     orders={inPrep} />
        <LoStatusRow dot="lo-status--green"  label="Waiting For Pickup" orders={waiting} />
      </div>
    </div>
  );
}

function LoRow({ iconName, label, count, amount }) {
  return (
    <div className="lo-row">
      <div className="lo-row-icon-box">
        <Icon name={iconName} size={20} />
      </div>
      <div className="lo-row-info">
        <div className="lo-row-label">{label}</div>
        <div className="lo-row-count">{count} order{count !== 1 ? "s" : ""}</div>
      </div>
      <div className="lo-row-amount">{fmt(amount)}</div>
    </div>
  );
}

function LoStatusRow({ dot, label, orders }) {
  const amount = orders.reduce((s, o) => s + (o.total || 0), 0);
  return (
    <div className="lo-row">
      <span className={`lo-status-dot ${dot}`} />
      <div className="lo-row-info">
        <div className="lo-row-label">{label}</div>
        <div className="lo-row-count">{orders.length} order{orders.length !== 1 ? "s" : ""}</div>
      </div>
      <div className="lo-row-amount">{fmt(amount)}</div>
    </div>
  );
}

function RunningTablesView({ dinein, pickup }) {
  const allTables = [...dinein, ...pickup];
  if (allTables.length === 0) {
    return (
      <div className="lo-tables-empty">
        <Icon name="table_restaurant" size={40} />
        <div>No active tables right now</div>
      </div>
    );
  }

  return (
    <div className="lo-tables-grid">
      {allTables.map((order, i) => {
        const type  = inferType(order.tableId);
        const total = orderTotal(order);
        const itemCount = (order.items || []).filter(it => !it.isVoided).length;
        return (
          <div key={order.id || i} className={`lo-table-card lo-table-card--${type}`}>
            <div className="lo-table-card-header">
              <span className="lo-table-card-name">{order.tableNumber || order.tableId || "Table"}</span>
              <span className={`lo-table-card-badge lo-table-badge--${type}`}>
                {type === "pickup" ? "Pick Up" : "Dine In"}
              </span>
            </div>
            <div className="lo-table-card-items">{itemCount} item{itemCount !== 1 ? "s" : ""}</div>
            <div className="lo-table-card-amount">{fmt(total)}</div>
            {order.cashierName && (
              <div className="lo-table-card-cashier">{order.cashierName}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LiveOrdersPage() {
  const [tab,            setTab]            = useState("running-orders");
  const [liveOrders,     setLiveOrders]     = useState([]);
  const [onlineOrders,   setOnlineOrders]   = useState([]);
  const [outlets,        setOutlets]        = useState([]);
  const [outletId,       setOutletId]       = useState("");
  const [loading,        setLoading]        = useState(true);
  const [lastUpdated,    setLastUpdated]    = useState(null);
  const [pendingBills,   setPendingBills]   = useState([]);
  const [deletingBill,   setDeletingBill]   = useState(null); // orderNumber being deleted
  const outletsRef = useRef([]);

  const load = useCallback(async () => {
    try {
      let currentOutlets = outletsRef.current;
      if (!currentOutlets.length) {
        const fetched = await api.get("/outlets").catch(() => []);
        if (Array.isArray(fetched) && fetched.length) {
          outletsRef.current = fetched;
          setOutlets(fetched);
          currentOutlets = fetched;
        }
      }

      const qs = outletId ? `?outletId=${outletId}` : "";
      const onlineOutletId = outletId || currentOutlets[0]?.id || "";

      const [orders, online] = await Promise.all([
        api.get(`/operations/orders${qs}`),
        onlineOutletId
          ? api.get(`/online-orders?outletId=${onlineOutletId}`).catch(() => [])
          : Promise.resolve([]),
      ]);

      setLiveOrders(Array.isArray(orders) ? orders.filter(o => !o.isClosed && (o.items?.length || 0) > 0) : []);
      setOnlineOrders(Array.isArray(online) ? online : []);
      setLastUpdated(new Date());

      // Also refresh pending bills if that tab is open or data is stale
      const billsOid = outletId || currentOutlets[0]?.id || "";
      if (billsOid) {
        api.get(`/operations/pending-bills?outletId=${billsOid}`)
          .then(bills => setPendingBills(Array.isArray(bills) ? bills : []))
          .catch(() => {});
      }
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  async function handleDeletePendingBill(bill) {
    const oid = outletId || outletsRef.current[0]?.id || "";
    if (!oid || !bill.orderNumber) return;
    if (!window.confirm(`Force-remove pending bill #${bill.orderNumber} for Table ${bill.tableNumber || bill.tableId}?\n\nOnly do this if the table is already cleared at the POS.`)) return;
    setDeletingBill(bill.orderNumber);
    try {
      await api.delete(`/operations/pending-bills/${bill.orderNumber}?outletId=${oid}`);
      setPendingBills(prev => prev.filter(b => b.orderNumber !== bill.orderNumber));
    } catch {
      alert("Failed to delete — please try again.");
    } finally {
      setDeletingBill(null);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const dinein = liveOrders.filter(o => inferType(o.tableId) === "dinein");
  const pickup = liveOrders.filter(o => inferType(o.tableId) === "pickup");

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Orders</h1>
          {lastUpdated && (
            <p className="page-subtitle">
              Auto-refreshes every 30s · Last updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {outlets.length > 1 && (
            <select className="filter-select" value={outletId} onChange={e => setOutletId(e.target.value)}>
              <option value="">All Outlets</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <button className="lo-refresh-btn" onClick={load} disabled={loading}>
            <Icon name="refresh" size={17} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="lo-tabs">
        <button
          className={`lo-tab ${tab === "running-orders" ? "lo-tab--active" : ""}`}
          onClick={() => setTab("running-orders")}
        >
          Running Orders
        </button>
        <button
          className={`lo-tab ${tab === "running-tables" ? "lo-tab--active" : ""}`}
          onClick={() => setTab("running-tables")}
        >
          Running Tables
          {liveOrders.length > 0 && <span className="lo-tab-count">{dinein.length + pickup.length}</span>}
        </button>
        <button
          className={`lo-tab ${tab === "stuck-bills" ? "lo-tab--active" : ""}`}
          onClick={() => setTab("stuck-bills")}
        >
          Stuck Bills
          {pendingBills.length > 0 && <span className="lo-tab-count" style={{ background: "#ef4444" }}>{pendingBills.length}</span>}
        </button>
      </div>

      {loading && liveOrders.length === 0 ? (
        <div className="page-loading">Loading live orders…</div>
      ) : tab === "running-orders" ? (
        <div className="lo-panels">
          <RunningPanel dinein={dinein} pickup={pickup} online={onlineOrders} />
          <PendingPanel online={onlineOrders} />
        </div>
      ) : tab === "running-tables" ? (
        <RunningTablesView dinein={dinein} pickup={pickup} />
      ) : (
        <StuckBillsPanel bills={pendingBills} deletingBill={deletingBill} onDelete={handleDeletePendingBill} />
      )}
    </div>
  );
}

function StuckBillsPanel({ bills, deletingBill, onDelete }) {
  if (bills.length === 0) {
    return (
      <div className="lo-tables-empty">
        <Icon name="check_circle" size={40} />
        <div>No stuck pending bills</div>
        <div style={{ fontSize: "0.82rem", marginTop: 6, color: "var(--muted)" }}>
          Pending bills appear here when a Captain-billed table fails to settle at the POS.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--warning-bg, #fef3c7)", borderRadius: 8, fontSize: "0.84rem", color: "var(--warning-text, #92400e)" }}>
        These bills were sent by the Captain for settlement but the POS has not cleared them.
        Force-remove only if you have confirmed the table is already settled and free at the POS.
      </div>
      <table className="orders-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Table</th>
            <th>Bill No</th>
            <th>Items</th>
            <th style={{ textAlign: "right" }}>Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bills.map((bill) => {
            const total = (bill.items || []).reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || i.qty || 1), 0);
            return (
              <tr key={bill.orderNumber}>
                <td><strong>#{bill.orderNumber}</strong></td>
                <td>{bill.tableNumber || bill.tableId || "—"}</td>
                <td>{bill.billNo || "—"}</td>
                <td style={{ color: "var(--muted)", fontSize: "0.82em" }}>
                  {(bill.items || []).slice(0, 3).map(i => i.name).join(", ")}
                  {(bill.items || []).length > 3 ? ` +${bill.items.length - 3} more` : ""}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>₹{total.toLocaleString("en-IN")}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    className="btn-outline"
                    style={{ color: "#ef4444", borderColor: "#ef4444", fontSize: "0.8rem", padding: "4px 10px" }}
                    disabled={deletingBill === bill.orderNumber}
                    onClick={() => onDelete(bill)}
                  >
                    {deletingBill === bill.orderNumber ? "Removing…" : "Force Remove"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
