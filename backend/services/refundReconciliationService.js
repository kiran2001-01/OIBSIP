const Order = require("../models/Order");
const { fetchRefunds, refundPayment } = require("./paymentService");

const MAX_REFUND_ATTEMPTS = 3;

const persistAttempt = async (order, processingToken, attempts) => {
  const latestAttempt = attempts[attempts.length - 1];
  const paymentStatus = latestAttempt.status === "processed"
    ? "refunded"
    : latestAttempt.status === "failed" && attempts.length >= MAX_REFUND_ATTEMPTS
      ? "refund_failed"
      : "refund_pending";
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      stockProcessing: true,
      stockProcessingToken: processingToken
    },
    {
      $set: {
        refundAttempts: attempts,
        razorpayRefundId: latestAttempt.refundId || "",
        razorpayRefundStatus: latestAttempt.status,
        paymentStatus
      }
    },
    { new: true }
  );
  if (!updatedOrder) {
    throw Object.assign(
      new Error("Refund state could not be saved because its processing lease expired"),
      { code: "PROCESSING_LEASE_EXPIRED" }
    );
  }
  return updatedOrder;
};

const reconcileRefund = async (order, processingToken) => {
  if (!order.razorpayPaymentId) {
    throw new Error("Cannot reconcile a refund without a payment ID");
  }

  let attempts = (order.refundAttempts || []).map((attempt) => ({
    receipt: attempt.receipt,
    refundId: attempt.refundId || "",
    status: attempt.status,
    requestedAt: attempt.requestedAt
  }));
  let latestAttempt = attempts[attempts.length - 1];

  if (!latestAttempt && (
    order.paymentStatus === "refund_pending" ||
    order.razorpayRefundId
  )) {
    let response;
    try {
      response = await fetchRefunds(order.razorpayPaymentId);
    } catch (error) {
      console.error("Legacy Razorpay refund lookup deferred:", error.name);
      return { kind: "refund_pending", order, reconciliationError: error };
    }

    const legacyRefund = response.items?.find((item) =>
      item.id === order.razorpayRefundId ||
      item.amount === Math.round(order.totalAmount * 100)
    );
    if (!legacyRefund) {
      return { kind: "refund_pending", order };
    }

    latestAttempt = {
      receipt: legacyRefund.receipt || `legacy-${legacyRefund.id}`.slice(0, 40),
      refundId: legacyRefund.id,
      status: legacyRefund.status,
      requestedAt: Number.isSafeInteger(legacyRefund.created_at)
        ? new Date(legacyRefund.created_at * 1000)
        : new Date()
    };
    attempts.push(latestAttempt);
    order = await persistAttempt(order, processingToken, attempts);
  }

  if (latestAttempt && ["pending", "unknown"].includes(latestAttempt.status)) {
    let response;
    try {
      response = await fetchRefunds(order.razorpayPaymentId);
    } catch (error) {
      console.error("Razorpay refund lookup deferred:", error.name);
      return { kind: "refund_pending", order, reconciliationError: error };
    }

    const refund = response.items?.find((item) =>
      item.receipt === latestAttempt.receipt ||
      (latestAttempt.refundId && item.id === latestAttempt.refundId)
    );
    if (!refund) {
      return { kind: "refund_pending", order };
    }

    latestAttempt = {
      ...latestAttempt,
      refundId: refund.id,
      status: refund.status
    };
    attempts[attempts.length - 1] = latestAttempt;
    order = await persistAttempt(order, processingToken, attempts);
  }

  if (latestAttempt?.status === "processed") {
    return { kind: "refunded", order };
  }

  if (latestAttempt?.status === "failed" && attempts.length >= MAX_REFUND_ATTEMPTS) {
    return { kind: "refund_failed", order };
  }

  if (latestAttempt?.status === "pending" || latestAttempt?.status === "unknown") {
    return { kind: "refund_pending", order };
  }

  const nextAttempt = {
    receipt: `pz-${order._id.toString()}-${attempts.length + 1}`,
    refundId: "",
    status: "pending",
    requestedAt: new Date()
  };
  attempts.push(nextAttempt);
  order = await persistAttempt(order, processingToken, attempts);

  try {
    const refund = await refundPayment(order.razorpayPaymentId, order.totalAmount, {
      receipt: nextAttempt.receipt,
      orderId: order._id.toString()
    });
    nextAttempt.refundId = refund.id || "";
    nextAttempt.status = ["processed", "failed", "pending"].includes(refund.status)
      ? refund.status
      : "unknown";
    attempts[attempts.length - 1] = nextAttempt;
    order = await persistAttempt(order, processingToken, attempts);
  } catch (error) {
    if (error.code === "PROCESSING_LEASE_EXPIRED") throw error;
    console.error("Razorpay refund request outcome requires reconciliation:", error.name);
    return { kind: "refund_pending", order, reconciliationError: error };
  }

  if (nextAttempt.status === "processed") {
    return { kind: "refunded", order };
  }
  if (nextAttempt.status === "failed" && attempts.length >= MAX_REFUND_ATTEMPTS) {
    return { kind: "refund_failed", order };
  }
  return { kind: "refund_pending", order };
};

module.exports = {
  MAX_REFUND_ATTEMPTS,
  reconcileRefund
};
