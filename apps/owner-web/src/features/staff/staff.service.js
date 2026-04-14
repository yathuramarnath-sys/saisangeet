import { api } from "../../lib/api";
import { staffSeedData } from "./staff.seed";
import { loadRestaurantState } from "../../../../../packages/shared-types/src/mockRestaurantStore.js";

function normalizeRoles(roles) {
  return roles.map((role, index) => ({
    id: role.id || role.name?.toLowerCase().replace(/\s+/g, "-") || `role-${index}`,
    name: role.name,
    summary: role.description || "Role summary pending",
    active: index === 0
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
    warning: user.isActive === false
  }));
}

export async function fetchStaffData() {
  const state = loadRestaurantState();
  const permissionEditor = staffSeedData.permissionEditor.map((item) => ({
    ...item,
    enabled: state.permissionPolicies?.[item.id] ?? item.enabled
  }));
  const financialControls = [
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

  try {
    const [roles, permissions, users] = await Promise.all([
      api.get("/roles"),
      api.get("/permissions"),
      api.get("/users"),
    ]);

    return {
      roles: normalizeRoles(roles),
      permissions: permissions.slice(0, 9).map((permission, index) => ({
        id: permission.code || `permission-${index}`,
        name: permission.description || permission.code,
        status: index < 6 ? "Enabled" : "Disabled",
        disabled: index >= 6
      })),
      accessMatrix: staffSeedData.accessMatrix,
      permissionEditor,
      financialControls,
      staff: normalizeStaff(users),
      tableAccess: staffSeedData.tableAccess,
      alerts: staffSeedData.alerts
    };
  } catch (_error) {
    return {
      ...staffSeedData,
      permissionEditor,
      financialControls
    };
  }
}

export async function createStaffMember(payload) {
  return api.post("/users", payload);
}

export async function createStaffRole(payload) {
  return api.post("/roles", payload);
}
