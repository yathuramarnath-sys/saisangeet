const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchRoles() {
  return getOwnerSetupData().roles;
}

async function fetchPermissions() {
  return getOwnerSetupData().permissions;
}

async function createRole(payload) {
  const role = {
    id: `role-${Date.now()}`,
    name: payload.name,
    description: payload.description || "",
    permissions: payload.permissions || []
  };

  updateOwnerSetupData((current) => ({
    ...current,
    roles: [...current.roles, role]
  }));

  return role;
}

async function createUser(payload) {
  const user = {
    id: `user-${Date.now()}`,
    fullName: payload.fullName,
    name: payload.fullName,
    roles: payload.roles || [],
    outletName: payload.outletName || "Outlet pending",
    isActive: payload.isActive ?? true,
    pin: payload.pin || ""
  };

  updateOwnerSetupData((current) => ({
    ...current,
    users: [...current.users, user]
  }));

  return user;
}

async function fetchUsers() {
  return getOwnerSetupData().users;
}

module.exports = {
  fetchRoles,
  fetchPermissions,
  fetchUsers,
  createRole,
  createUser
};
