/**
 * printBill.js — thermal bill printing for Captain / Waiter app
 *
 * Android path: sends HTML to the Windows POS local server (port 4001/print)
 * which forwards to the thermal printer via TCP ESC/POS port 9100.
 * The POS IP is stored as "captain_local_server_ip" (set via Find POS in ☰ menu).
 */

import { getBillPrinter } from "./kotPrint";
import { tabletPrintBill } from "./wifiPrint";

export function printBill(order, items, outletName, options = {}) {

  const { seatLabel = null, cashierName = null } = options;
  const _printer      = getBillPrinter();
  const _paperWidthMm = _printer?.paper || 80;
  const servedBy = cashierName || order.cashierName || null;

  const billableItems = (items || []).filter((i) => !i.isVoided && !i.isComp);
  const subtotal  = billableItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount  = Math.min(order.discountAmount || 0, subtotal);
  const afterDisc = subtotal - discount;

  // ── Per-item tax calculation (reads item.taxRate; defaults to 5% if not set) ──
  const taxBreakdown = {};
  billableItems.forEach(i => {
    const lineAmt   = i.price * i.quantity;
    const lineAfter = subtotal > 0 ? lineAmt * (afterDisc / subtotal) : lineAmt;
    const rate      = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    const lineTax   = Math.round(lineAfter * rate / 100);
    taxBreakdown[rate] = (taxBreakdown[rate] || 0) + lineTax;
  });
  const taxRows  = Object.entries(taxBreakdown).map(([rate, amt]) => ({
    rate:    Number(rate),
    cgstPct: Number(rate) / 2,
    cgst:    Math.round(amt / 2),
    sgst:    amt - Math.round(amt / 2),
  }));
  const taxTotal = taxRows.reduce((s, r) => s + r.cgst + r.sgst, 0);
  const total    = afterDisc + taxTotal;

  const now     = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const isCounter   = order.isCounter;
  const orderType   = isCounter
    ? (order.onlinePlatform ? order.onlinePlatform : "Takeaway")
    : "Dine In";
  const tableLabel  = isCounter
    ? (order.onlinePlatform
        ? `${order.onlinePlatform} #${order.ticketNumber}`
        : `Token #${order.ticketNumber}`)
    : `${order.tableNumber}${order.areaName ? " · " + order.areaName : ""}`;

  const itemsHtml = billableItems.map((i) => `
    <tr>
      <td class="col-item">${i.name}${i.note ? `<div class="item-note">${i.note}</div>` : ""}</td>
      <td class="col-qty">${i.quantity}</td>
      <td class="col-rate">${i.price.toFixed(0)}</td>
      <td class="col-amt">${(i.price * i.quantity).toFixed(0)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Bill${seatLabel ? " – " + seatLabel : ""}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: ${_paperWidthMm}mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Manrope', 'Courier New', monospace;
      font-size: ${_paperWidthMm <= 58 ? 11 : 12}px;
      color: #111;
      padding: 10px 10px 40px;
      width: ${_paperWidthMm}mm;
    }

    /* ── Header ── */
    .hdr { text-align: center; margin-bottom: 5px; }
    .outlet-name { font-size: 17px; font-weight: 800; letter-spacing: 0.3px; }

    /* ── Divider ── */
    .div-dash { border: none; border-top: 1px dashed #aaa; margin: 4px 0; }

    /* ── Info rows — 2-column flex, label auto-width ── */
    .info-row {
      display: flex; justify-content: space-between;
      font-size: 11px; margin: 2px 0;
    }
    .info-row .left, .info-row .right { display: flex; gap: 3px; align-items: baseline; }
    .info-lbl  { color: #666; white-space: nowrap; }
    .info-sep  { color: #aaa; }
    .info-val  { font-weight: 700; }

    /* ── Items table ── */
    .items-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
    .items-tbl th {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      color: #888; padding: 2px 0; text-align: right; border-bottom: 1px solid #ddd;
    }
    .items-tbl th.col-item { text-align: left; }
    .items-tbl td { padding: 3px 0; vertical-align: top; }
    .items-tbl tbody tr { border-bottom: 1px dotted #eee; }
    .items-tbl tbody tr:last-child { border-bottom: none; }
    .col-item { width: 60%; }
    .col-qty  { width: 8%;  text-align: right; font-weight: 700; }
    .col-rate { width: 16%; text-align: right; color: #555; }
    .col-amt  { width: 16%; text-align: right; font-weight: 700; }
    .item-note { font-size: 10px; color: #999; margin-top: 1px; }

    /* ── Summary rows ── */
    .sum-row {
      display: flex; justify-content: space-between; align-items: baseline;
      font-size: 11px; color: #444; margin: 1px 0;
    }
    .sum-row .val { font-weight: 700; }
    .sum-row.disc .val { color: #c33; }

    /* ── Total ── */
    .total-row {
      display: flex; justify-content: space-between; align-items: baseline;
      font-size: 15px; font-weight: 800; margin: 3px 0 0;
    }

    /* ── Seat tag ── */
    .seat-tag {
      display: inline-block; background: #111; color: #fff;
      padding: 2px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 800; margin: 3px 0;
    }

    /* ── Footer ── */
    .footer { text-align: center; font-size: 10px; color: #999; margin-top: 8px; line-height: 1.7; }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="hdr">
    <div class="outlet-name">${outletName || "Restaurant"}</div>
    ${seatLabel ? `<div><span class="seat-tag">${seatLabel}</span></div>` : ""}
  </div>
  <hr class="div-dash">

  <!-- Bill info — 2-column layout -->
  <div class="info-row">
    <div class="left"><span class="info-lbl">Date</span><span class="info-sep">:</span><span class="info-val">${dateStr}</span></div>
    <div class="right"><span class="info-lbl">Time</span><span class="info-sep">:</span><span class="info-val">${timeStr}</span></div>
  </div>
  <div class="info-row">
    <div class="left"><span class="info-lbl">Table</span><span class="info-sep">:</span><span class="info-val">${tableLabel}</span></div>
    <div class="right"><span class="info-lbl">Type</span><span class="info-sep">:</span><span class="info-val">${orderType}</span></div>
  </div>
  ${(servedBy || order.billNo || order.orderNumber) ? `
  <div class="info-row">
    ${servedBy ? `<div class="left"><span class="info-lbl">Cashier</span><span class="info-sep">:</span><span class="info-val">${servedBy}</span></div>` : "<div></div>"}
    ${(order.billNo || order.orderNumber) ? `<div class="right"><span class="info-lbl">Bill No</span><span class="info-sep">:</span><span class="info-val">#${order.billNo || order.orderNumber}</span></div>` : ""}
  </div>` : ""}
  <hr class="div-dash">

  <!-- Items -->
  <table class="items-tbl">
    <thead>
      <tr>
        <th class="col-item">ITEM</th>
        <th class="col-qty">QTY</th>
        <th class="col-rate">RATE</th>
        <th class="col-amt">AMT</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>
  <hr class="div-dash">

  <!-- Summary — no extra lines between rows -->
  <div class="sum-row"><span>Subtotal</span><span class="val">&#8377;${subtotal.toFixed(2)}</span></div>
  ${discount > 0 ? `<div class="sum-row disc"><span>Discount</span><span class="val">&#8722;&#8377;${discount.toFixed(2)}</span></div>` : ""}
  ${taxRows.map(t => `<div class="sum-row"><span>CGST (${t.cgstPct}%)</span><span class="val">&#8377;${t.cgst.toFixed(2)}</span></div><div class="sum-row"><span>SGST (${t.cgstPct}%)</span><span class="val">&#8377;${t.sgst.toFixed(2)}</span></div>`).join("")}
  <hr class="div-dash">
  <div class="total-row"><span>TOTAL</span><span>&#8377;${total.toFixed(2)}</span></div>

  <!-- Footer -->
  <div class="footer">
    <p>Please pay at the counter</p>
    <p>Thank you for dining with us!</p>
  </div>

</body>
</html>`;

  // ── Android / web: send via WiFi proxy (Windows POS port 4001) ──────────
  tabletPrintBill(html, _paperWidthMm)
    .then((result) => {
      if (!result?.ok) {
        console.warn("[printBill] WiFi print failed:", result?.error);
        window.dispatchEvent(new CustomEvent("dinex:print-error", {
          detail: { source: "Bill", error: result?.error || "Print failed" },
        }));
      }
    })
    .catch((err) => {
      console.warn("[printBill] WiFi print error:", err?.message);
      window.dispatchEvent(new CustomEvent("dinex:print-error", {
        detail: { source: "Bill", error: err?.message || "No POS found on network. Use Find POS in ☰ menu." },
      }));
    });
}
