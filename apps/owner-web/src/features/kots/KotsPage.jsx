import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../lib/api";

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
function inferType(tableNumber) {
  const t = String(tableNumber || "").toLowerCase();
  if (t.startsWith("counter")) return "pickup";
  if (t.startsWith("online"))  return "delivery";
  return "dinein";
}
const TYPE_LABELS = { dinein: "Dine In", pickup: "Pick Up", delivery: "Delivery" };
const TYPE_BADGE  = { dinein: "badge-dinein", pickup: "badge-pickup", delivery: "badge-delivery" };

function KotDetailPanel({ row, onClose }) {
  return (
    <div className="detail-panel-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="detail-panel">
        <div className="detail-panel-header">
          <span className="detail-panel-title">KOT #{row.kotNumber}</span>
          <button className="detail-close" onClick={onClose}>
            <span className="material-symbols-rounded" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
        <div className="detail-panel-body">
          <div className="detail-meta-grid">
            <MetaField label="Table"   value={row.tableNumber} />
            <MetaField label="Outlet"  value={row.outletName} />
            <MetaField label="Bill No" value={row.billNo || "—"} />
            <MetaField label="Captain" value={row.actorName} />
            <MetaField label="Date"    value={fmtDate(row.sentAt)} />
            <MetaField label="Time"    value={fmtTime(row.sentAt)} />
            <MetaField label="Status"  value={
              <span className={`badge ${row.isCreditSale ? "badge-credit" : "badge-paid"}`}>
                {row.isCreditSale ? "Credit" : "Billed"}
              </span>
            } />
          </div>

          {row.items.length > 0 && (
            <div>
              <div className="detail-section-title">Items in this KOT</div>
              <table className="detail-items-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {row.items.map((it, i) => (
                    <tr key={i}>
                      <td>{it.name}</td>
                      <td style={{ textAlign: "right" }}>{it.qty}</td>
                      <td style={{ textAlign: "right" }}>₹{Number(it.price).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

export function KotsPage() {
  const today   = todayStr();
  const weekAgo = daysAgoStr(6);
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo,   setDateTo]   = useState(today);
  const [outletId, setOutletId] = useState("");
  const [outlets,  setOutlets]  = useState([]);
  const [page,     setPage]     = useState(1);
  const [data,     setData]     = useState({ rows: [], total: 0 });
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const searchRef = useRef({ dateFrom: weekAgo, dateTo: today, outletId: "", page: 1 });

  const load = useCallback(async (params) => {
    const p = params || searchRef.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        dateFrom: p.dateFrom,
        dateTo:   p.dateTo,
        page:     p.page,
        pageSize: PAGE_SIZE,
      });
      if (p.outletId) qs.set("outletId", p.outletId);
      const res = await api.get(`/reports/kots?${qs}`);
      setData({ rows: res.rows || [], total: res.total || 0 });
      setPage(p.page);
      setLastUpdated(new Date());
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get("/outlets").then(r => { if (Array.isArray(r)) setOutlets(r); }).catch(() => {});
    const p = { dateFrom: weekAgo, dateTo: today, outletId: "", page: 1 };
    searchRef.current = p;
    load(p);
  }, [load]);

  // Auto-refresh every 30s when viewing a range that includes today
  useEffect(() => {
    const interval = setInterval(() => {
      const { dateTo: currentTo } = searchRef.current;
      if (currentTo >= today) load();
    }, 30_000);
    return () => clearInterval(interval);
  }, [load, today]);

  function handleSearch() {
    const p = { dateFrom, dateTo, outletId, page: 1 };
    searchRef.current = p;
    load(p);
  }

  function handleShowAll() {
    const farPast = daysAgoStr(365);
    setDateFrom(farPast); setDateTo(today); setOutletId("");
    const p = { dateFrom: farPast, dateTo: today, outletId: "", page: 1 };
    searchRef.current = p;
    load(p);
  }

  function goPage(p) {
    const params = { ...searchRef.current, page: p };
    searchRef.current = params;
    load(params);
  }

  const isLive = searchRef.current.dateTo >= today;

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE + 1;
  const end   = Math.min(page * PAGE_SIZE, data.total);

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <h1 className="page-title">KOT History</h1>
          {isLive && lastUpdated && (
            <p className="page-subtitle">
              Auto-refreshes every 30s · Last updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <button className="lo-refresh-btn" onClick={() => load()} disabled={loading}>
          <span className="material-symbols-rounded" style={{ fontSize: 17 }}>refresh</span>
          Refresh
        </button>
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
            <span className="orders-summary-label">KOTs</span>
            <span className="orders-summary-value">{data.total.toLocaleString()}</span>
          </div>
          <div className="orders-summary-item orders-summary-highlight">
            <span className="orders-summary-label">This Page</span>
            <span className="orders-summary-value">{data.rows.reduce((s, r) => s + r.itemCount, 0)} items</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="orders-table-wrap">
        {loading ? (
          <div className="page-loading">Loading KOT history…</div>
        ) : data.rows.length === 0 ? (
          <div className="orders-empty">
            <span className="material-symbols-rounded" style={{ fontSize: 40, display: "block", marginBottom: 8, color: "var(--muted)" }}>receipt</span>
            No KOTs found for the selected period.
            <div style={{ fontSize: "0.8rem", marginTop: 6 }}>Try extending the date range or check if bills have been printed.</div>
          </div>
        ) : (
          <table className="orders-table">
            <thead>
              <tr>
                <th>KOT No.</th>
                <th>Table</th>
                <th>Type</th>
                <th>Outlet</th>
                <th>Captain</th>
                <th className="num-cell">Items</th>
                <th>Items</th>
                <th>Status</th>
                <th>Date &amp; Time</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => {
                const type = inferType(row.tableNumber);
                return (
                  <tr
                    key={i}
                    className={selected === i ? "selected" : ""}
                    onClick={() => setSelected(selected === i ? null : i)}
                  >
                    <td><strong>#{row.kotNumber}</strong></td>
                    <td>{row.tableNumber}</td>
                    <td><span className={`badge ${TYPE_BADGE[type]}`}>{TYPE_LABELS[type]}</span></td>
                    <td>{row.outletName}</td>
                    <td>{row.actorName}</td>
                    <td className="num-cell">{row.itemCount}</td>
                    <td style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--muted)", fontSize: "0.82em" }}>
                      {row.items.map(i => i.name).join(", ") || "—"}
                    </td>
                    <td>
                      <span className={`badge ${row.isCreditSale ? "badge-credit" : "badge-paid"}`}>
                        {row.isCreditSale ? "Credit" : "Billed"}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {fmtDate(row.sentAt)}<br />
                      <span style={{ color: "var(--muted)", fontSize: "0.8em" }}>{fmtTime(row.sentAt)}</span>
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
          <span>Showing {start}–{end} of {data.total.toLocaleString()} KOTs</span>
          <div className="pagination-btns">
            <button className="pg-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
            <button className="pg-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
            <button className="pg-btn active">{page}</button>
            <button className="pg-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
            <button className="pg-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
          </div>
        </div>
      )}

      {selected !== null && data.rows[selected] && (
        <KotDetailPanel row={data.rows[selected]} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
