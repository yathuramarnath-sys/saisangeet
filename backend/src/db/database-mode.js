const { env } = require("../config/env");

function isDatabaseEnabled() {
  return env.enableDatabase === true;
}

module.exports = {
  isDatabaseEnabled
};
