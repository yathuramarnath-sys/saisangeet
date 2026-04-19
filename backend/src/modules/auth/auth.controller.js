const { login, signup, isSignupAvailable } = require("./auth.service");

async function loginHandler(req, res) {
  const result = await login(req.body);
  res.json(result);
}

function signupAvailableHandler(_req, res) {
  res.json({ available: isSignupAvailable() });
}

async function signupHandler(req, res) {
  const result = await signup(req.body);
  res.status(201).json(result);
}

function meHandler(req, res) {
  res.json({
    id: req.user.sub,
    fullName: req.user.fullName,
    outletId: req.user.outletId,
    roles: req.user.roles,
    permissions: req.user.permissions
  });
}

function logoutHandler(_req, res) {
  // JWT is stateless; client drops the token. This endpoint
  // exists so future refresh-token revocation can be added here.
  res.json({ ok: true });
}

module.exports = {
  loginHandler,
  signupAvailableHandler,
  signupHandler,
  meHandler,
  logoutHandler
};
