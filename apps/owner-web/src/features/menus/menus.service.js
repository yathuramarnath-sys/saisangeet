import { api } from "../../lib/api";
import { menusSeedData } from "./menus.seed";

export async function fetchMenusData() {
  try {
    const payload = await api.get("/menu/menus");

    return {
      menuGroups: payload.menuGroups || menusSeedData.menuGroups,
      assignments: payload.assignments || menusSeedData.assignments,
      quickSections: payload.quickSections || menusSeedData.quickSections,
      alerts: payload.alerts || menusSeedData.alerts
    };
  } catch {
    return menusSeedData;
  }
}
