/**
 * OnlineSalesPage.jsx
 *
 * Settlement Dashboard — shows owners the full picture of their Swiggy / Zomato payouts:
 * - Gross sales vs net credited to bank
 * - Commission, ads, tax deductions breakdown
 * - History of all settlement cycles
 *
 * Data is entered manually by the owner from their Swiggy/Zomato annexure XLSX/PDF.
 */

import { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n)  { return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function pct(a, b) { if (!b) return "0%"; return ((Number(a) / Number(b)) * 100).toFixed(1) + "%"; }
function num(v)  { return Number(v) || 0; }
function dateFmt(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

// ── Platform colours ─────────────────────────────────────────────────────────
const PLATFORM = {
  swiggy: { label: "Swiggy", color: "#FC8019", bg: "#FFF4EC", icon: "🍊" },
  zomato: { label: "Zomato", color: "#E23744", bg: "#FFF0F1", icon: "🔴" },
};

// ── Empty form state ──────────────────────────────────────────────────────────
const EMPTY_FORM = {
  platform: "swiggy",
  outletId: "", outletName: "",
  periodFrom: "", periodTo: "", settlementDate: "", bankUTR: "",
  orders: "",
  itemTotal: "", packagingCharges: "", discountShare: "", gstCollected: "",
  totalCustomerPaid: "",
  commission: "", commissionPct: "", gstOnPlatformFees: "", paymentCharges: "",
  otherPlatformFees: "",
  customerComplaints: "", adsDeductions: "",
  gstDeduction: "", tds: "", tcs: "",
  netPayout: "",
  notes: "",
};

// ── Settlement form Modal ─────────────────────────────────────────────────────
function AddSettlementModal({ onSave, onClose, outlets }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-calc totalCustomerPaid when components change
  const calcTotal = () => {
    const t = num(form.itemTotal) + num(form.packagingCharges)
            - num(form.discountShare) + num(form.gstCollected);
    return t > 0 ? t.toFixed(2) : "";
  };

  // Auto-calc netPayout as verification
  const calcNet = () => {
    const gross    = num(form.totalCustomerPaid) || (num(form.itemTotal) + num(form.packagingCharges) - num(form.discountShare) + num(form.gstCollected));
    const deducts  = num(form.commission) + num(form.gstOnPlatformFees) + num(form.paymentCharges)
                   + num(form.otherPlatformFees) + num(form.customerComplaints) + num(form.adsDeductions)
                   + num(form.gstDeduction) + num(form.tds) + num(form.tcs);
    const net = gross - deducts;
    return net > 0 ? net.toFixed(2) : "";
  };

  const fld = (label, key, opts = {}) => (
    <label className="stl-fld">
      <span>{label}</span>
      <input
        type={opts.type || "number"}
        step={opts.step || "0.01"}
        min={opts.min || "0"}
        placeholder={opts.placeholder || "0"}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        required={opts.required}
      />
    </label>
  );

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    if (!form.platform || !form.outletId || !form.periodFrom || !form.periodTo) {
      return setErr("Platform, Branch, Period From and Period To are required.");
    }
    if (!num(form.itemTotal) && !num(form.totalCustomerPaid)) {
      return setErr("Enter at least Item Total or Total Customer Paid.");
    }

    const payload = {
      ...form,
      totalCustomerPaid: form.totalCustomerPaid || calcTotal(),
      netPayout: form.netPayout || calcNet(),
    };

    setBusy(true);
    try {
      await onSave(payload);
      onClose();
    } catch (e) {
      setErr(e.message || "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stl-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="stl-modal">
        <div className="stl-modal-head">
          <h3>Add Settlement Record</h3>
          <button className="stl-close" onClick={onClose}>✕</button>
        </div>

        <div className="stl-modal-tip">
          Enter figures from your Swiggy / Zomato Annexure XLSX or Payment Advice PDF.
          You only need to enter the values — totals are calculated automatically.
        </div>

        {err && <div className="stl-modal-err">⚠️ {err}</div>}

        <form className="stl-modal-body" onSubmit={handleSave}>

          {/* ── Platform & Period ──────────────────────────────────────── */}
          <div className="stl-group-head">Platform & Branch</div>
          <div className="stl-row">
            <label className="stl-fld">
              <span>Platform *</span>
              <select value={form.platform} onChange={e => set("platform", e.target.value)}>
                <option value="swiggy">Swiggy</option>
                <option value="zomato">Zomato</option>
              </select>
            </label>
            <label className="stl-fld">
              <span>Branch / Outlet *</span>
              <select
                value={form.outletId}
                onChange={e => {
                  const sel = outlets.find(o => o.id === e.target.value);
                  set("outletId", e.target.value);
                  set("outletName", sel?.name || "");
                }}
                required
              >
                <option value="">— Select branch —</option>
                {outlets.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="stl-row">
            {fld("Total Orders", "orders", { step: "1", placeholder: "e.g. 224" })}
          </div>
          <div className="stl-row">
            <label className="stl-fld">
              <span>Period From *</span>
              <input type="date" value={form.periodFrom} onChange={e => set("periodFrom", e.target.value)} required />
            </label>
            <label className="stl-fld">
              <span>Period To *</span>
              <input type="date" value={form.periodTo} onChange={e => set("periodTo", e.target.value)} required />
            </label>
          </div>
          <div className="stl-row">
            <label className="stl-fld">
              <span>Settlement Date</span>
              <input type="date" value={form.settlementDate} onChange={e => set("settlementDate", e.target.value)} />
            </label>
            <label className="stl-fld">
              <span>Bank UTR</span>
              <input type="text" placeholder="e.g. AXISCN1332465786" value={form.bankUTR}
                     onChange={e => set("bankUTR", e.target.value)} />
            </label>
          </div>

          {/* ── Revenue (what customers paid) ──────────────────────────── */}
          <div className="stl-group-head">Revenue — What Customers Paid</div>
          <div className="stl-row">
            {fld("Item Total (excl. GST)", "itemTotal")}
            {fld("Packaging Charges", "packagingCharges")}
          </div>
          <div className="stl-row">
            {fld("Discount Share (your share)", "discountShare", { placeholder: "Restaurant's promo cost" })}
            {fld("GST Collected from Customers", "gstCollected")}
          </div>
          <div className="stl-row">
            <label className="stl-fld">
              <span>Total Customer Paid (auto-calc or enter)</span>
              <input type="number" step="0.01" min="0"
                placeholder={calcTotal() || "Auto from above"}
                value={form.totalCustomerPaid}
                onChange={e => set("totalCustomerPaid", e.target.value)} />
            </label>
          </div>

          {/* ── Platform Fees (deducted) ───────────────────────────────── */}
          <div className="stl-group-head">Platform Fees — Deducted by Swiggy / Zomato</div>
          <div className="stl-row">
            {fld("Commission Amount", "commission", { placeholder: "e.g. 8960" })}
            {fld("Commission %", "commissionPct", { step: "0.1", placeholder: "e.g. 15" })}
          </div>
          <div className="stl-row">
            {fld("GST on Platform Fees @18%", "gstOnPlatformFees", { placeholder: "GST on commission+fees" })}
            {fld("Payment Collection Charges", "paymentCharges", { placeholder: "e.g. 1194" })}
          </div>
          <div className="stl-row">
            {fld("Other Platform Fees", "otherPlatformFees", { placeholder: "Long distance, Bolt, etc." })}
            {fld("Customer Complaint Refunds", "customerComplaints", { placeholder: "Refunds deducted" })}
          </div>

          {/* ── Ads & Marketing ──────────────────────────────────────────── */}
          <div className="stl-group-head">Ads & Marketing Deductions</div>
          <div className="stl-row">
            {fld("Total Ads & Marketing Deducted", "adsDeductions", { placeholder: "CPC, Sponsored Listings, etc." })}
          </div>

          {/* ── Government / Tax ──────────────────────────────────────────── */}
          <div className="stl-group-head">Government / Tax Deductions</div>
          <div className="stl-modal-tip" style={{ marginBottom: 8 }}>
            GST Deduction (Sec 9(5)): This is GST that the platform pays to govt on your behalf.
            You don't pay it again, but it is deducted from your payout.
          </div>
          <div className="stl-row">
            {fld("GST Deduction — Paid by Platform (Sec 9(5))", "gstDeduction")}
            {fld("TDS (194-O)", "tds", { placeholder: "Tax Deducted at Source" })}
          </div>
          <div className="stl-row">
            {fld("TCS (usually 0)", "tcs", { placeholder: "Tax Collected at Source" })}
          </div>

          {/* ── Net Payout ─────────────────────────────────────────────────── */}
          <div className="stl-group-head">Net Payout</div>
          <div className="stl-row">
            <label className="stl-fld stl-fld-net">
              <span>Net Payout — Credited to Bank {calcNet() ? `(calculated: ₹${calcNet()})` : ""}</span>
              <input type="number" step="0.01" min="0"
                placeholder={calcNet() || "Enter from settlement document"}
                value={form.netPayout}
                onChange={e => set("netPayout", e.target.value)} />
            </label>
          </div>

          <label className="stl-fld" style={{ marginTop: 4 }}>
            <span>Notes (optional)</span>
            <input type="text" placeholder="Any remarks" value={form.notes}
                   onChange={e => set("notes", e.target.value)} />
          </label>

          <div className="stl-modal-actions">
            <button type="button" className="stl-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="stl-btn-save" disabled={busy}>
              {busy ? "Saving…" : "Save Settlement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Waterfall Bar ─────────────────────────────────────────────────────────────
function WaterfallRow({ label, amount, gross, type, indent }) {
  const absAmt = Math.abs(amount);
  const width  = gross ? Math.min(100, Math.round((absAmt / gross) * 100)) : 0;
  const isPos  = type === "credit";
  const isDed  = type === "deduction";
  const isSub  = type === "sub";
  return (
    <div className={`stl-wf-row${indent ? " stl-wf-indent" : ""}`}>
      <span className="stl-wf-label">{label}</span>
      <div className="stl-wf-bar-wrap">
        <div
          className={`stl-wf-bar${isPos ? " stl-wf-bar-pos" : isDed ? " stl-wf-bar-neg" : " stl-wf-bar-sub"}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`stl-wf-amt${isPos ? " stl-pos" : isDed || isSub ? " stl-neg" : ""}`}>
        {isPos ? "" : isDed || isSub ? "−" : ""}{fmt(absAmt)}
      </span>
      {gross > 0 && absAmt > 0 && (
        <span className="stl-wf-pct">{pct(absAmt, gross)}</span>
      )}
    </div>
  );
}

// ── Single Settlement Card (expanded view) ────────────────────────────────────
function SettlementCard({ s, onDelete }) {
  const [open, setOpen] = useState(false);
  const p  = PLATFORM[s.platform] || PLATFORM.swiggy;
  const gross = num(s.totalCustomerPaid) || (num(s.itemTotal) + num(s.packagingCharges) - num(s.discountShare) + num(s.gstCollected));
  const totalPlatformFees = num(s.commission) + num(s.gstOnPlatformFees) + num(s.paymentCharges) + num(s.otherPlatformFees);
  const totalDeductions = totalPlatformFees + num(s.customerComplaints) + num(s.adsDeductions) + num(s.gstDeduction) + num(s.tds) + num(s.tcs);
  const net = num(s.netPayout) || (gross - totalDeductions);
  const keepPct = gross > 0 ? ((net / gross) * 100).toFixed(1) : "0";
  const effectiveCommPct = num(s.itemTotal) > 0
    ? (((num(s.commission) + num(s.gstOnPlatformFees)) / num(s.itemTotal)) * 100).toFixed(1)
    : "0";

  return (
    <div className="stl-card" style={{ borderTop: `3px solid ${p.color}` }}>
      {/* ── Card Header ── */}
      <div className="stl-card-head">
        <div className="stl-card-meta">
          <span className="stl-platform-badge" style={{ background: p.bg, color: p.color }}>
            {p.icon} {p.label}
          </span>
          {s.outletName && (
            <span className="stl-outlet-badge">🏪 {s.outletName}</span>
          )}
          <span className="stl-period">
            {dateFmt(s.periodFrom)} — {dateFmt(s.periodTo)}
          </span>
          {s.orders > 0 && <span className="stl-orders">{s.orders} orders</span>}
        </div>
        <div className="stl-card-nums">
          <div className="stl-card-gross">
            <span>Customer Paid</span>
            <strong>{fmt(gross)}</strong>
          </div>
          <div className="stl-card-arrow">→</div>
          <div className="stl-card-net">
            <span>Net to Bank</span>
            <strong style={{ color: "#1a7a3a" }}>{fmt(net)}</strong>
          </div>
          <div className="stl-card-kept">
            <span>You kept</span>
            <strong className="stl-kept-pct">{keepPct}%</strong>
          </div>
        </div>
        <div className="stl-card-actions">
          <button className="stl-toggle-btn" onClick={() => setOpen(o => !o)}>
            {open ? "▲ Less" : "▼ Breakdown"}
          </button>
          <button className="stl-del-btn" onClick={() => onDelete(s.id)} title="Delete">✕</button>
        </div>
      </div>

      {/* UTR + date strip */}
      <div className="stl-card-strip">
        {s.settlementDate && <span>Settled: {dateFmt(s.settlementDate)}</span>}
        {s.bankUTR         && <span>UTR: <code>{s.bankUTR}</code></span>}
        {s.notes           && <span>📝 {s.notes}</span>}
      </div>

      {/* ── Expanded Waterfall ── */}
      {open && (
        <div className="stl-breakdown">
          <div className="stl-breakdown-head">Full Settlement Breakdown</div>

          {/* Revenue */}
          <div className="stl-sec-label">📊 Revenue (What Customers Paid)</div>
          <WaterfallRow label="Item Total (food value)" amount={num(s.itemTotal)} gross={gross} type="credit" />
          {num(s.packagingCharges) > 0 && <WaterfallRow label="Packaging Charges" amount={num(s.packagingCharges)} gross={gross} type="credit" />}
          {num(s.discountShare) > 0 && <WaterfallRow label="Discount Share (your promo cost)" amount={num(s.discountShare)} gross={gross} type="deduction" indent />}
          <WaterfallRow label="GST Collected (passthrough to Govt)" amount={num(s.gstCollected)} gross={gross} type="sub" indent />
          <div className="stl-subtotal">
            <span>= Total Customer Paid</span>
            <strong>{fmt(gross)}</strong>
          </div>

          {/* Platform Fees */}
          <div className="stl-sec-label" style={{ marginTop: 12 }}>
            🏷️ Platform Fees — Deducted by {p.label}
            {num(s.commission) > 0 && <span className="stl-eff-rate"> (Effective rate: {effectiveCommPct}% of food value)</span>}
          </div>
          {num(s.commission) > 0 && (
            <WaterfallRow label={`Commission${s.commissionPct ? ` (${s.commissionPct}%)` : ""}`} amount={num(s.commission)} gross={gross} type="deduction" />
          )}
          {num(s.gstOnPlatformFees) > 0 && <WaterfallRow label="GST on Platform Fees @18%" amount={num(s.gstOnPlatformFees)} gross={gross} type="deduction" indent />}
          {num(s.paymentCharges) > 0 && <WaterfallRow label="Payment Collection Charges" amount={num(s.paymentCharges)} gross={gross} type="deduction" />}
          {num(s.otherPlatformFees) > 0 && <WaterfallRow label="Other Platform Fees" amount={num(s.otherPlatformFees)} gross={gross} type="deduction" />}

          {/* Ads */}
          {num(s.adsDeductions) > 0 && (
            <>
              <div className="stl-sec-label" style={{ marginTop: 12 }}>📣 Ads & Marketing</div>
              <WaterfallRow label="Ads & Marketing Deductions" amount={num(s.adsDeductions)} gross={gross} type="deduction" />
            </>
          )}

          {/* Complaints */}
          {num(s.customerComplaints) > 0 && (
            <>
              <div className="stl-sec-label" style={{ marginTop: 12 }}>⚠️ Customer Issues</div>
              <WaterfallRow label="Customer Complaint Refunds" amount={num(s.customerComplaints)} gross={gross} type="deduction" />
            </>
          )}

          {/* Tax */}
          <div className="stl-sec-label" style={{ marginTop: 12 }}>🏛️ Government / Tax Deductions</div>
          {num(s.gstDeduction) > 0 && (
            <WaterfallRow label="GST — Paid by Platform on your behalf (Sec 9(5))" amount={num(s.gstDeduction)} gross={gross} type="sub" />
          )}
          {num(s.tds) > 0 && <WaterfallRow label="TDS (194-O)" amount={num(s.tds)} gross={gross} type="deduction" />}
          {num(s.tcs) > 0 && <WaterfallRow label="TCS" amount={num(s.tcs)} gross={gross} type="deduction" />}

          {/* Total deductions */}
          <div className="stl-subtotal stl-subtotal-neg">
            <span>= Total Deductions</span>
            <strong style={{ color: "#c0392b" }}>−{fmt(totalDeductions)}</strong>
          </div>

          {/* Net */}
          <div className="stl-net-row">
            <span>🏦 Net Credited to Bank</span>
            <strong>{fmt(net)}</strong>
            <span className="stl-kept-label">You kept {keepPct}% of customer-paid amount</span>
          </div>

          {/* Key insights */}
          <div className="stl-insights">
            <div className="stl-insight">
              <span className="stl-insight-label">Effective Commission on Food Sales</span>
              <span className="stl-insight-val" style={{ color: "#c0392b" }}>{effectiveCommPct}%</span>
              <span className="stl-insight-note">Commission + GST on fees, as % of item total</span>
            </div>
            {num(s.adsDeductions) > 0 && (
              <div className="stl-insight">
                <span className="stl-insight-label">Ad Spend Rate</span>
                <span className="stl-insight-val" style={{ color: "#e67e22" }}>{pct(num(s.adsDeductions), num(s.itemTotal))}</span>
                <span className="stl-insight-note">Ads cost as % of food sales</span>
              </div>
            )}
            <div className="stl-insight">
              <span className="stl-insight-label">Total Cost of Selling Online</span>
              <span className="stl-insight-val" style={{ color: "#8e44ad" }}>
                {pct(totalDeductions - num(s.gstDeduction) - num(s.tcs), num(s.itemTotal))}
              </span>
              <span className="stl-insight-note">All real deductions (excl. GST 9(5) passthrough) as % of food sales</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function OnlineSalesPage() {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showAdd, setShowAdd]         = useState(false);
  const [platformFilter, setPlatformFilter] = useState("all"); // "all" | "swiggy" | "zomato"
  const [outletFilter, setOutletFilter]     = useState("all"); // "all" | outletId
  const [delConfirm, setDelConfirm]   = useState(null);  // id to delete
  const [outlets, setOutlets]         = useState([]);

  useEffect(() => {
    load();
    api.get("/outlets")
      .then(res => {
        const list = Array.isArray(res) ? res : (res?.outlets || []);
        setOutlets(list.map(o => ({ id: o.id, name: o.name })));
      })
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/settlements");
      setSettlements(data || []);
    } catch (e) {
      console.error("Failed to load settlements:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(payload) {
    const record = await api.post("/settlements", payload);
    setSettlements(prev => [record, ...prev]);
  }

  async function handleDelete(id) {
    await api.delete(`/settlements/${id}`);
    setSettlements(prev => prev.filter(s => s.id !== id));
    setDelConfirm(null);
  }

  const filtered = useMemo(() => {
    return settlements.filter(s => {
      if (platformFilter !== "all" && s.platform !== platformFilter) return false;
      if (outletFilter   !== "all" && s.outletId   !== outletFilter)  return false;
      return true;
    });
  }, [settlements, platformFilter, outletFilter]);

  // ── Aggregate Stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const src = filtered;
    const sum  = (key) => src.reduce((t, s) => t + num(s[key]), 0);
    const sumComputed = (fn) => src.reduce((t, s) => t + fn(s), 0);

    const totalGross = sumComputed(s =>
      num(s.totalCustomerPaid) || (num(s.itemTotal) + num(s.packagingCharges) - num(s.discountShare) + num(s.gstCollected))
    );
    const totalNet   = sumComputed(s => {
      const gross = num(s.totalCustomerPaid) || (num(s.itemTotal) + num(s.packagingCharges) - num(s.discountShare) + num(s.gstCollected));
      const deds   = num(s.commission) + num(s.gstOnPlatformFees) + num(s.paymentCharges) + num(s.otherPlatformFees)
                   + num(s.customerComplaints) + num(s.adsDeductions) + num(s.gstDeduction) + num(s.tds) + num(s.tcs);
      return num(s.netPayout) || (gross - deds);
    });
    const totalFood  = sum("itemTotal");
    const totalComm  = sum("commission");
    const totalGstFees = sum("gstOnPlatformFees");
    const totalAds   = sum("adsDeductions");
    const totalOrders = sum("orders");

    const effComm = totalFood > 0
      ? (((totalComm + totalGstFees) / totalFood) * 100).toFixed(1)
      : "0";

    const keepRate = totalGross > 0
      ? ((totalNet / totalGross) * 100).toFixed(1)
      : "0";

    return { totalGross, totalNet, totalFood, totalComm, totalGstFees, totalAds, totalOrders, effComm, keepRate };
  }, [filtered]);

  return (
    <div className="stl-page">
      {/* ── Page Header ── */}
      <div className="stl-page-head">
        <div>
          <h1 className="stl-title">Online Sales & Settlements</h1>
          <p className="stl-subtitle">
            Track exactly what Swiggy and Zomato pay you — gross sales, deductions, and net credited to bank.
          </p>
        </div>
        <button className="stl-add-btn" onClick={() => setShowAdd(true)}>
          + Add Settlement
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="stl-filter-bar">
        {/* Platform */}
        {["all", "swiggy", "zomato"].map(f => (
          <button
            key={f}
            className={`stl-filter-btn${platformFilter === f ? " active" : ""}`}
            onClick={() => setPlatformFilter(f)}
            style={platformFilter === f && f !== "all" ? { background: PLATFORM[f]?.bg, color: PLATFORM[f]?.color, borderColor: PLATFORM[f]?.color } : {}}
          >
            {f === "all" ? "All Platforms" : `${PLATFORM[f].icon} ${PLATFORM[f].label}`}
          </button>
        ))}

        {/* Branch divider + outlet buttons (only if multiple outlets) */}
        {outlets.length > 1 && (
          <>
            <span className="stl-filter-divider">|</span>
            <button
              className={`stl-filter-btn${outletFilter === "all" ? " active" : ""}`}
              onClick={() => setOutletFilter("all")}
            >
              All Branches
            </button>
            {outlets.map(o => (
              <button
                key={o.id}
                className={`stl-filter-btn${outletFilter === o.id ? " active" : ""}`}
                onClick={() => setOutletFilter(o.id)}
              >
                🏪 {o.name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* ── Summary KPIs ── */}
      {settlements.length > 0 && (
        <div className="stl-kpi-row">
          <div className="stl-kpi stl-kpi-blue">
            <span>Total Customer Paid</span>
            <strong>{fmt(stats.totalGross)}</strong>
            {stats.totalOrders > 0 && <small>{stats.totalOrders.toLocaleString()} orders</small>}
          </div>
          <div className="stl-kpi stl-kpi-green">
            <span>Net Credited to Bank</span>
            <strong>{fmt(stats.totalNet)}</strong>
            <small>You kept {stats.keepRate}%</small>
          </div>
          <div className="stl-kpi stl-kpi-red">
            <span>Total Deductions</span>
            <strong>{fmt(stats.totalGross - stats.totalNet)}</strong>
            <small>{pct(stats.totalGross - stats.totalNet, stats.totalGross)} of gross</small>
          </div>
          <div className="stl-kpi stl-kpi-orange">
            <span>Effective Commission Rate</span>
            <strong>{stats.effComm}%</strong>
            <small>Comm + GST on fees, on food sales</small>
          </div>
          {stats.totalAds > 0 && (
            <div className="stl-kpi stl-kpi-purple">
              <span>Total Ads Spend</span>
              <strong>{fmt(stats.totalAds)}</strong>
              <small>{pct(stats.totalAds, stats.totalFood)} of food sales</small>
            </div>
          )}
        </div>
      )}

      {/* ── How it works explainer (shown when empty) ── */}
      {!loading && settlements.length === 0 && (
        <div className="stl-empty">
          <div className="stl-empty-icon">📊</div>
          <h3>No settlements recorded yet</h3>
          <p>
            Every week Swiggy and Zomato send you a settlement — they pay your customers' orders in bulk,
            but deduct their commission, GST on that commission, payment charges, and any ad spend before
            crediting the balance to your bank account.
          </p>
          <p>
            Add each settlement here to see the full picture: exactly how much was deducted and what arrived
            in your bank. Most restaurant owners are surprised — the effective cost of online ordering is
            often <strong>35–45% of gross sales</strong> after all deductions.
          </p>
          <button className="stl-add-btn" onClick={() => setShowAdd(true)}>
            Add Your First Settlement
          </button>

          <div className="stl-how-box">
            <div className="stl-how-head">Where to find your settlement data</div>
            <div className="stl-how-cols">
              <div>
                <div className="stl-how-platform">🍊 Swiggy</div>
                <ol>
                  <li>Open Swiggy for Restaurants</li>
                  <li>Go to Payments → Payout History</li>
                  <li>Click on any settlement → Download Annexure</li>
                  <li>Use the <strong>Payout Breakup</strong> sheet values</li>
                </ol>
              </div>
              <div>
                <div className="stl-how-platform">🔴 Zomato</div>
                <ol>
                  <li>Open Zomato for Restaurants</li>
                  <li>Go to Payments → Settlement Reports</li>
                  <li>Download the settlement report XLSX</li>
                  <li>Use the <strong>Payout Breakup</strong> sheet values</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && <div className="stl-loading">Loading settlements…</div>}

      {/* ── Settlement Cards ── */}
      {!loading && filtered.length > 0 && (
        <div className="stl-list">
          {filtered.map(s => (
            <SettlementCard
              key={s.id}
              s={s}
              onDelete={(id) => setDelConfirm(id)}
            />
          ))}
        </div>
      )}

      {/* ── No results for filter ── */}
      {!loading && settlements.length > 0 && filtered.length === 0 && (
        <div className="stl-empty-filter">
          No settlements found for the selected filters.
          <button className="stl-add-btn" style={{ marginLeft: 16 }} onClick={() => setShowAdd(true)}>
            Add One
          </button>
        </div>
      )}

      {/* ── Add Modal ── */}
      {showAdd && (
        <AddSettlementModal
          onSave={handleSave}
          onClose={() => setShowAdd(false)}
          outlets={outlets}
        />
      )}

      {/* ── Delete Confirm ── */}
      {delConfirm && (
        <div className="stl-overlay" onMouseDown={e => e.target === e.currentTarget && setDelConfirm(null)}>
          <div className="stl-confirm-box">
            <h4>Delete this settlement record?</h4>
            <p>This action cannot be undone.</p>
            <div className="stl-confirm-actions">
              <button className="stl-btn-cancel" onClick={() => setDelConfirm(null)}>Cancel</button>
              <button className="stl-btn-delete" onClick={() => handleDelete(delConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
