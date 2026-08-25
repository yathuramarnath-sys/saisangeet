/**
 * daily-sales-report.js
 * Sends an end-of-day sales summary email every night at 11 PM IST.
 * Reads from closed-orders-store and shifts-store (both in-memory,
 * kept alive by Postgres persistence).
 */

const { Resend } = require("resend");
const { env }    = require("../config/env");

const SALES_REPORT_EMAIL = process.env.SALES_REPORT_EMAIL || "info@dinexpos.in";

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmt(n)   { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function pct(a,b) { return b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "—"; }

/* ── Build summary numbers ────────────────────────────────────────────────── */
function buildSummary(orders, shifts, outlets = []) {
  let net = 0, gst = 0, cash = 0, upi = 0, card = 0, online = 0, other = 0;

  const outletNameById = {};
  for (const o of outlets) outletNameById[o.id] = o.name || o.id;

  const branchTotals = {}; // outletId → { name, total, orderCount }
  const itemTotals    = {}; // item name → { qty, revenue }
  const categoryTotals = {}; // category name → { qty, revenue }

  for (const o of orders) {
    const items    = (o.items || []).filter(i => !i.isVoided);
    const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const disc     = Math.min(o.discountAmount || 0, subtotal);

    // GST-inclusive extraction per item's actual taxRate (same formula as the live Reports page).
    let orderTax = 0;
    for (const item of items) {
      const rate    = (item.taxRate != null && item.taxRate !== "") ? Number(item.taxRate) : 5;
      const lineAmt = subtotal > 0 ? (item.price || 0) * (item.quantity || 1) * ((subtotal - disc) / subtotal) : 0;
      orderTax += rate > 0 ? lineAmt * rate / (100 + rate) : 0;

      const itemName = item.name || "Item";
      itemTotals[itemName] = itemTotals[itemName] || { qty: 0, revenue: 0 };
      itemTotals[itemName].qty     += item.quantity || 1;
      itemTotals[itemName].revenue += lineAmt;

      const catName = (item.category || item.categoryName || "Uncategorised").trim() || "Uncategorised";
      categoryTotals[catName] = categoryTotals[catName] || { qty: 0, revenue: 0 };
      categoryTotals[catName].qty     += item.quantity || 1;
      categoryTotals[catName].revenue += lineAmt;
    }
    const taxable = subtotal - disc - orderTax;

    net += taxable;
    gst += orderTax;

    const orderTotal = taxable + orderTax;
    const outletId   = o._outletId || "unknown";
    branchTotals[outletId] = branchTotals[outletId] || {
      name: outletNameById[outletId] || "Outlet", total: 0, orderCount: 0
    };
    branchTotals[outletId].total      += orderTotal;
    branchTotals[outletId].orderCount += 1;

    for (const p of o.payments || []) {
      const m = (p.method || "").toLowerCase();
      if      (m === "cash")   cash   += p.amount || 0;
      else if (m === "upi")    upi    += p.amount || 0;
      else if (m === "card")   card   += p.amount || 0;
      else if (m === "online") online += p.amount || 0;
      else                     other  += p.amount || 0;
    }
  }

  const total      = net + gst;
  const orderCount = orders.length;

  const topItems = Object.entries(itemTotals)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const topCategories = Object.entries(categoryTotals)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const branches = Object.values(branchTotals).sort((a, b) => b.total - a.total);

  // Shift mismatches — scoped to shifts CLOSED TODAY (IST) only. History keeps
  // up to 500 past shifts, so without this filter every report re-lists every
  // mismatch ever recorded instead of just today's.
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const todaysShifts = [...(shifts.active || []), ...(shifts.history || [])].filter(s => {
    const closedStr = new Date(s.closedAt || s.openedAt || 0)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return closedStr === todayStr;
  });
  const mismatches  = todaysShifts.filter(s => s.status === "mismatch");
  const totalShort  = mismatches.reduce((s, x) => s + Math.abs(Math.min(x.variance || 0, 0)), 0);

  return {
    net, gst, total, cash, upi, card, online, other, orderCount,
    mismatches, totalShort, allShifts: todaysShifts,
    branches, topItems, topCategories,
  };
}

/* ── HTML email ───────────────────────────────────────────────────────────── */
function buildHtml(summary, dateStr, restName = "Restaurant", ownerName = "Owner") {
  const { net, gst, total, cash, upi, card, online, other,
          orderCount, mismatches, totalShort, allShifts,
          branches, topItems, topCategories } = summary;

  const avgOrder = orderCount > 0 ? Math.round(total / orderCount) : 0;

  const branchRows = branches.map(b => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${b.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;">${b.orderCount}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;font-weight:700;">${fmt(b.total)}</td>
    </tr>`).join("");

  const topItemRows = topItems.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${i.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;">${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;font-weight:700;">${fmt(i.revenue)}</td>
    </tr>`).join("");

  const topCategoryRows = topCategories.map(c => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${c.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;">${c.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;font-weight:700;">${fmt(c.revenue)}</td>
    </tr>`).join("");

  const mismatchRows = mismatches.map(s => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${s.cashier}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${s.outlet || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;color:#DC2626;font-weight:700;">
        ${fmt(Math.abs(s.variance || 0))} short
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;font-size:12px;color:#888;">
        ${s.note || "No note"}
      </td>
    </tr>`).join("");

  const closedShifts = allShifts.filter(s => s.status !== "open");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#F4F4F7;margin:0;padding:0;">
<div style="max-width:580px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,.09);">

  <!-- Header -->
  <div style="background:#1A1D27;padding:28px 36px;">
    <div style="font-size:22px;font-weight:800;color:#fff;">🍽 ${restName}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.55);margin-top:4px;">Daily Sales Report · ${dateStr}</div>
  </div>

  <!-- Hero numbers -->
  <div style="padding:28px 36px 0;">
    <div style="font-size:14px;color:#4A5065;margin-bottom:12px;">Hi ${ownerName}, here's your sales summary for today.</div>
    <div style="font-size:13px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;">Total Sales Today</div>
    <div style="font-size:42px;font-weight:800;color:#1A1D27;margin:4px 0 2px;">${fmt(total)}</div>
    <div style="font-size:14px;color:#888;">${orderCount} orders &nbsp;·&nbsp; Avg ${fmt(avgOrder)} / order &nbsp;·&nbsp; GST ${fmt(gst)}</div>
  </div>

  <!-- Payment breakdown -->
  <div style="padding:24px 36px 0;">
    <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:12px;">Payment Breakdown</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${cash > 0   ? `<td style="text-align:center;background:#F0FDF4;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#16A34A;">${fmt(cash)}</div><div style="font-size:11px;color:#888;margin-top:4px;">Cash (${pct(cash,total)})</div></td>` : ""}
        ${upi > 0    ? `<td style="text-align:center;background:#EFF6FF;border-radius:10px;padding:16px 8px;margin-left:8px;"><div style="font-size:20px;font-weight:800;color:#2563EB;">${fmt(upi)}</div><div style="font-size:11px;color:#888;margin-top:4px;">UPI (${pct(upi,total)})</div></td>` : ""}
        ${card > 0   ? `<td style="text-align:center;background:#FFF7ED;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#EA580C;">${fmt(card)}</div><div style="font-size:11px;color:#888;margin-top:4px;">Card (${pct(card,total)})</div></td>` : ""}
        ${online > 0 ? `<td style="text-align:center;background:#FFFBEB;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#B45309;">${fmt(online)}</div><div style="font-size:11px;color:#888;margin-top:4px;">🛵 Online (${pct(online,total)})</div></td>` : ""}
        ${other > 0  ? `<td style="text-align:center;background:#F9FAFB;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#6B7280;">${fmt(other)}</div><div style="font-size:11px;color:#888;margin-top:4px;">Other</div></td>` : ""}
        ${total === 0 ? `<td style="text-align:center;padding:16px;color:#888;font-size:14px;">No sales recorded today</td>` : ""}
      </tr>
    </table>
  </div>

  <!-- Branch-wise split -->
  ${branches.length > 1 ? `
  <div style="padding:24px 36px 0;">
    <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px;">Branch-wise Split</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #F0F0F0;border-radius:10px;overflow:hidden;font-size:13px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 12px;text-align:left;color:#888;font-size:11px;">Branch</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Orders</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Sales</th>
      </tr>
      ${branchRows}
    </table>
  </div>` : ""}

  <!-- Top items -->
  ${topItems.length > 0 ? `
  <div style="padding:24px 36px 0;">
    <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px;">Top Items</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #F0F0F0;border-radius:10px;overflow:hidden;font-size:13px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 12px;text-align:left;color:#888;font-size:11px;">Item</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Qty</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Revenue</th>
      </tr>
      ${topItemRows}
    </table>
  </div>` : ""}

  <!-- Top categories -->
  ${topCategories.length > 0 ? `
  <div style="padding:24px 36px 0;">
    <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px;">Top Categories</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #F0F0F0;border-radius:10px;overflow:hidden;font-size:13px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 12px;text-align:left;color:#888;font-size:11px;">Category</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Qty</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Revenue</th>
      </tr>
      ${topCategoryRows}
    </table>
  </div>` : ""}

  <!-- Shift summary -->
  ${closedShifts.length > 0 ? `
  <div style="padding:24px 36px 0;">
    <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px;">Shifts Closed Today</div>
    <div style="font-size:14px;color:#1A1D27;">${closedShifts.length} shift${closedShifts.length > 1 ? "s" : ""} closed
      ${mismatches.length > 0
        ? `&nbsp;·&nbsp;<span style="color:#DC2626;font-weight:700;">⚠ ${mismatches.length} mismatch${mismatches.length > 1 ? "es" : ""} — ${fmt(totalShort)} short</span>`
        : `&nbsp;·&nbsp;<span style="color:#16A34A;font-weight:700;">✓ All cash matched</span>`}
    </div>
  </div>` : ""}

  <!-- Mismatch table -->
  ${mismatches.length > 0 ? `
  <div style="padding:16px 36px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #FEE2E2;border-radius:10px;overflow:hidden;font-size:13px;">
      <tr style="background:#FEF2F2;">
        <th style="padding:10px 12px;text-align:left;color:#DC2626;font-size:11px;">Cashier</th>
        <th style="padding:10px 12px;text-align:left;color:#DC2626;font-size:11px;">Outlet</th>
        <th style="padding:10px 12px;text-align:left;color:#DC2626;font-size:11px;">Variance</th>
        <th style="padding:10px 12px;text-align:left;color:#DC2626;font-size:11px;">Note</th>
      </tr>
      ${mismatchRows}
    </table>
  </div>` : ""}

  <!-- Footer -->
  <div style="padding:28px 36px;margin-top:24px;border-top:1px solid #F0F0F0;">
    <a href="https://app.dinexpos.in" style="display:inline-block;background:#FF5A1F;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;">
      Open Owner Console →
    </a>
    <p style="font-size:12px;color:#AAA;margin-top:16px;">
      © 2026 DineXPOS · Automated daily report · Sent every night at 11 PM IST
    </p>
  </div>

</div>
</body>
</html>`.trim();
}

/* ── Build backup JSON for a tenant (menu, staff, outlets, settings) ─────── */
function buildBackupJson(data, tenantId) {
  const sanitized = {
    ...data,
    users: (data?.users || []).map(({ passwordHash: _omit, ...u }) => u),
  };
  return JSON.stringify({ exportedAt: new Date().toISOString(), tenantCount: 1, tenants: { [tenantId]: sanitized } }, null, 2);
}

/* ── Combined daily report + backup email HTML ────────────────────────────── */
function buildCombinedHtml(summary, dateStr, restName, ownerName, backupFilename, backupSizeKb) {
  const { net, gst, total, cash, upi, card, online, other,
          orderCount, mismatches, totalShort, allShifts,
          branches, topItems, topCategories } = summary;

  const avgOrder = orderCount > 0 ? Math.round(total / orderCount) : 0;

  const branchRows = branches.map(b => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${b.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;">${b.orderCount}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;font-weight:700;">${fmt(b.total)}</td>
    </tr>`).join("");

  const topItemRows = topItems.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${i.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;">${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;font-weight:700;">${fmt(i.revenue)}</td>
    </tr>`).join("");

  const topCategoryRows = topCategories.map(c => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${c.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;">${c.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;text-align:right;font-weight:700;">${fmt(c.revenue)}</td>
    </tr>`).join("");

  const mismatchRows = mismatches.map(s => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${s.cashier}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${s.outlet || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;color:#DC2626;font-weight:700;">
        ${fmt(Math.abs(s.variance || 0))} short
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;font-size:12px;color:#888;">
        ${s.note || "No note"}
      </td>
    </tr>`).join("");

  const closedShifts = allShifts.filter(s => s.status !== "open");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#F4F4F7;margin:0;padding:0;">
<div style="max-width:580px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,.09);">

  <!-- Header -->
  <div style="background:#1A1D27;padding:28px 36px;">
    <div style="font-size:22px;font-weight:800;color:#fff;">🍽 ${restName}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.55);margin-top:4px;">Daily Sales Report &amp; Backup · ${dateStr}</div>
  </div>

  <!-- Hero numbers -->
  <div style="padding:28px 36px 0;">
    <div style="font-size:14px;color:#4A5065;margin-bottom:12px;">Hi ${ownerName}, here's your sales summary for yesterday.</div>
    <div style="font-size:13px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;">Total Sales</div>
    <div style="font-size:42px;font-weight:800;color:#1A1D27;margin:4px 0 2px;">${fmt(total)}</div>
    <div style="font-size:14px;color:#888;">${orderCount} orders &nbsp;·&nbsp; Avg ${fmt(avgOrder)} / order &nbsp;·&nbsp; GST ${fmt(gst)}</div>
  </div>

  <!-- Payment breakdown -->
  <div style="padding:24px 36px 0;">
    <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:12px;">Payment Breakdown</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${cash > 0   ? `<td style="text-align:center;background:#F0FDF4;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#16A34A;">${fmt(cash)}</div><div style="font-size:11px;color:#888;margin-top:4px;">Cash (${pct(cash,total)})</div></td>` : ""}
        ${upi > 0    ? `<td style="text-align:center;background:#EFF6FF;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#2563EB;">${fmt(upi)}</div><div style="font-size:11px;color:#888;margin-top:4px;">UPI (${pct(upi,total)})</div></td>` : ""}
        ${card > 0   ? `<td style="text-align:center;background:#FFF7ED;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#EA580C;">${fmt(card)}</div><div style="font-size:11px;color:#888;margin-top:4px;">Card (${pct(card,total)})</div></td>` : ""}
        ${online > 0 ? `<td style="text-align:center;background:#FFFBEB;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#B45309;">${fmt(online)}</div><div style="font-size:11px;color:#888;margin-top:4px;">🛵 Online (${pct(online,total)})</div></td>` : ""}
        ${other > 0  ? `<td style="text-align:center;background:#F9FAFB;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#6B7280;">${fmt(other)}</div><div style="font-size:11px;color:#888;margin-top:4px;">Other</div></td>` : ""}
        ${total === 0 ? `<td style="text-align:center;padding:16px;color:#888;font-size:14px;">No sales recorded</td>` : ""}
      </tr>
    </table>
  </div>

  <!-- Branch-wise split -->
  ${branches.length > 1 ? `
  <div style="padding:24px 36px 0;">
    <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px;">Branch-wise Split</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #F0F0F0;border-radius:10px;overflow:hidden;font-size:13px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 12px;text-align:left;color:#888;font-size:11px;">Branch</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Orders</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Sales</th>
      </tr>
      ${branchRows}
    </table>
  </div>` : ""}

  <!-- Top items -->
  ${topItems.length > 0 ? `
  <div style="padding:24px 36px 0;">
    <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px;">Top Items</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #F0F0F0;border-radius:10px;overflow:hidden;font-size:13px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 12px;text-align:left;color:#888;font-size:11px;">Item</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Qty</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Revenue</th>
      </tr>
      ${topItemRows}
    </table>
  </div>` : ""}

  <!-- Top categories -->
  ${topCategories.length > 0 ? `
  <div style="padding:24px 36px 0;">
    <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px;">Top Categories</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #F0F0F0;border-radius:10px;overflow:hidden;font-size:13px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 12px;text-align:left;color:#888;font-size:11px;">Category</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Qty</th>
        <th style="padding:10px 12px;text-align:right;color:#888;font-size:11px;">Revenue</th>
      </tr>
      ${topCategoryRows}
    </table>
  </div>` : ""}

  <!-- Shift summary -->
  ${closedShifts.length > 0 ? `
  <div style="padding:24px 36px 0;">
    <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px;">Shifts Closed</div>
    <div style="font-size:14px;color:#1A1D27;">${closedShifts.length} shift${closedShifts.length > 1 ? "s" : ""} closed
      ${mismatches.length > 0
        ? `&nbsp;·&nbsp;<span style="color:#DC2626;font-weight:700;">⚠ ${mismatches.length} mismatch${mismatches.length > 1 ? "es" : ""} — ${fmt(totalShort)} short</span>`
        : `&nbsp;·&nbsp;<span style="color:#16A34A;font-weight:700;">✓ All cash matched</span>`}
    </div>
  </div>` : ""}

  <!-- Mismatch table -->
  ${mismatches.length > 0 ? `
  <div style="padding:16px 36px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #FEE2E2;border-radius:10px;overflow:hidden;font-size:13px;">
      <tr style="background:#FEF2F2;">
        <th style="padding:10px 12px;text-align:left;color:#DC2626;font-size:11px;">Cashier</th>
        <th style="padding:10px 12px;text-align:left;color:#DC2626;font-size:11px;">Outlet</th>
        <th style="padding:10px 12px;text-align:left;color:#DC2626;font-size:11px;">Variance</th>
        <th style="padding:10px 12px;text-align:left;color:#DC2626;font-size:11px;">Note</th>
      </tr>
      ${mismatchRows}
    </table>
  </div>` : ""}

  <!-- Backup notice -->
  <div style="padding:24px 36px 0;">
    <div style="background:#F0FDF4;border:1.5px solid #A7F3D0;border-radius:10px;padding:16px 20px;">
      <div style="font-size:13px;font-weight:700;color:#065F46;margin-bottom:6px;">🗄 Data Backup Attached</div>
      <div style="font-size:13px;color:#065F46;">Your restaurant setup (menu, staff, outlets, settings) is attached as <strong>${backupFilename}</strong> (${backupSizeKb} KB). Save it to Google Drive or WhatsApp Saved Messages. If data is ever lost, send it to <a href="mailto:hello@dinexpos.in" style="color:#059669;">hello@dinexpos.in</a>.</div>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding:28px 36px;margin-top:24px;border-top:1px solid #F0F0F0;">
    <a href="https://app.dinexpos.in" style="display:inline-block;background:#FF5A1F;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;">
      Open Owner Console →
    </a>
    <p style="font-size:12px;color:#AAA;margin-top:16px;">
      © 2026 DineXPOS · Automated daily report + backup · Sent every morning at 4 AM IST
    </p>
  </div>

</div>
</body>
</html>`.trim();
}

/* ── Main report job ──────────────────────────────────────────────────────── */
async function runDailySalesReport() {
  console.log("[sales-report] Building daily sales reports…");
  try {
    const { query }    = require("../db/pool");
    const { isDatabaseEnabled } = require("../db/database-mode");
    const cosModule    = require("../modules/operations/closed-orders-store");
    const ssModule     = require("../modules/operations/shifts-store");

    if (!env.resendApiKey) {
      console.log("[sales-report] No RESEND_API_KEY — skipping");
      return;
    }

    const resend  = new Resend(env.resendApiKey);
    const dateStr = new Date().toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
    const backupDate = new Date().toISOString().slice(0, 10);

    // ── Get all ACTIVE tenants from DB ───────────────────────────────────────
    // Reads owner_setup + client_active to skip inactive accounts.
    let tenants = [];

    if (isDatabaseEnabled()) {
      try {
        const rows = await query(
          `SELECT ts.tenant_id, ts.value AS setup, ca.value AS client_active
           FROM tenant_settings ts
           LEFT JOIN tenant_settings ca
             ON ca.tenant_id = ts.tenant_id AND ca.key = 'client_active'
           WHERE ts.key = 'owner_setup'`
        );
        for (const row of rows.rows) {
          // Skip inactive tenants (set via Admin → Set Active toggle)
          const activeFlag = row.client_active
            ? (typeof row.client_active === "string" ? JSON.parse(row.client_active) : row.client_active)
            : null;
          if (activeFlag && activeFlag.active === false) {
            console.log(`[sales-report] Skipping inactive tenant ${row.tenant_id}`);
            continue;
          }

          const data       = typeof row.setup === "string" ? JSON.parse(row.setup) : row.setup;
          const ownerUser  = (data?.users || []).find(u => u.passwordHash && u.email);
          const ownerEmail = ownerUser?.email || data?.businessProfile?.email;
          const restName   = data?.businessProfile?.tradeName || data?.businessProfile?.legalName || "Restaurant";
          const ownerName  = ownerUser?.fullName || (data?.users || []).find(u => (u.roles || []).includes("Owner"))?.fullName || "Owner";
          const outlets    = data?.outlets || [];
          if (ownerEmail) tenants.push({ tenantId: row.tenant_id, ownerEmail, restName, ownerName, outlets, data });
        }
      } catch (err) {
        console.error("[sales-report] Could not query tenants:", err.message);
      }
    }

    if (!tenants.length) {
      console.log("[sales-report] No active tenants found — skipping");
      return;
    }

    // ── Send one combined report + backup email per active tenant ────────────
    for (const { tenantId, ownerEmail, restName, ownerName, outlets, data } of tenants) {
      try {
        const orders  = cosModule.getTodaySales(tenantId);
        const shifts  = ssModule.getShifts(tenantId);
        const summary = buildSummary(orders, shifts, outlets);

        // Build backup attachment
        const backupJson     = buildBackupJson(data, tenantId);
        const backupFilename = `plato-backup-${backupDate}.json`;
        const backupSizeKb   = Math.round(Buffer.byteLength(backupJson, "utf8") / 1024);

        const subject = summary.orderCount > 0
          ? `📊 ${summary.orderCount} orders · ${fmt(summary.total)} — ${restName} Daily Report`
          : `📊 ${restName} Daily Report — ${dateStr}`;

        const { error } = await resend.emails.send({
          from:    env.emailFrom,
          to:      ownerEmail,
          subject,
          html:    buildCombinedHtml(summary, dateStr, restName, ownerName, backupFilename, backupSizeKb),
          attachments: [
            {
              filename:    backupFilename,
              content:     Buffer.from(backupJson, "utf8").toString("base64"),
              contentType: "application/json",
            }
          ]
        });

        if (error) throw new Error(error.message);
        console.log(`[sales-report] ✅ Sent to ${ownerEmail} (${restName}) — ${summary.orderCount} orders, ${fmt(summary.total)}, backup ${backupSizeKb} KB`);
      } catch (err) {
        console.error(`[sales-report] ❌ Failed for tenant ${tenantId}:`, err.message);
      }

      // Per-outlet reports (no backup — backup goes to owner only)
      for (const outlet of outlets) {
        const outletEmail = outlet?.reportEmail;
        if (!outletEmail || outletEmail === ownerEmail) continue;
        try {
          const outletOrders  = cosModule.getTodaySalesByOutlet(tenantId, outlet.id);
          const outletSummary = buildSummary(outletOrders, { active: [], history: [] });
          const outletName    = outlet.name || restName;

          const subject = outletSummary.orderCount > 0
            ? `📊 ${outletSummary.orderCount} orders · ${fmt(outletSummary.total)} — ${outletName} Daily Report`
            : `📊 ${outletName} Daily Report — ${dateStr}`;

          const { error } = await resend.emails.send({
            from:    env.emailFrom,
            to:      outletEmail,
            subject,
            html:    buildHtml(outletSummary, dateStr, outletName, ownerName)
          });

          if (error) throw new Error(error.message);
          console.log(`[sales-report] ✅ Sent to ${outletEmail} (${outletName}) — ${outletSummary.orderCount} orders`);
        } catch (err) {
          console.error(`[sales-report] ❌ Failed for outlet ${outlet.id} (tenant ${tenantId}):`, err.message);
        }
      }
    }

  } catch (err) {
    console.error("[sales-report] ❌ Fatal:", err.message);
  }
}

/* ── Scheduler: fires every day at 4 AM IST ──────────────────────────────── */
function scheduleDailySalesReport() {
  function msUntil4AMIST() {
    const now = new Date();
    // 4:00 AM IST = 22:30 UTC previous day
    const target = new Date(now);
    target.setUTCHours(22, 30, 0, 0); // 22:30 UTC = 04:00 IST
    if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
    return target.getTime() - now.getTime();
  }

  function scheduleNext() {
    const delay = msUntil4AMIST();
    const hrs   = (delay / 3_600_000).toFixed(1);
    console.log(`[sales-report] Next report scheduled in ${hrs} hours (4 AM IST)`);
    setTimeout(async () => {
      await runDailySalesReport();
      scheduleNext();
    }, delay);
  }

  scheduleNext();
}

module.exports = { scheduleDailySalesReport, runDailySalesReport };
