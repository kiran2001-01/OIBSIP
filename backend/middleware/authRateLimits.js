const { rateLimit } = require("express-rate-limit");

const createRateLimiter = (windowMs, limit, message, options = {}) =>
  rateLimit({
    windowMs,
    limit,
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        success: false,
        message
      })
  });

module.exports = {
  registerRateLimiter: createRateLimiter(
    60 * 60 * 1000,
    5,
    "Too many registration attempts. Please try again later."
  ),
  loginRateLimiter: createRateLimiter(
    15 * 60 * 1000,
    10,
    "Too many login attempts. Please try again later.",
    { skipSuccessfulRequests: true }
  ),
  emailActionRateLimiter: createRateLimiter(
    60 * 60 * 1000,
    5,
    "Too many email requests. Please try again later."
  ),
  resetOtpRateLimiter: createRateLimiter(
    15 * 60 * 1000,
    10,
    "Too many code verification attempts. Please try again later."
  ),
  passwordResetRateLimiter: createRateLimiter(
    15 * 60 * 1000,
    10,
    "Too many password reset attempts. Please try again later."
  )
};
