const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  vendorId: { type: String, required: true, trim: true },
  currentPrice: { type: Number, required: true, min: 0 },
  description: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
});

// Ensure indexes for uniqueness
productSchema.index({ sku: 1 }, { unique: true });

module.exports = mongoose.model("Product", productSchema);
