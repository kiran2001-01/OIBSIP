const mongoose = require("mongoose");

const razorpayWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      maxlength: 200
    },
    event: {
      type: String,
      required: true,
      maxlength: 100
    },
    status: {
      type: String,
      enum: ["processing", "processed"],
      required: true
    },
    processingUntil: {
      type: Date,
      default: null
    },
    processedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("RazorpayWebhookEvent", razorpayWebhookEventSchema);
