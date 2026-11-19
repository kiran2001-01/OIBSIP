const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Ingredient name is required"],
      unique: true,
      trim: true,
      maxlength: 100
    },
    category: {
      type: String,
      enum: ["base", "sauce", "cheese", "vegetable", "other"],
      default: "other"
    },
    price: {
      type: Number,
      min: 0,
      default: 0
    },
    unit: {
      type: String,
      required: [true, "Ingredient unit is required"],
      enum: ["g", "kg", "ml", "l", "piece"]
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    lowStockThreshold: {
      type: Number,
      required: true,
      min: 0,
      default: 10
    },
    lowStockNotifiedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Inventory", inventorySchema);
