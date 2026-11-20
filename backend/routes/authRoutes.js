const express = require("express");
const { body } = require("express-validator");
const {
  registerRateLimiter,
  loginRateLimiter,
  emailActionRateLimiter,
  resetOtpRateLimiter,
  passwordResetRateLimiter
} = require("../middleware/authRateLimits");
const {
  PASSWORD_POLICY_MESSAGE,
  isStrongPassword
} = require("../utils/passwordPolicy");
const {
  registerUser,
  requestRegistrationVerification,
  loginUser,
  adminLoginUser,
  getCurrentUser,
  logoutUser,
  verifyEmail,
  resendVerification,
  forgotPassword,
  verifyResetOtp,
  resetPassword
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Auth routes ready"
  });
});

router.post(
  "/request-registration-verification",
  emailActionRateLimiter,
  requestRegistrationVerification
);

router.post(
  "/register",
  [
    body("name").trim().isLength({ min: 2 }).withMessage("Name must be at least 2 characters"),
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("phone").trim().notEmpty().withMessage("Phone number is required"),
    body("password").custom(isStrongPassword).withMessage(PASSWORD_POLICY_MESSAGE),
    body("confirmPassword")
      .custom((value, { req }) => value === req.body.password)
      .withMessage("Passwords do not match")
  ],
  registerRateLimiter,
  registerUser
);

router.post(
  "/login",
  [
    body("email").trim().isEmail().withMessage("Please provide a valid email"),
    body("password").notEmpty().withMessage("Password is required")
  ],
  loginRateLimiter,
  loginUser
);

router.post(
  "/admin-login",
  [
    body("email").trim().isEmail().withMessage("Please provide a valid email"),
    body("password").notEmpty().withMessage("Password is required")
  ],
  loginRateLimiter,
  adminLoginUser
);

router.get("/me", protect, getCurrentUser);
router.post("/logout", logoutUser);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", emailActionRateLimiter, resendVerification);
router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("Please provide a valid email")],
  emailActionRateLimiter,
  forgotPassword
);
router.post(
  "/verify-reset-otp",
  [
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("otp").isLength({ min: 6, max: 6 }).isNumeric().withMessage("Enter the six-digit code")
  ],
  resetOtpRateLimiter,
  verifyResetOtp
);
router.post(
  "/reset-password",
  [
    body("newPassword").custom(isStrongPassword).withMessage(PASSWORD_POLICY_MESSAGE),
    body("confirmPassword")
      .custom((value, { req }) => value === req.body.newPassword)
      .withMessage("Passwords do not match")
  ],
  passwordResetRateLimiter,
  resetPassword
);

module.exports = router;
