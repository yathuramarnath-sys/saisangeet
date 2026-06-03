/**
 * CreditSettlePanel — Outstanding credit bill settlement for POS cashier
 *
 * Cashier opens this when a customer walks in to pay their credit bill.
 * - Fetches all unpaid credit bills for this outlet from backend
 * - Search by customer name / bill number
 * - Settle inline: select method (Cash / UPI / Card / Bank Transfer)
 * - On settle: records to backend + saves to pos_credit_collections
 *   so the shift report can include "Credit Collected" in cash drawer
 */

import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

const SETTLE_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque"];
const CREDIT_COLLECTIONS_KEY = "pos_credit_collections";

export function saveCreditCollection(shiftId, entry) {
  try {
    const all = JSON.parse(localStorage.getItem(CREDIT_COLLECTIONS_KEY) || "[]");
    all.push({ shiftId, ...entry, recordedAt: new Date().toISOString() });
    localStorage.setItem(CREDIT_COLLECTIONS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function getCreditCollectionsForShift(shiftId) {
  try {
    const all = JSON.parse(localStorage.getItem(CREDIT_COLLECTIONS_KEY) || "[]");
    return all.filter(c => c.shiftId === shiftId);
  } catch { return []; }
}

function fmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function CreditSettlePanel({ activeShift, onClose }) {
  const [bills,           setBills]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState("");
  const [settling,        setSettling]        = useState(null);  // single bill being settled
  const [settlingAll,     setSettlingAll]     = useState(null);  // { customerName, bills[], total }
  const [method,          setMethod]          = useState("Cash");
  const [reference,       setReference]       = useState("");
  const [saving,          setSaving]          = useState(false);
  const [settleErr,       setSettleErr]       = useState("");
  const [justSettled,     setJustSettled]     = useState(null); // show success flash

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/operations/credits");
      const all = Array.isArray(res) ? res : (res?.data || []);
      setBills(all.filter(b => b.creditStatus !== "paid"));
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = bills.filter(b => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (b.creditCustomer?.name  || "").toLowerCase().includes(q) ||
      String(b.billNo || b.orderNumber || "").toLowerCase().includes(q) ||
      (b.creditCustomer?.phone || "").includes(q)
    );
  });

  // Group by customer
  const grouped = {};
  for (const b of filtered) {
    const key = (b.creditCustomer?.name || "Unknown").trim();
    if (!grouped[key]) grouped[key] = { customer: b.creditCustomer, bills: [] };
    grouped[key].bills.push(b);
  }

  const totalOutstanding = bills.reduce((s, b) => {
    const p = b.payments?.find(p => p.method === "credit");
    return s + (p?.amount || 0);
  }, 0);

  function creditAmt(bill) {
    const p = bill.payments?.find(p => p.method === "credit");
    return p?.amount || 0;
  }

  function openSettle(bill) {
    setSettling(bill);
    setMethod("Cash");
    setReference("");
    setSettleErr("");
  }

  function openSettleAll(customerName, custBills) {
    const total = custBills.reduce((s, b) => s + creditAmt(b), 0);
    setSettlingAll({ customerName, bills: custBills, total });
    setMethod("Cash");
    setReference("");
    setSettleErr("");
  }

  async function handleSettle() {
    if (!settling) return;
    setSaving(true);
    setSettleErr("");
    try {
      const id = settling.id || settling.orderNumber;
      await api.post(`/operations/credits/${id}/settle`, {
        method,
        reference: reference.trim() || null,
      });
      if (activeShift?.id) {
        saveCreditCollection(activeShift.id, {
          billId:   String(id),
          customer: settling.creditCustomer?.name || "Customer",
          amount:   creditAmt(settling),
          method,
          reference: reference.trim() || null,
          billNo:   settling.billNo || settling.orderNumber,
        });
      }
      setJustSettled({ name: settling.creditCustomer?.name, amount: creditAmt(settling), method });
      setSettling(null);
      await load();
      setTimeout(() => setJustSettled(null), 4000);
    } catch (err) {
      setSettleErr(err?.message || "Failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSettleAll() {
    if (!settlingAll) return;
    setSaving(true);
    setSettleErr("");
    try {
      await api.post("/operations/credits/settle-customer", {
        customerName: settlingAll.customerName,
        method,
        reference: reference.trim() || null,
      });
      if (activeShift?.id) {
        saveCreditCollection(activeShift.id, {
          billId:   `all-${settlingAll.customerName}`,
          customer: settlingAll.customerName,
          amount:   settlingAll.total,
          method,
          reference: reference.trim() || null,
          billNo:   `${settlingAll.bills.length} bills`,
        });
      }
      setJustSettled({ name: settlingAll.customerName, amount: settlingAll.total, method });
      setSettlingAll(null);
      await load();
      setTimeout(() => setJustSettled(null), 4000);
    } catch (err) {
      setSettleErr(err?.message || "Failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="csp-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="csp-panel">

        {/* Header */}
        <div className="csp-head">
          <div>
            <h3>💳 Credit Bills</h3>
            <p className="csp-sub">
              {bills.length > 0
                ? `${bills.length} unpaid · ${fmt(totalOutstanding)} outstanding`
                : "All credit bills settled ✓"}
            </p>
          </div>
          <button type="button" className="csp-close" onClick={onClose}>✕</button>
        </div>

        {/* Search */}
        <div className="csp-search-row">
          <input
            type="search"
            className="csp-search"
            placeholder="Search customer name or bill number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* Success flash */}
        {justSettled && (
          <div className="csp-success-banner">
            ✓ Settled {fmt(justSettled.amount)} from <strong>{justSettled.name}</strong> via {justSettled.method}
            {["Cash", "UPI", "Card"].includes(justSettled.method) && " — added to shift totals"}
          </div>
        )}

        {/* Bills list */}
        <div className="csp-body">
          {loading ? (
            <div className="csp-empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="csp-empty">
              {bills.length === 0
                ? "🎉 No outstanding credit bills"
                : "No results for \"" + search + "\""}
            </div>
          ) : (
            Object.entries(grouped).map(([customerName, { customer, bills: custBills }]) => {
              const custTotal = custBills.reduce((s, b) => s + creditAmt(b), 0);
              return (
                <div key={customerName} className="csp-customer-block">
                  <div className="csp-customer-head">
                    <div className="csp-customer-info">
                      <span className="csp-customer-name">{customerName}</span>
                      {customer?.phone && <span className="csp-customer-phone">📞 {customer.phone}</span>}
                      {customer?.gstin && <span className="csp-gstin-badge">GST</span>}
                    </div>
                    <div className="csp-customer-right">
                      <span className="csp-customer-total">{fmt(custTotal)}</span>
                      <span className="csp-bill-count">{custBills.length} bill{custBills.length > 1 ? "s" : ""}</span>
                      {custBills.length > 1 && (
                        <button type="button" className="csp-settle-all-btn"
                          onClick={() => openSettleAll(customerName, custBills)}>
                          Settle All
                        </button>
                      )}
                    </div>
                  </div>

                  {custBills.map(bill => (
                    <div key={bill.id || bill.orderNumber} className="csp-bill-row">
                      <div className="csp-bill-meta">
                        <span className="csp-bill-no">Bill #{bill.billNo || bill.orderNumber}</span>
                        {bill.creditCustomer?.poNumber &&
                          <span className="csp-bill-po">PO: {bill.creditCustomer.poNumber}</span>}
                        <span className="csp-bill-date">{fmtDate(bill.closedAt)}</span>
                      </div>
                      <div className="csp-bill-right">
                        <span className="csp-bill-amt">{fmt(creditAmt(bill))}</span>
                        <button
                          type="button"
                          className="csp-settle-btn"
                          onClick={() => openSettle(bill)}
                        >
                          Collect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Settle inline modal */}
        {settling && (
          <div className="csp-settle-modal-bg" onClick={() => setSettling(null)}>
            <div className="csp-settle-modal" onClick={e => e.stopPropagation()}>
              <div className="csp-settle-head">
                <h4>Collect Payment</h4>
                <button type="button" onClick={() => setSettling(null)} className="csp-close sm">✕</button>
              </div>

              <div className="csp-settle-summary">
                <div><span>Customer</span><strong>{settling.creditCustomer?.name}</strong></div>
                <div><span>Bill</span><strong>#{settling.billNo || settling.orderNumber}</strong></div>
                <div className="highlight"><span>Amount</span><strong>{fmt(creditAmt(settling))}</strong></div>
              </div>

              <div className="csp-settle-methods">
                {SETTLE_METHODS.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`csp-method-btn${method === m ? " active" : ""}`}
                    onClick={() => setMethod(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <input
                type="text"
                className="csp-ref-input"
                placeholder="Reference / UTR / Cheque no. (optional)"
                value={reference}
                onChange={e => setReference(e.target.value)}
              />

              {settleErr && <p className="csp-err">{settleErr}</p>}

              <div className="csp-settle-actions">
                <button type="button" className="csp-cancel-btn" onClick={() => setSettling(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="csp-confirm-btn"
                  disabled={saving}
                  onClick={handleSettle}
                >
                  {saving ? "Saving…" : `✓ Mark Collected · ${fmt(creditAmt(settling))}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Settle ALL bills for one customer ── */}
        {settlingAll && (
          <div className="csp-settle-modal-bg" onClick={() => setSettlingAll(null)}>
            <div className="csp-settle-modal" onClick={e => e.stopPropagation()}>
              <div className="csp-settle-head">
                <h4>Settle All Bills</h4>
                <button type="button" onClick={() => setSettlingAll(null)} className="csp-close sm">✕</button>
              </div>

              <div className="csp-settle-summary">
                <div><span>Customer</span><strong>{settlingAll.customerName}</strong></div>
                <div><span>Bills</span><strong>{settlingAll.bills.length} unpaid bills</strong></div>
                {settlingAll.bills.map(b => (
                  <div key={b.id} className="csp-settle-bill-line">
                    <span>Bill #{b.billNo || b.orderNumber} · {fmtDate(b.closedAt)}</span>
                    <span>{fmt(creditAmt(b))}</span>
                  </div>
                ))}
                <div className="highlight" style={{ marginTop: 6 }}>
                  <span>Total Outstanding</span>
                  <strong>{fmt(settlingAll.total)}</strong>
                </div>
              </div>

              <div className="csp-settle-methods">
                {SETTLE_METHODS.map(m => (
                  <button key={m} type="button"
                    className={`csp-method-btn${method === m ? " active" : ""}`}
                    onClick={() => setMethod(m)}>{m}</button>
                ))}
              </div>

              <input type="text" className="csp-ref-input"
                placeholder="Reference / UTR / Cheque no. (optional)"
                value={reference}
                onChange={e => setReference(e.target.value)}
              />

              {settleErr && <p className="csp-err">{settleErr}</p>}

              <div className="csp-settle-actions">
                <button type="button" className="csp-cancel-btn" onClick={() => setSettlingAll(null)}>
                  Cancel
                </button>
                <button type="button" className="csp-confirm-btn" disabled={saving} onClick={handleSettleAll}>
                  {saving ? "Settling…" : `✓ Settle All · ${fmt(settlingAll.total)}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
