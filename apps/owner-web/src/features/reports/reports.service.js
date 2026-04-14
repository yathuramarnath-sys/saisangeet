import { reportsSeedData } from "./reports.seed";
import { loadRestaurantState, subscribeRestaurantState, updateClosingState } from "../../../../../packages/shared-types/src/mockRestaurantStore.js";
import { api } from "../../lib/api";

function formatCurrency(value) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function deriveControlData(orders) {
  const list = Object.values(orders || {});
  const overrideOrders = list.filter((order) => order.discountOverrideRequested || order.discountApprovalStatus === "Approved");
  const deletedBills = list.flatMap((order) => order.deletedBillLog || []);
  const unauthorizedAlerts = list.flatMap((order) =>
    (order.controlAlerts || []).map((message, index) => ({
      id: `${order.tableId}-alert-${index}`,
      tableNumber: order.tableNumber,
      message
    }))
  );
  const approvalLog = list.flatMap((order) =>
    (order.auditTrail || [])
      .filter((entry) => ["Discount approved", "Void approved"].includes(entry.label))
      .map((entry, index) => ({
        id: `${order.tableId}-${index}-${entry.id}`,
        outlet: order.areaName,
        tableNumber: order.tableNumber,
        orderNumber: order.orderNumber,
        action: entry.label,
        actor: entry.actor,
        approvalMode: entry.actor.includes("OTP") ? "OTP" : "Manual",
        amount: entry.label === "Discount approved" ? formatCurrency(order.discountAmount || 0) : `Bill #${order.orderNumber}`,
        time: entry.time
      }))
  );

  return {
    popupAlert: {
      title: `${overrideOrders.length + deletedBills.length} control issues need owner review`,
      description:
        overrideOrders.length + deletedBills.length > 0
          ? `${overrideOrders.length} discount overrides and ${deletedBills.length} deleted bills were recorded in live operations.`
          : "No major control issues in live operations right now.",
      cta: "Open reports"
    },
    controlSummary: [
      {
        id: "discount-overrides",
        title: "Discount overrides",
        value: `${overrideOrders.length} today`,
        detail:
          overrideOrders.length > 0
            ? `${overrideOrders.filter((order) => order.discountOverrideRequested).length} still need review`
            : "No override requests in live flow",
        status: overrideOrders.some((order) => order.discountOverrideRequested) ? "Review" : "Strong"
      },
      {
        id: "deleted-bills",
        title: "Deleted bills",
        value: `${deletedBills.length} approved`,
        detail: deletedBills.length > 0 ? deletedBills.map((bill) => bill.tableNumber).join(", ") : "No deleted bills today",
        status: deletedBills.length > 0 ? "Review" : "Strong"
      },
      {
        id: "cash-mismatch",
        title: "Cash mismatch",
        value: reportsSeedData.controlSummary[2].value,
        detail: reportsSeedData.controlSummary[2].detail,
        status: reportsSeedData.controlSummary[2].status
      },
      {
        id: "unauthorized-actions",
        title: "Unauthorized actions",
        value: `${unauthorizedAlerts.length} alerts`,
        detail: unauthorizedAlerts[0]?.message || "No blocked cashier actions",
        status: unauthorizedAlerts.length > 0 ? "Review" : "Strong"
      }
    ],
    approvalLog,
    controlLogs: {
      reprints: [],
      deletedBills,
      voidRequests: overrideOrders
        .filter((order) => order.voidRequested)
        .map((order) => ({
          id: `${order.tableId}-void-request`,
          outlet: order.areaName,
          tableNumber: order.tableNumber,
          orderNumber: order.orderNumber,
          reason: order.voidReason,
          actor: order.voidApprovedBy,
          time: "Now",
          type: "void-request",
          status: "Pending OTP"
        })),
      unauthorizedAlerts
    },
    alerts: [
      ...reportsSeedData.alerts,
      ...unauthorizedAlerts.slice(0, 2).map((alert) => ({
        id: alert.id,
        title: `Unauthorized action at ${alert.tableNumber}`,
        description: alert.message
      }))
    ]
  };
}

function deriveShiftControlData(cashShifts) {
  const shiftState = cashShifts || reportsSeedData;
  const mismatchShifts = (shiftState.shifts || []).filter((shift) => ["Mismatch", "Manager check"].includes(shift.status));
  const shiftAlerts = (shiftState.alerts || []).map((alert) => ({
    id: `shift-${alert.id}`,
    title: alert.title,
    description: alert.description
  }));

  return {
    mismatchValue: mismatchShifts.length > 0 ? reportsSeedData.controlSummary[2].value : "Rs 0",
    mismatchDetail:
      mismatchShifts.length > 0
        ? mismatchShifts.map((shift) => `${shift.outlet} ${shift.status.toLowerCase()}`).join(", ")
        : "No cash mismatch in live shifts",
    mismatchStatus: mismatchShifts.length > 0 ? "Conditional" : "Strong",
    alerts: shiftAlerts
  };
}

function mergeReportsData(orders, cashShifts, closingState) {
  const localState = loadRestaurantState();
  const permissionPolicies = localState.permissionPolicies || {};
  const inventoryState = localState.inventory || {};
  const liveControlData = deriveControlData(orders);
  const liveShiftData = deriveShiftControlData(cashShifts);
  const stockVarianceLog = inventoryState.varianceLog || [];
  const hasLiveControlData =
    liveControlData.approvalLog.length > 0 ||
    liveControlData.controlSummary.some((item) => item.status !== "Strong" && item.value !== "0 approved" && item.value !== "0 today" && item.value !== "0 alerts");
  const popupTitle = hasLiveControlData
    ? `${liveControlData.popupAlert.title}`
    : liveShiftData.mismatchStatus !== "Strong"
      ? "1 shift issue needs owner review"
      : reportsSeedData.popupAlert.title;
  const popupDescription = hasLiveControlData
    ? liveControlData.popupAlert.description
    : liveShiftData.mismatchStatus !== "Strong"
      ? liveShiftData.mismatchDetail
      : reportsSeedData.popupAlert.description;
  const controlSummary = (hasLiveControlData ? liveControlData.controlSummary : reportsSeedData.controlSummary).map((item) => ({ ...item }));
  const pendingOverrideCount = Object.values(orders || {}).filter((order) => order.discountOverrideRequested).length;
  const deletedBillCount = Object.values(orders || {}).reduce((sum, order) => sum + (order.deletedBillLog || []).length, 0);
  const pendingShiftIssues = (cashShifts?.shifts || []).filter((shift) => ["Mismatch", "Manager check"].includes(shift.status)).length;
  const closingCenter = {
    ...reportsSeedData.closingCenter,
    blockers: [
      ...(pendingShiftIssues > 0
        ? [
            {
              id: "live-shift-blocker",
              title: `${pendingShiftIssues} shift issue still open`,
              detail: liveShiftData.mismatchDetail
            }
          ]
        : []),
      ...(pendingOverrideCount > 0
        ? [
            {
              id: "live-override-blocker",
              title: `${pendingOverrideCount} high discount override needs review`,
              detail: "Owner should confirm manager approvals before sending final closing mail."
            }
          ]
        : []),
      ...(stockVarianceLog.length > 0
        ? [
            {
              id: "live-stock-variance",
              title: `${stockVarianceLog.length} stock mismatch alert pending review`,
              detail: stockVarianceLog[0].note
            }
          ]
        : []),
      ...reportsSeedData.closingCenter.blockers
    ].slice(0, 4),
    checklist: reportsSeedData.closingCenter.checklist.map((item) => {
      if (item.id === "cash-review") {
        return {
          ...item,
          status: pendingShiftIssues > 0 ? "Pending" : "Done"
        };
      }

      if (item.id === "risk-review") {
        return {
          ...item,
          status: pendingOverrideCount > 0 || deletedBillCount > 0 || stockVarianceLog.length > 0 ? "Pending" : "Done"
        };
      }

      return item;
    }),
    ownerSummary: reportsSeedData.closingCenter.ownerSummary.map((item) => {
      if (item.id === "closing-deleted") {
        return { ...item, value: `${deletedBillCount} approved` };
      }

      if (item.id === "closing-overrides") {
        return { ...item, value: `${pendingOverrideCount} pending review` };
      }

      return item;
    })
  };
  controlSummary[2] = {
    ...controlSummary[2],
    value: liveShiftData.mismatchValue,
    detail: liveShiftData.mismatchDetail,
    status: liveShiftData.mismatchStatus
  };

  return {
    ...reportsSeedData,
    popupAlert: {
      title: closingState?.approved ? "Daily closing approved" : popupTitle,
      description: closingState?.approved
        ? `Approved by ${closingState.approvedBy} (${closingState.approvedRole}) at ${closingState.approvedAt}.`
        : popupDescription,
      cta: "Open reports"
    },
    closingState: closingState || {
      approved: false,
      approvedAt: null,
      approvedBy: null,
      approvedRole: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenedRole: null,
      status: "Pending review"
    },
    permissionPolicies,
    closingCenter,
    controlSummary,
    approvalLog: hasLiveControlData ? liveControlData.approvalLog : reportsSeedData.approvalLog,
    controlLogs: hasLiveControlData
      ? liveControlData.controlLogs
      : {
          reprints: [],
          deletedBills: [],
          voidRequests: [],
          unauthorizedAlerts: []
        },
    alerts: [
      ...(hasLiveControlData ? liveControlData.alerts : reportsSeedData.alerts),
      ...liveShiftData.alerts,
      ...stockVarianceLog.slice(0, 2).map((item) => ({
        id: item.id,
        title: `${item.itemName} stock mismatch detected`,
        description: item.note
      }))
    ]
  };
}

function mapOrderArrayToRecord(orders = []) {
  return Object.fromEntries((orders || []).map((order) => [order.tableId, order]));
}

export async function fetchReportsData() {
  const state = loadRestaurantState();

  try {
    const backendSummary = await api.get("/reports/owner-summary");
    const preferredClosingState =
      state.closingState?.approved || state.closingState?.reopenedAt
        ? state.closingState
        : backendSummary.closingState || state.closingState;

    return {
      ...backendSummary,
      closingState: preferredClosingState,
      permissionPolicies: {
        ...(backendSummary.permissionPolicies || {}),
        ...(state.permissionPolicies || {})
      }
    };
  } catch {
    return mergeReportsData(state.orders, state.cashShifts, state.closingState);
  }
}

export function subscribeOwnerReports(callback) {
  return subscribeRestaurantState((nextState) => {
    callback(mergeReportsData(nextState.orders, nextState.cashShifts, nextState.closingState));
  });
}

export function approveClosingReport(actor = { name: "Owner", role: "Owner" }) {
  return api
    .post("/reports/closing/approve", actor)
    .then((payload) => {
      updateClosingState(() => payload.closingState);
      return payload;
    })
    .catch(() =>
      updateClosingState(() => ({
        approved: true,
        approvedAt: "11:32 PM",
        approvedBy: actor.name,
        approvedRole: actor.role,
        reopenedAt: null,
        reopenedBy: null,
        reopenedRole: null,
        status: "Approved and queued"
      }))
    );
}

export function reopenBusinessDay(actor = { name: "Owner", role: "Owner" }) {
  return api
    .post("/reports/closing/reopen", actor)
    .then((payload) => {
      updateClosingState(() => payload.closingState);
      return payload;
    })
    .catch(() =>
      updateClosingState(() => ({
        approved: false,
        approvedAt: null,
        approvedBy: null,
        approvedRole: null,
        reopenedAt: "6:00 AM",
        reopenedBy: actor.name,
        reopenedRole: actor.role,
        status: "Open for operations"
      }))
    );
}
