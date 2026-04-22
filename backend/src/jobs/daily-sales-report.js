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

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

function getTodayOrders(store) {
  // store is the closed-orders Map structure
  const today   = todayIST();
  const result  = [];
  for (const outletMap of store.values()) {
    for (const orders of outletMap.values()) {
      for (const o of orders) {
        const d = new Date(o.closedAt || o._receivedAt || 0)
          .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        if (d === today) result.push(o);
      }
    }
  }
  return result;
}

/* ── Build summary numbers ────────────────────────────────────────────────── */
function buildSummary(orders, shifts) {
  let net = 0, gst = 0, cash = 0, upi = 0, card = 0, other = 0;

  for (const o of orders) {
    const items    = o.items || [];
    const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const disc     = Math.min(o.discountAmount || 0, subtotal);
    const taxable  = subtotal - disc;
    net += taxable;
    gst += Math.round(taxable * 0.05);

    for (const p of o.payments || []) {
      const m = (p.method || "").toLowerCase();
      if      (m === "cash") cash  += p.amount || 0;
      else if (m === "upi")  upi   += p.amount || 0;
      else if (m === "card") card  += p.amount || 0;
      else                   other += p.amount || 0;
    }
  }

  const total      = net + gst;
  const orderCount = orders.length;

  // Shift mismatches
  const allShifts   = [...(shifts.active || []), ...(shifts.history || [])];
  const mismatches  = allShifts.filter(s => s.status === "mismatch");
  const totalShort  = mismatches.reduce((s, x) => s + Math.abs(Math.min(x.variance || 0, 0)), 0);

  return { net, gst, total, cash, upi, card, other, orderCount, mismatches, totalShort, allShifts };
}

/* ── HTML email ───────────────────────────────────────────────────────────── */
function buildHtml(summary, dateStr, restName = "Restaurant", ownerName = "Owner") {
  const { net, gst, total, cash, upi, card, other,
          orderCount, mismatches, totalShort, allShifts } = summary;

  const avgOrder = orderCount > 0 ? Math.round(total / orderCount) : 0;

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
        ${cash > 0  ? `<td style="text-align:center;background:#F0FDF4;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#16A34A;">${fmt(cash)}</div><div style="font-size:11px;color:#888;margin-top:4px;">Cash (${pct(cash,total)})</div></td>` : ""}
        ${upi > 0   ? `<td style="text-align:center;background:#EFF6FF;border-radius:10px;padding:16px 8px;margin-left:8px;"><div style="font-size:20px;font-weight:800;color:#2563EB;">${fmt(upi)}</div><div style="font-size:11px;color:#888;margin-top:4px;">UPI (${pct(upi,total)})</div></td>` : ""}
        ${card > 0  ? `<td style="text-align:center;background:#FFF7ED;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#EA580C;">${fmt(card)}</div><div style="font-size:11px;color:#888;margin-top:4px;">Card (${pct(card,total)})</div></td>` : ""}
        ${other > 0 ? `<td style="text-align:center;background:#F9FAFB;border-radius:10px;padding:16px 8px;"><div style="font-size:20px;font-weight:800;color:#6B7280;">${fmt(other)}</div><div style="font-size:11px;color:#888;margin-top:4px;">Other</div></td>` : ""}
        ${total === 0 ? `<td style="text-align:center;padding:16px;color:#888;font-size:14px;">No sales recorded today</td>` : ""}
      </tr>
    </table>
  </div>

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

    // ── Get all tenants from DB (or fallback to "default" tenant) ────────────
    let tenants = []; // [{ tenantId, ownerEmail, restaurantName }]

    if (isDatabaseEnabled()) {
      try {
        const rows = await query(
          "SELECT tenant_id, value FROM tenant_settings WHERE key = 'owner_setup'"
        );
        for (const row of rows.rows) {
          const data        = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          const ownerEmail  = data?.businessProfile?.email;
          const restName    = data?.businessProfile?.tradeName || data?.businessProfile?.legalName || "Restaurant";
          const ownerName   = (data?.users || []).find(u => (u.roles || []).includes("Owner"))?.fullName || "Owner";
          if (ownerEmail) tenants.push({ tenantId: row.tenant_id, ownerEmail, restName, ownerName });
        }
      } catch (err) {
        console.error("[sales-report] Could not query tenants:", err.message);
      }
    }

    // Fallback: always also send to SALES_REPORT_EMAIL (your own email)
    const hasDefault = tenants.some(t => t.tenantId === "default");
    if (!hasDefault) {
      tenants.push({ tenantId: "default", ownerEmail: SALES_REPORT_EMAIL, restName: "Restaurant", ownerName: "Owner" });
    }

    // ── Send one report per tenant ───────────────────────────────────────────
    for (const { tenantId, ownerEmail, restName, ownerName } of tenants) {
      try {
        const orders  = cosModule.getTodaySales(tenantId);
        const shifts  = ssModule.getShifts(tenantId);
        const summary = buildSummary(orders, shifts);

        const subject = summary.orderCount > 0
          ? `📊 ${summary.orderCount} orders · ${fmt(summary.total)} — ${restName} Daily Report`
          : `📊 ${restName} Daily Report — ${dateStr}`;

        const { error } = await resend.emails.send({
          from:    env.emailFrom,
          to:      ownerEmail,
          subject,
          html:    buildHtml(summary, dateStr, restName, ownerName)
        });

        if (error) throw new Error(error.message);
        console.log(`[sales-report] ✅ Sent to ${ownerEmail} (${restName}) — ${summary.orderCount} orders, ${fmt(summary.total)}`);
      } catch (err) {
        console.error(`[sales-report] ❌ Failed for tenant ${tenantId}:`, err.message);
      }
    }

  } catch (err) {
    console.error("[sales-report] ❌ Fatal:", err.message);
  }
}

/* ── Scheduler: fires every day at 11 PM IST ─────────────────────────────── */
function scheduleDailySalesReport() {
  function msUntil11PMIST() {
    const now       = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow    = new Date(now.getTime() + istOffset);
    const target    = new Date(istNow);
    target.setUTCHours(17, 30, 0, 0); // 17:30 UTC = 23:00 IST
    if (target <= istNow) target.setUTCDate(target.getUTCDate() + 1);
    return target.getTime() - now.getTime();
  }

  function scheduleNext() {
    const delay = msUntil11PMIST();
    const hrs   = (delay / 3_600_000).toFixed(1);
    console.log(`[sales-report] Next report scheduled in ${hrs} hours (11 PM IST)`);
    setTimeout(async () => {
      await runDailySalesReport();
      scheduleNext();
    }, delay);
  }

  scheduleNext();
}

module.exports = { scheduleDailySalesReport, runDailySalesReport };
