function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  const code = error.code || "INTERNAL_SERVER_ERROR";
  const message = error.message || "Unexpected server error";

  res.status(statusCode).json({
    error: {
      code,
      message,
      details: error.details || {}
    }
  });
}

module.exports = {
  errorHandler
};
