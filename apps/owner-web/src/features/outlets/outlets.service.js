import { api } from "../../lib/api";
import { outletSeedData } from "./outlets.seed";

export async function fetchOutlets() {
  try {
    const outlets = await api.get("/outlets");

    return outlets.map((outlet) => ({
      id: outlet.id,
      code: outlet.code,
      name: outlet.name,
      city: outlet.city || "Unknown",
      state: outlet.state || "Unknown",
      gstin: outlet.gstin || "",
      isActive: outlet.isActive ?? true,
      hours: "Business hours pending",
      services: ["Dine-in", "Takeaway"],
      devicesLinked: 0,
      defaultTax: "Default tax pending",
      status: outlet.isActive ? "Healthy" : "Inactive"
    }));
  } catch (_error) {
    return outletSeedData;
  }
}

export async function createOutlet(payload) {
  return api.post("/outlets", payload);
}
