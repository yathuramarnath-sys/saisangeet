const { login } = require("./auth.service");

async function loginHandler(req, res) {
  const result = await login(req.body);
  res.json(result);
}

function meHandler(req, res) {
  res.json(
    req.user || {
      id: null,
      fullName: null,
      outletId: null,
      roles: [],
      permissions: []
    }
  );
}

module.exports = {
  loginHandler,
  meHandler
};
