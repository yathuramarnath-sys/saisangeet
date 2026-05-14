/**
 * escpos.js — ESC/POS command builder for thermal printers.
 *
 * Builds raw ESC/POS command strings from structured receipt data.
 * Output is latin1-encoded — send as-is via TCP port 9100.
 *
 * Ported from apps/operations-pos/electron/main.js printViaEscPosTcp()
 * so the Captain app can build and send receipts without any proxy.
 */

// ── ESC/POS constants ────────────────────────────────────────────────────────
const ESC    = "\x1B";
const GS     = "\x1D";
const INIT   = ESC + "@";          // Reset printer
const CUT    = GS  + "V\x00";     // Full cut
const LF     = "\n";
const BOLD1  = ESC + "E\x01";     // Bold on
const BOLD0  = ESC + "E\x00";     // Bold off
const CENTER = ESC + "a\x01";     // Align centre
const LEFT   = ESC + "a\x00";     // Align left
const BIG    = ESC + "!\x30";     // Double height + width
const DBLH   = ESC + "!\x10";     // Double height only
const NORMAL = ESC + "!\x00";     // Normal size
const DASH   = "-".repeat(32);    // Divider line (fits 80mm & 58mm)

// Strip ₹ symbol — latin1 can't encode it, renders as garbage on thermal paper
function stripRupee(s) {
  return String(s || "").replace(/[₹Rs\s]/g, "").trim();
}

// Sanitise text for latin1 — replace common unicode chars that break ESC/POS
function safe(s) {
  return String(s || "")
    .replace(/·/g, "-")
    .replace(/•/g, "-")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/'/g, "'")
    .replace(/'/g, "'")
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/₹/g, "Rs");
}

/**
 * Build ESC/POS string for a GST bill receipt.
 *
 * @param {object} data
 *   outlet, invoiceHeader, addr, phone, gstin, fssai,
 *   seatLabel, date, time, table, orderType, cashier, billNo,
 *   items: [{ name, note, qty, rate, amt }],
 *   summary: [{ label, value }],
 *   total, footer
 */
export function buildBillEscPos(data) {
  let cmd = INIT;

  // ── Header ─────────────────────────────────────────────────────────────────
  if (data.invoiceHeader) cmd += CENTER + safe(data.invoiceHeader) + LF;
  cmd += CENTER + BOLD1 + BIG + safe(data.outlet || "RESTAURANT") + NORMAL + BOLD0 + LF;
  if (data.addr)  cmd += CENTER + safe(data.addr)  + LF;
  if (data.phone) cmd += CENTER + safe(data.phone) + LF;
  if (data.gstin) cmd += CENTER + "GSTIN: " + safe(data.gstin) + LF;
  if (data.fssai) cmd += CENTER + "FSSAI: " + safe(data.fssai) + LF;
  if (data.seatLabel) cmd += CENTER + BOLD1 + "[ " + safe(data.seatLabel) + " ]" + BOLD0 + LF;
  cmd += DASH + LF;

  // ── Info rows ──────────────────────────────────────────────────────────────
  if (data.date)      cmd += LEFT + "Date    : " + safe(data.date) + "   " + safe(data.time || "") + LF;
  if (data.table)     cmd += LEFT + "Table   : " + safe(data.table) + (data.orderType ? "   (" + safe(data.orderType) + ")" : "") + LF;
  if (data.cashier)   cmd += LEFT + "Cashier : " + safe(data.cashier) + LF;
  if (data.billNo)    cmd += LEFT + "Bill No : " + safe(data.billNo) + LF;
  cmd += DASH + LF;

  // ── Items header ───────────────────────────────────────────────────────────
  cmd += BOLD1 + "Item              Qty    Rate      Amt" + BOLD0 + LF;
  cmd += DASH + LF;

  // ── Items ──────────────────────────────────────────────────────────────────
  for (const item of (data.items || [])) {
    const name = safe(item.name || "").substring(0, 18).padEnd(18);
    const qty  = String(item.qty  || "").padStart(3);
    const rate = stripRupee(item.rate).padStart(7);
    const amt  = stripRupee(item.amt).padStart(8);
    cmd += name + qty + rate + amt + LF;
    if (item.note) cmd += "     >> " + safe(item.note) + LF;
  }
  cmd += DASH + LF;

  // ── Summary rows (Subtotal, Discount, CGST, SGST) ─────────────────────────
  for (const row of (data.summary || [])) {
    if (!row.label || !row.value) continue;
    const lbl = safe(row.label).padEnd(22);
    const val = stripRupee(row.value).padStart(10);
    cmd += lbl + val + LF;
  }
  cmd += DASH + LF;

  // ── Grand total ────────────────────────────────────────────────────────────
  cmd += CENTER + BOLD1 + BIG + "TOTAL  " + stripRupee(data.total || "") + NORMAL + BOLD0 + LF;
  cmd += DASH + LF;

  // ── Footer ─────────────────────────────────────────────────────────────────
  cmd += CENTER + "Please pay at the counter" + LF;
  cmd += CENTER + safe(data.footer || "Thank you for dining with us!") + LF;

  cmd += LF + LF + LF + LF + CUT;
  return cmd;
}

/**
 * Build ESC/POS string for a Kitchen Order Ticket (KOT).
 *
 * @param {object} data
 *   outlet, table, kotNum, date, time, guests,
 *   items: [{ qty, name, note }],
 *   totalItems, sentBy, waiter, printerName
 */
export function buildKotEscPos(data) {
  let cmd = INIT;

  // ── Header ─────────────────────────────────────────────────────────────────
  cmd += CENTER + BOLD1 + BIG + safe(data.outlet || "KITCHEN") + NORMAL + BOLD0 + LF;
  cmd += CENTER + "*** KITCHEN ORDER ***" + LF;
  cmd += DASH + LF;

  // ── KOT number + Table on same line ───────────────────────────────────────
  const tblStr = safe(data.table  || "").substring(0, 18).padEnd(18);
  const kotStr = safe(data.kotNum || "").padStart(14);
  cmd += BOLD1 + tblStr + kotStr + BOLD0 + LF;

  // ── Date + Time on same line ───────────────────────────────────────────────
  if (data.date || data.time) {
    const dateL = safe(data.date || "").padEnd(18);
    const timeR = safe(data.time || "").padStart(14);
    cmd += dateL + timeR + LF;
  }

  if (data.guests) cmd += LEFT + "Guests: " + safe(data.guests) + LF;
  cmd += DASH + LF;

  // ── Items ──────────────────────────────────────────────────────────────────
  cmd += LEFT + BOLD1 + "QTY  ITEM" + BOLD0 + LF;
  cmd += DASH + LF;

  for (const item of (data.items || [])) {
    const qty  = String(item.qty  || "").padEnd(3);
    const name = safe(item.name || "");
    // Double-height bold so kitchen can read quickly
    cmd += DBLH + BOLD1 + qty + "  " + name + BOLD0 + NORMAL + LF;
    if (item.note) cmd += LEFT + "     >> " + safe(item.note) + LF;
  }
  cmd += DASH + LF;

  // ── Footer ─────────────────────────────────────────────────────────────────
  if (data.totalItems) cmd += "Total Items : " + data.totalItems + LF;
  if (data.sentBy)     cmd += BOLD1 + "Sent by : " + safe(data.sentBy) + BOLD0 + LF;
  if (data.waiter)     cmd += BOLD1 + "Waiter  : " + safe(data.waiter) + BOLD0 + LF;
  if (data.printerName) cmd += "→ " + safe(data.printerName) + LF;

  cmd += LF + LF + LF + LF + CUT;
  return cmd;
}
