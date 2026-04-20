const {
  getState,
  approveClosingState,
  reopenClosingState,
  getControlLogs
} = require("../operations/operations.memory-store");
const { syncOperationsState, persistOperationsState } = require("../operations/operations.state");

// Insights are generated from live sales data — empty until POS goes live
const defaultInsights = [];

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function buildApprovalLog(orders) {
  return Object.values(orders)
    .flatMap((order) =>
      (order.auditTrail || [])
        .filter((entry) => ["Discount approved", "Void approved"].includes(entry.label))
        .map((entry, index) => ({
          id: `${order.tableId}-${index}-${entry.id}`,
          outlet: order.outletName || order.areaName,
          tableNumber: order.tableNumber,
          orderNumber: order.orderNumber,
          action: entry.label,
          actor: entry.actor,
          approvalMode: entry.actor.includes("OTP") ? "OTP" : "Manual",
          amount:
            entry.label === "Discount approved"
              ? formatCurrency(order.discountAmount || 0)
              : `Bill #${order.orderNumber}`,
          time: entry.time
        }))
    )
    .sort((left, right) => right.orderNumber - left.orderNumber);
}

function buildControlSummary(orders) {
  const list = Object.values(orders);
  const discountOverrides = list.filter((order) => order.discountOverrideRequested);
  const deletedBills = list.reduce((sum, order) => sum + (order.deletedBillLog || []).length, 0);
  const reprints = list.reduce((sum, order) => sum + (order.reprintLog || []).length, 0);
  const voidRequests = list.filter((order) => order.voidRequested).length;
  const unauthorizedAlerts = list.reduce((sum, order) => sum + (order.controlAlerts || []).length, 0);

  return [
    {
      id: "discount-overrides",
      title: "Discount overrides",
      value: `${discountOverrides.length} today`,
      detail:
        discountOverrides.length > 0
          ? `${discountOverrides.length} still need review`
          : "No override requests in live flow",
      status: discountOverrides.length > 0 ? "Review" : "Strong"
    },
    {
      id: "deleted-bills",
      title: "Deleted bills",
      value: `${deletedBills} approved`,
      detail: deletedBills > 0 ? "Deleted bills recorded in live flow" : "No deleted bills today",
      status: deletedBills > 0 ? "Review" : "Strong"
    },
    {
      id: "reprints",
      title: "Reprints",
      value: `${reprints} logged`,
      detail: reprints > 0 ? "Receipt reprints recorded with reason" : "No reprints recorded today",
      status: reprints > 0 ? "Conditional" : "Strong"
    },
    {
      id: "void-requests",
      title: "Void requests",
      value: `${voidRequests} pending`,
      detail: voidRequests > 0 ? "Pending OTP approvals are waiting for review" : "No pending void requests",
      status: voidRequests > 0 ? "Review" : "Strong"
    },
    {
      id: "cash-mismatch",
      title: "Cash mismatch",
      value: "Rs 1,200",
      detail: "1 outlet under review before final close",
      status: "Conditional"
    },
    {
      id: "unauthorized-actions",
      title: "Unauthorized actions",
      value: `${unauthorizedAlerts} alerts`,
      detail: unauthorizedAlerts > 0 ? "Blocked cashier actions recorded" : "No blocked cashier actions",
      status: unauthorizedAlerts > 0 ? "Review" : "Strong"
    }
  ];
}

function buildClosingCenter(orders) {
  const deletedBills = Object.values(orders).reduce((sum, order) => sum + (order.deletedBillLog || []).length, 0);
  const pendingOverrides = Object.values(orders).filter((order) => order.discountOverrideRequested).length;

  return {
    blockers: [
      {
        id: "blocker-shift",
        title: "1 shift issue still open",
        detail: "Cash mismatch should be reviewed before sending final closing mail."
      },
      {
        id: "blocker-override",
        title: `${pendingOverrides} high discount override needs review`,
        detail: "Owner should confirm manager approvals before sending final closing mail."
      }
    ],
    checklist: [
      { id: "sales-lock", title: "All outlets sales synced", status: "Done" },
      { id: "tax-ready", title: "GST totals verified", status: "Done" },
      { id: "cash-review", title: "Cash mismatch resolved", status: "Pending" },
      {
        id: "risk-review",
        title: "Deleted bills and overrides reviewed",
        status: pendingOverrides > 0 || deletedBills > 0 ? "Pending" : "Done"
      }
    ],
    ownerSummary: [
      { id: "closing-sales", label: "Net sales", value: "Rs 0" },
      { id: "closing-tax", label: "GST total", value: "Rs 0" },
      { id: "closing-deleted", label: "Deleted bills", value: `${deletedBills} approved` },
      { id: "closing-overrides", label: "Discount overrides", value: `${pendingOverrides} pending review` }
    ]
  };
}

function buildAlerts(orders) {
  // Only real-time alerts from live POS activity — nothing hardcoded
  const liveAlerts = Object.values(orders)
    .flatMap((order) =>
      (order.controlAlerts || []).map((message, index) => ({
        id: `${order.tableId}-alert-${index}`,
        title: `Unauthorized action at ${order.tableNumber}`,
        description: message
      }))
    )
    .slice(0, 3);

  const controlLogs = getControlLogs();
  const reprintAlerts = (controlLogs.reprints || []).slice(0, 2).map((entry) => ({
    id: `reprint-${entry.id}`,
    title: `Receipt reprint at ${entry.tableNumber}`,
    description: `${entry.reason} approved by ${entry.actor}`
  }));
  const voidAlerts = (controlLogs.voidRequests || []).slice(0, 2).map((entry) => ({
    id: `void-${entry.id}`,
    title: `Void approval pending at ${entry.tableNumber}`,
    description: `${entry.reason} requires manager or owner OTP approval`
  }));

  return [...liveAlerts, ...reprintAlerts, ...voidAlerts];
}

function buildOwnerSummary() {
  const state = getState();
  const orders = state.orders || {};
  const approvalLog = buildApprovalLog(orders);
  const controlSummary = buildControlSummary(orders);
  const controlLogs = getControlLogs();
  const deletedBillCount = Object.values(orders).reduce((sum, order) => sum + (order.deletedBillLog || []).length, 0);
  const pendingOverrides = Object.values(orders).filter((order) => order.discountOverrideRequested).length;

  return {
    popupAlert: {
      title: state.closingState?.approved ? "Daily closing approved" : `${pendingOverrides + deletedBillCount} control issues need owner review`,
      description: state.closingState?.approved
        ? `Approved by ${state.closingState.approvedBy} (${state.closingState.approvedRole}) at ${state.closingState.approvedAt}.`
        : `${pendingOverrides} discount overrides and ${deletedBillCount} deleted bills were recorded in live operations.`,
      cta: "Open reports"
    },
    // Outlet comparison comes from live sales — populated once POS is active
    outletComparison: [],
    insights: defaultInsights,
    closingSummary: [
      {
        id: "sales-payments",
        title: "Sales & Payments",
        status: "Included",
        meta: "Total sales, order count, cash vs UPI vs card summary"
      },
      {
        id: "profit-expenses",
        title: "Profit & Expenses",
        status: "Included",
        meta: "Outlet-wise profit, expense ratio, and exception highlights"
      },
      {
        id: "risk-alerts",
        title: "Risk Alerts",
        status: "Conditional",
        meta: "Cash mismatch, deleted bills, discount overrides, and stock exceptions"
      }
    ],
    closingCenter: buildClosingCenter(orders),
    closingState: state.closingState,
    permissionPolicies: state.permissionPolicies,
    controlSummary,
    approvalLog,
    controlLogs,
    alerts: buildAlerts(orders)
  };
}

async function fetchOwnerSummary() {
  await syncOperationsState();
  return buildOwnerSummary();
}

async function approveClosing(actor = { name: "Owner", role: "Owner" }) {
  await syncOperationsState();
  approveClosingState(actor.name, actor.role);
  await persistOperationsState();
  return buildOwnerSummary();
}

async function reopenBusinessDay(actor = { name: "Owner", role: "Owner" }) {
  await syncOperationsState();
  reopenClosingState(actor.name, actor.role);
  await persistOperationsState();
  return buildOwnerSummary();
}

module.exports = {
  fetchOwnerSummary,
  approveClosing,
  reopenBusinessDay
};
