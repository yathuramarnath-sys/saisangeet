import { api } from "../../lib/api";

export async function fetchShiftData() {
  try {
    return await api.get("/shifts/summary");
  } catch {
    return { active: [], history: [], movements: [] };
  }
}

export async function deleteShiftHistory(shiftId) {
  return api.delete(`/shifts/history/${shiftId}`);
}
