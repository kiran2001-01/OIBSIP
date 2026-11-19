const crypto = require("crypto");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const { generateToken } = require("../utils/generateToken");
const {
  setAuthCookie,
  clearAuthCookie,
  setResetCookie,
  clearResetCookie,
  getResetToken
} = require("../utils/authCookie");
const { sendEmail } = require("../services/emailService");
const sendControllerError = require("../utils/controllerError");
const {
  PASSWORD_POLICY_MESSAGE,
  isStrongPassword
} = require("../utils/passwordPolicy");

const isLocalEmailFallbackEnabled = () => process.env.NODE_ENV === "development";
const isEmailConfigured = () => Boolean(process.env.EMAIL_HOST);
const passwordResetRequestMessage = "If an account exists for this email, a reset code has been sent.";

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const hashOtp = (otp) => {
  return crypto.createHmac("sha256", process.env.JWT_SECRET).update(otp).digest("hex");
};

const sendVerificationEmail = async (user) => {
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(verificationToken);
  const expiresAt = Date.now() + 60 * 60 * 1000;

  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpires = expiresAt;
  await user.save();

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const verifyLink = `${frontendUrl}/verify-email?token=${verificationToken}`;

  const emailResult = await sendEmail({
    to: user.email,
    subject: "Verify your Pizza Delivery account",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Welcome to Pizza Delivery</h2>
        <p>Hi ${user.name},</p>
        <p>Thanks for registering. Please verify your email to activate your account.</p>
        <p>
          <a href="${verifyLink}" target="_blank" style="display:inline-block;background:#d97706;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:bold;">
            Verify Email
          </a>
        </p>
        <p style="font-size: 13px; color: #666; margin-top: 15px;">If the button above is not clickable, copy and paste this link into your browser:</p>
        <p style="font-size: 13px; word-break: break-all;"><a href="${verifyLink}" style="color: #d97706;">${verifyLink}</a></p>
      </div>
    `
  });

  if (emailResult.skipped && !isLocalEmailFallbackEnabled()) {
    throw new Error("Email delivery is not configured");
  }

  return emailResult.skipped ? verifyLink : null;
};

const registerUser = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg
    });
  }

  try {
    const { name, email, phone, password, confirmPassword } = req.body;

    if (!name || !email || !phone || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields"
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_POLICY_MESSAGE
      });
    }

    if (!isEmailConfigured() && !isLocalEmailFallbackEnabled()) {
      return res.status(503).json({
        success: false,
        message: "Email delivery is not configured on the server"
      });
    }

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "A user with this email already exists"
      });
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password,
      role: "user",
      emailVerified: false
    });

    const verificationUrl = await sendVerificationEmail(user);

    return res.status(201).json({
      success: true,
      message: verificationUrl
        ? "Account created. Verify your email using the local development link."
        : "User registered successfully. Please check your email to verify your account.",
      data: {
        user: user.toJSON(),
        ...(verificationUrl && { verificationUrl })
      }
    });
  } catch (error) {
    return sendControllerError(res, error, "Registration failed", "Registration failed");
  }
};

const authenticateUser = async (req, res, requiredRole) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg
    });
  }

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    if (requiredRole && user.role !== requiredRole) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin credentials required."
      });
    }

    if (!user.emailVerified) {
      return res.status(401).json({
        success: false,
        message: "Please verify your email before logging in"
      });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: user.toJSON()
      }
    });
  } catch (error) {
    return sendControllerError(res, error, "Login failed", "Login failed");
  }
};

const loginUser = (req, res) => authenticateUser(req, res);
const adminLoginUser = (req, res) => authenticateUser(req, res, "admin");

const getCurrentUser = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      user: req.user
    }
  });
};

const logoutUser = async (req, res) => {
  clearAuthCookie(res);
  return res.status(200).json({
    success: true,
    message: "Logout successful"
  });
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token is required"
      });
    }

    const hashedToken = hashToken(token);
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification token"
      });
    }

    user.emailVerified = true;
    user.emailVerificationToken = "";
    user.emailVerificationExpires = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email verified successfully"
    });
  } catch (error) {
    return sendControllerError(res, error, "Email verification failed", "Email verification failed");
  }
};

const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    if (!isEmailConfigured() && !isLocalEmailFallbackEnabled()) {
      return res.status(503).json({
        success: false,
        message: "Email delivery is not configured on the server"
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified"
      });
    }

    const verificationUrl = await sendVerificationEmail(user);

    return res.status(200).json({
      success: true,
      message: verificationUrl
        ? "Use the local development link to verify your email."
        : "Verification email sent successfully",
      data: {
        ...(verificationUrl && { verificationUrl })
      }
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Resending verification email failed",
      "Unable to resend verification email"
    );
  }
};

const forgotPassword = async (req, res) => {
  let accountLookupCompleted = false;

  try {
    const { email } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    if (!isEmailConfigured() && !isLocalEmailFallbackEnabled()) {
      return res.status(503).json({
        success: false,
        message: "Email delivery is not configured on the server"
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    accountLookupCompleted = true;

    if (!user) {
      return res.status(200).json({
        success: true,
        message: passwordResetRequestMessage
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    user.resetPasswordOtp = hashOtp(otp);
    user.resetPasswordOtpExpires = Date.now() + 10 * 60 * 1000;
    user.resetPasswordOtpAttempts = 0;
    user.resetPasswordToken = "";
    user.resetPasswordExpires = null;
    await user.save();

    let emailResult;
    try {
      emailResult = await sendEmail({
        to: user.email,
        subject: "Your Pizza Delivery password reset code",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Password Reset Code</h2>
            <p>Hi ${user.name},</p>
            <p>Enter this code to continue resetting your password:</p>
            <p style="font-size:24px;font-weight:bold;letter-spacing:6px;">${otp}</p>
            <p>This code expires in 10 minutes. Do not share it. If you did not request it, you can ignore this email.</p>
          </div>
        `
      });
    } catch {
      await User.updateOne(
        { _id: user._id, resetPasswordOtp: user.resetPasswordOtp },
        {
          $set: {
            resetPasswordOtp: "",
            resetPasswordOtpExpires: null,
            resetPasswordOtpAttempts: 0
          }
        }
      );
      console.error("Password reset email delivery failed.");
      return res.status(200).json({
        success: true,
        message: passwordResetRequestMessage
      });
    }

    if (emailResult.skipped && !isLocalEmailFallbackEnabled()) {
      await User.updateOne(
        { _id: user._id, resetPasswordOtp: user.resetPasswordOtp },
        {
          $set: {
            resetPasswordOtp: "",
            resetPasswordOtpExpires: null,
            resetPasswordOtpAttempts: 0
          }
        }
      );
      return res.status(503).json({
        success: false,
        message: "Email delivery is not configured on the server"
      });
    }

    const developmentOtp = emailResult.skipped && isLocalEmailFallbackEnabled();
    return res.status(200).json({
      success: true,
      message: passwordResetRequestMessage,
      ...(developmentOtp && { data: { developmentOtp: otp } })
    });
  } catch {
    console.error("Password reset request failed.");
    return res.status(accountLookupCompleted ? 200 : 500).json({
      success: accountLookupCompleted,
      message: accountLookupCompleted
        ? passwordResetRequestMessage
        : "Unable to process password reset request"
    });
  }
};

const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (
      typeof email !== "string" ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter the six-digit code sent to your email"
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    const now = new Date();
    if (
      !user ||
      !user.resetPasswordOtp ||
      !user.resetPasswordOtpExpires
    ) {
      return res.status(400).json({
        success: false,
        message: "The code is invalid. Request a new code."
      });
    }

    if (user.resetPasswordOtpExpires <= now) {
      return res.status(400).json({
        success: false,
        message: "The code has expired. Request a new code."
      });
    }

    if (user.resetPasswordOtpAttempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Request a new code."
      });
    }

    const suppliedHash = hashOtp(otp);
    const storedHash = Buffer.from(user.resetPasswordOtp, "hex");
    const suppliedBuffer = Buffer.from(suppliedHash, "hex");
    const otpMatches = storedHash.length === suppliedBuffer.length &&
      crypto.timingSafeEqual(storedHash, suppliedBuffer);

    if (!otpMatches) {
      await User.updateOne(
        {
          _id: user._id,
          resetPasswordOtpExpires: { $gt: now },
          resetPasswordOtpAttempts: { $lt: 5 }
        },
        { $inc: { resetPasswordOtpAttempts: 1 } }
      );
      return res.status(400).json({
        success: false,
        message: "The code is invalid. Request a new code."
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const verifiedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        resetPasswordOtp: user.resetPasswordOtp,
        resetPasswordOtpExpires: { $gt: now },
        resetPasswordOtpAttempts: { $lt: 5 }
      },
      {
        $set: {
          resetPasswordOtp: "",
          resetPasswordOtpExpires: null,
          resetPasswordOtpAttempts: 0,
          resetPasswordToken: hashToken(resetToken),
          resetPasswordExpires: new Date(Date.now() + 10 * 60 * 1000)
        }
      },
      { returnDocument: 'after' }
    );

    if (!verifiedUser) {
      return res.status(400).json({
        success: false,
        message: "The code is invalid or expired. Request a new code."
      });
    }

    setResetCookie(res, resetToken);

    return res.status(200).json({
      success: true,
      message: "Code verified. You can now choose a new password."
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Reset code verification failed",
      "Unable to verify reset code"
    );
  }
};

const resetPassword = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg
    });
  }

  try {
    const { newPassword, confirmPassword } = req.body;

    if (Object.prototype.hasOwnProperty.call(req.body, "token")) {
      return res.status(400).json({
        success: false,
        message: "Reset authorization must be provided by the reset session cookie"
      });
    }

    const token = getResetToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Verify the reset code before choosing a new password"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_POLICY_MESSAGE
      });
    }

    const hashedToken = hashToken(token);
    const user = await User.findOneAndUpdate(
      {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: new Date() }
      },
      {
        $set: {
          resetPasswordToken: "",
          resetPasswordExpires: null,
          resetPasswordOtp: "",
          resetPasswordOtpExpires: null,
          resetPasswordOtpAttempts: 0
        }
      },
      { returnDocument: 'after' }
    );

    if (!user) {
      clearResetCookie(res);
      return res.status(401).json({
        success: false,
        message: "The reset session is invalid or expired. Request a new code."
      });
    }

    clearResetCookie(res);
    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful"
    });
  } catch (error) {
    return sendControllerError(res, error, "Password reset failed", "Password reset failed");
  }
};

module.exports = {
  registerUser,
  loginUser,
  adminLoginUser,
  getCurrentUser,
  logoutUser,
  verifyEmail,
  resendVerification,
  forgotPassword,
  verifyResetOtp,
  resetPassword
};
