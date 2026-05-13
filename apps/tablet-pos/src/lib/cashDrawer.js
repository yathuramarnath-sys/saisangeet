/**
 * cashDrawer.js — cash drawer trigger for Windows Electron POS
 *
 * Sends an ESC/POS cash drawer open pulse to the configured bill printer.
 * Only runs in Electron — silently does nothing on web/browser.
 *
 * Trigger logic:
 *   1. Read bill printer from pos_printers (same source as printBill)
 *   2. If printer has an IP → use TCP path (network printer, port 9100)
 *   3. If printer has a Windows device name → use Electron IPC USB path
 *   4. If no printer configured → silent no-op
 */

import { getBillPrinter } from "./kotPrint";

/**
 * Open the cash drawer.
 * Call this after a successful full cash payment.
 *
 * @returns {Promise<void>}
 */
export async function openCashDrawer() {
  // Only works in Electron
  if (!window.electronAPI?.triggerCashDrawer) return;

  const printer = getBillPrinter();

  const payload = {
    printerIp:   printer?.ip   || null,
    printerPort: printer?.port || 9100,
    printerName: printer?.winName || printer?.name || null,
  };

  // If neither IP nor name — nothing to do
  if (!payload.printerIp && !payload.printerName) {
    console.info("[cashDrawer] No printer configured — drawer trigger skipped");
    return;
  }

  try {
    const result = await window.electronAPI.triggerCashDrawer(payload);
    if (!result?.ok) {
      console.warn("[cashDrawer] Trigger failed:", result?.error);
    }
  } catch (err) {
    console.warn("[cashDrawer] IPC error:", err.message);
  }
}

/**
 * Returns true if any payment in the array is a cash payment.
 * Used to decide whether to fire the cash drawer.
 */
export function hasCashPayment(payments = []) {
  return (payments || []).some(
    (p) => String(p.method || "").toLowerCase() === "cash"
  );
}
