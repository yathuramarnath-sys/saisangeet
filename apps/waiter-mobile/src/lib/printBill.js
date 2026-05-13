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
      padding: 10px 12px 40px;
      width: ${_paperWidthMm}mm;
    }

    /* ── Header ── */
    .hdr { text-align: center; margin-bottom: 6px; }
    .outlet-name { font-size: 17px; font-weight: 800; letter-spacing: 0.3px; }

    /* ── Info grid ── */
    .info-grid {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin: 6px 0;
    }
    .info-grid td { padding: 1px 0; vertical-align: top; }
    .info-grid .lbl { color: #888; width: 42%; }
    .info-grid .val { font-weight: 700; }
    .info-grid .sep { width: 8%; text-align: center; color: #bbb; }

    /* ── Divider ── */
    .div-dash { border: none; border-top: 1px dashed #bbb; margin: 5px 0; }

    /* ── Items table ── */
    .items-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
    .items-tbl th {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      color: #999; padding: 2px 0; text-align: right;
    }
    .items-tbl th.col-item { text-align: left; }
    .items-tbl td { padding: 4px 0; vertical-align: top; }
    .col-item { width: 50%; }
    .col-qty  { width: 12%; text-align: right; font-weight: 700; }
    .col-rate { width: 18%; text-align: right; color: #666; }
    .col-amt  { width: 20%; text-align: right; font-weight: 700; }
    .item-note { font-size: 10px; color: #999; margin-top: 1px; }

    /* ── Summary rows ── */
    .sum-row {
      display: flex; justify-content: space-between;
      font-size: 11px; color: #555; margin: 2px 0;
    }
    .sum-row .val { font-weight: 700; }

    /* ── Total ── */
    .total-row {
      display: flex; justify-content: space-between;
      font-size: 15px; font-weight: 800; margin: 4px 0 2px;
    }

    /* ── Seat tag ── */
    .seat-tag {
      display: inline-block;
      background: #111; color: #fff;
      padding: 2px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 800; margin: 4px 0;
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

  <!-- Bill info grid -->
  <table class="info-grid">
    <tr>
      <td class="lbl">Date</td><td class="sep">:</td><td class="val">${dateStr}</td>
      <td class="lbl" style="padding-left:6px">Time</td><td class="sep">:</td><td class="val">${timeStr}</td>
    </tr>
    <tr>
      <td class="lbl">Table</td><td class="sep">:</td><td class="val">${tableLabel}</td>
      <td class="lbl" style="padding-left:6px">Type</td><td class="sep">:</td><td class="val">${orderType}</td>
    </tr>
    ${servedBy ? `<tr>
      <td class="lbl">Cashier</td><td class="sep">:</td><td class="val" colspan="4">${servedBy}</td>
    </tr>` : ""}
    ${(order.billNo || order.orderNumber) ? `<tr>
      <td class="lbl">Bill No</td><td class="sep">:</td><td class="val" colspan="4">#${order.billNo || order.orderNumber}</td>
    </tr>` : ""}
  </table>
  <hr class="div-dash">

  <!-- Items -->
  <table class="items-tbl">
    <thead>
      <tr>
        <th class="col-item">Item</th>
        <th class="col-qty">Qty</th>
        <th class="col-rate">Rate</th>
        <th class="col-amt">Amt</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>
  <hr class="div-dash">

  <!-- Summary -->
  <div class="sum-row"><span>Subtotal</span><span class="val">&#8377;${subtotal.toFixed(0)}</span></div>
  ${discount > 0 ? `<div class="sum-row"><span>Discount</span><span class="val" style="color:#e53">&#8722;&#8377;${discount.toFixed(0)}</span></div>` : ""}
  ${taxRows.map(t => `
  <div class="sum-row"><span>CGST (${t.cgstPct}%)</span><span class="val">&#8377;${t.cgst}</span></div>
  <div class="sum-row"><span>SGST (${t.cgstPct}%)</span><span class="val">&#8377;${t.sgst}</span></div>`).join("")}
  <hr class="div-dash">
  <div class="total-row"><span>TOTAL</span><span>&#8377;${total.toFixed(0)}</span></div>
  <hr class="div-dash">

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
