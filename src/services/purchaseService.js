const { v4: uuidv4 } = require("uuid");
const Inventory = require("../models/Inventory");
const Product = require("../models/Product");
const Transaction = require("../models/Transaction");
const notificationService = require("./notificationService");

const processPurchase = async (productId, quantity, userId = "anonymous") => {
  if (!productId || !quantity || quantity <= 0) {
    const err = new Error("Invalid request. productId and positive quantity required");
    err.status = 400;
    throw err;
  }

  const transactionId = uuidv4();

  const transaction = new Transaction({
    productId,
    quantity,
    transactionId,
    status: "pending",
    userId,
    timestamp: new Date(),
  });
  await transaction.save();

  const inventory = await Inventory.findOne({ productId });
  if (!inventory) {
    await Transaction.findOneAndUpdate({ transactionId }, { status: "failed", error: "Inventory not found" });
    const err = new Error("Inventory not found for this product");
    err.status = 404;
    throw err;
  }

  if (inventory.stock < quantity) {
    await Transaction.findOneAndUpdate({ transactionId }, { status: "failed", error: "Insufficient stock" });
    const err = new Error("Insufficient stock");
    err.status = 409;
    err.available = inventory.stock;
    err.requested = quantity;
    throw err;
  }

  // Atomic stock reduction — prevents race conditions
  const updatedInventory = await Inventory.findOneAndUpdate(
    { productId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity, version: 1 }, $set: { lastSyncedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!updatedInventory) {
    await Transaction.findOneAndUpdate({ transactionId }, { status: "failed", error: "Stock changed during operation" });
    const err = new Error("Stock changed during purchase. Please try again.");
    err.status = 409;
    throw err;
  }

  await Transaction.findOneAndUpdate({ transactionId }, { status: "completed" });

  const product = await Product.findById(productId);
  const isLowStock = updatedInventory.stock <= updatedInventory.lowStockThreshold;
  const isCritical = updatedInventory.stock === 0;

  if (isLowStock) {
    notificationService.emitLowStockAlert(
      productId,
      product ? product.name : "Unknown",
      product ? product.sku : "N/A",
      updatedInventory.stock,
      updatedInventory.lowStockThreshold
    );
  }

  return {
    transactionId,
    product: {
      id: productId,
      name: product ? product.name : "Unknown",
      sku: product ? product.sku : "N/A",
    },
    quantity,
    remainingStock: updatedInventory.stock,
    timestamp: new Date(),
    isLowStock,
    isCritical,
  };
};

const processBatchPurchases = async (purchases) => {
  if (!Array.isArray(purchases) || purchases.length === 0) {
    const err = new Error("Purchases array is required and must not be empty");
    err.status = 400;
    throw err;
  }

  for (const purchase of purchases) {
    if (!purchase.productId || !purchase.quantity || purchase.quantity <= 0) {
      const err = new Error("Each purchase must have productId and positive quantity");
      err.status = 400;
      throw err;
    }
  }

  const results = [];

  for (const purchase of purchases) {
    const transactionId = uuidv4();
    try {
      const transaction = new Transaction({
        productId: purchase.productId,
        quantity: purchase.quantity,
        transactionId,
        status: "pending",
        userId: purchase.userId || "anonymous",
      });
      await transaction.save();

      const updatedInventory = await Inventory.findOneAndUpdate(
        { productId: purchase.productId, stock: { $gte: purchase.quantity } },
        { $inc: { stock: -purchase.quantity, version: 1 }, $set: { lastSyncedAt: new Date() } },
        { returnDocument: "after" }
      );

      if (updatedInventory) {
        await Transaction.findOneAndUpdate({ transactionId }, { status: "completed" });

        const product = await Product.findById(purchase.productId);
        const isLowStock = updatedInventory.stock <= updatedInventory.lowStockThreshold;
        const isCritical = updatedInventory.stock === 0;

        if (isLowStock) {
          notificationService.emitLowStockAlert(
            purchase.productId,
            product ? product.name : "Unknown",
            product ? product.sku : "N/A",
            updatedInventory.stock,
            updatedInventory.lowStockThreshold
          );
        }

        results.push({
          success: true,
          productId: purchase.productId,
          remainingStock: updatedInventory.stock,
          transactionId,
          quantity: purchase.quantity,
        });
      } else {
        const currentInventory = await Inventory.findOne({ productId: purchase.productId });
        const reason = currentInventory ? "Insufficient stock" : "Inventory not found";
        await Transaction.findOneAndUpdate({ transactionId }, { status: "failed", error: reason });
        results.push({
          success: false,
          productId: purchase.productId,
          error: reason,
          available: currentInventory ? currentInventory.stock : 0,
          requested: purchase.quantity,
          transactionId,
        });
      }
    } catch (error) {
      results.push({ success: false, productId: purchase.productId, error: error.message, transactionId });
    }
  }

  return results;
};

const getTransactionStatus = async (transactionId) => {
  const transaction = await Transaction.findOne({ transactionId }).populate(
    "productId",
    "sku name currentPrice"
  );
  if (!transaction) {
    const err = new Error("Transaction not found");
    err.status = 404;
    throw err;
  }
  return transaction;
};

const getPurchaseHistory = async (productId, limit = 50) => {
  return Transaction.find({ productId, status: "completed" })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .populate("productId", "sku name currentPrice");
};

const getPurchaseStats = async () => {
  const stats = await Transaction.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 }, totalQuantity: { $sum: "$quantity" } } },
  ]);
  const total = await Transaction.countDocuments();
  const failed = await Transaction.countDocuments({ status: "failed" });
  const completed = await Transaction.countDocuments({ status: "completed" });

  return {
    total,
    completed,
    failed,
    successRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0,
    byStatus: stats,
  };
};

const getAllTransactions = async () => {
  return Transaction.find().sort({ timestamp: -1 }).populate("productId", "sku name");
};

module.exports = {
  processPurchase,
  processBatchPurchases,
  getTransactionStatus,
  getPurchaseHistory,
  getPurchaseStats,
  getAllTransactions,
};
