const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Product",
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: String,
      default: "anonymous",
    },
    error: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Create compound indexes for better query performance
transactionSchema.index({ productId: 1, status: 1 });
transactionSchema.index({ timestamp: -1 });

const Transaction = mongoose.model("Transaction", transactionSchema);
module.exports = Transaction;
