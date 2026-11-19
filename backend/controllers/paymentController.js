const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const RazorpayWebhookEvent = require("../models/RazorpayWebhookEvent");
const {
  deductOrderStock,
  restoreOrderStock,
  supportsStockTransactions,
  withStockTransaction
} = require("../services/inventoryService");
const { reconcileRefund } = require("../services/refundReconciliationService");
const {
  getRazorpayClient,
  fetchPayment,
  findOrderByReceipt
} = require("../services/paymentService");
const sendControllerError = require("../utils/controllerError");

const STOCK_PROCESSING_LEASE_MS = 2 * 60 * 1000;

const isValidSignature = (secret, message, signature) => {
  if (typeof signature !== "string" || !/^[\da-f]{64}$/i.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(message).digest();
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

const isCapturedPaymentForOrder = (order, payment, expectedPaymentId) => (
  payment &&
  payment.id === expectedPaymentId &&
  payment.order_id === order.razorpayOrderId &&
  payment.amount === Math.round(order.totalAmount * 100) &&
  payment.currency === "INR" &&
  payment.status === "captured"
);

const clearProcessingFields = {
  stockProcessing: false,
  stockProcessingStartedAt: null,
  stockProcessingAction: null,
  stockProcessingToken: ""
};

const finishProcessing = async (order, token, values, session) => {
  const result = await Order.findOneAndUpdate(
    {
      _id: order._id,
      stockProcessing: true,
      stockProcessingToken: token
    },
    { $set: { ...values, ...clearProcessingFields } },
    { returnDocument: 'after', session }
  );
  if (!result) {
    throw Object.assign(
      new Error("Payment processing lease expired before completion"),
      { code: "PROCESSING_LEASE_EXPIRED" }
    );
  }
  return result;
};

const refundCapturedPayment = async (order, paymentId, processingToken, orderStatus) => {
  const refundResult = await reconcileRefund(order, processingToken);
  const updatedOrder = await finishProcessing(
    refundResult.order,
    processingToken,
    {
      razorpayPaymentId: paymentId,
      orderStatus,
      stockDeducted: false
    }
  );
  return { ...refundResult, order: updatedOrder };
};

const processCapturedPayment = async (order, payment, recoveryToken) => {
  if (order.paymentStatus === "paid") {
    return order.razorpayPaymentId === payment.id
      ? { kind: "already-paid", order }
      : { kind: "conflict", order };
  }

  if (!["pending", "failed"].includes(order.paymentStatus)) {
    return { kind: "conflict", order };
  }

  const token = recoveryToken || crypto.randomUUID();
  const claimedOrder = recoveryToken
    ? order
    : await Order.findOneAndUpdate(
      {
        _id: order._id,
        razorpayOrderId: payment.order_id,
        paymentStatus: { $in: ["pending", "failed"] },
        orderStatus: order.orderStatus === "Cancelled" ? "Cancelled" : { $ne: "Cancelled" },
        stockProcessing: { $ne: true },
        stockDeducted: { $ne: true }
      },
      {
        $set: {
          stockProcessing: true,
          stockProcessingStartedAt: new Date(),
          stockProcessingAction: order.orderStatus === "Cancelled" ? "cancellation" : "fulfillment",
          stockProcessingToken: token,
          razorpayPaymentId: payment.id
        }
      },
      { returnDocument: 'after' }
    );

  if (!claimedOrder) {
    const currentOrder = await Order.findById(order._id);
    if (
      currentOrder?.paymentStatus === "paid" &&
      currentOrder.razorpayPaymentId === payment.id
    ) {
      return { kind: "already-paid", order: currentOrder };
    }

    return { kind: "conflict", order: currentOrder || order };
  }

  if (claimedOrder.orderStatus === "Cancelled") {
    return refundCapturedPayment(claimedOrder, payment.id, token, "Cancelled");
  }

  try {
    const updatedOrder = await withStockTransaction(async (session) => {
      if (!claimedOrder.stockDeducted) {
        await claimedOrder.populate({
          path: "items.pizza",
          populate: { path: "ingredients.ingredient" },
          options: session ? { session } : {}
        });
        await deductOrderStock(claimedOrder, session);
      }
      return finishProcessing(
        claimedOrder,
        token,
        {
          stockUsage: claimedOrder.stockUsage,
          stockDeducted: true,
          paymentStatus: "paid",
          orderStatus: "Confirmed",
          razorpayPaymentId: payment.id
        },
        session
      );
    }, true);
    return { kind: "paid", order: updatedOrder };
  } catch (inventoryError) {
    if (!["OUT_OF_STOCK", "INVALID_RECIPE"].includes(inventoryError.code)) {
      throw inventoryError;
    }

    const refundResult = await reconcileRefund(claimedOrder, token);
    const updatedOrder = await finishProcessing(
      refundResult.order,
      token,
      {
        orderStatus: "Cancelled",
        stockDeducted: false,
        razorpayPaymentId: payment.id
      }
    );
    return {
      ...refundResult,
      order: updatedOrder,
      inventoryError
    };
  }
};

const processCancelledOrder = async (order, processingToken) => {
  let orderForCompletion = order;
  if (["paid", "refund_pending"].includes(order.paymentStatus)) {
    if (!order.razorpayPaymentId) {
      throw new Error("Cannot reconcile a cancelled order without a payment ID");
    }
    const refundResult = await reconcileRefund(order, processingToken);
    orderForCompletion = refundResult.order;
  }

  return withStockTransaction(async (session) => {
    if (orderForCompletion.stockDeducted) {
      await restoreOrderStock(orderForCompletion, session);
    }
    return finishProcessing(
      orderForCompletion,
      processingToken,
      {
        orderStatus: "Cancelled",
        stockDeducted: false
      },
      session
    );
  }, true);
};

const processRefundReconciliation = async (order, processingToken) => {
  const result = await reconcileRefund(order, processingToken);
  return finishProcessing(result.order, processingToken, {});
};

const releaseUncapturedPayment = async (order, processingToken, paymentStatus) => (
  finishProcessing(
    order,
    processingToken,
    paymentStatus ? { paymentStatus } : {}
  )
);

const recoverExpiredProcessing = async (now = new Date()) => {
  const expiredBefore = new Date(now.getTime() - STOCK_PROCESSING_LEASE_MS);
  const expiredOrders = await Order.find({
    stockProcessing: true,
    stockProcessingStartedAt: { $lte: expiredBefore }
  }).sort({ stockProcessingStartedAt: 1 }).limit(50);

  for (const candidate of expiredOrders) {
    const token = crypto.randomUUID();
    const order = await Order.findOneAndUpdate(
      {
        _id: candidate._id,
        stockProcessing: true,
        stockProcessingStartedAt: { $lte: expiredBefore },
        stockProcessingToken: candidate.stockProcessingToken
      },
      {
        $set: {
          stockProcessingStartedAt: now,
          stockProcessingToken: token
        }
      },
      { returnDocument: 'after' }
    );
    if (!order) continue;

    try {
      if (order.stockProcessingAction === "fulfillment") {
        if (order.paymentStatus === "paid") {
          await finishProcessing(order, token, {});
          continue;
        }

        const payment = order.razorpayPaymentId
          ? await fetchPayment(order.razorpayPaymentId)
          : null;
        if (isCapturedPaymentForOrder(order, payment, order.razorpayPaymentId)) {
          await processCapturedPayment(order, payment, token);
        } else {
          await releaseUncapturedPayment(
            order,
            token,
            payment?.status === "failed" ? "failed" : undefined
          );
        }
      } else if (order.stockProcessingAction === "cancellation") {
        await processCancelledOrder(order, token);
      } else if (order.stockProcessingAction === "refund_reconciliation") {
        await processRefundReconciliation(order, token);
      }
    } catch (error) {
      console.error("Payment processing recovery deferred:", error.name);
    }
  }

  const pendingRefunds = await Order.find({
    paymentStatus: "refund_pending",
    stockProcessing: { $ne: true }
  }).limit(50);
  for (const candidate of pendingRefunds) {
    const token = crypto.randomUUID();
    const order = await Order.findOneAndUpdate(
      {
        _id: candidate._id,
        paymentStatus: "refund_pending",
        stockProcessing: { $ne: true }
      },
      {
        $set: {
          stockProcessing: true,
          stockProcessingStartedAt: now,
          stockProcessingAction: "refund_reconciliation",
          stockProcessingToken: token
        }
      },
      { returnDocument: 'after' }
    );
    if (!order) continue;
    try {
      await processRefundReconciliation(order, token);
    } catch (error) {
      console.error("Refund reconciliation deferred:", error.name);
      await Order.updateOne(
        { _id: order._id, stockProcessingToken: token },
        { $set: { ...clearProcessingFields } }
      );
    }
  }
};

const startPaymentRecoveryWorker = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await recoverExpiredProcessing();
    } catch (error) {
      console.error("Payment recovery worker failed:", error.name);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(run, 30 * 1000);
  timer.unref();
  void run();
  return timer;
};

const claimWebhookEvent = async (eventId, eventName) => {
  const now = new Date();
  const processingUntil = new Date(now.getTime() + 2 * 60 * 1000);
  try {
    const record = await RazorpayWebhookEvent.create({
      eventId,
      event: eventName,
      status: "processing",
      processingUntil
    });
    return { record, processingUntil };
  } catch (error) {
    if (error.code !== 11000) throw error;

    const existing = await RazorpayWebhookEvent.findOne({ eventId });
    if (existing?.status === "processed") {
      return { duplicate: true };
    }
    if (!existing || existing.processingUntil > now) {
      return { inProgress: true };
    }

    const record = await RazorpayWebhookEvent.findOneAndUpdate(
      {
        _id: existing._id,
        status: "processing",
        processingUntil: { $lte: now }
      },
      { $set: { event: eventName, processingUntil } },
      { returnDocument: 'after' }
    );
    return record ? { record, processingUntil } : { inProgress: true };
  }
};

const releaseWebhookEvent = async (record, processingUntil) => {
  await RazorpayWebhookEvent.deleteOne({
    _id: record._id,
    status: "processing",
    processingUntil
  });
};

const createPaymentOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "A valid order ID is required"
      });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(503).json({
        success: false,
        message: "Razorpay test credentials are not configured on the server"
      });
    }
    if (!supportsStockTransactions()) {
      return res.status(503).json({
        success: false,
        message: "Razorpay payments require a replica-set or sharded MongoDB deployment"
      });
    }

    let order = await Order.findOne({
      _id: orderId,
      user: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (order.paymentStatus === "paid") {
      return res.status(409).json({
        success: false,
        message: "This order has already been paid"
      });
    }
    if (order.stockProcessing) {
      return res.status(409).json({
        success: false,
        message: "Payment or inventory processing is in progress. Try again shortly."
      });
    }

    if (order.paymentStatus === "failed") {
      const retryOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,
          user: req.user._id,
          paymentStatus: "failed",
          orderStatus: { $ne: "Cancelled" }
        },
        { $set: { paymentStatus: "pending" } },
        { returnDocument: 'after' }
      );
      if (!retryOrder) {
        order = await Order.findOne({ _id: orderId, user: req.user._id });
      } else {
        order = retryOrder;
      }
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }
    }

    if (order.paymentStatus !== "pending" || order.orderStatus === "Cancelled") {
      return res.status(409).json({
        success: false,
        message: "This order is not available for payment"
      });
    }

    if (!order.razorpayOrderId) {
      const now = new Date();
      const lockExpiresAt = new Date(now.getTime() + 2 * 60 * 1000);
      const claimedOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,
          user: req.user._id,
          paymentStatus: "pending",
          orderStatus: { $ne: "Cancelled" },
          razorpayOrderId: { $in: ["", null] },
          $or: [
            { razorpayOrderCreatingUntil: null },
            { razorpayOrderCreatingUntil: { $lt: now } }
          ]
        },
        { $set: { razorpayOrderCreatingUntil: lockExpiresAt } },
        { returnDocument: 'after' }
      );

      if (!claimedOrder) {
        order = await Order.findOne({
          _id: orderId,
          user: req.user._id
        });
        if (!order?.razorpayOrderId) {
          return res.status(409).json({
            success: false,
            message: "Payment order creation is already in progress. Try again shortly."
          });
        }
      } else {
        try {
          const receipt = order._id.toString();
          let providerOrder = await findOrderByReceipt(receipt);
          if (providerOrder && (
            Number(providerOrder.amount) !== Math.round(order.totalAmount * 100) ||
            providerOrder.currency !== "INR"
          )) {
            throw new Error("A Razorpay order with this receipt has unexpected payment details");
          }
          if (!providerOrder) {
            try {
              providerOrder = await razorpay.client.orders.create({
                amount: Math.round(order.totalAmount * 100),
                currency: "INR",
                receipt,
                notes: {
                  orderId: order._id.toString(),
                  userId: req.user._id.toString()
                }
              });
            } catch (createError) {
              try {
                providerOrder = await findOrderByReceipt(receipt);
              } catch {
                throw createError;
              }
              if (!providerOrder) throw createError;
            }
          }
          if (typeof providerOrder.id !== "string" || !providerOrder.id) {
            throw new Error("Razorpay did not return a valid payment order ID");
          }

          claimedOrder.razorpayOrderId = providerOrder.id;
          claimedOrder.razorpayOrderCreatingUntil = null;
          await claimedOrder.save();
          order = claimedOrder;
        } catch (error) {
          try {
            await Order.updateOne(
              { _id: order._id, razorpayOrderCreatingUntil: lockExpiresAt },
              { $set: { razorpayOrderCreatingUntil: null } }
            );
          } catch (releaseError) {
            console.error(
              "Could not release the Razorpay order creation lock:",
              releaseError.name
            );
          }
          throw error;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment order ready",
      data: {
        keyId: razorpay.keyId,
        razorpayOrderId: order.razorpayOrderId,
        amount: Math.round(order.totalAmount * 100),
        currency: "INR",
        orderId: order._id
      }
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Creating Razorpay order failed",
      "Unable to create payment order",
      502
    );
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (
      !mongoose.isValidObjectId(orderId) ||
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification details are invalid"
      });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!getRazorpayClient() || !keySecret) {
      return res.status(503).json({
        success: false,
        message: "Razorpay test credentials are not configured on the server"
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (!order.razorpayOrderId || order.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: "Payment order does not match this order"
      });
    }

    if (!isValidSignature(
      keySecret,
      `${razorpay_order_id}|${razorpay_payment_id}`,
      razorpay_signature
    )) {
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed"
      });
    }

    if (order.paymentStatus === "paid") {
      if (order.razorpayPaymentId === razorpay_payment_id) {
        return res.status(200).json({
          success: true,
          message: "Payment was already verified",
          data: { order }
        });
      }

      return res.status(409).json({
        success: false,
        message: "A different payment has already been recorded for this order"
      });
    }

    if (!["pending", "failed"].includes(order.paymentStatus)) {
      return res.status(409).json({
        success: false,
        message: "This order is not available for payment verification"
      });
    }

    const payment = await fetchPayment(razorpay_payment_id);
    if (!isCapturedPaymentForOrder(order, payment, razorpay_payment_id)) {
      return res.status(400).json({
        success: false,
        message: "Payment is not captured or does not match this order"
      });
    }

    const result = await processCapturedPayment(order, payment);
    if (result.kind === "paid" || result.kind === "already-paid") {
      return res.status(200).json({
        success: true,
        message: result.kind === "already-paid"
          ? "Payment was already verified"
          : "Payment verified successfully",
        data: { order: result.order }
      });
    }

    if (["refunded", "refund_pending", "refund_failed"].includes(result.kind)) {
      return res.status(result.kind === "refunded" ? 409 : 503).json({
        success: false,
        message: result.kind === "refunded"
          ? "Required stock was unavailable or the order was cancelled. The payment was refunded."
          : result.kind === "refund_failed"
            ? "Required stock was unavailable or the order was cancelled, but the refund could not be completed. Contact support with your order ID."
            : "Required stock was unavailable or the order was cancelled and the refund is pending. Contact support with your order ID."
      });
    }

    return res.status(409).json({
      success: false,
      message: "Payment verification is already in progress or this order is no longer payable"
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Payment verification failed",
      "Payment verification failed"
    );
  }
};

const handlePaymentWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.get("x-razorpay-signature");
  const eventId = req.get("x-razorpay-event-id");
  if (!secret) {
    return res.status(503).json({
      success: false,
      message: "Razorpay webhook secret is not configured"
    });
  }
  if (!Buffer.isBuffer(req.body) || !isValidSignature(secret, req.body, signature)) {
    return res.status(400).json({
      success: false,
      message: "Webhook signature verification failed"
    });
  }
  if (typeof eventId !== "string" || !eventId.trim() || eventId.length > 200) {
    return res.status(400).json({
      success: false,
      message: "Webhook event ID is invalid"
    });
  }

  let webhook;
  try {
    webhook = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({
      success: false,
      message: "Webhook body is invalid"
    });
  }

  if (typeof webhook.event !== "string" || webhook.event.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Webhook event type is invalid"
    });
  }

  let claim;
  try {
    claim = await claimWebhookEvent(eventId, webhook.event);
  } catch (error) {
    return sendControllerError(res, error, "Claiming Razorpay webhook event failed", "Unable to process webhook", 503);
  }

  if (claim.duplicate) {
    return res.status(200).json({ success: true, message: "Webhook event was already processed" });
  }
  if (claim.inProgress) {
    return res.status(409).json({ success: false, message: "Webhook event is already being processed" });
  }

  try {
    if (webhook.event === "payment.captured") {
      const payment = webhook.payload?.payment?.entity;
      if (
        !payment ||
        typeof payment.id !== "string" ||
        typeof payment.order_id !== "string" ||
        !Number.isSafeInteger(payment.amount) ||
        typeof payment.currency !== "string" ||
        typeof payment.status !== "string"
      ) {
        await releaseWebhookEvent(claim.record, claim.processingUntil);
        return res.status(400).json({
          success: false,
          message: "Captured payment details are invalid"
        });
      }

      const order = await Order.findOne({ razorpayOrderId: payment.order_id });
      if (order && !isCapturedPaymentForOrder(order, payment, payment.id)) {
        await releaseWebhookEvent(claim.record, claim.processingUntil);
        return res.status(400).json({
          success: false,
          message: "Captured payment does not match this order"
        });
      }

      if (order) {
        await processCapturedPayment(order, payment);
      }
    } else if (webhook.event === "payment.failed") {
      const payment = webhook.payload?.payment?.entity;
      if (
        !payment ||
        typeof payment.id !== "string" ||
        typeof payment.order_id !== "string" ||
        !Number.isSafeInteger(payment.amount) ||
        payment.currency !== "INR" ||
        payment.status !== "failed"
      ) {
        await releaseWebhookEvent(claim.record, claim.processingUntil);
        return res.status(400).json({
          success: false,
          message: "Failed payment details are invalid"
        });
      }

      const order = await Order.findOne({ razorpayOrderId: payment.order_id });
      if (order && (
        payment.amount !== Math.round(order.totalAmount * 100) ||
        order.orderStatus === "Cancelled"
      )) {
        await releaseWebhookEvent(claim.record, claim.processingUntil);
        return res.status(400).json({
          success: false,
          message: "Failed payment does not match this order"
        });
      }

      if (order) {
        await Order.updateOne(
          {
            _id: order._id,
            paymentStatus: "pending",
            orderStatus: { $ne: "Cancelled" },
            stockProcessing: { $ne: true }
          },
          { $set: { paymentStatus: "failed", razorpayPaymentId: payment.id } }
        );
      }
    }

    const processed = await RazorpayWebhookEvent.updateOne(
      {
        _id: claim.record._id,
        status: "processing",
        processingUntil: claim.processingUntil
      },
      { $set: { status: "processed", processingUntil: null, processedAt: new Date() } }
    );
    if (processed.matchedCount !== 1) {
      throw new Error("Webhook processing lease expired before completion");
    }

    return res.status(200).json({
      success: true,
      message: webhook.event === "payment.captured"
        ? "Payment webhook processed"
        : "Webhook event acknowledged"
    });
  } catch (error) {
    try {
      await releaseWebhookEvent(claim.record, claim.processingUntil);
    } catch (releaseError) {
      console.error("Could not release the Razorpay webhook event claim:", releaseError.name);
    }
    return sendControllerError(res, error, "Processing Razorpay webhook failed", "Unable to process webhook", 503);
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handlePaymentWebhook,
  processCancelledOrder,
  recoverExpiredProcessing,
  startPaymentRecoveryWorker
};
