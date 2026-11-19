const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");
const {
  getDashboard,
  getAllOrders,
  updateOrderStatus,
  getInventory,
  createInventoryItem,
  updateInventoryItem
} = require("../controllers/adminController");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Admin routes ready"
  });
});

router.get("/dashboard", protect, adminOnly, getDashboard);
router.get("/orders", protect, adminOnly, getAllOrders);
router.patch("/orders/:id/status", protect, adminOnly, updateOrderStatus);
router.get("/inventory", protect, adminOnly, getInventory);
router.post("/inventory", protect, adminOnly, createInventoryItem);
router.patch("/inventory/:id", protect, adminOnly, updateInventoryItem);

module.exports = router;
