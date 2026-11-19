const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : err.statusCode || 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error("Unhandled API error:", err);
  }

  res.status(statusCode).json({
    success: false,
    message: isServerError ? "Internal server error" : err.message || "Request failed",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
  });
};

module.exports = {
  notFound,
  errorHandler
};
