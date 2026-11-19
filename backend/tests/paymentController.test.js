const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const inventoryService = require("../services/inventoryService");
const paymentService = require("../services/paymentService");

const controllerPath = require.resolve("../controllers/paymentController");
const refundServicePath = require.resolve("../services/refundReconciliationService");
const originalMethods = {
  orderFindOne: Order.findOne,
  orderFindById: Order.findById,
  orderFindOneAndUpdate: Order.findOneAndUpdate,
  orderUpdateOne: Order.updateOne,
  getRazorpayClient: paymentService.getRazorpayClient,
  fetchPayment: paymentService.fetchPayment,
  refundPayment: paymentService.refundPayment,
  fetchRefunds: paymentService.fetchRefunds,
  findOrderByReceipt: paymentService.findOrderByReceipt,
  deductOrderStock: inventoryService.deductOrderStock,
  restoreOrderStock: inventoryService.restoreOrderStock,
  supportsStockTransactions: inventoryService.supportsStockTransactions,
  withStockTransaction: inventoryService.withStockTransaction,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

const userId = new mongoose.Types.ObjectId();
const orderId = new mongoose.Types.ObjectId();
const makeRequest = () => ({
  user: { _id: userId },
  params: { id: orderId.toString(), orderId: orderId.toString() },
  body: { id: orderId.toString(), orderId: orderId.toString() }
});

const paymentOrderId = "razorpay_test_order_1";
const paymentId = "razorpay_test_payment_1";
const webhookSecret = "test_webhook_secret";

const makePaymentOrder = (overrides = {}) => ({
  _id: orderId,
  user: userId,
  totalAmount: 250,
  paymentStatus: "pending",
  orderStatus: "Pending",
  razorpayOrderId: paymentOrderId,
  stockProcessing: false,
  stockDeducted: false,
  async populate() {
    return this;
  },
  async save() {
    this.saved = true;
  },
  ...overrides
});

const makeVerifyRequest = (overrides = {}) => ({
  user: { _id: userId },
  body: {
    orderId: orderId.toString(),
    razorpay_order_id: paymentOrderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: require("node:crypto")
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${paymentOrderId}|${paymentId}`)
      .digest("hex"),
    ...overrides
  }
});

const makeCapturedPayment = (overrides = {}) => ({
  id: paymentId,
  order_id: paymentOrderId,
  amount: 25000,
  currency: "INR",
  status: "captured",
  ...overrides
});

beforeEach(() => {
  delete require.cache[controllerPath];
  delete require.cache[refundServicePath];
  Order.findOne = originalMethods.orderFindOne;
  Order.findById = originalMethods.orderFindById;
  Order.findOneAndUpdate = originalMethods.orderFindOneAndUpdate;
  Order.updateOne = originalMethods.orderUpdateOne;
  process.env.RAZORPAY_KEY_ID = "rzp_test_public_key";
  process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
  paymentService.fetchRefunds = async () => ({ items: [] });
  paymentService.findOrderByReceipt = async () => null;
  inventoryService.supportsStockTransactions = () => true;
  inventoryService.withStockTransaction = async (operation) => operation({ testSession: true });
});

afterEach(() => {
  delete require.cache[controllerPath];
  delete require.cache[refundServicePath];
  Order.findOne = originalMethods.orderFindOne;
  Order.findById = originalMethods.orderFindById;
  Order.findOneAndUpdate = originalMethods.orderFindOneAndUpdate;
  Order.updateOne = originalMethods.orderUpdateOne;
  paymentService.getRazorpayClient = originalMethods.getRazorpayClient;
  paymentService.fetchPayment = originalMethods.fetchPayment;
  paymentService.refundPayment = originalMethods.refundPayment;
  paymentService.fetchRefunds = originalMethods.fetchRefunds;
  paymentService.findOrderByReceipt = originalMethods.findOrderByReceipt;
  inventoryService.deductOrderStock = originalMethods.deductOrderStock;
  inventoryService.restoreOrderStock = originalMethods.restoreOrderStock;
  inventoryService.supportsStockTransactions = originalMethods.supportsStockTransactions;
  inventoryService.withStockTransaction = originalMethods.withStockTransaction;
  if (originalMethods.razorpayKeyId === undefined) {
    delete process.env.RAZORPAY_KEY_ID;
  } else {
    process.env.RAZORPAY_KEY_ID = originalMethods.razorpayKeyId;
  }
  if (originalMethods.razorpayKeySecret === undefined) {
    delete process.env.RAZORPAY_KEY_SECRET;
  } else {
    process.env.RAZORPAY_KEY_SECRET = originalMethods.razorpayKeySecret;
  }
});

test("creates one Razorpay order under an atomic per-order claim", async () => {
  const order = {
    _id: orderId,
    user: userId,
    totalAmount: 250,
    paymentStatus: "pending",
    orderStatus: "Pending",
    razorpayOrderId: ""
  };
  let claimFilter;
  let claimUpdate;
  let providerCalls = 0;
  let providerOptions;
  Order.findOne = async () => order;
  Order.findOneAndUpdate = async (filter, update) => {
    claimFilter = filter;
    claimUpdate = update;
    return {
      ...order,
      async save() {
        this.persisted = true;
      }
    };
  };
  paymentService.getRazorpayClient = () => ({
    client: {
      orders: {
        create: async (options) => {
          providerCalls += 1;
          providerOptions = options;
          return { id: "razorpay_test_order_1" };
        }
      }
    },
    keyId: "rzp_test_public_key"
  });
  const { createPaymentOrder } = require("../controllers/paymentController");
  const response = makeResponse();

  await createPaymentOrder(makeRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(providerCalls, 1);
  assert.equal(providerOptions.amount, 25000);
  assert.equal(providerOptions.currency, "INR");
  assert.equal(providerOptions.receipt, orderId.toString());
  assert.equal(claimFilter.razorpayOrderId.$in.includes(""), true);
  assert.equal(claimFilter.paymentStatus, "pending");
  assert.ok(claimUpdate.$set.razorpayOrderCreatingUntil instanceof Date);
  const responseBody = JSON.stringify(response.body);
  assert.ok(responseBody.includes("razorpay_test_order_1"));
  assert.ok(responseBody.includes("rzp_test_public_key"));
  assert.equal(responseBody.includes("key_secret"), false);
});

test("does not start checkout when MongoDB cannot provide payment transactions", async () => {
  let orderLookupCount = 0;
  Order.findOne = async () => {
    orderLookupCount += 1;
    return null;
  };
  inventoryService.supportsStockTransactions = () => false;
  paymentService.getRazorpayClient = () => ({
    keyId: "rzp_test_public_key",
    client: { orders: { create: async () => ({ id: "unused" }) } }
  });

  const { createPaymentOrder } = require("../controllers/paymentController");
  const response = makeResponse();
  await createPaymentOrder(makeRequest(), response);

  assert.equal(response.statusCode, 503);
  assert.equal(orderLookupCount, 0);
});

test("does not create another Razorpay order while a claim is active", async () => {
  const order = {
    _id: orderId,
    user: userId,
    totalAmount: 250,
    paymentStatus: "pending",
    orderStatus: "Pending",
    razorpayOrderId: ""
  };
  let providerCalls = 0;
  Order.findOne = async () => order;
  Order.findOneAndUpdate = async () => null;
  paymentService.getRazorpayClient = () => ({
    client: {
      orders: {
        create: async () => {
          providerCalls += 1;
          return { id: "unexpected_duplicate" };
        }
      }
    },
    keyId: "rzp_test_public_key"
  });
  const { createPaymentOrder } = require("../controllers/paymentController");
  const response = makeResponse();

  await createPaymentOrder(makeRequest(), response);

  assert.equal(response.statusCode, 409);
  assert.equal(providerCalls, 0);
});

test("retries a failed payment using the existing Razorpay order", async () => {
  const order = makePaymentOrder({
    paymentStatus: "failed",
    razorpayPaymentId: paymentId
  });
  let resetFilter;
  let providerCalls = 0;
  Order.findOne = async () => order;
  Order.findOneAndUpdate = async (filter) => {
    resetFilter = filter;
    order.paymentStatus = "pending";
    return order;
  };
  paymentService.getRazorpayClient = () => ({
    keyId: "rzp_test_public_key",
    client: {
      orders: {
        create: async () => {
          providerCalls += 1;
          return { id: "unexpected_duplicate_order" };
        }
      }
    }
  });
  const { createPaymentOrder } = require("../controllers/paymentController");
  const response = makeResponse();

  await createPaymentOrder(makeRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(resetFilter.paymentStatus, "failed");
  assert.equal(order.paymentStatus, "pending");
  assert.equal(response.body.data.razorpayOrderId, paymentOrderId);
  assert.equal(providerCalls, 0);
});

test("fulfills only a captured payment matching the server order amount and currency", async () => {
  const order = makePaymentOrder();
  let fetchedPaymentId;
  let claimedFilter;
  let stockDeductionCount = 0;
  Order.findOne = async (filter) => {
    assert.equal(filter._id, orderId.toString());
    assert.equal(filter.user, userId);
    return order;
  };
  Order.findOneAndUpdate = async (filter, update) => {
    if (!claimedFilter) claimedFilter = filter;
    Object.assign(order, update.$set);
    return order;
  };
  paymentService.getRazorpayClient = () => ({});
  paymentService.fetchPayment = async (id) => {
    fetchedPaymentId = id;
    return makeCapturedPayment();
  };
  inventoryService.deductOrderStock = async () => {
    stockDeductionCount += 1;
  };
  const { verifyPayment } = require("../controllers/paymentController");
  const response = makeResponse();

  await verifyPayment(makeVerifyRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(fetchedPaymentId, paymentId);
  assert.equal(stockDeductionCount, 1);
  assert.equal(claimedFilter.razorpayOrderId, paymentOrderId);
  assert.equal(order.paymentStatus, "paid");
  assert.equal(order.orderStatus, "Confirmed");
  assert.equal(order.razorpayPaymentId, paymentId);
});

test("recovers an orphaned provider order after local persistence fails", async () => {
  const order = {
    _id: orderId,
    user: userId,
    totalAmount: 250,
    paymentStatus: "pending",
    orderStatus: "Pending",
    razorpayOrderId: ""
  };
  let lookupCount = 0;
  let saveCount = 0;
  let createdCount = 0;
  Order.findOne = async () => order;
  Order.findOneAndUpdate = async (filter, update) => {
    const claimedOrder = { ...order, ...update.$set };
    claimedOrder.save = async () => {
      saveCount += 1;
      if (saveCount === 1) throw new Error("Simulated database persistence failure");
    };
    return claimedOrder;
  };
  paymentService.findOrderByReceipt = async (receipt) => {
    assert.equal(receipt, orderId.toString());
    lookupCount += 1;
    return lookupCount === 1
      ? null
      : {
        id: "razorpay_recovered_order",
        receipt,
        amount: 25000,
        currency: "INR"
      };
  };
  Order.updateOne = async () => ({ matchedCount: 1 });
  paymentService.getRazorpayClient = () => ({
    keyId: "rzp_test_public_key",
    client: {
      orders: {
        create: async () => {
          createdCount += 1;
          throw new Error("An existing provider order should be reused");
        }
      }
    }
  });

  const { createPaymentOrder } = require("../controllers/paymentController");
  const firstResponse = makeResponse();
  await createPaymentOrder(makeRequest(), firstResponse);
  const retryResponse = makeResponse();
  await createPaymentOrder(makeRequest(), retryResponse);

  assert.equal(firstResponse.statusCode, 502);
  assert.equal(retryResponse.statusCode, 200);
  assert.equal(createdCount, 1);
  assert.equal(retryResponse.body.data.razorpayOrderId, "razorpay_recovered_order");
});

test("rejects invalid signatures before fetching payment details", async () => {
  const order = makePaymentOrder();
  let fetchCount = 0;
  let claimCount = 0;
  Order.findOne = async () => order;
  Order.findOneAndUpdate = async () => {
    claimCount += 1;
    return order;
  };
  paymentService.getRazorpayClient = () => ({});
  paymentService.fetchPayment = async () => {
    fetchCount += 1;
    return makeCapturedPayment();
  };
  const { verifyPayment } = require("../controllers/paymentController");
  const response = makeResponse();

  await verifyPayment(makeVerifyRequest({ razorpay_signature: "invalid" }), response);

  assert.equal(response.statusCode, 400);
  assert.equal(fetchCount, 0);
  assert.equal(claimCount, 0);
  assert.equal(order.paymentStatus, "pending");
});

test("rejects uncaptured and amount-mismatched payments without deducting stock", async () => {
  for (const payment of [
    makeCapturedPayment({ status: "authorized" }),
    makeCapturedPayment({ amount: 24999 }),
    makeCapturedPayment({ currency: "USD" }),
    makeCapturedPayment({ order_id: "razorpay_test_order_other" })
  ]) {
    const order = makePaymentOrder();
    let claimCount = 0;
    Order.findOne = async () => order;
    Order.findOneAndUpdate = async () => {
      claimCount += 1;
      return order;
    };
    paymentService.getRazorpayClient = () => ({});
    paymentService.fetchPayment = async () => payment;
    const { verifyPayment } = require("../controllers/paymentController");
    const response = makeResponse();

    await verifyPayment(makeVerifyRequest(), response);

    assert.equal(response.statusCode, 400);
    assert.equal(claimCount, 0);
    assert.equal(order.paymentStatus, "pending");
  }
});

test("keeps duplicate verification idempotent and requires a valid signature for replays", async () => {
  const order = makePaymentOrder({
    paymentStatus: "paid",
    orderStatus: "Confirmed",
    razorpayPaymentId: paymentId
  });
  let fetchCount = 0;
  let deductionCount = 0;
  Order.findOne = async () => order;
  paymentService.getRazorpayClient = () => ({});
  paymentService.fetchPayment = async () => {
    fetchCount += 1;
    return makeCapturedPayment();
  };
  inventoryService.deductOrderStock = async () => {
    deductionCount += 1;
  };
  const { verifyPayment } = require("../controllers/paymentController");
  const replayResponse = makeResponse();

  await verifyPayment(makeVerifyRequest(), replayResponse);

  const invalidReplayResponse = makeResponse();
  await verifyPayment(makeVerifyRequest({ razorpay_signature: "0".repeat(64) }), invalidReplayResponse);

  assert.equal(replayResponse.statusCode, 200);
  assert.equal(invalidReplayResponse.statusCode, 400);
  assert.equal(fetchCount, 0);
  assert.equal(deductionCount, 0);
});

test("does not expose another customer's order to payment verification", async () => {
  let query;
  Order.findOne = async (filter) => {
    query = filter;
    return null;
  };
  paymentService.getRazorpayClient = () => ({});
  const { verifyPayment } = require("../controllers/paymentController");
  const response = makeResponse();

  await verifyPayment(makeVerifyRequest(), response);

  assert.equal(response.statusCode, 404);
  assert.equal(query._id, orderId.toString());
  assert.equal(query.user, userId);
});

test("refunds a captured payment for an order that was cancelled before payment", async () => {
  const order = makePaymentOrder({ orderStatus: "Cancelled" });
  let stockDeductionCount = 0;
  paymentService.getRazorpayClient = () => ({});
  paymentService.fetchPayment = async () => makeCapturedPayment();
  paymentService.refundPayment = async (id, amount) => {
    assert.equal(id, paymentId);
    assert.equal(amount, 250);
    return { id: "razorpay_test_refund_1", status: "processed" };
  };
  Order.findOne = async () => order;
  Order.findOneAndUpdate = async (filter, update) => {
    Object.assign(order, update.$set);
    return order;
  };
  inventoryService.deductOrderStock = async () => {
    stockDeductionCount += 1;
  };
  const { verifyPayment } = require("../controllers/paymentController");
  const response = makeResponse();

  await verifyPayment(makeVerifyRequest(), response);

  assert.equal(response.statusCode, 409);
  assert.equal(order.paymentStatus, "refunded");
  assert.equal(order.orderStatus, "Cancelled");
  assert.equal(order.razorpayRefundId, "razorpay_test_refund_1");
  assert.equal(stockDeductionCount, 0);
});
