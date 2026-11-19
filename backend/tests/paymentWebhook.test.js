const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { afterEach, beforeEach, test } = require("node:test");
const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const RazorpayWebhookEvent = require("../models/RazorpayWebhookEvent");
const inventoryService = require("../services/inventoryService");

const webhookSecret = "test_webhook_secret";
const controllerPath = require.resolve("../controllers/paymentController");
const refundServicePath = require.resolve("../services/refundReconciliationService");
const webhookRoutePath = require.resolve("../routes/paymentWebhookRoutes");
const eventRecords = new Map();
const originalMethods = {
  orderFindOne: Order.findOne,
  orderFindOneAndUpdate: Order.findOneAndUpdate,
  orderFindById: Order.findById,
  orderUpdateOne: Order.updateOne,
  eventCreate: RazorpayWebhookEvent.create,
  eventFindOne: RazorpayWebhookEvent.findOne,
  eventFindOneAndUpdate: RazorpayWebhookEvent.findOneAndUpdate,
  eventUpdateOne: RazorpayWebhookEvent.updateOne,
  eventDeleteOne: RazorpayWebhookEvent.deleteOne,
  deductOrderStock: inventoryService.deductOrderStock,
  withStockTransaction: inventoryService.withStockTransaction,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
};

const makeOrder = () => ({
  _id: new mongoose.Types.ObjectId(),
  totalAmount: 250,
  paymentStatus: "pending",
  orderStatus: "Pending",
  razorpayOrderId: "razorpay_test_order_1",
  stockProcessing: false,
  stockDeducted: false,
  async populate() {
    return this;
  },
  async save() {
    this.saved = true;
  }
});

const makeEvent = (overrides = {}) => ({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "razorpay_test_payment_1",
        order_id: "razorpay_test_order_1",
        amount: 25000,
        currency: "INR",
        status: "captured"
      }
    }
  },
  ...overrides
});

const createEventRecord = (record) => ({
  _id: new mongoose.Types.ObjectId(),
  ...record
});

const makeRequest = (body, eventId = "event_test_1", signatureOverride) => ({
  body,
  get(name) {
    const header = name.toLowerCase();
    if (header === "x-razorpay-event-id") return eventId;
    if (header === "x-razorpay-signature") {
      return signatureOverride || crypto
        .createHmac("sha256", webhookSecret)
        .update(body)
        .digest("hex");
    }
    return undefined;
  }
});

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

const sendWebhook = async (server, eventId, webhook) => {
  const body = Buffer.from(JSON.stringify(webhook));
  const signature = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");
  const address = server.address();
  return fetch(`http://127.0.0.1:${address.port}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-event-id": eventId,
      "x-razorpay-signature": signature
    },
    body
  });
};

beforeEach(() => {
  delete require.cache[controllerPath];
  delete require.cache[refundServicePath];
  delete require.cache[webhookRoutePath];
  eventRecords.clear();
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  Order.findOne = originalMethods.orderFindOne;
  Order.findOneAndUpdate = originalMethods.orderFindOneAndUpdate;
  Order.findById = originalMethods.orderFindById;
  Order.updateOne = originalMethods.orderUpdateOne;
  inventoryService.deductOrderStock = originalMethods.deductOrderStock;
  inventoryService.withStockTransaction = async (operation) => operation({ testSession: true });
  RazorpayWebhookEvent.create = async (record) => {
    if (eventRecords.has(record.eventId)) {
      throw Object.assign(new Error("Duplicate event"), { code: 11000 });
    }
    const created = createEventRecord(record);
    eventRecords.set(record.eventId, created);
    return created;
  };
  RazorpayWebhookEvent.findOne = async ({ eventId }) => eventRecords.get(eventId) || null;
  RazorpayWebhookEvent.findOneAndUpdate = async (filter, update) => {
    const existing = eventRecords.get(
      [...eventRecords.keys()].find((key) => eventRecords.get(key)._id.equals(filter._id))
    );
    if (!existing || existing.status !== filter.status ||
      existing.processingUntil.getTime() > filter.processingUntil.$lte.getTime()) {
      return null;
    }
    Object.assign(existing, update.$set);
    return existing;
  };
  RazorpayWebhookEvent.updateOne = async (filter, update) => {
    const existing = [...eventRecords.values()].find((record) =>
      record._id.equals(filter._id) &&
      record.status === filter.status &&
      record.processingUntil?.getTime() === filter.processingUntil.getTime()
    );
    if (!existing) return { matchedCount: 0 };
    Object.assign(existing, update.$set);
    return { matchedCount: 1 };
  };
  RazorpayWebhookEvent.deleteOne = async (filter) => {
    const found = [...eventRecords.entries()].find(([, record]) =>
      record._id.equals(filter._id) &&
      record.status === filter.status &&
      record.processingUntil?.getTime() === filter.processingUntil.getTime()
    );
    if (!found) return { deletedCount: 0 };
    eventRecords.delete(found[0]);
    return { deletedCount: 1 };
  };
});

afterEach(() => {
  delete require.cache[controllerPath];
  delete require.cache[refundServicePath];
  delete require.cache[webhookRoutePath];
  Order.findOne = originalMethods.orderFindOne;
  Order.findOneAndUpdate = originalMethods.orderFindOneAndUpdate;
  Order.findById = originalMethods.orderFindById;
  Order.updateOne = originalMethods.orderUpdateOne;
  RazorpayWebhookEvent.create = originalMethods.eventCreate;
  RazorpayWebhookEvent.findOne = originalMethods.eventFindOne;
  RazorpayWebhookEvent.findOneAndUpdate = originalMethods.eventFindOneAndUpdate;
  RazorpayWebhookEvent.updateOne = originalMethods.eventUpdateOne;
  RazorpayWebhookEvent.deleteOne = originalMethods.eventDeleteOne;
  inventoryService.deductOrderStock = originalMethods.deductOrderStock;
  inventoryService.withStockTransaction = originalMethods.withStockTransaction;
  if (originalMethods.razorpayWebhookSecret === undefined) {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  } else {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalMethods.razorpayWebhookSecret;
  }
});

test("verifies webhook signatures and rejects malformed signatures", async () => {
  const { handlePaymentWebhook } = require("../controllers/paymentController");
  const rawBody = Buffer.from(JSON.stringify(makeEvent()));
  const response = makeResponse();

  await handlePaymentWebhook(makeRequest(rawBody, "event_bad_signature", "bad"), response);

  assert.equal(response.statusCode, 400);
  assert.equal(eventRecords.size, 0);
});

test("keeps webhook deduplication records free of automatic TTL expiry", () => {
  const expiringIndexes = RazorpayWebhookEvent.schema.indexes().filter(([, options]) =>
    options.expireAfterSeconds !== undefined
  );
  assert.equal(expiringIndexes.length, 0);
});

test("retains old webhook event IDs so duplicate delivery remains idempotent", async () => {
  const order = makeOrder();
  let stockDeductionCount = 0;
  Order.findOne = async (filter) => {
    assert.equal(filter.razorpayOrderId, order.razorpayOrderId);
    return order;
  };
  Order.findOneAndUpdate = async (filter, update) => {
    Object.assign(order, update.$set);
    return order;
  };
  inventoryService.deductOrderStock = async () => {
    stockDeductionCount += 1;
  };
  const app = express();
  app.use("/api/payments/webhook", require("../routes/paymentWebhookRoutes"));
  app.use(express.json({ limit: "1mb" }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const first = await sendWebhook(server, "event_capture_1", makeEvent());
    const firstBody = await first.json();
    [...eventRecords.values()][0].processedAt = new Date(0);
    const duplicate = await sendWebhook(server, "event_capture_1", makeEvent());
    const duplicateBody = await duplicate.json();

    assert.equal(first.status, 200);
    assert.equal(firstBody.message, "Payment webhook processed");
    assert.equal(duplicate.status, 200);
    assert.equal(duplicateBody.message, "Webhook event was already processed");
    assert.equal(stockDeductionCount, 1);
    assert.equal(order.paymentStatus, "paid");
    assert.equal(order.orderStatus, "Confirmed");
    assert.equal([...eventRecords.values()][0].status, "processed");
  } finally {
    await new Promise((resolve, reject) => server.close((error) =>
      error ? reject(error) : resolve()
    ));
  }
});

test("does not fulfill a captured webhook with an incorrect amount", async () => {
  const order = makeOrder();
  let claimCount = 0;
  Order.findOne = async () => order;
  Order.findOneAndUpdate = async () => {
    claimCount += 1;
    return order;
  };
  const { handlePaymentWebhook } = require("../controllers/paymentController");
  const event = makeEvent({
    payload: {
      payment: {
        entity: {
          id: "razorpay_test_payment_1",
          order_id: "razorpay_test_order_1",
          amount: 1,
          currency: "INR",
          status: "captured"
        }
      }
    }
  });
  const response = makeResponse();

  await handlePaymentWebhook(
    makeRequest(Buffer.from(JSON.stringify(event)), "event_bad_amount"),
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(claimCount, 0);
  assert.equal(eventRecords.size, 0);
  assert.equal(order.paymentStatus, "pending");
});

test("records failed payment status without confirming or fulfilling the order", async () => {
  const order = makeOrder();
  const event = makeEvent({
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: "razorpay_test_payment_1",
          order_id: "razorpay_test_order_1",
          amount: 25000,
          currency: "INR",
          status: "failed"
        }
      }
    }
  });
  Order.findOne = async () => order;
  Order.updateOne = async (filter, update) => {
    assert.equal(filter.paymentStatus, "pending");
    Object.assign(order, update.$set);
    return { matchedCount: 1 };
  };
  const { handlePaymentWebhook } = require("../controllers/paymentController");
  const response = makeResponse();

  await handlePaymentWebhook(
    makeRequest(Buffer.from(JSON.stringify(event)), "event_failed_1"),
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(order.paymentStatus, "failed");
  assert.equal(order.orderStatus, "Pending");
  assert.equal(eventRecords.get("event_failed_1").status, "processed");
});
