import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api";

function fmt(n) { return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

const STATUS_ALL     = "all";
const STATUS_UNPAID  = "unpaid";
const STATUS_PAID    = "paid";

const SETTLE_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque"];

export function CreditLedgerPage() {
  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [statusTab,   setStatusTab]   = useState(STATUS_UNPAID);
  const [search,      setSearch]      = useState("");

  // Settle modal state
  const [settling,    setSettling]    = useState(null);  // order being settled
  const [settleForm,  setSettleForm]  = useState({ method: "Cash", reference: "" });
  const [settleLoad,  setSettleLoad]  = useState(false);
  const [settleErr,   setSettleErr]   = useState("");

  const loadData = useCallback(async () => {
    try {
      const res = await api.get("/operations/credits");
      setOrders(Array.isArray(res) ? res : (res?.data || []));
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = orders.filter(o => {
    const matchStatus = statusTab === STATUS_ALL ? true
      : statusTab === STATUS_UNPAID ? o.creditStatus !== "paid"
      : o.creditStatus === "paid";
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || (o.creditCustomer?.name  || "").toLowerCase().includes(q)
      || (o.creditCustomer?.gstin || "").toLowerCase().includes(q)
      || (o.creditCustomer?.phone || "").toLowerCase().includes(q)
      || String(o.billNo || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const unpaidOrders  = orders.filter(o => o.creditStatus !== "paid");
  const totalOutstanding = unpaidOrders.reduce((s, o) => {
    const p = o.payments?.find(p => p.method === "credit");
    return s + (p?.amount || 0);
  }, 0);
  const uniqueCustomers = new Set(unpaidOrders.map(o => (o.creditCustomer?.name || "").toLowerCase().trim())).size;

  // ── Group by customer name ─────────────────────────────────────────────────
  const grouped = {};
  for (const o of filtered) {
    const key = (o.creditCustomer?.name || "Unknown").trim();
    if (!grouped[key]) grouped[key] = { customer: o.creditCustomer, orders: [] };
    grouped[key].orders.push(o);
  }

  // ── Settle handler ─────────────────────────────────────────────────────────
  async function handleSettle() {
    if (!settling) return;
    setSettleLoad(true);
    setSettleErr("");
    try {
      const id = settling.id || settling.orderNumber;
      await api.post(`/operations/credits/${id}/settle`, {
        method:    settleForm.method,
        reference: settleForm.reference.trim() || null,
      });
      setSettling(null);
      setSettleForm({ method: "Cash", reference: "" });
      await loadData();
    } catch (err) {
      setSettleErr(err?.message || "Failed to settle. Please try again.");
    } finally {
      setSettleLoad(false);
    }
  }

  function openSettle(order) {
    setSettling(order);
    setSettleForm({ method: "Cash", reference: "" });
    setSettleErr("");
  }

  const creditAmount = (o) => {
    const p = o.payments?.find(p => p.method === "credit");
    return p?.amount || 0;
  };

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>Credit Ledger</h2>
        </div>
        <div className="topbar-actions">
          <input
            className="rpt-date-input"
            type="text"
            placeholder="Search customer, GSTIN, bill…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 220, padding: "6px 10px", borderRadius: 8 }}
          />
          <button className="topbar-btn" onClick={loadData}>↺ Refresh</button>
        </div>
      </header>

      {/* Stats row */}
      <div className="shift-stats-row">
        <div className={`shift-stat${totalOutstanding > 0 ? " bad" : ""}`}>
          <strong>{fmt(totalOutstanding)}</strong>
          <span>Total Outstanding</span>
        </div>
        <div className="shift-stat">
          <strong>{unpaidOrders.length}</strong>
          <span>Unpaid Bills</span>
        </div>
        <div className="shift-stat">
          <strong>{uniqueCustomers}</strong>
          <span>Customers with Dues</span>
        </div>
        <div className="shift-stat">
          <strong>{orders.filter(o => o.creditStatus === "paid").length}</strong>
          <span>Settled Bills</span>
        </div>
      </div>

      {/* Alert banner */}
      {unpaidOrders.length > 0 && (
        <div className="shift-alert-banner">
          ⚠️ {unpaidOrders.length} unpaid credit bill{unpaidOrders.length > 1 ? "s" : ""} — {fmt(totalOutstanding)} outstanding
        </div>
      )}

      {/* Status tabs */}
      <div style={{ padding: "0 24px 0", display: "flex", gap: 8, marginBottom: 16 }}>
        {[STATUS_UNPAID, STATUS_ALL, STATUS_PAID].map(t => (
          <button
            key={t}
            className={`shift-filter-tab${statusTab === t ? " active" : ""}`}
            onClick={() => setStatusTab(t)}
          >
            {t === STATUS_UNPAID ? "Unpaid" : t === STATUS_PAID ? "Settled" : "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="shift-empty" style={{ padding: "48px 24px" }}>Loading credit records…</div>
      ) : filtered.length === 0 ? (
        <div className="shift-empty" style={{ padding: "48px 24px", textAlign: "center" }}>
          {statusTab === STATUS_UNPAID
            ? "No unpaid credit bills — all accounts clear ✓"
            : "No credit bills found"}
        </div>
      ) : (
        <div style={{ padding: "0 24px 40px" }}>
          {Object.entries(grouped).map(([customerName, { customer, orders: custOrders }]) => {
            const custOutstanding = custOrders
              .filter(o => o.creditStatus !== "paid")
              .reduce((s, o) => s + creditAmount(o), 0);
            return (
              <div key={customerName} className="credit-customer-card">
                <div className="credit-customer-head">
                  <div className="credit-customer-info">
                    <strong className="credit-customer-name">{customerName}</strong>
                    <div className="credit-customer-meta">
                      {customer?.gstin    && <span className="credit-gstin-badge">GST: {customer.gstin}</span>}
                      {customer?.phone    && <span>📞 {customer.phone}</span>}
                      {customer?.address  && <span>📍 {customer.address}</span>}
                    </div>
                  </div>
                  {custOutstanding > 0 && (
                    <div className="credit-outstanding-chip">
                      <span>Outstanding</span>
                      <strong>{fmt(custOutstanding)}</strong>
                    </div>
                  )}
                </div>

                <div className="credit-bills-list">
                  {custOrders.map(o => {
                    const amt     = creditAmount(o);
                    const isPaid  = o.creditStatus === "paid";
                    return (
                      <div key={o.id || o.orderNumber} className={`credit-bill-row${isPaid ? " credit-bill-paid" : ""}`}>
                        <div className="credit-bill-left">
                          <span className="credit-bill-no">Bill #{o.billNo || o.orderNumber}</span>
                          {o.creditCustomer?.poNumber && (
                            <span className="credit-po">PO: {o.creditCustomer.poNumber}</span>
                          )}
                          <span className="credit-bill-date">{fmtDate(o.closedAt)} · {fmtTime(o.closedAt)}</span>
                          <span className="credit-outlet">{o.outletName || ""}</span>
                          {o.creditCustomer?.gstin && (
                            <span className="credit-tax-badge">TAX INVOICE</span>
                          )}
                        </div>
                        <div className="credit-bill-right">
                          <span className="credit-bill-amt">{fmt(amt)}</span>
                          {isPaid ? (
                            <span className="credit-settled-badge">
                              ✓ Settled · {o.creditSettledMethod} · {fmtDate(o.creditSettledAt)}
                            </span>
                          ) : (
                            <button
                              className="credit-settle-btn"
                              onClick={() => openSettle(o)}
                            >
                              Settle
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Settle modal */}
      {settling && (
        <div className="modal-overlay" onClick={() => setSettling(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Settle Credit Bill</h3>
              <button className="modal-close" onClick={() => setSettling(null)}>✕</button>
            </div>
            <div style={{ padding: "16px 20px 20px" }}>
              <div className="credit-settle-summary">
                <div><span>Customer</span><strong>{settling.creditCustomer?.name}</strong></div>
                <div><span>Bill No</span><strong>#{settling.billNo || settling.orderNumber}</strong></div>
                <div><span>Date</span><strong>{fmtDate(settling.closedAt)}</strong></div>
                <div className="credit-settle-total"><span>Amount</span><strong>{fmt(creditAmount(settling))}</strong></div>
              </div>

              <div className="form-field" style={{ marginTop: 16 }}>
                <label className="form-label">Payment Received Via</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {SETTLE_METHODS.map(m => (
                    <button
                      key={m}
                      type="button"
                      className={`shift-filter-tab${settleForm.method === m ? " active" : ""}`}
                      onClick={() => setSettleForm(p => ({ ...p, method: m }))}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-field" style={{ marginTop: 12 }}>
                <label className="form-label">Reference / Transaction ID <span style={{ color: "#999", fontWeight: 400 }}>(optional)</span></label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="UTR, cheque no., etc."
                  value={settleForm.reference}
                  onChange={e => setSettleForm(p => ({ ...p, reference: e.target.value }))}
                  style={{ marginTop: 6 }}
                />
              </div>

              {settleErr && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{settleErr}</p>}

              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setSettling(null)}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  style={{ flex: 2 }}
                  disabled={settleLoad}
                  onClick={handleSettle}
                >
                  {settleLoad ? "Saving…" : `Mark as Paid · ${fmt(creditAmount(settling))}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
