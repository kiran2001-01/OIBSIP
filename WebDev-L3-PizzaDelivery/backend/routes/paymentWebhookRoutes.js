const express = require("express");
const { handlePaymentWebhook } = require("../controllers/paymentController");

const router = express.Router();

router.post("/", express.raw({ type: "application/json", limit: "1mb" }), handlePaymentWebhook);

module.exports = router;
