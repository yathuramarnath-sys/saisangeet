import { api } from "../../lib/api";
import { staffSeedData } from "./staff.seed";
import { loadRestaurantState } from "../../../../../packages/shared-types/src/mockRestaurantStore.js";
import { sharedAreas } from "../../../../../packages/shared-types/src/restaurantFlow.js";

const permissionCatalog = {
  "business.manage": {
    label: "Business Setup",
    description: "Create and update business profile settings.",
    workflowArea: "Owner Setup"
  },
  "outlets.manage": {
    label: "Outlet Setup",
    description: "Create outlets and assign local setup.",
    workflowArea: "Owner Setup"
  },
  "menu.manage": {
    label: "Menu Setup",
    description: "Create categories, items, taxes, and menu rules.",
    workflowArea: "Owner Setup"
  },
  "roles.manage": {
    label: "Role Management",
    description: "Create and update roles with permission control.",
    workflowArea: "Owner Setup"
  },
  "users.manage": {
    label: "Staff Management",
    description: "Create staff accounts and assign them to outlets.",
    workflowArea: "Owner Setup"
  },
  "tax.manage": {
    label: "Tax Setup",
    description: "Create and maintain GST and tax settings.",
    workflowArea: "Owner Setup"
  },
  "receipt_templates.manage": {
    label: "Receipt Templates",
    description: "Control bill print layout and footer rules.",
    workflowArea: "Owner Setup"
  },
  "devices.manage": {
    label: "Device Linking",
    description: "Link POS, printers, and kitchen displays.",
    workflowArea: "Owner Setup"
  },
  "reports.view": {
    label: "Reports Access",
    description: "View owner and outlet reports.",
    workflowArea: "Reports & Monitoring"
  },
  "operations.kot.send": {
    label: "Send KOT",
    description: "Captain flow: send kitchen order tickets after taking orders.",
    workflowArea: "Captain / Waiter Flow"
  },
  "operations.bill.request": {
    label: "Request Bill",
    description: "Waiter flow: request billing from cashier after service.",
    workflowArea: "Captain / Waiter Flow"
  },
  "operations.discount.approve": {
    label: "Approve Discount",
    description: "Cashier billing flow: approve discounts above cashier limit.",
    workflowArea: "Cashier Billing Flow"
  },
  "operations.table.create": {
    label: "Table Creation",
    description: "Outlet page: create tables during floor setup.",
    workflowArea: "Outlet Setup"
  },
  "operations.bill.split": {
    label: "Split Bill",
    description: "Cashier billing flow: split bill before final settlement.",
    workflowArea: "Cashier Billing Flow"
  },
  "operations.bill.edit": {
    label: "Bill Edit",
    description: "Cashier billing flow: edit bill lines before settlement.",
    workflowArea: "Cashier Billing Flow"
  },
  "operations.bill.cancel": {
    label: "Bill Cancel",
    description: "Cashier billing flow: cancel or void a bill with role approval.",
    workflowArea: "Cashier Billing Flow"
  },
  "operations.table.move": {
    label: "Move Table",
    description: "Captain flow: move one running table or bill to another table.",
    workflowArea: "Captain / Waiter Flow"
  },
  "floor.area.manage": {
    label: "Area Creation",
    description: "Outlet page: create or update AC, Non-AC, and service areas.",
    workflowArea: "Outlet Setup"
  },
  "floor.table.seats.manage": {
    label: "Seat Setup",
    description: "Outlet page: configure seat count table by table.",
    workflowArea: "Outlet Setup"
  },
  "operations.kot.status.update": {
    label: "Kitchen Status Update",
    description: "Kitchen display flow: update kitchen ticket status from KDS.",
    workflowArea: "Kitchen Display Flow"
  }
};

function normalizeRoles(roles) {
  return roles.map((role) => ({
    id: role.id || role.name?.toLowerCase().replace(/\s+/g, "-") || `role-${Date.now()}`,
    name: role.name,
    summary: role.description || "Role summary pending",
    description: role.description || "",
    permissions: role.permissions || [],
    active: true
  }));
}

function normalizePermissions(permissions) {
  return permissions.map((permission, index) => ({
    id: permission.id || permission.code || `permission-${index}`,
    code: permission.code,
    name: permissionCatalog[permission.code]?.label || permission.code,
    description: permissionCatalog[permission.code]?.description || permission.description || permission.code,
    workflowArea: permissionCatalog[permission.code]?.workflowArea || permission.moduleName || "Operations",
    scope: permission.scope || "role"
  }));
}

function normalizeStaff(users) {
  return users.map((user) => ({
    id: user.id,
    name: user.fullName || user.name || "Unknown",
    role: user.roles?.[0] || "Staff",
    outlet: user.outletName || "Outlet pending",
    login: user.pin ? "PIN" : "Password",
    status: user.isActive === false ? "Inactive" : "Active",
    warning: user.isActive === false,
    pin: user.pin || "",
    mobileNumber: user.mobileNumber || ""
  }));
}

function buildPermissionEditor(state) {
  const definitions = [
    {
      id: "cashier-table-setup",
      label: "Cashier can create tables",
      role: "Cashier",
      detail: "Allow cashier to add table name and seats in service areas."
    },
    {
      id: "manager-close-day",
      label: "Manager can approve closing day",
      role: "Manager",
      detail: "Let manager approve closing and reopen the next business day."
    },
    {
      id: "captain-move-table",
      label: "Captain can move table",
      role: "Captain",
      detail: "Allow captain to shift guests between tables before billing."
    },
    {
      id: "waiter-request-bill",
      label: "Waiter can request bill",
      role: "Waiter",
      detail: "Let waiter trigger bill request to cashier after service."
    },
    {
      id: "kitchen-kot-control",
      label: "Kitchen can update KOT status",
      role: "Kitchen",
      detail: "Allow kitchen to move tickets between New, Preparing, and Ready."
    }
  ];

  return definitions.map((item) => ({
    ...item,
    enabled: state.permissionPolicies?.[item.id] ?? true
  }));
}

function buildFinancialControls(state) {
  return [
    {
      id: "cashier-discount-limit",
      title: "Cashier Discount Limit",
      value: `${state.permissionPolicies?.["cashier-discount-limit-percent"] ?? 5}%`,
      detail: "Cashier can approve discount up to this percentage of bill subtotal."
    },
    {
      id: "discount-approval-route",
      title: "Approval Route",
      value: "Manager / Owner",
      detail: "Any discount above cashier limit needs manager or owner approval."
    },
    {
      id: "cashier-void-limit",
      title: "Cashier Void Limit",
      value: `Rs ${state.permissionPolicies?.["cashier-void-limit-amount"] ?? 200}`,
      detail: "Cashier can complete void directly up to this amount."
    },
    {
      id: "void-approval-route",
      title: "Void Approval Route",
      value: "Manager / Owner OTP",
      detail: "Any void above cashier limit needs OTP approval from manager or owner."
    }
  ];
}

function buildAccessMatrix(roles, permissionPolicies) {
  return roles.map((role) => {
    const name = role.name || "Role";
    const permissions = role.permissions || [];
    const isOwner = name === "Owner";
    const isManager = name === "Manager";
    const isCashier = name === "Cashier";
    const isCaptain = name === "Captain";
    const isWaiter = name === "Waiter";
    const isKitchen = name === "Kitchen";
    const isStore = name === "Store Incharge";

    return {
      id: role.id,
      role: name,
      outletScope: isOwner ? "All outlets" : isManager || isCashier ? "Assigned outlet" : "Assigned work area",
      closeDay: isOwner
        ? "Approve and reopen"
        : permissionPolicies["manager-close-day"] && isManager
          ? "Approve and reopen"
          : permissions.includes("reports.view")
            ? "View only"
            : "No access",
      discountOverride:
        isOwner || permissions.includes("operations.discount.approve")
          ? "Approve"
          : isCashier
            ? `Request above ${permissionPolicies["cashier-discount-limit-percent"] ?? 5}%`
            : "No access",
      voidApproval: isOwner || isManager ? "Approve" : isCashier ? "Request only" : "No access",
      reports: permissions.includes("reports.view") ? "Enabled" : "No access",
      tableControl:
        isOwner
          ? "Full control"
          : permissions.includes("floor.area.manage")
            ? "Area setup"
            : permissions.includes("operations.table.create")
              ? "Create tables"
              : permissions.includes("floor.table.seats.manage")
                ? "Set seats"
                : isCaptain && permissionPolicies["captain-move-table"]
            ? "Move table"
            : isCashier && permissionPolicies["cashier-table-setup"]
              ? "Create tables"
              : isWaiter
                ? "Assigned tables"
                : isKitchen || isStore
                  ? "No table access"
                  : "Monitor only"
    };
  });
}

function buildTableAccess(outlets, permissionPolicies) {
  const firstOutletName = outlets[0]?.name || "Main Outlet";

  return sharedAreas.flatMap((area) =>
    area.tables.map((table) => ({
      id: `${area.id}-${table.id}`,
      area: area.name,
      table: table.number,
      seats: table.seats,
      createdBy: permissionPolicies["cashier-table-setup"] ? "Cashier" : "Owner only",
      status: permissionPolicies["cashier-table-setup"] ? `${firstOutletName} enabled` : "Blocked"
    }))
  );
}

function buildAlerts(staff, roles, permissionPolicies) {
  const alerts = [];
  const defaultPins = staff.filter((member) => member.pin === "1234" || member.pin === "0000").length;
  const unassignedRoles = staff.filter((member) => !roles.some((role) => role.name === member.role)).length;
  const inactiveStaff = staff.filter((member) => member.status === "Inactive").length;

  if (permissionPolicies["cashier-table-setup"]) {
    alerts.push({
      id: "cashier-table-setup",
      title: "Cashier table setup is enabled",
      description: "Cashiers can create or manage tables where floor setup is allowed."
    });
  }

  if (defaultPins > 0) {
    alerts.push({
      id: "default-pin",
      title: `${defaultPins} staff still using default PIN`,
      description: "Force a PIN reset before next shift."
    });
  }

  if (unassignedRoles > 0) {
    alerts.push({
      id: "missing-role",
      title: `${unassignedRoles} staff have missing role mapping`,
      description: "Review staff role assignment before POS login."
    });
  }

  if (inactiveStaff > 0) {
    alerts.push({
      id: "inactive-staff",
      title: `${inactiveStaff} staff are inactive`,
      description: "Inactive staff should not be allowed to log in on outlet devices."
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "access-clean",
      title: "Staff access is clean",
      description: "No role or login issues need attention right now."
    });
  }

  return alerts;
}

export async function fetchStaffData() {
  try {
    const state = loadRestaurantState();

    const [roles, permissions, users, outlets, discountSettings] = await Promise.all([
      api.get("/roles"),
      api.get("/permissions"),
      api.get("/users"),
      api.get("/outlets"),
      api.get("/settings/discounts").catch(() => null)
    ]);

    const normalizedRoles = normalizeRoles(roles);
    const normalizedPermissions = normalizePermissions(permissions);
    const normalizedStaff = normalizeStaff(users);
    const permissionEditor = buildPermissionEditor(state);
    const financialControls = buildFinancialControls(state);
    const accessMatrix = buildAccessMatrix(normalizedRoles, state.permissionPolicies || {});
    const tableAccess = buildTableAccess(outlets, state.permissionPolicies || {});
    const alerts = buildAlerts(normalizedStaff, normalizedRoles, state.permissionPolicies || {});

    return {
      roles: normalizedRoles,
      permissions: normalizedPermissions,
      accessMatrix,
      permissionEditor,
      financialControls,
      staff: normalizedStaff,
      tableAccess,
      alerts,
      outlets,
      policyValues: {
        cashierDiscountLimitPercent:
          discountSettings?.defaults?.cashierLimitPercent ??
          state.permissionPolicies?.["cashier-discount-limit-percent"] ?? 5,
        cashierVoidLimitAmount:
          discountSettings?.defaults?.cashierVoidLimitAmount ??
          state.permissionPolicies?.["cashier-void-limit-amount"] ?? 200
      }
    };
  } catch (_error) {
    return {
      ...staffSeedData,
      roles: staffSeedData.roles.map((role) => ({ permissions: [], ...role })),
      financialControls: buildFinancialControls({}),
      outlets: [],
      policyValues: { cashierDiscountLimitPercent: 5, cashierVoidLimitAmount: 200 }
    };
  }
}

export async function createStaffMember(payload) {
  return api.post("/users", payload);
}

export async function updateStaffMember(userId, payload) {
  return api.patch(`/users/${userId}`, payload);
}

export async function deleteStaffMember(userId) {
  return api.delete(`/users/${userId}`);
}

export async function createStaffRole(payload) {
  return api.post("/roles", payload);
}

export async function updateStaffRole(roleId, payload) {
  return api.patch(`/roles/${roleId}`, payload);
}

export async function deleteStaffRole(roleId) {
  return api.delete(`/roles/${roleId}`);
}
