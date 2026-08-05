import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";

function fmt(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function inferOrderType(row) {
  const t = String(row._order?.tableId || row.tableNumber || "").toLowerCase();
  if (t.startsWith("counter")) return "pickup";
  if (t.startsWith("online"))  return "delivery";
  return "dinein";
}

const TYPE_LABELS = { dinein: "Dine In", pickup: "Pick Up", delivery: "Delivery" };
const TYPE_BADGE  = { dinein: "badge-dinein", pickup: "badge-pickup", delivery: "badge-delivery" };

function OrderDetailPanel({ row, onClose }) {
  const order = row._order || {};
  const items = (order.items || []).filter(it => !it.isVoided);

  const taxTotal = items.reduce((s, it) => {
    const price = Number(it.price || 0);
    const qty   = Number(it.quantity || it.qty || 1);
    const rate  = Number(it.taxRate || 0);
    return s + (price * qty * rate / 100);
  }, 0);

  return (
    <div className="detail-panel-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="detail-panel">
        <div className="detail-panel-header">
          <span className="detail-panel-title">Bill #{row.billNo}</span>
          <button className="detail-close" onClick={onClose}>
            <span className="material-symbols-rounded" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
        <div className="detail-panel-body">
          <div className="detail-meta-grid">
            <MetaField label="Table"    value={row.tableNumber} />
            <MetaField label="Outlet"   value={row.outletName} />
            <MetaField label="Date"     value={row.date} />
            <MetaField label="Time"     value={row.time} />
            <MetaField label="Cashier"  value={row.cashierName} />
            <MetaField label="Payment"  value={row.paymentMethods} />
            <MetaField label="Status"   value={
              <span className={`badge badge-${row.status.toLowerCase()}`}>{row.status}</span>
            } />
            {row.guests > 0 && <MetaField label="Guests" value={row.guests} />}
          </div>

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
                    const qty   = Number(it.quantity || it.qty || 1);
                    return (
                      <tr key={i}>
                        <td>
                          {it.name}
                          {it.note && <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>{it.note}</div>}
                        </td>
                        <td className="num-cell">{qty}</td>
                        <td className="num-cell">{fmt(price)}</td>
                        <td className="num-cell">{fmt(price * qty)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="detail-totals">
            <div className="detail-total-row">
              <span>Subtotal</span>
              <span>{fmt(row.subtotal)}</span>
            </div>
            {row.discount > 0 && (
              <div className="detail-total-row">
                <span>Discount</span>
                <span>− {fmt(row.discount)}</span>
              </div>
            )}
            {taxTotal > 0.01 && (
              <div className="detail-total-row">
                <span>Tax (GST)</span>
                <span>{fmt(Math.round(taxTotal))}</span>
              </div>
            )}
            <div className="detail-total-row grand">
              <span>Grand Total</span>
              <span>{fmt(row.totalPaid || row.net)}</span>
            </div>
          </div>
        </div>
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

export function AllOrdersPage() {
  const today   = todayStr();
  const weekAgo = daysAgoStr(6);
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo,   setDateTo]   = useState(today);
  const [outletId, setOutletId] = useState("");
  const [billNoQ,  setBillNoQ]  = useState("");
  const [outlets,  setOutlets]  = useState([]);
  const [page,     setPage]     = useState(1);
  const [data,     setData]     = useState({ orders: [], total: 0 });
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const searchRef = useRef({ dateFrom: weekAgo, dateTo: today, outletId: "", billNoQ: "", page: 1 });

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
      const res = await api.get(`/reports/orders?${qs}`);
      setData({ orders: res.orders || [], total: res.total || 0 });
      setPage(params.page);
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.get("/outlets").then(r => { if (Array.isArray(r)) setOutlets(r); }).catch(() => {});
    const p = { dateFrom: weekAgo, dateTo: today, outletId: "", page: 1 };
    searchRef.current = p;
    load(p);
  }, []);

  function handleSearch() {
    const p = { dateFrom, dateTo, outletId, billNoQ, page: 1 };
    searchRef.current = p;
    load(p);
  }

  function handleShowAll() {
    const farPast = daysAgoStr(365);
    setDateFrom(farPast);
    setDateTo(today);
    setOutletId("");
    setBillNoQ("");
    const p = { dateFrom: farPast, dateTo: today, outletId: "", billNoQ: "", page: 1 };
    searchRef.current = p;
    load(p);
  }

  function goPage(p) {
    const params = { ...searchRef.current, page: p };
    searchRef.current = params;
    load(params);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE + 1;
  const end   = Math.min(page * PAGE_SIZE, data.total);

  const visibleOrders = billNoQ.trim()
    ? data.orders.filter(r => String(r.billNo || "").includes(billNoQ.trim()))
    : data.orders;

  const pageSubtotal = visibleOrders.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  const pageDiscount = visibleOrders.reduce((s, r) => s + Number(r.discount || 0), 0);
  const pageTotal    = visibleOrders.reduce((s, r) => s + Number(r.totalPaid || r.net || 0), 0);

  return (
    <div className="page-root">
      <div className="page-header">
        <h1 className="page-title">All Orders</h1>
      </div>

      {/* Filters */}
      <div className="orders-filters">
        <div className="filter-group">
          <label className="filter-label">Start Date</label>
          <input
            type="date" className="filter-input"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">End Date</label>
          <input
            type="date" className="filter-input"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
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
          <label className="filter-label">Order No.</label>
          <input
            type="text" className="filter-input" placeholder="e.g. 976"
            value={billNoQ}
            onChange={e => setBillNoQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            style={{ width: 110 }}
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

      {/* Summary strip */}
      {!loading && data.total > 0 && (
        <div className="orders-summary-strip">
          <div className="orders-summary-item">
            <span className="orders-summary-label">Orders</span>
            <span className="orders-summary-value">{data.total.toLocaleString()}</span>
          </div>
          <div className="orders-summary-item">
            <span className="orders-summary-label">Page Subtotal</span>
            <span className="orders-summary-value">{fmt(pageSubtotal)}</span>
          </div>
          {pageDiscount > 0 && (
            <div className="orders-summary-item">
              <span className="orders-summary-label">Page Discount</span>
              <span className="orders-summary-value">− {fmt(pageDiscount)}</span>
            </div>
          )}
          <div className="orders-summary-item orders-summary-highlight">
            <span className="orders-summary-label">Page Total</span>
            <span className="orders-summary-value">{fmt(pageTotal)}</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="orders-table-wrap">
        {loading ? (
          <div className="page-loading">Loading orders…</div>
        ) : data.orders.length === 0 ? (
          <div className="orders-empty">
            <span className="material-symbols-rounded" style={{ fontSize: 40, display: "block", marginBottom: 8, color: "var(--muted)" }}>receipt_long</span>
            No orders found for the selected period.
            <div style={{ fontSize: "0.8rem", marginTop: 6 }}>Try extending the date range or check if bills have been printed for this period.</div>
          </div>
        ) : (
          <table className="orders-table">
            <thead>
              <tr>
                <th>Bill No</th>
                <th>Table</th>
                <th>Type</th>
                <th>Items</th>
                <th className="num-cell">Subtotal</th>
                <th className="num-cell">Discount</th>
                <th className="num-cell">Tax</th>
                <th className="num-cell">Grand Total</th>
                <th>Payment</th>
                <th>Cashier</th>
                <th>Date &amp; Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((row, i) => {
                const type = inferOrderType(row);
                const taxTotal = ((row._order?.items || []).filter(it => !it.isVoided)).reduce((s, it) => {
                  const price = Number(it.price || 0);
                  const qty   = Number(it.quantity || it.qty || 1);
                  const rate  = Number(it.taxRate || 0);
                  return s + (price * qty * rate / 100);
                }, 0);
                return (
                  <tr
                    key={i}
                    className={selected === i ? "selected" : ""}
                    onClick={() => setSelected(selected === i ? null : i)}
                  >
                    <td><strong>{row.billNo}</strong></td>
                    <td>{row.tableNumber}</td>
                    <td><span className={`badge ${TYPE_BADGE[type]}`}>{TYPE_LABELS[type]}</span></td>
                    <td>{row.items}</td>
                    <td className="num-cell">{fmt(row.subtotal)}</td>
                    <td className="num-cell">{row.discount > 0 ? `− ${fmt(row.discount)}` : "—"}</td>
                    <td className="num-cell">{taxTotal > 0.01 ? fmt(Math.round(taxTotal)) : "—"}</td>
                    <td className="num-cell"><strong>{fmt(row.totalPaid || row.net)}</strong></td>
                    <td style={{ textTransform: "capitalize" }}>{row.paymentMethods}</td>
                    <td>{row.cashierName}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{row.date}<br /><span style={{ color: "var(--muted)", fontSize: "0.8em" }}>{row.time}</span></td>
                    <td><span className={`badge badge-${row.status.toLowerCase()}`}>{row.status}</span></td>
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
            <button className="pg-btn" onClick={() => goPage(1)}       disabled={page === 1}>«</button>
            <button className="pg-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
            <button className="pg-btn active">{page}</button>
            <button className="pg-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
            <button className="pg-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
          </div>
        </div>
      )}

      {/* Detail slide panel */}
      {selected !== null && data.orders[selected] && (
        <OrderDetailPanel
          row={data.orders[selected]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
