const Razorpay = require("razorpay");

const getRazorpayClient = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId?.startsWith("rzp_test_") || !keySecret) {
    return null;
  }

  return {
    keyId,
    client: new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    })
  };
};

const fetchPayment = async (paymentId) => {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    throw new Error("Razorpay test credentials are not configured on the server");
  }

  return razorpay.client.payments.fetch(paymentId);
};

const refundPayment = async (paymentId, amount, options = {}) => {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    throw new Error("Razorpay test credentials are not configured on the server");
  }

  return razorpay.client.payments.refund(paymentId, {
    amount: Math.round(amount * 100),
    receipt: options.receipt,
    notes: options.orderId ? { orderId: options.orderId } : undefined
  });
};

const fetchRefunds = async (paymentId) => {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    throw new Error("Razorpay test credentials are not configured on the server");
  }

  return razorpay.client.payments.fetchMultipleRefund(paymentId, { count: 100 });
};

const findOrderByReceipt = async (receipt) => {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    throw new Error("Razorpay test credentials are not configured on the server");
  }

  const orders = await razorpay.client.orders.all({ receipt, count: 100 });
  return orders.items?.find((order) => order.receipt === receipt) || null;
};

module.exports = {
  getRazorpayClient,
  fetchPayment,
  refundPayment,
  fetchRefunds,
  findOrderByReceipt
};
