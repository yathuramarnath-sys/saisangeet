const { getOwnerSetupData } = require("../../data/owner-setup-store");

async function findUserByIdentifier(identifier) {
  const store = getOwnerSetupData();
  const users = store.users || [];

  const user = users.find(
    (u) => u.email === identifier || u.phone === identifier
  );

  if (!user) return null;

  const roleNames = Array.isArray(user.roles) ? user.roles : [];
  const storeRoles = store.roles || [];

  const permissions = roleNames.flatMap((roleName) => {
    const role = storeRoles.find((r) => r.name === roleName);
    return role?.permissions || [];
  });

  return {
    id: user.id,
    outletId: user.outletId || null,
    fullName: user.fullName || user.name,
    email: user.email || null,
    phone: user.phone || null,
    passwordHash: user.passwordHash,
    status: user.isActive === false ? "inactive" : "active",
    roles: roleNames,
    permissions: [...new Set(permissions)]
  };
}

module.exports = {
  findUserByIdentifier
};
