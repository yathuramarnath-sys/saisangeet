/**
 * printBill.js — thermal bill printing for waiter/captain app
 * Generates an 80mm thermal receipt and auto-prints via window.print()
 */

export function printBill(order, items, outletName, options = {}) {
  const { seatLabel = null } = options;

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  // Per-item GST — mirrors POS printBill.js logic exactly
  const tax = items.reduce((s, i) => {
    const rate = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : 5;
    return s + Math.round((i.price * i.quantity) * rate / 100);
  }, 0);
  const total    = subtotal + tax;

  const now     = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const w = window.open("", "_blank", "width=420,height=620");
  if (!w) { alert("Please allow pop-ups to print the bill."); return; }

  const itemsHtml = items
    .map(
      (i) => `
      <div class="row">
        <div class="item-name">
          <span>${i.name}</span>
          ${i.note ? `<div class="item-note">${i.note}</div>` : ""}
        </div>
        <span class="item-qty">×${i.quantity}</span>
        <span class="item-amt">₹${(i.price * i.quantity).toFixed(0)}</span>
      </div>`
    )
    .join("");

  w.document.write(`<!DOCTYPE html>
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
      padding: 10px 12px 18px;
      width: 80mm;
    }
    .center { text-align: center; }
    .outlet-name { font-size: 16px; font-weight: 800; margin-bottom: 3px; }
    .meta { font-size: 11px; color: #555; margin-bottom: 2px; }
    .divider { border: none; border-top: 1px dashed #bbb; margin: 7px 0; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px; gap: 4px; }
    .item-name { flex: 1; line-height: 1.35; }
    .item-note { font-size: 10px; color: #888; margin-top: 1px; }
    .item-qty  { width: 28px; text-align: center; font-weight: 700; flex-shrink: 0; }
    .item-amt  { width: 52px; text-align: right; font-weight: 700; flex-shrink: 0; }
    .total-row { font-size: 14px; font-weight: 800; }
    .muted { color: #666; }
    .seat-tag {
      display: inline-block;
      background: #111; color: #fff;
      padding: 3px 12px;
      border-radius: 20px;
      font-size: 11px; font-weight: 800;
      margin: 6px 0 2px;
    }
    .footer { text-align: center; font-size: 10px; color: #999; margin-top: 10px; line-height: 1.6; }
    .col-head { color: #999; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="center">
    <p class="outlet-name">${outletName || "Restaurant"}</p>
    <p class="meta">Table ${order.tableNumber}${order.areaName ? " · " + order.areaName : ""}</p>
    <p class="meta">${dateStr} · ${timeStr}</p>
    ${seatLabel ? `<span class="seat-tag">${seatLabel}</span>` : ""}
  </div>
  <hr class="divider">
  <div class="row col-head">
    <span class="item-name">Item</span>
    <span class="item-qty">Qty</span>
    <span class="item-amt">Amt</span>
  </div>
  <hr class="divider">
  ${itemsHtml}
  <hr class="divider">
  <div class="row muted"><span>Subtotal</span><span>₹${subtotal.toFixed(0)}</span></div>
  <div class="row muted"><span>GST</span><span>₹${tax.toFixed(0)}</span></div>
  <hr class="divider">
  <div class="row total-row"><span>TOTAL</span><span>₹${total.toFixed(0)}</span></div>
  <hr class="divider">
  <div class="footer">
    <p>Please pay at the counter</p>
    <p>Thank you for dining with us!</p>
  </div>
</body>
</html>`);

  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.onafterprint = () => w.close();
    setTimeout(() => w.close(), 3500);
  }, 500);
}
