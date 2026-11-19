const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const inventoryService = require("../services/inventoryService");
const paymentService = require("../services/paymentService");

const originalMethods = {
  orderFindById: Order.findById,
  orderFindOneAndUpdate: Order.findOneAndUpdate,
  orderUpdateOne: Order.updateOne,
  refundPayment: paymentService.refundPayment,
  restoreOrderStock: inventoryService.restoreOrderStock,
  withStockTransaction: inventoryService.withStockTransaction
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
const adminControllerPath = require.resolve("../controllers/adminController");
const paymentControllerPath = require.resolve("../controllers/paymentController");
const refundServicePath = require.resolve("../services/refundReconciliationService");

const makeOrder = (overrides = {}) => ({
  _id: orderId,
  user: userId,
  totalAmount: 250,
  paymentStatus: "pending",
  orderStatus: "Pending",
  stockProcessing: false,
  stockDeducted: false,
  razorpayRefundId: "",
  async save() {
    this.saved = true;
  },
  ...overrides
});

const makeRequest = () => ({
  params: { id: orderId.toString() },
  body: { status: "Cancelled" },
  app: { get: () => null }
});

beforeEach(() => {
  delete require.cache[adminControllerPath];
  delete require.cache[paymentControllerPath];
  delete require.cache[refundServicePath];
});

afterEach(() => {
  delete require.cache[adminControllerPath];
  delete require.cache[paymentControllerPath];
  delete require.cache[refundServicePath];
  Order.findById = originalMethods.orderFindById;
  Order.findOneAndUpdate = originalMethods.orderFindOneAndUpdate;
  Order.updateOne = originalMethods.orderUpdateOne;
  paymentService.refundPayment = originalMethods.refundPayment;
  inventoryService.restoreOrderStock = originalMethods.restoreOrderStock;
  inventoryService.withStockTransaction = originalMethods.withStockTransaction;
});

test("does not cancel while payment or inventory processing owns the order", async () => {
  const order = makeOrder({ stockProcessing: true });
  let refundCount = 0;
  let restoreCount = 0;
  Order.findById = async () => order;
  Order.findOneAndUpdate = async () => null;
  paymentService.refundPayment = async () => {
    refundCount += 1;
  };
  inventoryService.restoreOrderStock = async () => {
    restoreCount += 1;
  };

  const { updateOrderStatus } = require("../controllers/adminController");
  const response = makeResponse();
  await updateOrderStatus(makeRequest(), response);

  assert.equal(response.statusCode, 409);
  assert.equal(refundCount, 0);
  assert.equal(restoreCount, 0);
});

test("claims cancellation atomically and allows retrying stock restoration", async () => {
  const order = makeOrder({
    orderStatus: "Cancelled",
    paymentStatus: "refunded",
    razorpayRefundId: "refund_test_1",
    stockDeducted: true
  });
  let claimFilter;
  let restoreCount = 0;
  Order.findById = async () => order;
  Order.findOneAndUpdate = async (filter, update) => {
    if (!claimFilter) {
      claimFilter = filter;
      assert.equal(update.$set.stockProcessing, true);
    }
    Object.assign(order, update.$set);
    return order;
  };
  inventoryService.withStockTransaction = async (operation) => operation({ testSession: true });
  inventoryService.restoreOrderStock = async () => {
    restoreCount += 1;
  };

  const { updateOrderStatus } = require("../controllers/adminController");
  const response = makeResponse();
  await updateOrderStatus(makeRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(claimFilter.orderStatus, "Cancelled");
  assert.equal(claimFilter.stockProcessing.$ne, true);
  assert.equal(restoreCount, 1);
  assert.equal(order.stockDeducted, false);
  assert.equal(order.stockProcessing, false);
  assert.equal(order.orderStatus, "Cancelled");
});
