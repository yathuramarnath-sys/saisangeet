import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function fmtTs(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    hour12: true, timeZone: "Asia/Kolkata",
  });
}
function minutesBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 60000);
}

const PLATFORM_COLORS = {
  Zomato:  { bg: "#E23744", text: "#fff" },
  Swiggy:  { bg: "#FC8019", text: "#fff" },
  Dotpe:   { bg: "#FF6B35", text: "#fff" },
  Dunzo:   { bg: "#22D3EE", text: "#111" },
  Online:  { bg: "#6366f1", text: "#fff" },
};

function PlatformBadge({ platform }) {
  const c = PLATFORM_COLORS[platform] || { bg: "#6b7280", text: "#fff" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6,
      fontSize: "0.72rem", fontWeight: 700, background: c.bg, color: c.text,
    }}>
      {platform}
    </span>
  );
}

const STATUS_BADGE = {
  pending:    { label: "Pending",    cls: "badge-pending" },
  accepted:   { label: "Accepted",   cls: "badge-accepted" },
  food_ready: { label: "Food Ready", cls: "badge-food-ready" },
  rejected:   { label: "Rejected",   cls: "badge-rejected" },
  delivered:  { label: "Delivered",  cls: "badge-paid" },
  cancelled:  { label: "Cancelled",  cls: "badge-rejected" },
};

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || { label: status, cls: "badge-pending" };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

function OrderDetailPanel({ order, onClose }) {
  const items = order.items || [];
  const itemsTotal = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0);
  const acceptMins = minutesBetween(order.receivedAt, order.acceptedAt);
  const readyMins  = minutesBetween(order.receivedAt, order.foodReadyAt);

  return (
    <div className="detail-panel-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="detail-panel">
        <div className="detail-panel-header">
          <span className="detail-panel-title">Order #{order.orderId || order.id}</span>
          <button className="detail-close" onClick={onClose}>
            <span className="material-symbols-rounded" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
        <div className="detail-panel-body">
          {/* Status + platform */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <PlatformBadge platform={order.platform} />
            <StatusBadge status={order.status} />
            {order.rejectReason && (
              <span style={{ fontSize: "0.78rem", color: "#b91c1c" }}>— {order.rejectReason}</span>
            )}
          </div>

          {/* Customer */}
          {order.customer?.name && (
            <div>
              <div className="detail-section-title">Customer</div>
              <div className="detail-meta-grid">
                <MetaField label="Name"    value={order.customer.name} />
                {order.customer.phone   && <MetaField label="Phone"   value={order.customer.phone} />}
                {order.customer.address && <MetaField label="Address" value={order.customer.address} />}
              </div>
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <div style={{ background: "var(--warning-soft)", borderRadius: 10, padding: "10px 14px", fontSize: "0.88rem", color: "var(--text)" }}>
              <strong>Customer note:</strong> {order.notes}
            </div>
          )}

          {/* Timeline */}
          <div>
            <div className="detail-section-title">Timeline</div>
            <div className="oo-timeline">
              <TimelineRow label="Received"   ts={order.receivedAt} />
              <TimelineRow label="Accepted"   ts={order.acceptedAt}  duration={acceptMins} />
              <TimelineRow label="Food Ready" ts={order.foodReadyAt} duration={readyMins} />
              {order.rejectedAt && <TimelineRow label="Rejected" ts={order.rejectedAt} />}
            </div>
          </div>

          {/* Items */}
          {items.length > 0 && (
            <div>
              <div className="detail-section-title">Order Items</div>
              <table className="detail-items-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Price</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const price = Number(it.price || 0);
                    const qty   = Number(it.quantity || 1);
                    return (
                      <tr key={i}>
                        <td>
                          {it.name}
                          {it.note && <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>{it.note}</div>}
                        </td>
                        <td className="num-cell">{qty}</td>
                        <td className="num-cell">₹{price.toLocaleString("en-IN")}</td>
                        <td className="num-cell">₹{(price * qty).toLocaleString("en-IN")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Total */}
          <div className="detail-totals">
            <div className="detail-total-row">
              <span>Items Total</span>
              <span>₹{itemsTotal.toLocaleString("en-IN")}</span>
            </div>
            <div className="detail-total-row grand">
              <span>Grand Total</span>
              <span>₹{Number(order.total).toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ label, ts, duration }) {
  if (!ts) return null;
  return (
    <div className="oo-timeline-row">
      <div className="oo-timeline-dot" />
      <div className="oo-timeline-info">
        <span className="oo-timeline-label">{label}</span>
        <span className="oo-timeline-ts">{fmtTs(ts)}</span>
        {duration != null && <span className="oo-timeline-dur">{duration} min</span>}
      </div>
    </div>
  );
}

function MetaField({ label, value }) {
  return (
    <div className="detail-meta-item">
      <div className="detail-meta-label">{label}</div>
      <div className="detail-meta-value">{value ?? "—"}</div>
    </div>
  );
}

const PAGE_SIZE = 50;
const STATUSES = [
  { value: "", label: "All Status" },
  { value: "pending",    label: "Pending" },
  { value: "accepted",   label: "Accepted" },
  { value: "food_ready", label: "Food Ready" },
  { value: "rejected",   label: "Rejected" },
];

export function OnlineOrdersHistoryPage() {
  const today     = todayStr();
  const fiveDays  = daysAgoStr(4);
  const [dateFrom,  setDateFrom]  = useState(fiveDays);
  const [dateTo,    setDateTo]    = useState(today);
  const [platform,  setPlatform]  = useState("");
  const [status,    setStatus]    = useState("");
  const [orderNoQ,  setOrderNoQ]  = useState("");
  const [outlets,   setOutlets]   = useState([]);
  const [outletId,  setOutletId]  = useState("");
  const [page,      setPage]      = useState(1);
  const [data,      setData]      = useState({ rows: [], total: 0 });
  const [platforms, setPlatforms] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const searchRef = useRef({ dateFrom: fiveDays, dateTo: today, platform: "", status: "", outletId: "", page: 1 });

  async function load(params) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        dateFrom: params.dateFrom,
        dateTo:   params.dateTo,
        page:     params.page,
        pageSize: PAGE_SIZE,
      });
      if (params.outletId) qs.set("outletId", params.outletId);
      if (params.platform) qs.set("platform", params.platform);
      if (params.status)   qs.set("status",   params.status);
      const res = await api.get(`/online-orders/history?${qs}`);
      const rows = res.rows || [];
      setData({ rows, total: res.total || 0 });
      setPage(params.page);
      // Collect unique platforms from returned data
      const seen = new Set(rows.map(r => r.platform).filter(Boolean));
      setPlatforms(prev => {
        const combined = new Set([...prev, ...seen]);
        return [...combined];
      });
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.get("/outlets").then(r => { if (Array.isArray(r)) setOutlets(r); }).catch(() => {});
    const p = { dateFrom: fiveDays, dateTo: today, platform: "", status: "", outletId: "", page: 1 };
    searchRef.current = p;
    load(p);
  }, []);

  function handleSearch() {
    const p = { dateFrom, dateTo, platform, status, outletId, page: 1 };
    searchRef.current = p;
    load(p);
  }

  function handleShowAll() {
    const farPast = daysAgoStr(365);
    setDateFrom(farPast); setDateTo(today); setPlatform(""); setStatus(""); setOutletId(""); setOrderNoQ("");
    const p = { dateFrom: farPast, dateTo: today, platform: "", status: "", outletId: "", page: 1 };
    searchRef.current = p;
    load(p);
  }

  function selectPlatform(p) {
    setPlatform(p);
    const params = { ...searchRef.current, platform: p, page: 1 };
    searchRef.current = params;
    load(params);
  }

  function goPage(p) {
    const params = { ...searchRef.current, page: p };
    searchRef.current = params;
    load(params);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE + 1;
  const end   = Math.min(page * PAGE_SIZE, data.total);

  const visibleRows = orderNoQ.trim()
    ? data.rows.filter(r => String(r.orderId || r.id || "").toLowerCase().includes(orderNoQ.trim().toLowerCase()))
    : data.rows;

  return (
    <div className="page-root">
      <div className="page-header">
        <h1 className="page-title">Online Orders Activity</h1>
      </div>

      {/* Platform tabs */}
      <div className="lo-tabs">
        {["", ...platforms].map(p => (
          <button
            key={p || "all"}
            className={`lo-tab ${platform === p ? "lo-tab--active" : ""}`}
            onClick={() => selectPlatform(p)}
          >
            {p === "" ? "All" : p}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="orders-filters">
        <div className="filter-group">
          <label className="filter-label">Start Date</label>
          <input type="date" className="filter-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="filter-label">End Date</label>
          <input type="date" className="filter-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        {outlets.length > 1 && (
          <div className="filter-group">
            <label className="filter-label">Outlet</label>
            <select className="filter-select" value={outletId} onChange={e => setOutletId(e.target.value)}>
              <option value="">All Outlets</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
        <div className="filter-group">
          <label className="filter-label">Status</label>
          <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Order No.</label>
          <input
            type="text" className="filter-input" placeholder="Search order…"
            value={orderNoQ} onChange={e => setOrderNoQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            style={{ width: 130 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, alignSelf: "flex-end" }}>
          <button className="btn-primary" onClick={handleSearch} disabled={loading}>
            <span className="material-symbols-rounded" style={{ fontSize: 17 }}>search</span>
            Search
          </button>
          <button className="btn-outline" onClick={handleShowAll} disabled={loading}>
            Show All
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && data.total > 0 && (
        <div className="orders-summary-strip">
          <div className="orders-summary-item">
            <span className="orders-summary-label">Total Orders</span>
            <span className="orders-summary-value">{data.total.toLocaleString()}</span>
          </div>
          <div className="orders-summary-item orders-summary-highlight">
            <span className="orders-summary-label">Page Total</span>
            <span className="orders-summary-value">
              ₹{visibleRows.reduce((s, r) => s + Number(r.total || 0), 0).toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="orders-table-wrap">
        {loading ? (
          <div className="page-loading">Loading online orders…</div>
        ) : visibleRows.length === 0 ? (
          <div className="orders-empty">
            <span className="material-symbols-rounded" style={{ fontSize: 40, display: "block", marginBottom: 8, color: "var(--muted)" }}>delivery_dining</span>
            No online orders found for the selected period.
            <div style={{ fontSize: "0.8rem", marginTop: 6 }}>Try extending the date range or changing the platform filter.</div>
          </div>
        ) : (
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order No.</th>
                <th>Platform</th>
                <th>Customer</th>
                <th>Received</th>
                <th>Accepted</th>
                <th className="num-cell">Total</th>
                <th>Status</th>
                <th className="num-cell">Accept (min)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => {
                const acceptMins = minutesBetween(row.receivedAt, row.acceptedAt);
                return (
                  <tr
                    key={i}
                    className={selected === i ? "selected" : ""}
                    onClick={() => setSelected(selected === i ? null : i)}
                  >
                    <td><strong>{row.orderId || row.id}</strong></td>
                    <td><PlatformBadge platform={row.platform} /></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{row.customer?.name || "—"}</div>
                      {row.customer?.phone && (
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{row.customer.phone}</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>{fmtTs(row.receivedAt) || "—"}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>{fmtTs(row.acceptedAt) || "—"}</td>
                    <td className="num-cell"><strong>₹{Number(row.total).toLocaleString("en-IN")}</strong></td>
                    <td><StatusBadge status={row.status} /></td>
                    <td className="num-cell">{acceptMins != null ? `${acceptMins}m` : "—"}</td>
                    <td>
                      <button
                        className="oo-action-btn"
                        onClick={e => { e.stopPropagation(); setSelected(i); }}
                        title="View details"
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>open_in_new</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data.total > 0 && (
        <div className="orders-pagination">
          <span>Showing {start}–{end} of {data.total.toLocaleString()} orders</span>
          <div className="pagination-btns">
            <button className="pg-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
            <button className="pg-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
            <button className="pg-btn active">{page}</button>
            <button className="pg-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
            <button className="pg-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selected !== null && visibleRows[selected] && (
        <OrderDetailPanel order={visibleRows[selected]} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
