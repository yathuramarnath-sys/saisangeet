import { api } from "../../lib/api";
import { staffSeedData } from "./staff.seed";

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
      staff: normalizeStaff(users),
      tableAccess: staffSeedData.tableAccess,
      alerts: staffSeedData.alerts
    };
  } catch (_error) {
    return staffSeedData;
  }
}
