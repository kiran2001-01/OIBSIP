const assert = require("node:assert/strict");
const { test } = require("node:test");
const { adminOnly } = require("../middleware/adminMiddleware");

const makeResponse = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

test("denies customer roles and permits admin roles", () => {
  let customerNextCalled = false;
  const customerResponse = makeResponse();
  adminOnly(
    { user: { role: "user" } },
    customerResponse,
    () => {
      customerNextCalled = true;
    }
  );

  let adminNextCalled = false;
  const adminResponse = makeResponse();
  adminOnly(
    { user: { role: "admin" } },
    adminResponse,
    () => {
      adminNextCalled = true;
    }
  );

  assert.equal(customerResponse.statusCode, 403);
  assert.equal(customerNextCalled, false);
  assert.equal(adminResponse.statusCode, 200);
  assert.equal(adminNextCalled, true);
});
