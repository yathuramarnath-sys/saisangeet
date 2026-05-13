import { useMemo, useState } from "react";
import { getFinancials } from "./OrderPanel";
import { printBill } from "../lib/printBill";

const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Wallet", "Zomato Pay", "Swiggy Pay"];

/* ── Edit Payment Modal ───────────────────────────────────────────────────── */
function EditPaymentModal({ order, fin, onSave, onClose }) {
  const existing = (order.payments || []);
  const [payments, setPayments] = useState(
    existing.length
      ? existing.map(p => ({ method: p.method, amount: p.amount }))
      : [{ method: "Cash", amount: fin.total }]
  );

  function updateMethod(idx, method) {
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, method } : p));
  }
  function updateAmount(idx, val) {
    const n = Number(val) || 0;
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, amount: n } : p));
  }
  function addSplit() {
    setPayments(prev => [...prev, { method: "Card", amount: 0 }]);
  }
  function removeRow(idx) {
    if (payments.length === 1) return;
    setPayments(prev => prev.filter((_, i) => i !== idx));
  }

  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const isValid   = paidTotal >= fin.total;

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sm-modal" style={{ maxWidth: 420 }}>
        <div className="sm-head">
          <div>
            <h3>✏️ Edit Payment</h3>
            <p className="sm-sub">
              Order #{order.orderNumber} · ₹{fin.total} due
            </p>
          </div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="sm-body" style={{ gap: 10 }}>
          <div className="ep-note">
            ⚠️ Correcting a payment method updates the billing record. Use for genuine errors only.
          </div>

          {payments.map((p, idx) => (
            <div key={idx} className="ep-row">
              <select className="pset-select" style={{ flex: 1 }}
                value={p.method}
                onChange={e => updateMethod(idx, e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
              <input
                type="number"
                className="pset-input"
                style={{ width: 110 }}
                value={p.amount}
                onChange={e => updateAmount(idx, e.target.value)}
              />
              {payments.length > 1 && (
                <button type="button" className="pset-icon-btn danger" onClick={() => removeRow(idx)}>🗑</button>
              )}
            </div>
          ))}

          <button type="button" className="ep-add-split-btn" onClick={addSplit}>
            + Add Split Payment
          </button>

          <div className={`ep-total-row${isValid ? " ok" : " short"}`}>
            <span>Paid: ₹{paidTotal}</span>
            <span>{isValid ? `✓ Covers ₹${fin.total}` : `₹${fin.total - paidTotal} still short`}</span>
          </div>
        </div>

        <div className="sm-footer">
          <button type="button" className="sm-btn-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="sm-btn-action close-ok"
            disabled={!isValid}
            onClick={() => onSave(payments)}>
            Save Correction
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Past Orders Modal ────────────────────────────────────────────────────── */
export function PastOrdersModal({ orders, onClose, onEditPayment, outlet, outletName, cashierName }) {
  const [filter,    setFilter]    = useState("all");   // all | cash | card | upi | online
  const [search,    setSearch]    = useState("");
  const [editOrder, setEditOrder] = useState(null);
  const [expanded,  setExpanded]  = useState(null);

  // Today-only: cashier should only see today's bills, not historical data.
  // We filter by closedAt matching today's IST date string (YYYY-MM-DD).
  const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const closedOrders = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("pos_closed_orders") || "[]");
      // Filter to today's orders only (IST date match)
      const todayOrders = stored.filter(o => {
        if (!o.closedAt) return false;
        const d = new Date(o.closedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        return d === todayIST;
      });
      if (todayOrders.length > 0) return todayOrders;
    } catch {}
    // Fallback: in-memory closed orders from this session (today only)
    return Object.values(orders || {})
      .filter(o => o.isClosed && o.items?.length)
      .sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));
  }, [orders, todayIST]);

  const filtered = useMemo(() => {
    let list = closedOrders;
    if (filter !== "all") {
      list = list.filter(o =>
        (o.payments || []).some(p => p.method?.toLowerCase().includes(filter))
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(o =>
        String(o.orderNumber).includes(q) ||
        String(o.tableNumber).toLowerCase().includes(q) ||
        (o.customer?.name || "").toLowerCase().includes(q) ||
        (o.items || []).some(i => i.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [closedOrders, filter, search]);

  const totalRevenue = filtered.reduce((s, o) => {
    const fin = getFinancials(o);
    return s + (fin?.total || 0);
  }, 0);

  const FILTERS = [
    { id: "all",  label: "All Orders" },
    { id: "cash", label: "Cash"       },
    { id: "card", label: "Card"       },
    { id: "upi",  label: "UPI"        },
  ];

  return (
    <>
      <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="past-modal sm-modal wide" style={{ maxWidth: 680, maxHeight: "85vh" }}>

          {/* Header */}
          <div className="sm-head">
            <div>
              <h3>📋 Past Orders</h3>
              <p className="sm-sub">
                {filtered.length} orders · ₹{totalRevenue.toLocaleString("en-IN")} total
              </p>
            </div>
            <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Filters + search */}
          <div className="past-toolbar">
            <div className="past-filter-tabs">
              {FILTERS.map(f => (
                <button key={f.id} type="button"
                  className={`past-filter-tab${filter === f.id ? " active" : ""}`}
                  onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <input
              className="pset-input sm"
              placeholder="Search order, table, item…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 160 }}
            />
          </div>

          {/* Order list */}
          <div className="past-list">
            {filtered.length === 0 && (
              <div className="pset-empty" style={{ padding: 32 }}>
                No closed orders found
              </div>
            )}
            {filtered.map(order => {
              const fin        = getFinancials(order);
              const billLabel  = order.billNo != null ? `#${order.billNo}` : `#${order.orderNumber}`;
              const isExpanded = expanded === (order.billNo ?? order.orderNumber);
              const payMethods = [...new Set((order.payments || []).map(p => p.method))].join(" + ");
              const label      = order.isCounter
                ? `Ticket #${String(order.ticketNumber || "").padStart(3, "0")}`
                : `Table ${order.tableNumber}`;

              return (
                <div key={order.billNo ?? order.orderNumber} className="past-order-card">
                  {/* Summary row */}
                  <div className="past-order-row"
                    onClick={() => setExpanded(isExpanded ? null : (order.billNo ?? order.orderNumber))}>
                    <div className="past-order-left">
                      <span className="past-order-num">{billLabel}</span>
                      <div>
                        <div className="past-order-label">{label} · {order.areaName}</div>
                        <div className="past-order-meta">
                          {new Date(order.closedAt || 0).toLocaleTimeString("en-IN", {
                            hour: "2-digit", minute: "2-digit", hour12: true
                          })}
                          {order.customer?.name && ` · ${order.customer.name}`}
                          {" · "}
                          {order.items?.filter(i => !i.isVoided).length} items
                        </div>
                      </div>
                    </div>
                    <div className="past-order-right">
                      <span className="past-order-total">₹{fin?.total?.toLocaleString("en-IN")}</span>
                      <span className="past-order-method">{payMethods || "—"}</span>
                      <span className="past-chevron">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="past-order-detail">
                      <div className="past-items-list">
                        {(order.items || []).filter(i => !i.isVoided).map((item, i) => (
                          <div key={i} className="past-item-row">
                            <span>{item.name}{item.isComp ? " 🎁" : ""} × {item.quantity}</span>
                            <span>{item.isComp ? "COMP" : `₹${item.price * item.quantity}`}</span>
                          </div>
                        ))}
                      </div>
                      <div className="past-fin-rows">
                        <div className="past-fin-row"><span>Subtotal</span><span>₹{fin.subtotal}</span></div>
                        {fin.discountAmt > 0 && <div className="past-fin-row discount"><span>Discount</span><span>−₹{fin.discountAmt}</span></div>}
                        <div className="past-fin-row"><span>GST</span><span>₹{Math.round(fin.tax)}</span></div>
                        <div className="past-fin-row bold"><span>Total</span><span>₹{fin.total}</span></div>
                      </div>
                      <div className="past-payments">
                        {(order.payments || []).map((p, i) => (
                          <span key={i} className="past-pay-pill">{p.method} · ₹{p.amount}</span>
                        ))}
                      </div>
                      <div className="past-actions">
                        <button type="button" className="past-action-btn"
                          onClick={() => printBill(
                            order,
                            order.items,
                            outlet || outletName || order.outletName || "Restaurant",
                            { cashierName: cashierName || "Cashier" }
                          )}>
                          🖨 Reprint Bill
                        </button>
                        <button type="button" className="past-action-btn warn"
                          onClick={() => setEditOrder(order)}>
                          ✏️ Edit Payment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* Edit payment sub-modal */}
      {editOrder && (
        <EditPaymentModal
          order={editOrder}
          fin={getFinancials(editOrder)}
          onClose={() => setEditOrder(null)}
          onSave={(payments) => {
            onEditPayment(editOrder, payments);
            setEditOrder(null);
            setExpanded(null);
          }}
        />
      )}
    </>
  );
}
