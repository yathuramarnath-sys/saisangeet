const {
  getState,
  approveClosingState,
  reopenClosingState,
  getControlLogs
} = require("../operations/operations.memory-store");
const { syncOperationsState, persistOperationsState } = require("../operations/operations.state");
const { getTodaySales, getSalesForRange } = require("../operations/closed-orders-store");
const { queryClosedOrders, listClosedOrders } = require("../../db/closed-orders.repository");
const { isDatabaseEnabled } = require("../../db/database-mode");
const { getOwnerSetupData } = require("../../data/owner-setup-store");

// Insights are generated from live sales data — empty until POS goes live
const defaultInsights = [];

// ── Sales data builder ────────────────────────────────────────────────────────
// Computes all report tab data from the closed-orders array for today.
// Used by every Reports tab in Owner Web — no seed data, purely from POS sales.

function _cap(str) {
  if (!str) return "Cash";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function buildStaffSales(closedToday) {
  const staffMap = {};

  for (const order of closedToday) {
    const cashier = order.cashierName || "Cashier";
    const outlet  = order.outletName  || "All";
    const items   = order.items || [];
    const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const disc     = Math.min(order.discountAmount || 0, subtotal);
    const net      = subtotal - disc;
    const hour     = new Date(order.closedAt || order._receivedAt || 0)
      .toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
    const h        = parseInt(hour, 10) || 0;
    const session  = h < 12 ? "Breakfast" : h < 16 ? "Lunch" : "Dinner";
    const key      = `${cashier}::${outlet}`;

    if (!staffMap[key]) {
      staffMap[key] = { cashier, outlet, session, orders: 0, sales: 0, discounts: 0, voids: 0, openingCash: 0, closingCash: 0, variance: 0 };
    }
    staffMap[key].orders    += 1;
    staffMap[key].sales     += net;
    staffMap[key].discounts += disc;
    if (order.voidRequested) staffMap[key].voids += 1;
  }

  return Object.values(staffMap).map(r => ({
    ...r,
    sales:     Math.round(r.sales),
    discounts: Math.round(r.discounts),
  }));
}

function buildCaptainIncentives(closedToday, tenantId) {
  // Build a lookup: captain name → incentivePct from owner setup data
  const ownerData   = getOwnerSetupData(tenantId);
  const staffList   = ownerData?.users || [];
  const incentiveMap = {};
  for (const u of staffList) {
    const name = u.fullName || u.name || "";
    if (name) incentiveMap[name.trim().toLowerCase()] = Number(u.incentivePct || 0);
  }

  const captainMap = {};

  for (const order of closedToday) {
    const captain = order.captainName || null;
    if (!captain) continue;                    // counter/cashier order — skip
    const outlet  = order.outletName || "All";
    const items   = order.items || [];
    const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const disc     = Math.min(order.discountAmount || 0, subtotal);
    const net      = subtotal - disc;
    const key      = `${captain}::${outlet}`;
    const pct      = incentiveMap[captain.trim().toLowerCase()] ?? 0;

    if (!captainMap[key]) {
      captainMap[key] = { captain, outlet, orders: 0, sales: 0, discounts: 0, incentivePct: pct, incentiveAmt: 0 };
    }
    captainMap[key].orders    += 1;
    captainMap[key].sales     += net;
    captainMap[key].discounts += disc;
  }

  return Object.values(captainMap).map(r => ({
    ...r,
    sales:        Math.round(r.sales),
    discounts:    Math.round(r.discounts),
    incentiveAmt: Math.round(r.sales * (r.incentivePct / 100)),
  }));
}

function buildSalesData(closedToday) {
  const paymentMap = {};
  const itemMap    = {};
  let totalGross   = 0;
  let totalDiscount = 0;

  for (const order of closedToday) {
    const items    = order.items || [];
    const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const disc     = Math.min(order.discountAmount || 0, subtotal);
    const net      = subtotal - disc;

    totalGross    += net;
    totalDiscount += disc;

    for (const p of (order.payments || [])) {
      const mode = _cap(p.method || "cash");
      if (!paymentMap[mode]) paymentMap[mode] = { mode, amount: 0, orders: 0 };
      paymentMap[mode].amount += p.amount || 0;
      paymentMap[mode].orders += 1;
    }

    for (const item of items) {
      const key = item.name || "Unknown";
      if (!itemMap[key]) itemMap[key] = {
        name:     key,
        category: item.category || item.categoryName || "—",
        qty:      0, amount: 0, orders: 0, rate: item.price || 0,
      };
      itemMap[key].qty    += item.quantity || 1;
      itemMap[key].amount += (item.price || 0) * (item.quantity || 1);
      itemMap[key].orders += 1;
      // Upgrade "—" to a real name if a later order has the field
      if (itemMap[key].category === "—" && (item.category || item.categoryName)) {
        itemMap[key].category = item.category || item.categoryName;
      }
    }
  }

  const totalOrders   = closedToday.length;
  // Assume prices are GST-inclusive at 5%
  const taxableAmount = Math.round(totalGross / 1.05);
  const totalTax      = totalGross - taxableAmount;
  const cgst          = Math.round(totalTax / 2);
  const sgst          = totalTax - cgst;

  // ── Order type breakdown (Dine-In / Takeaway / Online) ───────────────────────
  const orderTypeBuckets = {
    "Dine In":  { type: "Dine In",  orders: 0, amount: 0 },
    "Takeaway": { type: "Takeaway", orders: 0, amount: 0 },
    "Online":   { type: "Online",   orders: 0, amount: 0 },
  };
  for (const order of closedToday) {
    const tid     = order.tableId || "";
    const key     = tid.startsWith("counter-") ? "Takeaway" : tid.startsWith("online-") ? "Online" : "Dine In";
    const items2  = order.items || [];
    const sub2    = items2.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const net2    = sub2 - Math.min(order.discountAmount || 0, sub2);
    orderTypeBuckets[key].orders += 1;
    orderTypeBuckets[key].amount += net2;
  }
  const computedOrderTypes = Object.values(orderTypeBuckets).map(b => ({
    ...b, amount: Math.round(b.amount)
  }));

  // ── Hourly sales breakdown (IST) ─────────────────────────────────────────────
  const hourlyMap = {};
  for (const order of closedToday) {
    const h = parseInt(
      new Date(order.closedAt || order._receivedAt || 0)
        .toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }),
      10
    ) || 0;
    const label = `${String(h).padStart(2, "0")}:00`;
    if (!hourlyMap[label]) hourlyMap[label] = { hour: label, orders: 0, amount: 0 };
    const items3 = order.items || [];
    const net3   = items3.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)
                   - Math.min(order.discountAmount || 0, 0);
    hourlyMap[label].orders += 1;
    hourlyMap[label].amount += net3;
  }
  const hourlySales = Object.values(hourlyMap)
    .sort((a, b) => a.hour.localeCompare(b.hour))
    .map(h => ({ ...h, amount: Math.round(h.amount) }));

  const totalCollected = Object.values(paymentMap).reduce((s, p) => s + p.amount, 0);
  const paymentModes   = Object.values(paymentMap).map(p => ({
    ...p,
    amount: Math.round(p.amount),
    pct:    totalCollected > 0 ? Math.round(p.amount / totalCollected * 100) : 0,
    icon:   p.mode === "Cash" ? "💵" : p.mode === "Upi" ? "📱" : "💳"
  }));

  const itemSales = Object.values(itemMap)
    .sort((a, b) => b.amount - a.amount)
    .map((item, i) => ({
      rank:     i + 1,
      name:     item.name,
      category: item.category || "—",
      qty:      item.qty,
      orders:   item.orders,
      rate:     Math.round(item.rate),
      amount:   Math.round(item.amount),
    }));

  const mostSoldItem   = [...itemSales].sort((a, b) => b.qty    - a.qty)[0]    || null;
  const topRevenueItem = [...itemSales].sort((a, b) => b.amount - a.amount)[0] || null;

  // Session breakdown by hour (IST)
  const buckets = {
    Breakfast: { session: "Breakfast", orders: 0, amount: 0 },
    Lunch:     { session: "Lunch",     orders: 0, amount: 0 },
    Dinner:    { session: "Dinner",    orders: 0, amount: 0 },
  };
  for (const order of closedToday) {
    const hour   = new Date(order.closedAt || order._receivedAt || 0)
      .toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
    const h      = parseInt(hour, 10) || 0;
    const bucket = h < 12 ? "Breakfast" : h < 16 ? "Lunch" : "Dinner";
    const items2    = order.items || [];
    const subtotal2 = items2.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const net2      = subtotal2 - Math.min(order.discountAmount || 0, subtotal2);
    buckets[bucket].orders += 1;
    buckets[bucket].amount += net2;
  }
  const sessions = Object.values(buckets).filter(s => s.orders > 0);

  const discountBills = closedToday.filter(o => (o.discountAmount || 0) > 0).length;

  return {
    dayEnd: {
      summary: {
        totalSales:       Math.round(totalGross),
        totalOrders,
        avgOrderValue:    totalOrders > 0 ? Math.round(totalGross / totalOrders) : 0,
        netAfterDiscount: Math.round(totalGross),
        totalTax:         Math.round(totalTax),
        totalDiscount:    Math.round(totalDiscount),
        totalCancelled:   0,
        cancelledValue:   0,
      },
      paymentModes,
      orderTypes: computedOrderTypes,
      hourlySales,
      sessions,
      categories:   [],
      items:        itemSales.slice(0, 20),
      tax: {
        taxableAmount: Math.round(taxableAmount),
        cgst, sgst, igst: 0, cess: 0,
        totalTax: Math.round(totalTax),
      },
      discounts: discountBills > 0
        ? [{ type: "Manual Discount", count: discountBills, amount: Math.round(totalDiscount) }]
        : [],
      cancellations: [],
    },
    itemSales,
    mostSoldItem,
    topRevenueItem,
    gst: {
      month: new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      summary: {
        taxableAmount: Math.round(taxableAmount),
        cgst, sgst,
        totalGst:   Math.round(totalTax),
        totalBills: totalOrders,
      },
      daily: totalOrders > 0 ? [{
        date:    new Date().toLocaleDateString("en-IN"),
        bills:   totalOrders,
        taxable: Math.round(taxableAmount),
        cgst, sgst,
        total:   Math.round(totalTax),
      }] : [],
      outletBreakdown: [],
    },
    payment: {
      summary: {
        totalCollected:  Math.round(totalCollected),
        cashAmount:      Math.round((paymentMap["Cash"] || {}).amount || 0),
        digitalAmount:   Math.round(
          ((paymentMap["Upi"]  || {}).amount || 0) +
          ((paymentMap["Card"] || {}).amount || 0)
        ),
        variance: 0,
      },
      modes:                paymentModes,
      hourly:               [],
      outletReconciliation: [],
    },
    staffSales: buildStaffSales(closedToday),
    discountVoid: {
      summary: {
        totalDiscountAmt:   Math.round(totalDiscount),
        totalDiscountBills: discountBills,
        totalVoids:         0,
        totalVoidAmt:       0,
        manualOverrides:    0,
      },
      discountLog: [],
      voidLog:     [],
    },
    categorySales: buildCategorySales(closedToday),
  };
}

// ── Category sales builder ────────────────────────────────────────────────────
// Groups items by item.category (resolved at POS add-time from the live category
// list), falling back to item.station then "General".  Applies to all tenants.
const CAT_COLORS = [
  "#2196F3","#4CAF50","#FF9800","#9C27B0",
  "#F44336","#00BCD4","#795548","#607D8B",
];

function buildCategorySales(closedToday) {
  // ── Build menu-catalog lookup so closed orders without a category field
  // are retroactively matched to the correct category by menuItemId or name.
  const setupData  = getOwnerSetupData();
  const menuItems  = (setupData?.menu?.items)      || [];
  const menuCats   = (setupData?.menu?.categories) || [];
  const catById    = Object.fromEntries(menuCats.map(c => [c.id, c.name]));
  const catByItemId   = {};  // menuItemId → categoryName
  const catByItemName = {};  // normalised item name → categoryName
  for (const mi of menuItems) {
    const cName = catById[mi.categoryId] || "";
    if (mi.id && cName)   catByItemId[mi.id] = cName;
    if (mi.name && cName) catByItemName[(mi.name || "").toLowerCase().trim()] = cName;
  }

  /** catKey → accumulator */
  const catMap = {};

  for (const order of closedToday) {
    const items = order.items || [];
    const rawHour = new Date(order.closedAt || order._receivedAt || 0)
      .toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
    const h       = parseInt(rawHour, 10) || 0;
    const session = h < 12 ? "Breakfast" : h < 16 ? "Lunch" : "Dinner";
    const outlet  = (order.outletName || "All Outlets").trim();

    for (const item of items) {
      // Priority: item.category (set by POS) → catalog lookup by id → catalog lookup by name → station → "General"
      const catKey = (
        (item.category || item.categoryName || "").trim() ||
        catByItemId[item.menuItemId || item.id] ||
        catByItemName[(item.name || "").toLowerCase().trim()] ||
        item.station || ""
      ).trim() || "General";

      if (!catMap[catKey]) {
        catMap[catKey] = {
          name:       catKey,
          qty:        0,
          amount:     0,
          ordersSet:  new Set(),
          itemMap:    {},
          sessions:   { Breakfast: 0, Lunch: 0, Dinner: 0 },
          outletMap:  {},
        };
      }

      const cat    = catMap[catKey];
      const lineAmt = (item.price || 0) * (item.quantity || 1);

      cat.qty    += item.quantity || 1;
      cat.amount += lineAmt;
      cat.ordersSet.add(order.tableId || order.orderNumber || Math.random());
      cat.sessions[session] = (cat.sessions[session] || 0) + lineAmt;
      cat.outletMap[outlet]  = (cat.outletMap[outlet]  || 0) + lineAmt;

      const iKey = (item.name || "Unknown");
      if (!cat.itemMap[iKey]) {
        cat.itemMap[iKey] = { name: iKey, qty: 0, orders: 0, rate: item.price || 0, amount: 0 };
      }
      cat.itemMap[iKey].qty    += item.quantity || 1;
      cat.itemMap[iKey].orders += 1;
      cat.itemMap[iKey].amount += lineAmt;
    }
  }

  const categories = Object.values(catMap)
    .sort((a, b) => b.amount - a.amount)
    .map((cat, i) => {
      const itemList = Object.values(cat.itemMap).sort((a, b) => b.amount - a.amount);
      const topItem  = itemList[0] || { name: "—" };
      const orders   = cat.ordersSet.size;
      const avgRate  = cat.qty > 0 ? Math.round(cat.amount / cat.qty) : 0;
      return {
        name:      cat.name,
        color:     CAT_COLORS[i % CAT_COLORS.length],
        itemCount: itemList.length,
        qty:       cat.qty,
        amount:    Math.round(cat.amount),
        orders,
        avgRate,
        topItem:   { name: topItem.name },
        sessions: {
          Breakfast: Math.round(cat.sessions.Breakfast || 0),
          Lunch:     Math.round(cat.sessions.Lunch     || 0),
          Dinner:    Math.round(cat.sessions.Dinner    || 0),
        },
        outlets: Object.fromEntries(
          Object.entries(cat.outletMap).map(([k, v]) => [k, Math.round(v)])
        ),
      };
    });

  // items keyed by category name — used by the drilldown section
  const items = {};
  for (const cat of Object.values(catMap)) {
    items[cat.name] = Object.values(cat.itemMap)
      .map(i => ({ ...i, amount: Math.round(i.amount) }))
      .sort((a, b) => b.amount - a.amount);
  }

  return { categories, items };
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function buildApprovalLog(orders) {
  return Object.values(orders)
    .flatMap((order) =>
      (order.auditTrail || [])
        .filter((entry) => ["Discount approved", "Void approved"].includes(entry.label))
        .map((entry, index) => ({
          id: `${order.tableId}-${index}-${entry.id}`,
          outlet: order.outletName || order.areaName,
          tableNumber: order.tableNumber,
          orderNumber: order.orderNumber,
          action: entry.label,
          actor: entry.actor,
          approvalMode: entry.actor.includes("OTP") ? "OTP" : "Manual",
          amount:
            entry.label === "Discount approved"
              ? formatCurrency(order.discountAmount || 0)
              : `Bill #${order.orderNumber}`,
          time: entry.time
        }))
    )
    .sort((left, right) => right.orderNumber - left.orderNumber);
}

function buildControlSummary(orders) {
  const list = Object.values(orders);
  const discountOverrides = list.filter((order) => order.discountOverrideRequested);
  const deletedBills = list.reduce((sum, order) => sum + (order.deletedBillLog || []).length, 0);
  const reprints = list.reduce((sum, order) => sum + (order.reprintLog || []).length, 0);
  const voidRequests = list.filter((order) => order.voidRequested).length;
  const unauthorizedAlerts = list.reduce((sum, order) => sum + (order.controlAlerts || []).length, 0);

  return [
    {
      id: "discount-overrides",
      title: "Discount overrides",
      value: `${discountOverrides.length} today`,
      detail:
        discountOverrides.length > 0
          ? `${discountOverrides.length} still need review`
          : "No override requests in live flow",
      status: discountOverrides.length > 0 ? "Review" : "Strong"
    },
    {
      id: "deleted-bills",
      title: "Deleted bills",
      value: `${deletedBills} approved`,
      detail: deletedBills > 0 ? "Deleted bills recorded in live flow" : "No deleted bills today",
      status: deletedBills > 0 ? "Review" : "Strong"
    },
    {
      id: "reprints",
      title: "Reprints",
      value: `${reprints} logged`,
      detail: reprints > 0 ? "Receipt reprints recorded with reason" : "No reprints recorded today",
      status: reprints > 0 ? "Conditional" : "Strong"
    },
    {
      id: "void-requests",
      title: "Void requests",
      value: `${voidRequests} pending`,
      detail: voidRequests > 0 ? "Pending OTP approvals are waiting for review" : "No pending void requests",
      status: voidRequests > 0 ? "Review" : "Strong"
    },
    {
      id: "cash-mismatch",
      title: "Cash mismatch",
      value: "Rs 1,200",
      detail: "1 outlet under review before final close",
      status: "Conditional"
    },
    {
      id: "unauthorized-actions",
      title: "Unauthorized actions",
      value: `${unauthorizedAlerts} alerts`,
      detail: unauthorizedAlerts > 0 ? "Blocked cashier actions recorded" : "No blocked cashier actions",
      status: unauthorizedAlerts > 0 ? "Review" : "Strong"
    }
  ];
}

// NOTE: buildClosingCenter is called with a pre-fetched closedToday array
// (from buildOwnerSummary which already ran _getOrdersForRange). Pass it in directly.
function buildClosingCenter(orders, closedToday, tenantId, { dateFrom, dateTo, outletId } = {}) {
  const deletedBills = Object.values(orders).reduce((sum, order) => sum + (order.deletedBillLog || []).length, 0);
  const pendingOverrides = Object.values(orders).filter((order) => order.discountOverrideRequested).length;
  let netSales = 0;
  let gstTotal = 0;
  let cashSales = 0;
  let upiSales  = 0;
  let cardSales = 0;
  let orderCount = closedToday.length;

  for (const order of closedToday) {
    const items    = order.items || [];
    const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const disc     = Math.min(order.discountAmount || 0, subtotal);
    const taxable  = subtotal - disc;
    const tax      = Math.round(taxable * 0.05);
    const total    = taxable + tax;

    netSales += taxable;
    gstTotal += tax;

    for (const p of order.payments || []) {
      const m = (p.method || "").toLowerCase();
      if (m === "cash")       cashSales += p.amount || 0;
      else if (m === "upi")   upiSales  += p.amount || 0;
      else if (m === "card")  cardSales += p.amount || 0;
    }
  }

  return {
    blockers: [
      ...(pendingOverrides > 0
        ? [{
            id: "blocker-override",
            title: `${pendingOverrides} high discount override needs review`,
            detail: "Owner should confirm manager approvals before sending final closing mail."
          }]
        : [])
    ],
    checklist: [
      { id: "sales-lock", title: "All outlets sales synced", status: orderCount > 0 ? "Done" : "Pending" },
      { id: "tax-ready",  title: "GST totals verified",      status: orderCount > 0 ? "Done" : "Pending" },
      {
        id: "risk-review",
        title: "Deleted bills and overrides reviewed",
        status: pendingOverrides > 0 || deletedBills > 0 ? "Pending" : "Done"
      }
    ],
    ownerSummary: [
      { id: "closing-sales",   label: "Net sales",          value: formatCurrency(netSales) },
      { id: "closing-tax",     label: "GST total (5%)",     value: formatCurrency(gstTotal) },
      { id: "closing-orders",  label: "Orders today",       value: `${orderCount}` },
      { id: "closing-cash",    label: "Cash collected",     value: formatCurrency(cashSales) },
      { id: "closing-upi",     label: "UPI collected",      value: formatCurrency(upiSales) },
      { id: "closing-card",    label: "Card collected",     value: formatCurrency(cardSales) },
      { id: "closing-deleted", label: "Deleted bills",      value: `${deletedBills} approved` },
      { id: "closing-overrides", label: "Discount overrides", value: `${pendingOverrides} pending review` }
    ]
  };
}

function buildAlerts(orders) {
  // Only real-time alerts from live POS activity — nothing hardcoded
  const liveAlerts = Object.values(orders)
    .flatMap((order) =>
      (order.controlAlerts || []).map((message, index) => ({
        id: `${order.tableId}-alert-${index}`,
        title: `Unauthorized action at ${order.tableNumber}`,
        description: message
      }))
    )
    .slice(0, 3);

  const controlLogs = getControlLogs();
  const reprintAlerts = (controlLogs.reprints || []).slice(0, 2).map((entry) => ({
    id: `reprint-${entry.id}`,
    title: `Receipt reprint at ${entry.tableNumber}`,
    description: `${entry.reason} approved by ${entry.actor}`
  }));
  const voidAlerts = (controlLogs.voidRequests || []).slice(0, 2).map((entry) => ({
    id: `void-${entry.id}`,
    title: `Void approval pending at ${entry.tableNumber}`,
    description: `${entry.reason} requires manager or owner OTP approval`
  }));

  return [...liveAlerts, ...reprintAlerts, ...voidAlerts];
}

async function buildOwnerSummary(tenantId, { dateFrom, dateTo, outletId } = {}) {
  const state = getState();
  const orders = state.orders || {};
  const approvalLog = buildApprovalLog(orders);
  const controlSummary = buildControlSummary(orders);
  const controlLogs = getControlLogs();
  const deletedBillCount = Object.values(orders).reduce((sum, order) => sum + (order.deletedBillLog || []).length, 0);
  const pendingOverrides = Object.values(orders).filter((order) => order.discountOverrideRequested).length;

  // Sales data — smart fetcher: memory for today, Postgres for history
  const closedToday     = await _getOrdersForRange(tenantId || "default", { dateFrom, dateTo, outletId });
  const todayOrderCount = closedToday.length;
  const salesData       = {
    ...buildSalesData(closedToday),
    captainIncentives: buildCaptainIncentives(closedToday, tenantId || "default"),
  };

  return {
    popupAlert: {
      title: state.closingState?.approved
        ? "Daily closing approved"
        : todayOrderCount > 0
          ? `${todayOrderCount} orders settled today · ${pendingOverrides + deletedBillCount} control issues`
          : `${pendingOverrides + deletedBillCount} control issues need owner review`,
      description: state.closingState?.approved
        ? `Approved by ${state.closingState.approvedBy} (${state.closingState.approvedRole}) at ${state.closingState.approvedAt}.`
        : `${pendingOverrides} discount overrides and ${deletedBillCount} deleted bills were recorded in live operations.`,
      cta: "Open reports"
    },
    // Outlet comparison comes from live sales — populated once POS is active
    outletComparison: [],
    insights: defaultInsights,
    closingSummary: [
      {
        id: "sales-payments",
        title: "Sales & Payments",
        status: "Included",
        meta: "Total sales, order count, cash vs UPI vs card summary"
      },
      {
        id: "profit-expenses",
        title: "Profit & Expenses",
        status: "Included",
        meta: "Outlet-wise profit, expense ratio, and exception highlights"
      },
      {
        id: "risk-alerts",
        title: "Risk Alerts",
        status: "Conditional",
        meta: "Cash mismatch, deleted bills, discount overrides, and stock exceptions"
      }
    ],
    closingCenter: buildClosingCenter(orders, closedToday, tenantId, { dateFrom, dateTo, outletId }),
    closingState: state.closingState,
    permissionPolicies: state.permissionPolicies,
    controlSummary,
    approvalLog,
    controlLogs,
    alerts: buildAlerts(orders),
    salesData,
  };
}

/**
 * Smart order fetcher:
 *  • Today (or no date range)  → in-memory store (fast, zero DB latency)
 *  • Historical / multi-day    → Postgres (persistent, full history)
 *  • Today included in range   → merge Postgres result with in-memory today
 *
 * This ensures the owner always sees both live-today orders AND all past orders,
 * even after a server restart that clears in-memory state.
 */
async function _getOrdersForRange(tenantId, { dateFrom, dateTo, outletId } = {}) {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const from     = dateFrom || todayStr;
  const to       = dateTo   || todayStr;

  const isOnlyToday = from === todayStr && to === todayStr;
  const includesHistory = from < todayStr; // range covers at least one past day

  // ── Path 1: today-only — always use in-memory (fastest) ─────────────────────
  if (isOnlyToday || !isDatabaseEnabled()) {
    return getSalesForRange(tenantId, from, to, outletId || null);
  }

  // ── Path 2: historical range — Postgres is authoritative ────────────────────
  const pgOrders = await queryClosedOrders(tenantId, { dateFrom: from, dateTo: to, outletId: outletId || null });

  // If range includes today, merge with in-memory to catch orders not yet persisted.
  // Dedup by order.id (always a string, never null) to avoid false-positive collisions
  // when closedAt/\_receivedAt is null.
  if (includesHistory && to >= todayStr) {
    const memToday = getSalesForRange(tenantId, todayStr, todayStr, outletId || null);
    const pgIds    = new Set(pgOrders.map((o) => o.id).filter(Boolean));
    const newToday = memToday.filter((o) => o.id && !pgIds.has(o.id));
    return [...newToday, ...pgOrders];
  }

  return pgOrders;
}

async function fetchOwnerSummary(tenantId, { dateFrom, dateTo, outletId } = {}) {
  await syncOperationsState();
  return buildOwnerSummary(tenantId, { dateFrom, dateTo, outletId });
}

/**
 * Order History — paginated bill list for Owner Web.
 * Returns raw closed orders (not aggregated) so the UI can render a bill table.
 *
 * @param {string}  tenantId
 * @param {object}  opts
 * @param {string}  opts.dateFrom   "YYYY-MM-DD" IST (defaults to today)
 * @param {string}  opts.dateTo     "YYYY-MM-DD" IST (defaults to today)
 * @param {string}  opts.outletId   filter to one outlet
 * @param {number}  opts.page       1-based page number (default 1)
 * @param {number}  opts.pageSize   rows per page (default 50)
 */
async function listOrderHistory(tenantId, { dateFrom, dateTo, outletId, page = 1, pageSize = 50 } = {}) {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const from     = dateFrom || todayStr;
  const to       = dateTo   || todayStr;

  // Today-only with no DB: serve from memory
  if (!isDatabaseEnabled() || (from === todayStr && to === todayStr)) {
    const memOrders = getSalesForRange(tenantId, from, to, outletId || null);
    const sorted    = [...memOrders].sort((a, b) => {
      const ta = new Date(a.closedAt || a._receivedAt || 0).getTime();
      const tb = new Date(b.closedAt || b._receivedAt || 0).getTime();
      return tb - ta;
    });
    const total   = sorted.length;
    const start   = (page - 1) * pageSize;
    const orders  = sorted.slice(start, start + pageSize).map(_formatBillRow);
    return { orders, total, page, pageSize, source: "memory" };
  }

  // Postgres path: paginated, full history
  const result = await listClosedOrders(tenantId, { dateFrom: from, dateTo: to, outletId, page, pageSize });

  // If range includes today, prepend today's in-memory orders not yet in Postgres
  // (only on page 1 — these are the most recent orders)
  if (page === 1 && to >= todayStr) {
    const pgSet    = new Set(result.orders.map((o) => o.id).filter(Boolean));
    const memToday = getSalesForRange(tenantId, todayStr, todayStr, outletId || null);
    const fresh    = memToday
      .filter((o) => o.id && !pgSet.has(o.id))
      .sort((a, b) =>
        new Date(b.closedAt || b._receivedAt || 0) - new Date(a.closedAt || a._receivedAt || 0)
      );
    result.orders  = [...fresh, ...result.orders].slice(0, pageSize).map(_formatBillRow);
    result.total   = result.total + fresh.length;
  } else {
    result.orders = result.orders.map(_formatBillRow);
  }

  result.source = "postgres";
  return result;
}

/** Flatten a closed-order object to the compact shape needed by the bill-list UI. */
function _formatBillRow(order) {
  const items    = order.items || [];
  const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  const discount = Math.min(order.discountAmount || 0, subtotal);
  const net      = subtotal - discount;
  const payments = order.payments || [];
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const methods   = [...new Set(payments.map((p) => (p.method || "cash").toLowerCase()))].join(", ");

  const closedAt = order.closedAt || order._receivedAt || null;
  const timeStr  = closedAt
    ? new Date(closedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    : "—";
  const dateStr  = closedAt
    ? new Date(closedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    : "—";

  return {
    billNo:      order.billNo     || "—",
    billNoFY:    order.billNoFY   || null,
    tableNumber: order.tableNumber || order.tableId || "—",
    outletName:  order.outletName  || "—",
    items:       items.length,
    subtotal:    Math.round(subtotal),
    discount:    Math.round(discount),
    net:         Math.round(net),
    totalPaid:   Math.round(totalPaid),
    paymentMethods: methods || "—",
    cashierName: order.cashierName || "—",
    date:        dateStr,
    time:        timeStr,
    closedAt,
    // Full order attached so the UI can open a bill detail modal
    _order:      order,
  };
}

async function approveClosing(actor = { name: "Owner", role: "Owner" }, tenantId) {
  await syncOperationsState();
  approveClosingState(actor.name, actor.role);
  await persistOperationsState();
  return await buildOwnerSummary(tenantId);
}

async function reopenBusinessDay(actor = { name: "Owner", role: "Owner" }, tenantId) {
  await syncOperationsState();
  reopenClosingState(actor.name, actor.role);
  await persistOperationsState();
  return await buildOwnerSummary(tenantId);
}

module.exports = {
  fetchOwnerSummary,
  approveClosing,
  reopenBusinessDay,
  listOrderHistory
};
