const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const inventoryService = require("../services/inventoryService");
const paymentService = require("../services/paymentService");

const controllerPath = require.resolve("../controllers/paymentController");
const refundServicePath = require.resolve("../services/refundReconciliationService");
const originalMethods = {
  orderFind: Order.find,
  orderFindOneAndUpdate: Order.findOneAndUpdate,
  orderUpdateOne: Order.updateOne,
  orderFindById: Order.findById,
  withStockTransaction: inventoryService.withStockTransaction,
  deductOrderStock: inventoryService.deductOrderStock,
  restoreOrderStock: inventoryService.restoreOrderStock,
  fetchPayment: paymentService.fetchPayment,
  fetchRefunds: paymentService.fetchRefunds,
  refundPayment: paymentService.refundPayment,
  findOrderByReceipt: paymentService.findOrderByReceipt,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET
};

const orderId = new mongoose.Types.ObjectId();
const paymentOrderId = "razorpay_test_order_1";
const paymentId = "razorpay_test_payment_1";
const oldLease = new Date("2026-01-01T00:00:00.000Z");
const now = new Date("2026-01-01T00:10:00.000Z");

let orders;
let stock;
let deductionCalls;
let restorationCalls;
let refundCalls;

const makeOrder = (overrides = {}) => ({
  _id: orderId,
  totalAmount: 250,
  paymentStatus: "pending",
  orderStatus: "Pending",
  razorpayOrderId: paymentOrderId,
  razorpayPaymentId: paymentId,
  razorpayRefundId: "",
  refundAttempts: [],
  stockProcessing: true,
  stockProcessingStartedAt: oldLease,
  stockProcessingAction: "fulfillment",
  stockProcessingToken: "expired-token",
  stockDeducted: false,
  stockUsage: [],
  items: [],
  async populate() {
    return this;
  },
  ...overrides
});

const sameId = (left, right) => String(left) === String(right);

const matchesFilter = (order, filter) => {
  if (filter._id && !sameId(order._id, filter._id)) return false;
  if (filter.stockProcessing !== undefined) {
    if (typeof filter.stockProcessing === "object") {
      if (filter.stockProcessing.$ne === true && order.stockProcessing === true) return false;
    } else if (order.stockProcessing !== filter.stockProcessing) {
      return false;
    }
  }
  if (filter.stockProcessingToken !== undefined &&
      order.stockProcessingToken !== filter.stockProcessingToken) return false;
  if (filter.stockProcessingStartedAt?.$lte &&
      order.stockProcessingStartedAt > filter.stockProcessingStartedAt.$lte) return false;
  if (filter.paymentStatus && Array.isArray(filter.paymentStatus.$in)) {
    if (!filter.paymentStatus.$in.includes(order.paymentStatus)) return false;
  } else if (filter.paymentStatus && order.paymentStatus !== filter.paymentStatus) {
    return false;
  }
  return true;
};

const installOrderStore = () => {
  Order.find = (filter) => ({
    sort() {
      return this;
    },
    limit: async () => [...orders.values()].filter((order) => matchesFilter(order, filter))
  });
  Order.findById = async (id) => orders.get(String(id)) || null;
  Order.findOneAndUpdate = async (filter, update) => {
    const order = orders.get(String(filter._id));
    if (!order || !matchesFilter(order, filter)) return null;
    Object.assign(order, update.$set);
    return order;
  };
  Order.updateOne = async (filter, update) => {
    const order = orders.get(String(filter._id));
    if (!order || !matchesFilter(order, filter)) return { matchedCount: 0 };
    Object.assign(order, update.$set);
    return { matchedCount: 1 };
  };
};

const installTransactionalStock = () => {
  inventoryService.withStockTransaction = async (operation, required) => {
    assert.equal(required, true);
    const previousStock = stock;
    try {
      return await operation({ isolatedTransaction: true });
    } catch (error) {
      stock = previousStock;
      throw error;
    }
  };
  inventoryService.deductOrderStock = async (order, session) => {
    assert.equal(session.isolatedTransaction, true);
    deductionCalls += 1;
    stock -= 1;
    order.stockUsage = [{ kind: "pizza", item: new mongoose.Types.ObjectId(), amount: 1 }];
  };
  inventoryService.restoreOrderStock = async (order, session) => {
    assert.equal(session.isolatedTransaction, true);
    restorationCalls += 1;
    stock += 1;
    if (restorationCalls === 1 && order.failFirstRestore) {
      throw new Error("Simulated crash during restore");
    }
  };
};

const makeCapturedPayment = () => ({
  id: paymentId,
  order_id: paymentOrderId,
  amount: 25000,
  currency: "INR",
  status: "captured"
});

beforeEach(() => {
  delete require.cache[controllerPath];
  delete require.cache[refundServicePath];
  process.env.RAZORPAY_KEY_ID = "rzp_test_public_key";
  process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
  orders = new Map();
  stock = 10;
  deductionCalls = 0;
  restorationCalls = 0;
  refundCalls = 0;
  installOrderStore();
  installTransactionalStock();
  paymentService.fetchPayment = async () => makeCapturedPayment();
  paymentService.fetchRefunds = async () => ({ items: [] });
  paymentService.refundPayment = async (id, amount, options) => {
    refundCalls += 1;
    assert.equal(id, paymentId);
    assert.equal(amount, 250);
    assert.ok(options.receipt);
    return { id: `refund_test_${refundCalls}`, receipt: options.receipt, status: "pending" };
  };
  paymentService.findOrderByReceipt = async () => null;
});

afterEach(() => {
  delete require.cache[controllerPath];
  delete require.cache[refundServicePath];
  Order.find = originalMethods.orderFind;
  Order.findOneAndUpdate = originalMethods.orderFindOneAndUpdate;
  Order.updateOne = originalMethods.orderUpdateOne;
  Order.findById = originalMethods.orderFindById;
  inventoryService.withStockTransaction = originalMethods.withStockTransaction;
  inventoryService.deductOrderStock = originalMethods.deductOrderStock;
  inventoryService.restoreOrderStock = originalMethods.restoreOrderStock;
  paymentService.fetchPayment = originalMethods.fetchPayment;
  paymentService.fetchRefunds = originalMethods.fetchRefunds;
  paymentService.refundPayment = originalMethods.refundPayment;
  paymentService.findOrderByReceipt = originalMethods.findOrderByReceipt;
  if (originalMethods.razorpayKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
  else process.env.RAZORPAY_KEY_ID = originalMethods.razorpayKeyId;
  if (originalMethods.razorpayKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
  else process.env.RAZORPAY_KEY_SECRET = originalMethods.razorpayKeySecret;
});

test("recovers a captured payment after a process crash without charging stock twice", async () => {
  const order = makeOrder();
  orders.set(String(order._id), order);
  const { recoverExpiredProcessing } = require("../controllers/paymentController");

  await recoverExpiredProcessing(now);

  assert.equal(order.paymentStatus, "paid");
  assert.equal(order.orderStatus, "Confirmed");
  assert.equal(order.stockDeducted, true);
  assert.equal(order.stockProcessing, false);
  assert.equal(stock, 9);
  assert.equal(deductionCalls, 1);
});

test("does not deduct stock again when recovering an already-deducted order", async () => {
  const stockUsage = [{
    kind: "pizza",
    item: new mongoose.Types.ObjectId(),
    amount: 1
  }];
  const order = makeOrder({
    stockDeducted: true,
    stockUsage
  });
  orders.set(String(order._id), order);
  const { recoverExpiredProcessing } = require("../controllers/paymentController");

  await recoverExpiredProcessing(now);

  assert.equal(order.paymentStatus, "paid");
  assert.equal(order.orderStatus, "Confirmed");
  assert.equal(order.stockDeducted, true);
  assert.deepEqual(order.stockUsage, stockUsage);
  assert.equal(stock, 10);
  assert.equal(deductionCalls, 0);
});

test("does not recover a lease before its expiration", async () => {
  const order = makeOrder({
    stockProcessingStartedAt: new Date(now.getTime() - 10_000)
  });
  orders.set(String(order._id), order);
  const { recoverExpiredProcessing } = require("../controllers/paymentController");

  await recoverExpiredProcessing(now);

  assert.equal(order.stockProcessingToken, "expired-token");
  assert.equal(deductionCalls, 0);
});

test("never fulfills a recovered order when Razorpay does not report capture", async () => {
  const order = makeOrder();
  orders.set(String(order._id), order);
  paymentService.fetchPayment = async () => ({
    ...makeCapturedPayment(),
    status: "authorized"
  });
  const { recoverExpiredProcessing } = require("../controllers/paymentController");

  await recoverExpiredProcessing(now);

  assert.equal(order.paymentStatus, "pending");
  assert.equal(order.orderStatus, "Pending");
  assert.equal(order.stockDeducted, false);
  assert.equal(order.stockProcessing, false);
  assert.equal(stock, 10);
  assert.equal(deductionCalls, 0);
});

test("allows only one concurrent recovery claimant", async () => {
  const order = makeOrder();
  orders.set(String(order._id), order);
  const { recoverExpiredProcessing } = require("../controllers/paymentController");

  await Promise.all([
    recoverExpiredProcessing(now),
    recoverExpiredProcessing(now)
  ]);

  assert.equal(deductionCalls, 1);
  assert.equal(stock, 9);
  assert.equal(order.paymentStatus, "paid");
});

test("retries a crashed inventory restoration through an atomic transaction", async () => {
  const order = makeOrder({
    paymentStatus: "refunded",
    orderStatus: "Cancelled",
    stockProcessingAction: "cancellation",
    stockDeducted: true,
    stockUsage: [{ kind: "pizza", item: new mongoose.Types.ObjectId(), amount: 1 }],
    failFirstRestore: true
  });
  orders.set(String(order._id), order);
  const { recoverExpiredProcessing } = require("../controllers/paymentController");

  await recoverExpiredProcessing(now);
  assert.equal(stock, 10);
  assert.equal(order.stockProcessing, true);
  assert.equal(order.stockDeducted, true);

  await recoverExpiredProcessing(new Date(now.getTime() + 3 * 60 * 1000));

  assert.equal(stock, 11);
  assert.equal(order.stockDeducted, false);
  assert.equal(order.stockProcessing, false);
  assert.equal(order.orderStatus, "Cancelled");
  assert.equal(restorationCalls, 2);
});

test("does not resubmit a legacy pending refund with an unknown outcome", async () => {
  const order = makeOrder({
    stockProcessing: false,
    stockProcessingStartedAt: null,
    stockProcessingAction: null,
    stockProcessingToken: "",
    paymentStatus: "refund_pending",
    orderStatus: "Cancelled"
  });
  orders.set(String(order._id), order);
  const { recoverExpiredProcessing } = require("../controllers/paymentController");

  await recoverExpiredProcessing(now);
  await recoverExpiredProcessing(new Date(now.getTime() + 30_000));

  assert.equal(refundCalls, 0);
  assert.equal(order.paymentStatus, "refund_pending");
  assert.equal(order.refundAttempts.length, 0);
});

test("reconciles delayed refunds without creating duplicates", async () => {
  const order = makeOrder({
    stockProcessing: false,
    stockProcessingStartedAt: null,
    stockProcessingAction: null,
    stockProcessingToken: "",
    paymentStatus: "refund_pending",
    orderStatus: "Cancelled",
    refundAttempts: [{
      receipt: `pz-${orderId.toString()}-1`,
      refundId: "refund_test_1",
      status: "pending",
      requestedAt: now
    }]
  });
  orders.set(String(order._id), order);
  let fetchedStatus = "pending";
  paymentService.fetchRefunds = async () => ({
    items: [{
      id: "refund_test_1",
      receipt: order.refundAttempts[0].receipt,
      status: fetchedStatus
    }]
  });
  const { recoverExpiredProcessing } = require("../controllers/paymentController");

  await recoverExpiredProcessing(now);
  fetchedStatus = "processed";
  await recoverExpiredProcessing(new Date(now.getTime() + 30_000));

  assert.equal(refundCalls, 0);
  assert.equal(order.paymentStatus, "refunded");
  assert.equal(order.razorpayRefundStatus, "processed");
});

test("reconciles a legacy refund ID instead of issuing another refund", async () => {
  const order = makeOrder({
    stockProcessing: false,
    stockProcessingStartedAt: null,
    stockProcessingAction: null,
    stockProcessingToken: "",
    paymentStatus: "refund_pending",
    orderStatus: "Cancelled",
    razorpayRefundId: "refund_legacy_1"
  });
  orders.set(String(order._id), order);
  paymentService.fetchRefunds = async () => ({
    items: [{
      id: "refund_legacy_1",
      amount: 25000,
      status: "processed",
      created_at: 1760000000
    }]
  });
  const { recoverExpiredProcessing } = require("../controllers/paymentController");

  await recoverExpiredProcessing(now);

  assert.equal(order.paymentStatus, "refunded");
  assert.equal(order.razorpayRefundId, "refund_legacy_1");
  assert.equal(order.refundAttempts.length, 1);
  assert.equal(refundCalls, 0);
});

test("retries only confirmed failed refunds and records the terminal failure", async () => {
  const order = makeOrder({
    stockProcessing: false,
    stockProcessingStartedAt: null,
    stockProcessingAction: null,
    stockProcessingToken: "",
    paymentStatus: "refund_pending",
    orderStatus: "Cancelled",
    refundAttempts: [{
      receipt: `pz-${orderId.toString()}-1`,
      refundId: "refund_test_failed",
      status: "failed",
      requestedAt: now
    }]
  });
  orders.set(String(order._id), order);
  paymentService.refundPayment = async (id, amount, options) => {
    refundCalls += 1;
    return {
      id: `refund_test_${refundCalls}`,
      receipt: options.receipt,
      status: "failed"
    };
  };
  const { recoverExpiredProcessing } = require("../controllers/paymentController");

  await recoverExpiredProcessing(now);
  await recoverExpiredProcessing(new Date(now.getTime() + 30_000));
  await recoverExpiredProcessing(new Date(now.getTime() + 60_000));

  assert.equal(refundCalls, 2);
  assert.equal(order.refundAttempts.length, 3);
  assert.equal(order.paymentStatus, "refund_failed");
  assert.equal(order.razorpayRefundStatus, "failed");
});
