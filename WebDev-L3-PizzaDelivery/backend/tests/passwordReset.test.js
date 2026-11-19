const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { afterEach, beforeEach, test } = require("node:test");
const User = require("../models/User");
const { verifyResetOtp, resetPassword } = require("../controllers/authController");
const { RESET_COOKIE_NAME } = require("../utils/authCookie");

const originalMethods = {
  findOne: User.findOne,
  findOneAndUpdate: User.findOneAndUpdate,
  updateOne: User.updateOne
};
const originalEnvironment = {
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV
};

const hashOtp = (otp) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(otp).digest("hex");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const makeResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    cookies: [],
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    }
  };
  return response;
};

beforeEach(() => {
  process.env.JWT_SECRET = "password-reset-test-secret-that-is-long-enough";
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  User.findOne = originalMethods.findOne;
  User.findOneAndUpdate = originalMethods.findOneAndUpdate;
  User.updateOne = originalMethods.updateOne;

  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("valid OTP creates an HttpOnly reset cookie without returning its token", async () => {
  const user = {
    _id: "user-1",
    resetPasswordOtp: hashOtp("123456"),
    resetPasswordOtpExpires: new Date(Date.now() + 60_000),
    resetPasswordOtpAttempts: 0
  };
  User.findOne = async () => user;
  User.findOneAndUpdate = async () => user;
  const response = makeResponse();

  await verifyResetOtp(
    { body: { email: "person@example.test", otp: "123456" }, headers: {} },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data, undefined);
  assert.equal(JSON.stringify(response.body).includes("resetToken"), false);
  assert.equal(response.cookies.length, 1);
  assert.equal(response.cookies[0].name, RESET_COOKIE_NAME);
  assert.equal(response.cookies[0].options.httpOnly, true);
  assert.equal(response.cookies[0].options.path, "/api/auth/reset-password");
  assert.equal(response.cookies[0].options.maxAge, 10 * 60 * 1000);
});

test("expired OTP is rejected and an incorrect OTP increments the attempt count", async () => {
  const expiredUser = {
    _id: "user-expired",
    resetPasswordOtp: hashOtp("123456"),
    resetPasswordOtpExpires: new Date(Date.now() - 1),
    resetPasswordOtpAttempts: 0
  };
  User.findOne = async () => expiredUser;
  const expiredResponse = makeResponse();

  await verifyResetOtp(
    { body: { email: "person@example.test", otp: "123456" }, headers: {} },
    expiredResponse
  );

  assert.equal(expiredResponse.statusCode, 400);
  assert.match(expiredResponse.body.message, /expired/i);

  const activeUser = {
    ...expiredUser,
    resetPasswordOtpExpires: new Date(Date.now() + 60_000)
  };
  let incrementedAttempts = false;
  User.findOne = async () => activeUser;
  User.updateOne = async (_filter, update) => {
    incrementedAttempts = update.$inc.resetPasswordOtpAttempts === 1;
  };
  const invalidResponse = makeResponse();

  await verifyResetOtp(
    { body: { email: "person@example.test", otp: "000000" }, headers: {} },
    invalidResponse
  );

  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(incrementedAttempts, true);

  activeUser.resetPasswordOtpAttempts = 5;
  const lockedResponse = makeResponse();
  await verifyResetOtp(
    { body: { email: "person@example.test", otp: "123456" }, headers: {} },
    lockedResponse
  );
  assert.equal(lockedResponse.statusCode, 429);
  assert.match(lockedResponse.body.message, /too many/i);
});

test("reset requires the cookie and consumes a valid reset session once", async () => {
  const rawToken = "one-time-reset-token";
  const headers = { cookie: `${RESET_COOKIE_NAME}=${rawToken}` };
  const user = {
    password: "old-hash",
    saveCount: 0,
    async save() {
      this.saveCount += 1;
    }
  };
  let findAndUpdateCount = 0;
  User.findOneAndUpdate = async (filter, update) => {
    findAndUpdateCount += 1;
    assert.equal(filter.resetPasswordToken, hashToken(rawToken));
    assert.ok(filter.resetPasswordExpires.$gt instanceof Date);
    assert.equal(update.$set.resetPasswordToken, "");
    return findAndUpdateCount === 1 ? user : null;
  };

  const missingCookieResponse = makeResponse();
  await resetPassword(
    {
      body: { newPassword: "StrongPass1", confirmPassword: "StrongPass1" },
      headers: {}
    },
    missingCookieResponse
  );
  assert.equal(missingCookieResponse.statusCode, 401);
  assert.equal(findAndUpdateCount, 0);

  const successResponse = makeResponse();
  await resetPassword(
    {
      body: { newPassword: "StrongPass1", confirmPassword: "StrongPass1" },
      headers
    },
    successResponse
  );
  assert.equal(successResponse.statusCode, 200);
  assert.equal(user.password, "StrongPass1");
  assert.equal(user.saveCount, 1);
  assert.equal(successResponse.clearedCookies[0].name, RESET_COOKIE_NAME);

  const reusedResponse = makeResponse();
  await resetPassword(
    {
      body: { newPassword: "AnotherPass2", confirmPassword: "AnotherPass2" },
      headers
    },
    reusedResponse
  );
  assert.equal(reusedResponse.statusCode, 401);
  assert.equal(user.password, "StrongPass1");
  assert.equal(user.saveCount, 1);
});

test("reset rejects a token supplied in the request body", async () => {
  const response = makeResponse();

  await resetPassword(
    {
      body: {
        token: "body-token",
        newPassword: "StrongPass1",
        confirmPassword: "StrongPass1"
      },
      headers: {}
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /cookie/i);
});

test("invalid or expired reset cookie is rejected and cleared", async () => {
  User.findOneAndUpdate = async (filter) => {
    assert.ok(filter.resetPasswordExpires.$gt instanceof Date);
    return null;
  };
  const response = makeResponse();

  await resetPassword(
    {
      body: { newPassword: "StrongPass1", confirmPassword: "StrongPass1" },
      headers: { cookie: `${RESET_COOKIE_NAME}=expired-token` }
    },
    response
  );

  assert.equal(response.statusCode, 401);
  assert.match(response.body.message, /invalid or expired/i);
  assert.equal(response.clearedCookies[0].name, RESET_COOKIE_NAME);
});
