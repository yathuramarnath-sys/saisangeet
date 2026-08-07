import { useEffect, useMemo, useState } from "react";
import { getFinancials } from "./OrderPanel";
import { printBill } from "../lib/printBill";
import { api } from "../lib/api";
import { lsGet } from "../lib/ls";

const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Wallet", "Credit", "Zomato Pay", "Swiggy Pay"];

const FILTERS = [
  { id: "all",    label: "All" },
  { id: "cash",   label: "Cash" },
  { id: "card",   label: "Card" },
  { id: "upi",    label: "UPI" },
  { id: "online", label: "Online" },
];

function EditPaymentModal({ order, fin, onSave, onClose, saving }) {
  const [payments, setPayments] = useState(
    (order.payments || []).length
      ? (order.payments || []).map(p => ({ method: p.method, amount: p.amount }))
      : [{ method: "Cash", amount: fin.total }]
  );

  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const isValid   = paidTotal >= fin.total;

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sm-modal" style={{ maxWidth: 420 }}>
        <div className="sm-head">
          <div>
            <h3>✏️ Edit Payment</h3>
            <p className="sm-sub">Order #{order.orderNumber} · ₹{fin.total} due</p>
          </div>
          <button type="button" className="sm-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="sm-body" style={{ gap: 10 }}>
          <div className="ep-note">⚠️ Correcting a payment method updates the billing record. Use for genuine errors only.</div>
          {payments.map((p, idx) => (
            <div key={idx} className="ep-row">
              <select className="pset-select" style={{ flex: 1 }}
                value={p.method}
                onChange={e => setPayments(prev => prev.map((x, i) => i === idx ? { ...x, method: e.target.value } : x))}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
              <input type="number" className="pset-input" style={{ width: 110 }}
                value={p.amount}
                onChange={e => setPayments(prev => prev.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) || 0 } : x))} />
              {payments.length > 1 && (
                <button type="button" className="pset-icon-btn danger"
                  onClick={() => setPayments(prev => prev.filter((_, i) => i !== idx))}>🗑</button>
              )}
            </div>
          ))}
          <button type="button" className="ep-add-split-btn"
            onClick={() => setPayments(prev => [...prev, { method: "Card", amount: 0 }])}>
            + Add Split Payment
          </button>
          <div className={`ep-total-row${isValid ? " ok" : " short"}`}>
            <span>Paid: ₹{paidTotal}</span>
            <span>{isValid ? `✓ Covers ₹${fin.total}` : `₹${fin.total - paidTotal} still short`}</span>
          </div>
        </div>
        <div className="sm-footer">
          <button type="button" className="sm-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="sm-btn-action close-ok"
            disabled={!isValid || saving}
            onClick={() => onSave(payments)}>
            {saving ? "Saving…" : "Save Correction"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TransactionsTab({ orders, onEditPayment, outlet, outletId, cashierName, gstTreatment = "exclusive" }) {
  const [filter,       setFilter]       = useState("all");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState(null);
  const [serverOrders, setServerOrders] = useState([]);
  const [paymentOverrides, setPaymentOverrides] = useState({});
  const [editOrder,    setEditOrder]    = useState(null);
  const [savingPayment, setSavingPayment] = useState(false);

  const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  useEffect(() => {
    if (!outletId) return;
    api.get(`/operations/today-orders?outletId=${encodeURIComponent(outletId)}`)
      .then(list => setServerOrders(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [outletId]);

  const closedOrders = useMemo(() => {
    let local = [];
    try {
      local = lsGet("pos_closed_orders", []).filter(o => {
        if (!o.closedAt) return false;
        const d = new Date(o.closedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        if (d !== todayIST) return false;
        if (outletId && o._outletId && String(o._outletId) !== String(outletId)) return false;
        return true;
      });
    } catch {}

    if (!local.length) {
      local = Object.values(orders || {})
        .filter(o => o.isClosed && o.items?.length)
        .sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));
    }

    const merged = [...local];
    const seenKeys = new Set(local.map(o => String(o.billNo ?? `${o.orderNumber}-${o.closedAt}`)));
    for (const o of serverOrders) {
      const key = String(o.billNo ?? `${o.orderNumber}-${o.closedAt}`);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      merged.push(o);
    }
    return merged.sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));
  }, [orders, todayIST, outletId, serverOrders]);

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
    const fin = getFinancials(o, { gstTreatment });
    return s + (fin?.total || 0);
  }, 0);

  return (
    <>
      <div className="txn-header">
        <div className="txn-title">Transactions</div>
        <div className="txn-summary">
          {filtered.length} orders · ₹{totalRevenue.toLocaleString("en-IN")} today
        </div>
      </div>

      <div className="txn-toolbar">
        {FILTERS.map(f => (
          <button key={f.id} type="button"
            className={`txn-filter-tab${filter === f.id ? " active" : ""}`}
            onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <input
          className="txn-search"
          placeholder="Search order #, table, item…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="txn-list">
        {filtered.length === 0 && (
          <div className="txn-empty">No closed orders yet today</div>
        )}
        {filtered.map(order => {
          const key        = String(order.billNo ?? `${order.orderNumber}-${order.closedAt}`);
          const payments   = paymentOverrides[key] || order.payments;
          const fin        = getFinancials(order, { gstTreatment });
          const billLabel  = order.billNo != null ? `#${order.billNo}` : `#${order.orderNumber}`;
          const isExpanded = expanded === key;
          const payMethods = [...new Set((payments || []).map(p => p.method))].join(" + ");
          const tableLabel = order.isCounter
            ? `Ticket #${String(order.ticketNumber || "").padStart(3, "0")}`
            : `Table ${order.tableNumber}`;

          return (
            <div key={key} className="txn-card">
              <div className="txn-row" onClick={() => setExpanded(isExpanded ? null : key)}>
                <div className="txn-num">{billLabel}</div>
                <div className="txn-info">
                  <div className="txn-label">{tableLabel} · {order.areaName}</div>
                  <div className="txn-meta">
                    {new Date(order.closedAt || 0).toLocaleTimeString("en-IN", {
                      hour: "2-digit", minute: "2-digit", hour12: true
                    })}
                    {order.customer?.name && ` · ${order.customer.name}`}
                    {" · "}{(order.items || []).filter(i => !i.isVoided).length} items
                  </div>
                </div>
                <div className="txn-right">
                  <div className="txn-amount">₹{fin?.total?.toLocaleString("en-IN")}</div>
                  <div className="txn-method">{payMethods || "—"}</div>
                </div>
                <span className="txn-chevron">{isExpanded ? "▲" : "▼"}</span>
              </div>

              {isExpanded && (
                <div className="txn-detail">
                  <div className="txn-items-grid">
                    {(() => {
                      const validItems = (order.items || []).filter(i => !i.isVoided);
                      const groups = [];
                      const groupMap = new Map();
                      validItems.forEach(item => {
                        const k = item.kotNumber != null ? String(item.kotNumber) : "__none__";
                        if (!groupMap.has(k)) { groupMap.set(k, []); groups.push({ kotNumber: item.kotNumber, items: groupMap.get(k) }); }
                        groupMap.get(k).push(item);
                      });
                      return groups.map(({ kotNumber, items: gItems }) => (
                        <div key={kotNumber ?? "__none__"}>
                          {kotNumber != null && (
                            <div className="txn-kot-label">KOT #{String(kotNumber).padStart(4, "0")}</div>
                          )}
                          {gItems.map((item, i) => (
                            <div key={i} className="txn-item-row">
                              <span>{item.name}{item.isComp ? " 🎁" : ""} × {item.quantity}</span>
                              <span>{item.isComp ? "COMP" : `₹${item.price * item.quantity}`}</span>
                            </div>
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                  <div className="txn-fin-rows">
                    <div className="txn-fin-row"><span>Subtotal</span><span>₹{fin.subtotal}</span></div>
                    {fin.discountAmt > 0 && <div className="txn-fin-row discount"><span>Discount</span><span>−₹{fin.discountAmt}</span></div>}
                    <div className="txn-fin-row"><span>GST</span><span>₹{Math.round(fin.tax)}</span></div>
                    <div className="txn-fin-row bold"><span>Total</span><span>₹{fin.total}</span></div>
                  </div>
                  <div className="txn-pay-pills">
                    {(payments || []).map((p, i) => (
                      <span key={i} className="txn-pay-pill">{p.method} · ₹{p.amount}</span>
                    ))}
                  </div>
                  <div className="txn-actions">
                    <button type="button" className="txn-action-btn"
                      onClick={() => printBill(
                        order, order.items,
                        outlet || order.outletName || "Restaurant",
                        { cashierName: cashierName || "Cashier" }
                      )}>
                      🖨 Reprint Bill
                    </button>
                    <button type="button" className="txn-action-btn warn"
                      onClick={() => setEditOrder({ ...order, payments })}>
                      ✏️ Edit Payment
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editOrder && (
        <EditPaymentModal
          order={editOrder}
          fin={getFinancials(editOrder, { gstTreatment })}
          saving={savingPayment}
          onClose={() => !savingPayment && setEditOrder(null)}
          onSave={async (pmts) => {
            setSavingPayment(true);
            const ok = await onEditPayment(editOrder, pmts);
            setSavingPayment(false);
            if (ok === false) return;
            const k = String(editOrder.billNo ?? `${editOrder.orderNumber}-${editOrder.closedAt}`);
            setPaymentOverrides(prev => ({ ...prev, [k]: pmts }));
            setEditOrder(null);
          }}
        />
      )}
    </>
  );
}
