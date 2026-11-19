const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const User = require("../models/User");
const { adminLoginUser } = require("../controllers/authController");
const { AUTH_COOKIE_NAME } = require("../utils/authCookie");

const originalFindOne = User.findOne;
const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  cookies: [],
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
  }
});

beforeEach(() => {
  process.env.JWT_SECRET = "admin-login-test-secret-long-enough-for-signing";
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  User.findOne = originalFindOne;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test("rejects a valid customer login at the admin endpoint", async () => {
  let queriedEmail;
  User.findOne = async ({ email }) => {
    queriedEmail = email;
    return {
      role: "user",
      emailVerified: true,
      matchPassword: async () => true
    };
  };
  const response = makeResponse();

  await adminLoginUser({
    body: { email: " Customer@Example.Test ", password: "correct-password" },
    headers: {}
  }, response);

  assert.equal(queriedEmail, "customer@example.test");
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    success: false,
    message: "Access denied. Admin credentials required."
  });
  assert.equal(response.cookies.length, 0);
});

test("sets the secure auth cookie after an admin authenticates", async () => {
  User.findOne = async () => ({
    _id: "admin-1",
    email: "admin@example.test",
    role: "admin",
    emailVerified: true,
    matchPassword: async () => true,
    toJSON: () => ({ _id: "admin-1", email: "admin@example.test", role: "admin" })
  });
  const response = makeResponse();

  await adminLoginUser({
    body: { email: "admin@example.test", password: "correct-password" },
    headers: {}
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.user.role, "admin");
  assert.equal(response.cookies.length, 1);
  assert.equal(response.cookies[0].name, AUTH_COOKIE_NAME);
  assert.equal(response.cookies[0].options.httpOnly, true);
});
