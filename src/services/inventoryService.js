const Inventory = require("../models/Inventory");
const Product = require("../models/Product");
const notificationService = require("./notificationService");

const createOrUpdateInventory = async (productId, stock, lowStockThreshold) => {
  const product = await Product.findById(productId);
  if (!product) {
    const err = new Error("Product not found");
    err.status = 404;
    throw err;
  }

  let inventory = await Inventory.findOne({ productId });

  if (inventory) {
    inventory.stock = stock;
    if (lowStockThreshold !== undefined && lowStockThreshold !== null) {
      inventory.lowStockThreshold = lowStockThreshold;
    }
    inventory.lastSyncedAt = new Date();
    inventory.version += 1;
    await inventory.save();
    return { inventory, created: false };
  }

  inventory = new Inventory({
    productId,
    vendorId: product.vendorId || "Unknown Vendor",
    stock,
    lowStockThreshold: (lowStockThreshold !== undefined && lowStockThreshold !== null) ? lowStockThreshold : 10,
    lastSyncedAt: new Date(),
  });
  await inventory.save();
  return { inventory, created: true };
};

const getAllInventory = async () => {
  return Inventory.find()
    .populate("productId", "sku name currentPrice vendorId")
    .sort({ createdAt: -1 });
};

const getInventoryByProduct = async (productId) => {
  const inventory = await Inventory.findOne({ productId }).populate(
    "productId",
    "sku name currentPrice vendorId"
  );
  if (!inventory) {
    const err = new Error("Inventory not found for this product");
    err.status = 404;
    throw err;
  }
  return inventory;
};

const getLowStockItems = async () => {
  return Inventory.find({
    $expr: { $lte: ["$stock", "$lowStockThreshold"] },
  }).populate("productId", "sku name currentPrice vendorId");
};

const updateStock = async (productId, quantity, operation) => {
  if (!quantity || quantity <= 0) {
    const err = new Error("Valid quantity is required (positive number)");
    err.status = 400;
    throw err;
  }
  if (!operation || !["add", "reduce"].includes(operation)) {
    const err = new Error('Operation must be "add" or "reduce"');
    err.status = 400;
    throw err;
  }

  let updatedInventory;

  if (operation === "add") {
    updatedInventory = await Inventory.findOneAndUpdate(
      { productId },
      { $inc: { stock: quantity, version: 1 }, $set: { lastSyncedAt: new Date() } },
      { returnDocument: "after", runValidators: true }
    ).populate("productId", "sku name currentPrice");
  } else {
    updatedInventory = await Inventory.findOneAndUpdate(
      { productId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity, version: 1 }, $set: { lastSyncedAt: new Date() } },
      { returnDocument: "after", runValidators: true }
    ).populate("productId", "sku name currentPrice");
  }

  if (!updatedInventory) {
    if (operation === "reduce") {
      const current = await Inventory.findOne({ productId });
      const err = new Error("Insufficient stock");
      err.status = 409;
      err.currentStock = current ? current.stock : 0;
      err.requested = quantity;
      throw err;
    }
    const err = new Error("Inventory not found for this product");
    err.status = 404;
    throw err;
  }

  const isLowStock = updatedInventory.stock <= updatedInventory.lowStockThreshold;
  const isCritical = updatedInventory.stock === 0;

  if (isLowStock) {
    notificationService.emitLowStockAlert(
      updatedInventory.productId._id,
      updatedInventory.productId.name,
      updatedInventory.productId.sku,
      updatedInventory.stock,
      updatedInventory.lowStockThreshold
    );
  }

  return { inventory: updatedInventory, isLowStock, isCritical };
};

const updateThreshold = async (productId, lowStockThreshold) => {
  if (lowStockThreshold === undefined || lowStockThreshold < 0) {
    const err = new Error("Valid lowStockThreshold is required (positive number)");
    err.status = 400;
    throw err;
  }

  const inventory = await Inventory.findOneAndUpdate(
    { productId },
    { $set: { lowStockThreshold, lastSyncedAt: new Date() }, $inc: { version: 1 } },
    { returnDocument: "after" }
  ).populate("productId", "sku name currentPrice");

  if (!inventory) {
    const err = new Error("Inventory not found for this product");
    err.status = 404;
    throw err;
  }

  return inventory;
};

const deleteInventory = async (productId) => {
  const inventory = await Inventory.findOneAndDelete({ productId });
  if (!inventory) {
    const err = new Error("Inventory not found");
    err.status = 404;
    throw err;
  }
  return inventory;
};

module.exports = {
  createOrUpdateInventory,
  getAllInventory,
  getInventoryByProduct,
  getLowStockItems,
  updateStock,
  updateThreshold,
  deleteInventory,
};
