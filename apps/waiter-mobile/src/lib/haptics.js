/**
 * haptics.js — thin wrapper around @capacitor/haptics
 * Gracefully does nothing in web/Electron (no native bridge).
 */
let Haptics = null;

async function loadHaptics() {
  if (Haptics) return Haptics;
  try {
    const mod = await import("@capacitor/haptics");
    Haptics = mod.Haptics;
  } catch {
    Haptics = null;
  }
  return Haptics;
}

export async function tapImpact() {
  try {
    const h = await loadHaptics();
    await h?.impact({ style: "light" });
  } catch { /* web / no native bridge */ }
}

export async function successVibrate() {
  try {
    const h = await loadHaptics();
    await h?.notification({ type: "SUCCESS" });
  } catch { /* web */ }
}

export async function errorVibrate() {
  try {
    const h = await loadHaptics();
    await h?.notification({ type: "ERROR" });
  } catch { /* web */ }
}
