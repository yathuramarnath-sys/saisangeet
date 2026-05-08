/**
 * printBill.js — thermal bill printing for POS
 *
 * Production path  (Windows Electron): silent via window.electronAPI.printHTML()
 * Fallback         (browser / web):    popup window + window.print()
 */

import { getBillPrinter } from "./kotPrint";

export function printBill(order, items, outletName, options = {}) {
  const { seatLabel = null, cashierName = null } = options;
  const servedBy = cashierName || order.cashierName || null;

  const billableItems = (items || []).filter((i) => !i.isVoided && !i.isComp);
  const subtotal  = billableItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount  = Math.min(order.discountAmount || 0, subtotal);
  const afterDisc = subtotal - discount;
  const taxTotal  = Math.round(afterDisc * 0.05);
  const cgst      = Math.round(afterDisc * 0.025);
  const sgst      = taxTotal - cgst;
  const total     = afterDisc + taxTotal;

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
      <td class="col-rate">₹${i.price.toFixed(0)}</td>
      <td class="col-amt">₹${(i.price * i.quantity).toFixed(0)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Bill${seatLabel ? " – " + seatLabel : ""}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Manrope', 'Courier New', monospace;
      font-size: 12px;
      color: #111;
      padding: 10px 12px 20px;
      width: 80mm;
    }

    /* ── Header ── */
    .hdr { text-align: center; margin-bottom: 6px; }
    .outlet-name { font-size: 17px; font-weight: 800; letter-spacing: 0.3px; }
    .outlet-sub  { font-size: 10px; color: #777; margin-top: 1px; }

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
    .footer .cashier { font-size: 11px; font-weight: 700; color: #444; }
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
    ${order.orderNumber ? `<tr>
      <td class="lbl">Bill No</td><td class="sep">:</td><td class="val" colspan="4">#${order.orderNumber}</td>
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
  <div class="sum-row"><span>Subtotal</span><span class="val">₹${subtotal.toFixed(0)}</span></div>
  ${discount > 0 ? `<div class="sum-row"><span>Discount</span><span class="val" style="color:#e53">−₹${discount.toFixed(0)}</span></div>` : ""}
  <div class="sum-row"><span>CGST (2.5%)</span><span class="val">₹${cgst.toFixed(0)}</span></div>
  <div class="sum-row"><span>SGST (2.5%)</span><span class="val">₹${sgst.toFixed(0)}</span></div>
  <hr class="div-dash">
  <div class="total-row"><span>TOTAL</span><span>₹${total.toFixed(0)}</span></div>
  <hr class="div-dash">

  <!-- Footer -->
  <div class="footer">
    <p>Please pay at the counter</p>
    <p>Thank you for dining with us!</p>
  </div>

</body>
</html>`;

  // ── Production path: Windows Electron silent printing ───────────────────
  if (window.electronAPI?.printHTML) {
    const printer     = getBillPrinter();
    const printerName = printer?.winName || printer?.name || null;
    const printerIp   = printer?.ip?.trim() || null;

    window.electronAPI
      .printHTML({ html, printerName, printerIp, paperWidthMm: 80 })
      .then((result) => {
        if (!result?.ok) {
          console.warn("[printBill] Electron print failed:", result?.error);
          window.dispatchEvent(new CustomEvent("dinex:print-error", {
            detail: { source: "Bill", printerName, error: result?.error },
          }));
        }
      })
      .catch((err) => {
        console.error("[printBill] Electron printHTML error:", err);
        window.dispatchEvent(new CustomEvent("dinex:print-error", {
          detail: { source: "Bill", printerName, error: err?.message || "unknown" },
        }));
      });

    return;
  }

  // ── Fallback: browser popup + window.print() ──────────────────────────────
  const w = window.open("", "_blank", "width=420,height=700");
  if (!w) { alert("Please allow pop-ups to print the bill."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.onafterprint = () => w.close();
    setTimeout(() => w.close(), 3500);
  }, 500);
}
