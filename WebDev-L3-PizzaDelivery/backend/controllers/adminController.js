const mongoose = require("mongoose");
const crypto = require("crypto");
const Order = require("../models/Order");
const User = require("../models/User");
const Inventory = require("../models/Inventory");
const { processCancelledOrder } = require("./paymentController");
const sendControllerError = require("../utils/controllerError");

const orderStatuses = [
  "Confirmed",
  "Preparing",
  "Out for Delivery",
  "Delivered",
  "Cancelled"
];
const inventoryCategories = ["base", "sauce", "cheese", "vegetable", "other"];

const allowedTransitions = {
  Pending: ["Cancelled"],
  Confirmed: ["Preparing", "Cancelled"],
  Preparing: ["Out for Delivery", "Cancelled"],
  "Out for Delivery": ["Delivered", "Cancelled"],
  Delivered: [],
  Cancelled: []
};

const getDashboard = async (req, res) => {
  try {
    const [totalUsers, totalOrders, pendingOrders, completedOrders, revenue] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ orderStatus: { $in: ["Pending", "Confirmed", "Preparing"] } }),
      Order.countDocuments({ orderStatus: "Delivered" }),
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } }
      ])
    ]);

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalOrders,
          totalRevenue: revenue[0]?.total || 0,
          pendingOrders,
          completedOrders
        }
      }
    });
  } catch (error) {
    return sendControllerError(res, error, "Loading admin dashboard failed", "Unable to load dashboard");
  }
};

const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(100);

    return res.status(200).json({
      success: true,
      data: { orders }
    });
  } catch (error) {
    return sendControllerError(res, error, "Loading admin orders failed", "Unable to load orders");
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      });
    }

    const { status } = req.body;
    if (!orderStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status"
      });
    }

    let order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const cancelledOrderNeedsStockRestore =
      order.orderStatus === "Cancelled" && status === "Cancelled" && order.stockDeducted;
    if (order.orderStatus === status && !cancelledOrderNeedsStockRestore) {
      return res.status(200).json({
        success: true,
        message: "Order status is unchanged",
        data: { order }
      });
    }

    if (status !== "Cancelled" && order.paymentStatus !== "paid") {
      return res.status(409).json({
        success: false,
        message: "Only paid orders can move through fulfillment"
      });
    }

    if (
      !cancelledOrderNeedsStockRestore &&
      !allowedTransitions[order.orderStatus]?.includes(status)
    ) {
      return res.status(409).json({
        success: false,
        message: `Order cannot move from ${order.orderStatus} to ${status}`
      });
    }

    if (status === "Cancelled") {
      const processingToken = crypto.randomUUID();
      const claimedOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,
          orderStatus: order.orderStatus,
          stockProcessing: { $ne: true }
        },
        {
          $set: {
            orderStatus: status,
            stockProcessing: true,
            stockProcessingStartedAt: new Date(),
            stockProcessingAction: "cancellation",
            stockProcessingToken: processingToken
          }
        },
        { returnDocument: 'after' }
      );
      if (!claimedOrder) {
        return res.status(409).json({
          success: false,
          message: "Payment or inventory processing is in progress. Try cancelling again shortly."
        });
      }

      order = claimedOrder;
      order = await processCancelledOrder(order, processingToken);
    } else {
      order.orderStatus = status;
      await order.save();
    }

    const update = {
      orderId: order._id.toString(),
      status: order.orderStatus,
      updatedAt: order.updatedAt
    };
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${order.user.toString()}`).emit("order-status-updated", update);
      io.to("admins").emit("order-status-updated", update);
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated",
      data: { order }
    });
  } catch (error) {
    return sendControllerError(res, error, "Updating order status failed", "Unable to update order status");
  }
};

const getInventory = async (req, res) => {
  try {
    const inventory = await Inventory.find().sort({ name: 1 });
    return res.status(200).json({
      success: true,
      data: { inventory }
    });
  } catch (error) {
    return sendControllerError(res, error, "Loading inventory failed", "Unable to load inventory");
  }
};

const createInventoryItem = async (req, res) => {
  try {
    const { name, unit, stock, lowStockThreshold, category, price } = req.body;
    if (
      !name ||
      !unit ||
      !Number.isFinite(Number(stock)) ||
      Number(stock) < 0 ||
      (category !== undefined && !inventoryCategories.includes(category)) ||
      (price !== undefined && (
        price === "" || !Number.isFinite(Number(price)) || Number(price) < 0
      ))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory item details"
      });
    }

    const item = await Inventory.create({
      name: name.trim(),
      unit,
      stock: Number(stock),
      ...(category !== undefined ? { category } : {}),
      ...(price !== undefined ? { price: Number(price) } : {}),
      lowStockThreshold: lowStockThreshold === undefined ? 10 : Number(lowStockThreshold)
    });

    return res.status(201).json({
      success: true,
      message: "Inventory item created",
      data: { inventoryItem: item }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An ingredient with this name already exists"
      });
    }
    return sendControllerError(
      res,
      error,
      "Creating inventory item failed",
      error.name === "ValidationError" ? "Invalid inventory item" : "Unable to create inventory item",
      error.name === "ValidationError" ? 400 : 500
    );
  }
};

const updateInventoryItem = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid inventory ID" });
    }

    const { name, unit, adjustment, lowStockThreshold, category, price } = req.body;
    if (
      adjustment !== undefined &&
      (!Number.isFinite(Number(adjustment)) || Number(adjustment) === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Stock adjustment must be a non-zero number"
      });
    }

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (unit !== undefined) update.unit = unit;
    if (category !== undefined) {
      if (!inventoryCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid inventory category"
        });
      }
      update.category = category;
    }
    if (price !== undefined) {
      const itemPrice = Number(price);
      if (price === "" || !Number.isFinite(itemPrice) || itemPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Inventory price must be a non-negative number"
        });
      }
      update.price = itemPrice;
    }
    if (lowStockThreshold !== undefined) {
      const threshold = Number(lowStockThreshold);
      if (!Number.isFinite(threshold) || threshold < 0) {
        return res.status(400).json({
          success: false,
          message: "Low-stock threshold must be a non-negative number"
        });
      }
      update.lowStockThreshold = threshold;
    }

    let item;
    if (adjustment !== undefined) {
      const delta = Number(adjustment);
      item = await Inventory.findOneAndUpdate(
        { _id: req.params.id, stock: { $gte: Math.max(0, -delta) } },
        { $inc: { stock: delta }, $set: update },
        { returnDocument: 'after', runValidators: true }
      );
      if (!item) {
        return res.status(409).json({
          success: false,
          message: "Stock adjustment would make inventory negative, or item does not exist"
        });
      }
      if (item.stock > item.lowStockThreshold) {
        item.lowStockNotifiedAt = null;
        await item.save();
      }
    } else {
      item = await Inventory.findByIdAndUpdate(req.params.id, { $set: update }, {
        returnDocument: 'after',
        runValidators: true
      });
    }

    if (!item) {
      return res.status(404).json({ success: false, message: "Inventory item not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Inventory item updated",
      data: { inventoryItem: item }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An ingredient with this name already exists"
      });
    }

    const isValidationError =
      error.name === "ValidationError" || error.name === "CastError";
    return sendControllerError(
      res,
      error,
      "Updating inventory item failed",
      isValidationError ? "Invalid inventory item" : "Unable to update inventory item",
      isValidationError ? 400 : 500
    );
  }
};

module.exports = {
  getDashboard,
  getAllOrders,
  updateOrderStatus,
  getInventory,
  createInventoryItem,
  updateInventoryItem
};
