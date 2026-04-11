const { listPermissions, listRoles } = require("./roles.repository");

async function fetchRoles() {
  return listRoles();
}

async function fetchPermissions() {
  return listPermissions();
}

async function createRole(payload) {
  return {
    message: "Create role implementation pending",
    payload
  };
}

async function createUser(payload) {
  return {
    message: "Create user implementation pending",
    payload
  };
}

module.exports = {
  fetchRoles,
  fetchPermissions,
  createRole,
  createUser
};
