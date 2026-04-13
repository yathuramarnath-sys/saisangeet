const jwt = require("jsonwebtoken");

const { env } = require("../config/env");

function buildDemoUser(req) {
  if (env.nodeEnv === "production") {
    return null;
  }

  const demoName = req.headers["x-demo-user-name"];
  const demoRole = req.headers["x-demo-user-role"];
  const demoPermissions = req.headers["x-demo-user-permissions"];

  if (!demoName && !demoRole && !demoPermissions) {
    return null;
  }

  return {
    sub: "demo-user",
    outletId: req.headers["x-demo-outlet-id"] || "demo-outlet",
    fullName: demoName || "Demo User",
    roles: demoRole ? [demoRole] : ["Owner"],
    permissions: String(demoPermissions || "")
      .split(",")
      .map((permission) => permission.trim())
      .filter(Boolean)
  };
}

function authenticate(req, _res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    req.user = buildDemoUser(req);
    return next();
  }

  const token = header.replace("Bearer ", "").trim();

  try {
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch (_error) {
    req.user = null;
    return next();
  }
}

module.exports = {
  authenticate
};
