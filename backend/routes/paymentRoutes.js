const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createPaymentOrder,
  verifyPayment
} = require("../controllers/paymentController");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Payment routes ready"
  });
});

router.post("/create-order", protect, createPaymentOrder);
router.post("/verify", protect, verifyPayment);

module.exports = router;
