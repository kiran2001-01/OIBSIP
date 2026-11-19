const mongoose = require("mongoose");

const customIngredientSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["base", "sauce", "cheese", "vegetable"],
      required: true
    },
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true
    },
    name: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    pizza: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pizza",
      required() {
        return !this.customIngredients?.length;
      },
      default: undefined
    },
    customIngredients: {
      type: [customIngredientSchema],
      default: undefined
    },
    name: {
      type: String,
      required: true
    },
    image: {
      type: String,
      default: ""
    },
    size: {
      type: String,
      required: true
    },
    crust: {
      type: String,
      required: true
    },
    toppings: {
      type: [String],
      default: []
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const deliveryAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const stockUsageSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["pizza", "ingredient"],
      required: true
    },
    item: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.001
    }
  },
  { _id: false }
);

const refundAttemptSchema = new mongoose.Schema(
  {
    receipt: {
      type: String,
      required: true,
      maxlength: 40
    },
    refundId: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["pending", "processed", "failed", "unknown"],
      default: "pending"
    },
    requestedAt: {
      type: Date,
      required: true
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    idempotencyKey: {
      type: String,
      required: true
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(items) => items.length > 0, "Order must include at least one item"]
    },
    deliveryAddress: {
      type: deliveryAddressSchema,
      required: true
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    tax: {
      type: Number,
      required: true,
      min: 0
    },
    deliveryFee: {
      type: Number,
      required: true,
      min: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    paymentMethod: {
      type: String,
      enum: ["razorpay"],
      default: "razorpay"
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded", "refund_pending", "refund_failed"],
      default: "pending"
    },
    orderStatus: {
      type: String,
      enum: ["Pending", "Confirmed", "Preparing", "Out for Delivery", "Delivered", "Cancelled"],
      default: "Pending"
    },
    razorpayOrderId: {
      type: String,
      default: ""
    },
    razorpayOrderCreatingUntil: {
      type: Date,
      default: null
    },
    razorpayPaymentId: {
      type: String,
      default: ""
    },
    razorpayRefundId: {
      type: String,
      default: ""
    },
    razorpayRefundStatus: {
      type: String,
      enum: ["pending", "processed", "failed", "unknown", null],
      default: null
    },
    refundAttempts: {
      type: [refundAttemptSchema],
      default: []
    },
    stockDeducted: {
      type: Boolean,
      default: false
    },
    stockProcessing: {
      type: Boolean,
      default: false
    },
    stockProcessingStartedAt: {
      type: Date,
      default: null
    },
    stockProcessingAction: {
      type: String,
      enum: ["fulfillment", "cancellation", "refund_reconciliation", null],
      default: null
    },
    stockProcessingToken: {
      type: String,
      default: ""
    },
    stockUsage: {
      type: [stockUsageSchema],
      default: []
    }
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ stockProcessing: 1, stockProcessingStartedAt: 1 });
orderSchema.index({ paymentStatus: 1, stockProcessing: 1 });

module.exports = mongoose.model("Order", orderSchema);
