const jwt = require("jsonwebtoken");

const { env } = require("../config/env");

function authenticate(req, _res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    req.user = null;
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
