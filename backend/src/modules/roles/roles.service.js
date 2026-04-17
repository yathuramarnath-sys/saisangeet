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

async function updateRole(roleId, payload) {
  let updatedRole = null;

  updateOwnerSetupData((current) => ({
    ...current,
    roles: current.roles.map((role) => {
      if (role.id !== roleId) {
        return role;
      }

      updatedRole = {
        ...role,
        name: payload.name ?? role.name,
        description: payload.description ?? role.description,
        permissions: payload.permissions ?? role.permissions ?? []
      };

      return updatedRole;
    }),
    users: (current.users || []).map((user) => {
      if (!payload.name || !user.roles?.includes(current.roles.find((role) => role.id === roleId)?.name)) {
        return user;
      }

      return {
        ...user,
        roles: user.roles.map((roleName) =>
          roleName === current.roles.find((role) => role.id === roleId)?.name ? payload.name : roleName
        )
      };
    })
  }));

  return updatedRole;
}

async function deleteRole(roleId) {
  let deletedRole = null;

  updateOwnerSetupData((current) => {
    const roleToDelete = current.roles.find((role) => role.id === roleId);
    deletedRole = roleToDelete || null;

    return {
      ...current,
      roles: current.roles.filter((role) => role.id !== roleId),
      users: (current.users || []).map((user) => ({
        ...user,
        roles: (user.roles || []).filter((roleName) => roleName !== roleToDelete?.name)
      }))
    };
  });

  return deletedRole;
}

async function createUser(payload) {
  const user = {
    id: `user-${Date.now()}`,
    fullName: payload.fullName,
    name: payload.fullName,
    roles: payload.roles || [],
    outletName: payload.outletName || "Outlet pending",
    isActive: payload.isActive ?? true,
    pin: payload.pin || "",
    mobileNumber: payload.mobileNumber || ""
  };

  updateOwnerSetupData((current) => ({
    ...current,
    users: [...current.users, user]
  }));

  return user;
}

async function updateUser(userId, payload) {
  let updatedUser = null;

  updateOwnerSetupData((current) => ({
    ...current,
    users: (current.users || []).map((user) => {
      if (user.id !== userId) {
        return user;
      }

      updatedUser = {
        ...user,
        fullName: payload.fullName ?? user.fullName,
        name: payload.fullName ?? user.name,
        roles: payload.roles ?? user.roles ?? [],
        outletName: payload.outletName ?? user.outletName,
        isActive: payload.isActive ?? user.isActive,
        pin: payload.pin ?? user.pin,
        mobileNumber: payload.mobileNumber ?? user.mobileNumber ?? ""
      };

      return updatedUser;
    })
  }));

  return updatedUser;
}

async function deleteUser(userId) {
  let deletedUser = null;

  updateOwnerSetupData((current) => {
    deletedUser = (current.users || []).find((user) => user.id === userId) || null;

    return {
      ...current,
      users: (current.users || []).filter((user) => user.id !== userId)
    };
  });

  return deletedUser;
}

async function fetchUsers() {
  return getOwnerSetupData().users;
}

module.exports = {
  fetchRoles,
  fetchPermissions,
  fetchUsers,
  createRole,
  updateRole,
  deleteRole,
  createUser,
  updateUser,
  deleteUser
};
