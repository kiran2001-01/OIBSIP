const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { getRazorpayClient } = require("../services/paymentService");

const originalKeyId = process.env.RAZORPAY_KEY_ID;
const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;

afterEach(() => {
  if (originalKeyId === undefined) {
    delete process.env.RAZORPAY_KEY_ID;
  } else {
    process.env.RAZORPAY_KEY_ID = originalKeyId;
  }
  if (originalKeySecret === undefined) {
    delete process.env.RAZORPAY_KEY_SECRET;
  } else {
    process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
  }
});

test("refuses to initialize the client with a live-mode key ID", () => {
  process.env.RAZORPAY_KEY_ID = "rzp_live_test_value";
  process.env.RAZORPAY_KEY_SECRET = "test_secret_value";

  assert.equal(getRazorpayClient(), null);
});

test("initializes the client only when test-mode credentials are present", () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_public_value";
  process.env.RAZORPAY_KEY_SECRET = "test_secret_value";

  const razorpay = getRazorpayClient();

  assert.equal(razorpay.keyId, "rzp_test_public_value");
  assert.equal(typeof razorpay.client.payments.fetch, "function");
});
