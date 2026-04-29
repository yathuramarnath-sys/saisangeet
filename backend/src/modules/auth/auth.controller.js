const { login, signup, isSignupAvailable, saveSignupInterest, changePassword, resetOwnerPassword, forgotPassword, resetPasswordByToken } = require("./auth.service");

// Very basic email format check — prevents garbage hitting the DB
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loginHandler(req, res) {
  const { email, password } = req.body;
  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Valid email is required." } });
  }
  if (!password || typeof password !== "string" || password.length < 1) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Password is required." } });
  }
  const result = await login({ email: email.trim().toLowerCase(), password });
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

async function signupInterestHandler(req, res) {
  const result = await saveSignupInterest(req.body);
  res.json(result);
}

async function changePasswordHandler(req, res) {
  const result = await changePassword({
    userId: req.user.sub,
    ...req.body
  });
  res.json(result);
}

async function resetOwnerHandler(req, res) {
  const result = await resetOwnerPassword(req.body);
  res.json(result);
}

async function forgotPasswordHandler(req, res) {
  const { email } = req.body;
  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Valid email is required." } });
  }
  const result = await forgotPassword({ email: email.trim().toLowerCase() });
  res.json(result);
}

async function resetPasswordByTokenHandler(req, res) {
  const { token, password } = req.body;
  if (!token || typeof token !== "string" || token.length < 10) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Valid reset token is required." } });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "New password must be at least 8 characters." } });
  }
  const result = await resetPasswordByToken({ token, password });
  res.json(result);
}

module.exports = {
  loginHandler,
  signupAvailableHandler,
  signupHandler,
  signupInterestHandler,
  meHandler,
  logoutHandler,
  changePasswordHandler,
  resetOwnerHandler,
  forgotPasswordHandler,
  resetPasswordByTokenHandler
};
