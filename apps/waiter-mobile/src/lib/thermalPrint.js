/**
 * thermalPrint.js — Capacitor bridge for direct TCP thermal printing.
 *
 * On Android (native): calls ThermalPrintPlugin.java which opens a raw TCP
 * socket directly to the printer on port 9100. No POS proxy needed.
 *
 * On web (fallback): rejects so callers can fall back to the WiFi proxy path.
 */

import { registerPlugin, Capacitor } from "@capacitor/core";

// Register the native plugin — name must match @CapacitorPlugin(name = "ThermalPrint")
const ThermalPrint = registerPlugin("ThermalPrint", {
  // Web fallback — always rejects so wifiPrint.js can use the proxy instead
  web: () => ({
    send: () => Promise.reject(new Error("Direct TCP not available in browser")),
    ping: () => Promise.reject(new Error("Direct TCP not available in browser")),
  }),
});

/**
 * Returns true if we're running inside the Android APK (native Capacitor).
 * Used by printBill.js and kotPrint.js to choose the print path.
 */
export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * Send raw ESC/POS bytes directly to a thermal printer via TCP.
 *
 * @param {string} ip          - Printer IP, e.g. "192.168.1.200"
 * @param {string} escPosData  - ESC/POS command string (latin1-encoded)
 * @param {number} [port=9100] - TCP port (default 9100)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function sendToThermalPrinter(ip, escPosData, port = 9100) {
  try {
    await ThermalPrint.send({ ip, port, data: escPosData });
    return { ok: true };
  } catch (err) {
    console.warn("[thermalPrint] Direct TCP failed:", err?.message);
    return { ok: false, error: err?.message || "Print failed" };
  }
}

/**
 * Ping a printer to check if it's reachable on the network.
 * Useful for the Settings "Test Connection" button.
 */
export async function pingPrinter(ip, port = 9100) {
  try {
    await ThermalPrint.ping({ ip, port });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message };
  }
}
