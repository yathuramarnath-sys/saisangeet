/**
 * haptics.js — thin wrapper around @capacitor/haptics
 * Silently no-ops on web/browser — only fires on Android/iOS native builds.
 */
import { Capacitor } from "@capacitor/core";

// Only load the Haptics module on a real native platform.
// Calling Capacitor plugin methods on web throws "not implemented on web"
// as an unhandled promise rejection even inside try-catch blocks.
let _haptics = null;

async function loadHaptics() {
  if (!Capacitor.isNativePlatform()) return null;  // web/browser — skip entirely
  if (_haptics) return _haptics;
  try {
    const mod = await import("@capacitor/haptics");
    _haptics = mod.Haptics;
  } catch {
    _haptics = null;
  }
  return _haptics;
}

export async function tapImpact() {
  try {
    const h = await loadHaptics();
    if (h) await h.impact({ style: "light" });
  } catch { /* native bridge unavailable */ }
}

export async function successVibrate() {
  try {
    const h = await loadHaptics();
    if (h) await h.notification({ type: "SUCCESS" });
  } catch { /* native bridge unavailable */ }
}

export async function errorVibrate() {
  try {
    const h = await loadHaptics();
    if (h) await h.notification({ type: "ERROR" });
  } catch { /* native bridge unavailable */ }
}
