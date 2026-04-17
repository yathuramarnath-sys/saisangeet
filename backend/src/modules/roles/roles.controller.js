const {
  fetchRoles,
  fetchPermissions,
  fetchUsers,
  createRole,
  updateRole,
  deleteRole,
  createUser,
  updateUser,
  deleteUser
} = require("./roles.service");

async function listRolesHandler(_req, res) {
  const result = await fetchRoles();
  res.json(result);
}

async function listPermissionsHandler(_req, res) {
  const result = await fetchPermissions();
  res.json(result);
}

async function createRoleHandler(req, res) {
  const result = await createRole(req.body);
  res.status(201).json(result);
}

async function updateRoleHandler(req, res) {
  const result = await updateRole(req.params.roleId, req.body);
  res.json(result);
}

async function deleteRoleHandler(req, res) {
  const result = await deleteRole(req.params.roleId);
  res.json(result || { success: true });
}

async function listUsersHandler(_req, res) {
  const result = await fetchUsers();
  res.json(result);
}

async function createUserHandler(req, res) {
  const result = await createUser(req.body);
  res.status(201).json(result);
}

async function updateUserHandler(req, res) {
  const result = await updateUser(req.params.userId, req.body);
  res.json(result);
}

async function deleteUserHandler(req, res) {
  const result = await deleteUser(req.params.userId);
  res.json(result || { success: true });
}

module.exports = {
  listRolesHandler,
  listPermissionsHandler,
  listUsersHandler,
  createRoleHandler,
  updateRoleHandler,
  deleteRoleHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler
};
