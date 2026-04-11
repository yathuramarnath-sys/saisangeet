const { listOutlets } = require("./outlets.repository");

async function fetchOutlets() {
  return listOutlets();
}

async function createOutlet(payload) {
  return {
    message: "Create outlet implementation pending",
    payload
  };
}

async function updateOutletSettings(id, payload) {
  return {
    message: "Update outlet settings implementation pending",
    outletId: id,
    payload
  };
}

module.exports = {
  fetchOutlets,
  createOutlet,
  updateOutletSettings
};
