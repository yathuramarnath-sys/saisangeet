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
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, [outletId]);

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
      </div>

      {loading && liveOrders.length === 0 ? (
        <div className="page-loading">Loading live orders…</div>
      ) : tab === "running-orders" ? (
        <div className="lo-panels">
          <RunningPanel dinein={dinein} pickup={pickup} online={onlineOrders} />
          <PendingPanel online={onlineOrders} />
        </div>
      ) : (
        <RunningTablesView dinein={dinein} pickup={pickup} />
      )}
    </div>
  );
}

