const assert = require("node:assert/strict");
const { test } = require("node:test");
const User = require("../models/User");

test("user JSON does not expose credentials or reset and verification secrets", () => {
  const user = new User({
    name: "Test User",
    email: "test@example.test",
    phone: "0000000000",
    password: "example-password",
    emailVerificationToken: "verification-hash",
    emailVerificationExpires: new Date(),
    resetPasswordToken: "reset-hash",
    resetPasswordExpires: new Date(),
    resetPasswordOtp: "otp-hash",
    resetPasswordOtpExpires: new Date(),
    resetPasswordOtpAttempts: 2
  });

  const serializedUser = user.toJSON();

  for (const secretField of [
    "password",
    "emailVerificationToken",
    "emailVerificationExpires",
    "resetPasswordToken",
    "resetPasswordExpires",
    "resetPasswordOtp",
    "resetPasswordOtpExpires",
    "resetPasswordOtpAttempts"
  ]) {
    assert.equal(Object.hasOwn(serializedUser, secretField), false);
  }
});
