const { fetchAppConfig } = require("./setup.service");

async function getAppConfigHandler(_req, res) {
  const result = await fetchAppConfig();
  res.json(result);
}

module.exports = {
  getAppConfigHandler
};
