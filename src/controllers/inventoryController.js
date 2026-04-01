const Inventory = require("../models/Inventory");
const Product = require("../models/Product");

// Create or update inventory for a product
const createOrUpdateInventory = async (req, res) => {
  try {
    const { productId, stock, lowStockThreshold } = req.body;

    // Validate required fields
    if (!productId || stock === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: productId, stock",
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Check if inventory already exists
    let inventory = await Inventory.findOne({ productId });

    if (inventory) {
      // Update existing inventory
      inventory.stock = stock;
      if (lowStockThreshold !== undefined) {
        inventory.lowStockThreshold = lowStockThreshold;
      }
      inventory.lastSyncedAt = new Date();
      inventory.version += 1;

      await inventory.save();

      res.json({
        success: true,
        data: inventory,
        message: "Inventory updated successfully",
      });
    } else {
      // Create new inventory
      inventory = new Inventory({
        productId,
        vendorId: product.vendorId,
        stock,
        lowStockThreshold: lowStockThreshold || 10,
        lastSyncedAt: new Date(),
      });

      await inventory.save();

      res.status(201).json({
        success: true,
        data: inventory,
        message: "Inventory created successfully",
      });
    }
  } catch (error) {
    console.error("Create/Update inventory error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

// Get all inventory items with product details
const getAllInventory = async (req, res) => {
  try {
    const inventory = await Inventory.find()
      .populate("productId", "sku name currentPrice vendorId")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: inventory.length,
      data: inventory,
    });
  } catch (error) {
    console.error("Get inventory error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Add this to get io instance
let io = null;
let emitAlert = null;

// Function to initialize WebSocket
const setWebSocket = (ioInstance, emitAlertFunction) => {
  io = ioInstance;
  emitAlert = emitAlertFunction;
};

// Get inventory by product ID
const getInventoryByProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const inventory = await Inventory.findOne({ productId }).populate(
      "productId",
      "sku name currentPrice vendorId",
    );

    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: "Inventory not found for this product",
      });
    }

    res.json({
      success: true,
      data: inventory,
    });
  } catch (error) {
    console.error("Get inventory error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get low stock items
const getLowStockItems = async (req, res) => {
  try {
    const lowStockItems = await Inventory.find({
      $expr: {
        $lte: ["$stock", "$lowStockThreshold"],
      },
    }).populate("productId", "sku name currentPrice vendorId");

    res.json({
      success: true,
      count: lowStockItems.length,
      data: lowStockItems,
      message:
        lowStockItems.length > 0
          ? "Low stock items found"
          : "No low stock items",
    });
  } catch (error) {
    console.error("Get low stock error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Update stock (with atomic operation to prevent race conditions)
const updateStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, operation } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid quantity is required (positive number)",
      });
    }

    if (!operation || !["add", "reduce"].includes(operation)) {
      return res.status(400).json({
        success: false,
        error: 'Operation must be "add" or "reduce"',
      });
    }

    let updatedInventory;

    if (operation === "add") {
      // Add stock
      updatedInventory = await Inventory.findOneAndUpdate(
        { productId },
        {
          $inc: { stock: quantity, version: 1 },
          $set: { lastSyncedAt: new Date() },
        },
        { new: true, runValidators: true },
      ).populate("productId", "sku name currentPrice");
    } else {
      // Reduce stock with check to prevent negative stock
      updatedInventory = await Inventory.findOneAndUpdate(
        {
          productId,
          stock: { $gte: quantity },
        },
        {
          $inc: { stock: -quantity, version: 1 },
          $set: { lastSyncedAt: new Date() },
        },
        { new: true, runValidators: true },
      ).populate("productId", "sku name currentPrice");
    }

    if (!updatedInventory) {
      if (operation === "reduce") {
        const current = await Inventory.findOne({ productId });
        return res.status(409).json({
          success: false,
          error: "Insufficient stock",
          currentStock: current ? current.stock : 0,
          requested: quantity,
        });
      } else {
        return res.status(404).json({
          success: false,
          error: "Inventory not found for this product",
        });
      }
    }

    // Check if stock became low
    const isLowStock =
      updatedInventory.stock <= updatedInventory.lowStockThreshold;
    const isCritical = updatedInventory.stock === 0;

    // EMIT WEBSOCKET ALERT if stock is low
    if (isLowStock && emitAlert) {
      const alertData = {
        type: "LOW_STOCK",
        productId: updatedInventory.productId._id,
        productName: updatedInventory.productId.name,
        sku: updatedInventory.productId.sku,
        currentStock: updatedInventory.stock,
        threshold: updatedInventory.lowStockThreshold,
        severity: isCritical ? "CRITICAL" : "WARNING",
        timestamp: new Date(),
        message: isCritical
          ? `⚠️ CRITICAL: ${updatedInventory.productId.name} is OUT OF STOCK!`
          : `⚠️ WARNING: ${updatedInventory.productId.name} has only ${updatedInventory.stock} units left (threshold: ${updatedInventory.lowStockThreshold})`,
      };

      emitAlert("low_stock_alert", alertData);
    }

    res.json({
      success: true,
      data: updatedInventory,
      alerts: {
        isLowStock,
        isCritical,
        message: isCritical
          ? "CRITICAL: Product is now out of stock!"
          : isLowStock
            ? "Warning: Stock is now low!"
            : null,
      },
      message: `Stock ${operation === "add" ? "added" : "reduced"} successfully`,
    });
  } catch (error) {
    console.error("Update stock error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

// Update low stock threshold
const updateThreshold = async (req, res) => {
  try {
    const { productId } = req.params;
    const { lowStockThreshold } = req.body;

    if (lowStockThreshold === undefined || lowStockThreshold < 0) {
      return res.status(400).json({
        success: false,
        error: "Valid lowStockThreshold is required (positive number)",
      });
    }

    const inventory = await Inventory.findOneAndUpdate(
      { productId },
      {
        $set: { lowStockThreshold, lastSyncedAt: new Date() },
        $inc: { version: 1 },
      },
      { new: true },
    ).populate("productId", "sku name currentPrice");

    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: "Inventory not found for this product",
      });
    }

    res.json({
      success: true,
      data: inventory,
      message: "Low stock threshold updated successfully",
    });
  } catch (error) {
    console.error("Update threshold error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Delete inventory
const deleteInventory = async (req, res) => {
  try {
    const { productId } = req.params;

    const inventory = await Inventory.findOneAndDelete({ productId });

    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: "Inventory not found",
      });
    }

    res.json({
      success: true,
      message: "Inventory deleted successfully",
    });
  } catch (error) {
    console.error("Delete inventory error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

module.exports = {
  createOrUpdateInventory,
  getAllInventory,
  getInventoryByProduct,
  getLowStockItems,
  updateStock,
  updateThreshold,
  deleteInventory,
  setWebSocket,
};
