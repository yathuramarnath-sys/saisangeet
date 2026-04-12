import { api } from "../../lib/api";
import { discountsSeedData } from "./discounts.seed";

function normalizeRule(rule) {
  return {
    id: rule.id,
    name: rule.name,
    status: rule.isActive === false ? "Paused" : "Active",
    meta: [
      `Type: ${rule.discountType === "flat" ? "Flat amount" : "Percentage"} ${rule.value ?? ""}`.trim(),
      `Scope: ${rule.discountScope || "order"}`,
      `Approval: ${rule.requiresApproval ? "Required" : "Not required"}`
    ],
    actions: ["Edit", "Duplicate", rule.isActive === false ? "Resume" : "Pause"]
  };
}

export async function fetchDiscountData() {
  try {
    const rules = await api.get("/settings/discount-rules");

    return {
      rules: rules.map(normalizeRule),
      approvalPolicy: discountsSeedData.approvalPolicy,
      activity: discountsSeedData.activity,
      alerts: discountsSeedData.alerts
    };
  } catch (_error) {
    return discountsSeedData;
  }
}
