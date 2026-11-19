const cron = require("node-cron");
const Inventory = require("../models/Inventory");
const { sendEmail } = require("./emailService");

let isCheckingLowStock = false;
let lowStockTask;

const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const checkLowStock = async () => {
  if (isCheckingLowStock) return;
  isCheckingLowStock = true;

  try {
    const notifiedItems = await Inventory.find({ lowStockNotifiedAt: { $ne: null } });
    const restockedIds = notifiedItems
      .filter((item) => item.stock > item.lowStockThreshold)
      .map((item) => item._id);
    if (restockedIds.length) {
      await Inventory.updateMany(
        { _id: { $in: restockedIds }, lowStockNotifiedAt: { $ne: null } },
        { $set: { lowStockNotifiedAt: null } }
      );
    }

    const lowStockItems = await Inventory.find({
      $expr: { $lte: ["$stock", "$lowStockThreshold"] },
      lowStockNotifiedAt: null
    }).sort({ name: 1 });
    if (!lowStockItems.length || !process.env.ADMIN_EMAIL) return;

    const rows = lowStockItems.map((item) => (
      `<li>${escapeHtml(item.name)}: ${item.stock} ${escapeHtml(item.unit)} remaining ` +
      `(threshold: ${item.lowStockThreshold})</li>`
    )).join("");
    const result = await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: "Low stock inventory alert",
      html: `<p>The following inventory items are at or below their low-stock threshold:</p><ul>${rows}</ul>`
    });

    if (!result.skipped) {
      await Inventory.updateMany(
        {
          _id: { $in: lowStockItems.map((item) => item._id) },
          $expr: { $lte: ["$stock", "$lowStockThreshold"] },
          lowStockNotifiedAt: null
        },
        { $set: { lowStockNotifiedAt: new Date() } }
      );
    }
  } finally {
    isCheckingLowStock = false;
  }
};

const startLowStockJob = () => {
  if (lowStockTask) return lowStockTask;
  const schedule = process.env.LOW_STOCK_CRON || "*/30 * * * *";
  lowStockTask = cron.schedule(schedule, () => {
    checkLowStock().catch((error) => {
      console.error("Low-stock check failed:", error.message);
    });
  });
  return lowStockTask;
};

module.exports = {
  checkLowStock,
  startLowStockJob
};
