import { api } from "../../lib/api";

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toFixed(0)}`;
}

function buildRuleMeta(rule) {
  return [
    `Type: ${rule.discountType === "flat" ? "Flat amount" : "Percentage"} ${rule.discountType === "flat" ? formatCurrency(rule.value) : `${rule.value}%`}`,
    `Scope: ${rule.discountScope === "item" ? "Item" : "Order"}`,
    `Outlet: ${rule.outletScope || "All Outlets"}`,
    `Role: ${rule.appliesToRole || "Cashier"}`,
    `Time: ${rule.timeWindow || "Always on"}`
  ];
}

function normalizeRule(rule) {
  return {
    ...rule,
    status: rule.isActive === false ? "Paused" : "Active",
    meta: buildRuleMeta(rule)
  };
}

function buildDiscountActivity(orders = []) {
  return orders
    .filter((order) => order.discountAmount > 0 || order.discountOverrideRequested || order.discountApprovalStatus === "Approved")
    .slice(0, 8)
    .map((order) => ({
      id: `${order.tableId}-${order.orderNumber}`,
      time: order.billRequestedAt || "Now",
      user: order.assignedWaiter || order.captain || "Cashier",
      action: order.discountOverrideRequested
        ? "Discount approval pending"
        : order.discountApprovalStatus === "Approved"
          ? "Manual discount approved"
          : "Discount applied",
      amount: formatCurrency(order.discountAmount || 0),
      status: order.discountOverrideRequested ? "Escalated" : order.discountApprovalStatus || "Applied"
    }));
}

function buildDiscountAlerts(rules = [], summary, orders = []) {
  const alerts = [];
  const pausedRules = rules.filter((rule) => rule.isActive === false).length;
  const pendingApprovals = summary?.totals?.discountApprovalsPending || 0;
  const highDiscountOrders = orders.filter((order) => Number(order.discountAmount || 0) > 0);

  if (pendingApprovals > 0) {
    alerts.push({
      id: "discount-pending",
      title: `${pendingApprovals} discount approval requests are pending`,
      description: "Manager or owner approval is still required for live billing."
    });
  }

  if (pausedRules > 0) {
    alerts.push({
      id: "discount-paused",
      title: `${pausedRules} discount rules are paused`,
      description: "Review whether these promotions should stay inactive or be resumed."
    });
  }

  if (highDiscountOrders.length === 0 && pendingApprovals === 0 && pausedRules === 0) {
    alerts.push({
      id: "discount-healthy",
      title: "Discount controls look healthy",
      description: "No pending overrides or paused discount rules need attention right now."
    });
  }

  return alerts;
}

export async function fetchDiscountData() {
  const [settings, summary, orders] = await Promise.all([
    api.get("/settings/discounts"),
    api.get("/operations/summary"),
    api.get("/operations/orders")
  ]);

  return {
    rules: (settings.rules || []).map(normalizeRule),
    approvalPolicy: settings.approvalPolicy || [],
    defaults: settings.defaults || {},
    activity: buildDiscountActivity(orders),
    alerts: buildDiscountAlerts(settings.rules || [], summary, orders),
    summary,
    orders
  };
}

export async function createDiscountRule(payload) {
  const result = await api.post("/settings/discounts", payload);
  return normalizeRule(result);
}

export async function updateDiscountRule(ruleId, payload) {
  const result = await api.patch(`/settings/discounts/${ruleId}`, payload);
  return normalizeRule(result);
}

export async function deleteDiscountRule(ruleId) {
  return api.delete(`/settings/discounts/${ruleId}`);
}

export async function updateDiscountApprovalPolicy(policyId, payload) {
  return api.patch(`/settings/discounts/approval/${policyId}`, payload);
}

export async function updateDiscountDefaults(payload) {
  return api.patch("/settings/discounts/defaults/config", payload);
}
