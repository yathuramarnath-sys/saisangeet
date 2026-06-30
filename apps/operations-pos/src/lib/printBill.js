/**
 * printBill.js — thermal bill printing for POS
 *
 * Production path  (Windows Electron): silent via window.electronAPI.printHTML()
 * Fallback         (browser / web):    popup window + window.print()
 */

import QRCode from "qrcode";
import { getBillPrinter } from "./kotPrint";

export async function printBill(order, items, outletOrName, options = {}) {
  // outletOrName can be a string (legacy) or a full outlet object
  const outlet = (outletOrName && typeof outletOrName === "object") ? outletOrName : null;
  const outletName = outlet?.name || (typeof outletOrName === "string" ? outletOrName : null) || "Restaurant";

  // Credit / B2B GST bill — customer details printed on receipt
  const creditCustomer = order?.creditCustomer || null;
  const isTaxInvoice   = !!(creditCustomer?.gstin);

  const { seatLabel = null, cashierName = null, captainName = null, waiterName = null } = options;
  // Resolve paper width early so the @page CSS can use it
  const _printer      = getBillPrinter();
  const _paperWidthMm = parseInt(_printer?.paper) || 80;  // "80mm"→80, "58mm"→58
  const _marginAdjust = parseInt(_printer?.marginAdjust) || 0;
  const _rightPad     = 14 + _marginAdjust;
  const servedBy   = cashierName || order.cashierName || "-";
  // Captain and waiter — row hidden entirely if both are empty
  const captainStr = captainName || order.captainName    || "";
  const waiterStr  = waiterName  || order.assignedWaiter || "";

  // ── Outlet header fields ───────────────────────────────────────────────────
  const outletPhone   = outlet?.phone       || "";
  const outletAddr1   = outlet?.addressLine1 || "";
  const outletAddr2   = outlet?.addressLine2 || "";
  const outletCity    = outlet?.city         || "";
  const outletState   = outlet?.state        || "";
  const outletGstin   = outlet?.gstin        || "";
  const outletFssai   = (outlet?.showFssai !== false) ? (outlet?.fssaiNo || "") : "";
  const invoiceHeader = outlet?.invoiceHeader || "";
  const invoiceFooter = outlet?.footerNote || outlet?.invoiceFooter || "Thank you for dining with us!";

  // ── Receipt print settings (owner sets in Owner Console → Receipts) ────────
  // Default true = show (backward compatible — existing accounts see no change)
  const showDiscountOnBill = outlet?.showDiscountOnBill !== false;
  const showGstBreakdown   = outlet?.showGstBreakdown   !== false;
  const showItemDesc       = outlet?.showItemDesc       === true;  // default hidden
  const showPhone          = outlet?.showPhone          !== false;
  const showAddress        = outlet?.showAddress        !== false;
  const showGstin          = outlet?.showGstin          !== false;

  const billableItems = (items || []).filter((i) => !i.isVoided && !i.isComp);
  const subtotal  = billableItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount  = Math.min(order.discountAmount || 0, subtotal);
  const afterDisc = subtotal - discount;
  // Discount % shown on bill — round to 1 decimal, drop ".0" for whole numbers
  const discountPct = subtotal > 0 && discount > 0
    ? (() => { const p = (discount / subtotal) * 100; return Number.isInteger(Math.round(p * 10) / 10) ? Math.round(p) : Math.round(p * 10) / 10; })()
    : 0;

  // ── GST Treatment: "exclusive" (add on top) or "inclusive" (extract from price) ──
  const inclusive = (outlet?.gstTreatment === "inclusive");

  // Outlet-level fallback rate — used when an item has no taxRate assigned.
  // outlet.defaultTaxRate is CGST+SGST combined (e.g. 5 for "GST 5%").
  // This prevents items configured in Owner Console without a per-item tax
  // from silently printing as 0% GST on the bill.
  const defaultItemTaxRate = outlet?.defaultTaxRate ?? 0;

  // ── Per-item tax calculation ──────────────────────────────────────────────
  // Discount is spread proportionally across items before applying tax.
  // NOTE: We accumulate as decimals (no Math.round per item) so that CGST and SGST
  // split evenly — e.g. ₹20 item at 5% exclusive = ₹0.50 CGST + ₹0.50 SGST (not ₹1 + ₹0).
  const taxBreakdown = {}; // { rate: totalTaxAmt (decimal) }
  billableItems.forEach(i => {
    const lineAmt   = i.price * i.quantity;
    // Proportional share of discount for this line
    const lineAfter = subtotal > 0 ? lineAmt * (afterDisc / subtotal) : lineAmt;
    // Use per-item taxRate; fall back to outlet default when not explicitly set
    const rate      = (i.taxRate != null && i.taxRate !== "") ? Number(i.taxRate) : defaultItemTaxRate;
    const lineTax   = lineAfter * rate / (inclusive ? (100 + rate) : 100);
    taxBreakdown[rate] = (taxBreakdown[rate] || 0) + lineTax;
  });
  // Build rows: each rate split exactly 50/50 into CGST + SGST (decimal amounts)
  const taxRows  = Object.entries(taxBreakdown).map(([rate, amt]) => ({
    rate:    Number(rate),
    cgstPct: Number(rate) / 2,
    cgst:    amt / 2,
    sgst:    amt / 2,
  }));
  const taxTotal = taxRows.reduce((s, r) => s + r.cgst + r.sgst, 0);
  // Inclusive: tax already inside prices — total = afterDisc; Exclusive: add tax on top
  const total        = inclusive ? afterDisc : afterDisc + taxTotal;
  // Round off to nearest rupee (enabled by default; set outlet.roundOff = false to disable)
  const showRoundOff = outlet?.roundOff !== false;
  const roundOff     = showRoundOff ? Math.round(total) - total : 0;
  const roundedTotal = total + roundOff;

  // ── UPI QR code ────────────────────────────────────────────────────────────
  let upiQrDataUrl = null;
  if (outlet?.upiId && outlet?.showQR !== false) {
    const upiUri = `upi://pay?pa=${encodeURIComponent(outlet.upiId)}&pn=${encodeURIComponent(outletName)}&am=${roundedTotal.toFixed(2)}&cu=INR&tn=Bill%20%23${order.billNo || order.orderNumber || ""}`;
    try {
      upiQrDataUrl = await QRCode.toDataURL(upiUri, { width: 160, margin: 1, color: { dark: "#111111", light: "#ffffff" } });
    } catch (_) {}
  }

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
      <td class="col-item">${i.name}${showItemDesc && i.note ? `<div class="item-note">${i.note}</div>` : ""}</td>
      <td class="col-qty">${i.quantity}</td>
      <td class="col-rate">${i.price.toFixed(2)}</td>
      <td class="col-amt">${(i.price * i.quantity).toFixed(2)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${isTaxInvoice ? "Tax Invoice" : "Bill"}${seatLabel ? " – " + seatLabel : ""}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: ${_paperWidthMm}mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Manrope', 'Courier New', monospace;
      font-size: ${_paperWidthMm <= 58 ? 11 : 12}px;
      color: #111;
      margin: 0;
      padding: 10px ${_rightPad}px 40px 8px;
      width: ${_paperWidthMm}mm;
      overflow: hidden;
    }

    /* ── Header ── */
    .hdr { text-align: center; margin-bottom: 5px; }
    .outlet-name    { font-size: 17px; font-weight: 800; letter-spacing: 0.3px; }
    .outlet-addr    { font-size: 10px; color: #555; margin-top: 2px; line-height: 1.4; }
    .outlet-meta    { font-size: 10px; color: #555; margin-top: 1px; }
    .invoice-header { font-size: 11px; color: #333; font-weight: 600; margin-top: 3px; }

    /* ── Divider ── */
    .div-dash { border: none; border-top: 1px dashed #aaa; margin: 4px 0; }

    /* ── Info rows — 2-column flex, label auto-width ── */
    .info-row {
      display: flex; justify-content: space-between;
      font-size: 11px; margin: 2px 0;
    }
    .info-row .left, .info-row .right { display: flex; gap: 3px; align-items: baseline; }
    .info-row .right { text-align: right; }
    .info-lbl  { color: #666; white-space: nowrap; }
    .info-sep  { color: #aaa; }
    .info-val  { font-weight: 700; }
    .info-full { font-size: 11px; display: flex; gap: 3px; margin: 2px 0; }

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

    /* ── Summary rows — aligned under AMT column via table ── */
    .sum-lbl  { font-size: 11px; color: #444; text-align: right; padding-right: 6px; }
    .sum-val  { font-weight: 700; font-size: 11px; }
    .disc-lbl { color: #c33; }
    .disc-val { color: #c33; }

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

    /* ── Bill To (Credit/GST) ── */
    .bill-to { margin: 4px 0; padding: 4px 0; border-top: 1px dashed #aaa; border-bottom: 1px dashed #aaa; }
    .bill-to-title { font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
    .bill-to-name  { font-size: 12px; font-weight: 800; }
    .bill-to-meta  { font-size: 10px; color: #444; margin-top: 1px; line-height: 1.5; }
    .tax-invoice-badge { text-align: center; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; color: #059669; margin: 2px 0 4px; text-transform: uppercase; }
    .credit-badge  { text-align: center; font-size: 9px; font-weight: 700; color: #b45309; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; padding: 2px 6px; display: inline-block; margin: 2px 0; }

    /* ── Footer ── */
    .footer { text-align: center; font-size: 10px; color: #999; margin-top: 8px; line-height: 1.7; }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="hdr">
    ${invoiceHeader ? `<div class="invoice-header">${invoiceHeader}</div>` : ""}
    <div class="outlet-name">${outletName || "Restaurant"}</div>
    ${showAddress && (outletAddr1 || outletAddr2 || outletCity || outletState) ? `<div class="outlet-addr">${[outletAddr1, outletAddr2, outletCity, outletState].filter(Boolean).join(", ")}</div>` : ""}
    ${(showPhone && outletPhone) || (showGstin && outletGstin) ? `<div class="outlet-meta">${showPhone && outletPhone ? `Ph: ${outletPhone}` : ""}${showPhone && outletPhone && showGstin && outletGstin ? " &nbsp;|&nbsp; " : ""}${showGstin && outletGstin ? `GSTIN: ${outletGstin}` : ""}</div>` : ""}
    ${outletFssai ? `<div class="outlet-meta">FSSAI: <span class="outlet-fssai">${outletFssai}</span></div>` : ""}
    ${seatLabel ? `<div><span class="seat-tag">${seatLabel}</span></div>` : ""}
  </div>
  ${isTaxInvoice ? `<div class="tax-invoice-badge">★ TAX INVOICE ★</div>` : (creditCustomer ? `<div style="text-align:center"><span class="credit-badge">CREDIT BILL</span></div>` : "")}

  ${creditCustomer ? `
  <div class="bill-to">
    <div class="bill-to-title">Bill To</div>
    <div class="bill-to-name">${creditCustomer.name || ""}</div>
    ${creditCustomer.gstin   ? `<div class="bill-to-meta">GSTIN: <strong>${creditCustomer.gstin}</strong></div>` : ""}
    ${creditCustomer.address ? `<div class="bill-to-meta">${creditCustomer.address}</div>` : ""}
    ${creditCustomer.phone   ? `<div class="bill-to-meta">Ph: ${creditCustomer.phone}</div>` : ""}
    ${creditCustomer.poNumber ? `<div class="bill-to-meta">PO/Ref: ${creditCustomer.poNumber}</div>` : ""}
  </div>` : ""}

  <hr class="div-dash">

  <!-- Bill info — 2-column layout, all rows always shown -->
  <div class="info-row">
    <div class="left"><span class="info-lbl">Date</span><span class="info-sep">:</span><span class="info-val">${dateStr}</span></div>
    <div class="right"><span class="info-lbl">Time</span><span class="info-sep">:</span><span class="info-val">${timeStr}</span></div>
  </div>
  <div class="info-row">
    <div class="left"><span class="info-lbl">Table</span><span class="info-sep">:</span><span class="info-val">${tableLabel}</span></div>
    <div class="right"><span class="info-lbl">Type</span><span class="info-sep">:</span><span class="info-val">${orderType}</span></div>
  </div>
  <div class="info-row">
    <div class="left"><span class="info-lbl">Cashier</span><span class="info-sep">:</span><span class="info-val">${servedBy}</span></div>
    <div class="right"><span class="info-lbl">Bill No</span><span class="info-sep">:</span><span class="info-val">#${order.billNo || order.orderNumber || "-"}</span></div>
  </div>
  ${(captainStr || waiterStr) ? `
  <div class="info-row">
    ${captainStr ? `<div class="left"><span class="info-lbl">Captain</span><span class="info-sep">:</span><span class="info-val">${captainStr}</span></div>` : "<div></div>"}
    ${waiterStr  ? `<div class="right"><span class="info-lbl">Waiter</span><span class="info-sep">:</span><span class="info-val">${waiterStr}</span></div>` : ""}
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

  <!-- Summary aligned under AMT column using same table structure as items -->
  <table class="items-tbl">
    <tbody>
      <tr><td colspan="3" class="sum-lbl">Subtotal</td><td class="col-amt sum-val">&#8377;${subtotal.toFixed(2)}</td></tr>
      ${showDiscountOnBill && discount > 0 ? `<tr><td colspan="3" class="sum-lbl disc-lbl">Discount (${discountPct}%)</td><td class="col-amt sum-val disc-val">${discount.toFixed(2)}</td></tr>` : ""}
      ${showGstBreakdown
        ? taxRows.map(t => `
      <tr><td colspan="3" class="sum-lbl">CGST (${t.cgstPct}%)</td><td class="col-amt sum-val">&#8377;${t.cgst.toFixed(2)}</td></tr>
      <tr><td colspan="3" class="sum-lbl">SGST (${t.cgstPct}%)</td><td class="col-amt sum-val">&#8377;${t.sgst.toFixed(2)}</td></tr>`).join("")
        : taxRows.map(t => `
      <tr><td colspan="3" class="sum-lbl">GST (${t.rate}%)</td><td class="col-amt sum-val">&#8377;${(t.cgst + t.sgst).toFixed(2)}</td></tr>`).join("")
      }
      ${showRoundOff && Math.abs(roundOff) >= 0.01 ? `
      <tr><td colspan="3" class="sum-lbl">Round Off</td><td class="col-amt sum-val">${roundOff > 0 ? "+" : ""}&#8377;${roundOff.toFixed(2)}</td></tr>` : ""}
    </tbody>
  </table>
  <hr class="div-dash">
  <div class="total-row"><span>TOTAL</span><span>&#8377;${roundedTotal.toFixed(2)}</span></div>

  <!-- UPI QR -->
  ${upiQrDataUrl ? `
  <hr class="div-dash" style="margin-top:10px;">
  <div style="text-align:center;margin:8px 0 4px;">
    <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">Scan &amp; Pay via UPI</div>
    <img src="${upiQrDataUrl}" style="width:120px;height:120px;display:block;margin:0 auto;" alt="UPI QR" />
    <div class="upi-id-text" style="font-size:9px;color:#555;margin-top:4px;">${outlet.upiId}</div>
  </div>` : ""}

  <!-- Footer -->
  <div class="footer">
    <p>${upiQrDataUrl ? "Scan the QR above to pay" : "Please pay at the counter"}</p>
    <p>${invoiceFooter}</p>
  </div>

</body>
</html>`;

  // ── Production path: Windows Electron silent printing ───────────────────
  if (window.electronAPI?.printHTML) {
    const printerName  = _printer?.winName || _printer?.name || null;
    const printerIp    = _printer?.ip?.trim() || null;
    const paperWidthMm = _paperWidthMm;

    window.electronAPI
      .printHTML({ html, printerName, printerIp, paperWidthMm })
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
