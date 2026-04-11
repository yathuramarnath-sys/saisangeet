const {
  fetchRoles,
  fetchPermissions,
  createRole,
  createUser
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

async function createUserHandler(req, res) {
  const result = await createUser(req.body);
  res.status(201).json(result);
}

module.exports = {
  listRolesHandler,
  listPermissionsHandler,
  createRoleHandler,
  createUserHandler
};
