const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Product",
      unique: true, // One inventory record per product
    },
    vendorId: {
      type: String,
      required: true,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      required: true,
      default: 10,
      min: 0,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  },
);

// Create indexes for better query performance
inventorySchema.index({ stock: 1, lowStockThreshold: 1 });
inventorySchema.index({ vendorId: 1 });
inventorySchema.index({ productId: 1 }, { unique: true });

// Virtual field to check if stock is low
inventorySchema.virtual("isLowStock").get(function () {
  return this.stock <= this.lowStockThreshold;
});

// Virtual field to check if stock is critical
inventorySchema.virtual("isCritical").get(function () {
  return this.stock === 0;
});

const Inventory = mongoose.model("Inventory", inventorySchema);
module.exports = Inventory;
