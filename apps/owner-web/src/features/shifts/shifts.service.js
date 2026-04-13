import { shiftsSeedData } from "./shifts.seed";
import { loadRestaurantState, subscribeRestaurantState, updateCashShifts } from "../../../../../packages/shared-types/src/mockRestaurantStore.js";
import { api } from "../../lib/api";

export async function fetchShiftData() {
  try {
    return await api.get("/shifts/summary");
  } catch {
    return loadRestaurantState().cashShifts || shiftsSeedData;
  }
}

export function subscribeShiftData(callback) {
  return subscribeRestaurantState((nextState) => {
    callback(nextState.cashShifts || shiftsSeedData);
  });
}

export function recordCashMismatchResolution() {
  return api.post("/shifts/mismatch/review", {}).catch(() =>
    updateCashShifts((current) => {
      const next = structuredClone(current);
      next.shifts = next.shifts.map((shift) =>
        shift.id === "ramesh-hsr"
          ? {
              ...shift,
              status: "Manager check"
            }
          : shift
      );
      next.alerts = next.alerts.map((alert) =>
        alert.id === "hsr-short"
          ? {
              ...alert,
              title: "HSR Layout mismatch under manager review",
              description: "Owner report should stay open until closing approval is complete"
            }
          : alert
      );
      return next;
    })
  );
}
