const { login, loginWithGoogle, signup, isSignupAvailable, saveSignupInterest, changePassword, resetOwnerPassword, forgotPassword, resetPasswordByToken } = require("./auth.service");
const { env } = require("../../config/env");

// Very basic email format check — prevents garbage hitting the DB
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loginHandler(req, res) {
  // Frontend sends "identifier" (email or phone); also accept "email" for direct API callers
  const raw = req.body.identifier || req.body.email;
  const { password } = req.body;

  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Email or phone is required." } });
  }
  if (!password || typeof password !== "string" || password.length < 1) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Password is required." } });
  }
  const result = await login({ identifier: raw.trim().toLowerCase(), password });
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

// ── Google OAuth ─────────────────────────────────────────────────────────────

// Step 1 — redirect user to Google sign-in page
function googleAuthHandler(_req, res) {
  const params = new URLSearchParams({
    client_id:     env.googleClientId,
    redirect_uri:  `https://api.dinexpos.in/api/v1/auth/google/callback`,
    response_type: "code",
    scope:         "openid email profile",
    access_type:   "online",
    prompt:        "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

// Step 2 — Google redirects back here with ?code=...
async function googleCallbackHandler(req, res) {
  const { code, error } = req.query;
  const frontendUrl = env.appUrl; // https://app.dinexpos.in

  if (error || !code) {
    return res.redirect(`${frontendUrl}/login?error=google_cancelled`);
  }

  try {
    const result = await loginWithGoogle({ code });
    // Pass JWT back to frontend via URL param — frontend stores it in localStorage
    return res.redirect(`${frontendUrl}/auth/callback?token=${result.token}`);
  } catch (err) {
    const msg = err.message || "google_error";
    return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(msg)}`);
  }
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
  resetPasswordByTokenHandler,
  googleAuthHandler,
  googleCallbackHandler,
};
