const { v4: uuidv4 } = require("uuid");
const Inventory = require("../models/Inventory");
const Product = require("../models/Product");
const Transaction = require("../models/Transaction");

// WebSocket variables
let io = null;
let emitAlert = null;

const setWebSocket = (ioInstance, emitAlertFunction) => {
  io = ioInstance;
  emitAlert = emitAlertFunction;
};

// Process a single purchase with atomic operation (no transactions needed)
const processPurchase = async (req, res) => {
  const transactionId = uuidv4();

  try {
    const { productId, quantity, userId } = req.body;

    // Validate input
    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid request. productId and positive quantity required",
      });
    }

    // Create transaction record
    const transaction = new Transaction({
      productId,
      quantity,
      transactionId,
      status: "pending",
      userId: userId || "anonymous",
      timestamp: new Date(),
    });
    await transaction.save();

    // Try to find and update inventory atomically
    // This is the key - it's atomic and prevents race conditions
    const inventory = await Inventory.findOne({ productId });

    if (!inventory) {
      await Transaction.findOneAndUpdate(
        { transactionId },
        { status: "failed", error: "Inventory not found" },
      );
      return res.status(404).json({
        success: false,
        error: "Inventory not found for this product",
      });
    }

    // Check if enough stock is available
    if (inventory.stock < quantity) {
      await Transaction.findOneAndUpdate(
        { transactionId },
        { status: "failed", error: "Insufficient stock" },
      );

      return res.status(409).json({
        success: false,
        error: "Insufficient stock",
        available: inventory.stock,
        requested: quantity,
      });
    }

    // ATOMIC OPERATION: This prevents race conditions
    // It ensures that stock is only reduced if it's still >= quantity
    const updatedInventory = await Inventory.findOneAndUpdate(
      {
        productId: productId,
        stock: { $gte: quantity }, // Only update if stock is sufficient
      },
      {
        $inc: {
          stock: -quantity,
          version: 1,
        },
        $set: { lastSyncedAt: new Date() },
      },
      {
        new: true, // Return the updated document
      },
    );

    if (!updatedInventory) {
      // Stock changed during the operation
      await Transaction.findOneAndUpdate(
        { transactionId },
        { status: "failed", error: "Stock changed during operation" },
      );

      return res.status(409).json({
        success: false,
        error: "Stock changed during purchase. Please try again.",
      });
    }

    // Update transaction to completed
    await Transaction.findOneAndUpdate(
      { transactionId },
      { status: "completed" },
    );

    // Get product details for response
    const product = await Product.findById(productId);

    // Check if stock became low after purchase
    const isLowStock =
      updatedInventory.stock <= updatedInventory.lowStockThreshold;
    const isCritical = updatedInventory.stock === 0;

    // ============================================================
    // EMIT WEBSOCKET ALERT if stock is low
    // ============================================================
    if (isLowStock && emitAlert) {
      const alertData = {
        type: "LOW_STOCK",
        productId: productId,
        productName: product ? product.name : "Unknown",
        sku: product ? product.sku : "N/A",
        currentStock: updatedInventory.stock,
        threshold: updatedInventory.lowStockThreshold,
        severity: isCritical ? "CRITICAL" : "WARNING",
        timestamp: new Date(),
        message: isCritical
          ? `⚠️ CRITICAL: ${product ? product.name : "Product"} is OUT OF STOCK!`
          : `⚠️ WARNING: ${product ? product.name : "Product"} has only ${updatedInventory.stock} units left (threshold: ${updatedInventory.lowStockThreshold})`,
      };

      emitAlert("low_stock_alert", alertData);
      console.log(
        `📢 WebSocket Alert Sent: ${alertData.severity} - ${alertData.productName}`,
      );
    }
    // ============================================================

    res.status(200).json({
      success: true,
      data: {
        transactionId,
        product: {
          id: productId,
          name: product ? product.name : "Unknown",
          sku: product ? product.sku : "N/A",
        },
        quantity,
        remainingStock: updatedInventory.stock,
        timestamp: new Date(),
      },
      alerts: {
        isLowStock,
        isCritical,
        message: isCritical
          ? "CRITICAL: Product is now out of stock!"
          : isLowStock
            ? "Warning: Stock is now low!"
            : null,
      },
      message: "Purchase completed successfully",
    });
  } catch (error) {
    console.error("Purchase error:", error);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        error: "Invalid Product ID format",
      });
    }

    // Update transaction as failed if it exists
    try {
      await Transaction.findOneAndUpdate(
        { transactionId },
        { status: "failed", error: error.message },
      );
    } catch (err) {
      console.error("Failed to update transaction:", err);
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
      transactionId,
    });
  }
};

// Process multiple purchases in batch
const processBatchPurchases = async (req, res) => {
  try {
    const { purchases } = req.body;

    if (!Array.isArray(purchases) || purchases.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Purchases array is required and must not be empty",
      });
    }

    // Validate all purchases first
    for (const purchase of purchases) {
      if (!purchase.productId || !purchase.quantity || purchase.quantity <= 0) {
        return res.status(400).json({
          success: false,
          error: "Each purchase must have productId and positive quantity",
        });
      }
    }

    const results = [];

    // Process each purchase sequentially (but each is atomic)
    for (const purchase of purchases) {
      const transactionId = uuidv4();

      try {
        // Create transaction record
        const transaction = new Transaction({
          productId: purchase.productId,
          quantity: purchase.quantity,
          transactionId,
          status: "pending",
          userId: purchase.userId || "anonymous",
        });
        await transaction.save();

        // Atomic stock reduction
        const updatedInventory = await Inventory.findOneAndUpdate(
          {
            productId: purchase.productId,
            stock: { $gte: purchase.quantity },
          },
          {
            $inc: { stock: -purchase.quantity, version: 1 },
            $set: { lastSyncedAt: new Date() },
          },
          { new: true },
        );

        if (updatedInventory) {
          await Transaction.findOneAndUpdate(
            { transactionId },
            { status: "completed" },
          );

          // Get product details for alert
          const product = await Product.findById(purchase.productId);

          // Check if stock became low after purchase
          const isLowStock =
            updatedInventory.stock <= updatedInventory.lowStockThreshold;
          const isCritical = updatedInventory.stock === 0;

          // EMIT WEBSOCKET ALERT if stock is low
          if (isLowStock && emitAlert) {
            const alertData = {
              type: "LOW_STOCK",
              productId: purchase.productId,
              productName: product ? product.name : "Unknown",
              sku: product ? product.sku : "N/A",
              currentStock: updatedInventory.stock,
              threshold: updatedInventory.lowStockThreshold,
              severity: isCritical ? "CRITICAL" : "WARNING",
              timestamp: new Date(),
              message: isCritical
                ? `⚠️ CRITICAL: ${product ? product.name : "Product"} is OUT OF STOCK!`
                : `⚠️ WARNING: ${product ? product.name : "Product"} has only ${updatedInventory.stock} units left (threshold: ${updatedInventory.lowStockThreshold})`,
            };

            emitAlert("low_stock_alert", alertData);
          }

          results.push({
            success: true,
            productId: purchase.productId,
            remainingStock: updatedInventory.stock,
            transactionId,
            quantity: purchase.quantity,
          });
        } else {
          const currentInventory = await Inventory.findOne({
            productId: purchase.productId,
          });
          await Transaction.findOneAndUpdate(
            { transactionId },
            {
              status: "failed",
              error: currentInventory
                ? "Insufficient stock"
                : "Inventory not found",
            },
          );
          results.push({
            success: false,
            productId: purchase.productId,
            error: currentInventory
              ? "Insufficient stock"
              : "Inventory not found",
            available: currentInventory ? currentInventory.stock : 0,
            requested: purchase.quantity,
            transactionId,
          });
        }
      } catch (error) {
        results.push({
          success: false,
          productId: purchase.productId,
          error: error.message,
          transactionId,
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    res.status(200).json({
      success: true,
      summary: {
        total: results.length,
        successful,
        failed,
      },
      results,
    });
  } catch (error) {
    console.error("Batch purchase error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

// Get transaction status
const getTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await Transaction.findOne({ transactionId }).populate(
      "productId",
      "sku name currentPrice",
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found",
      });
    }

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error("Get transaction error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get purchase history for a product
const getPurchaseHistory = async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 50 } = req.query;

    const transactions = await Transaction.find({
      productId,
      status: "completed",
    })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate("productId", "sku name currentPrice");

    res.json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    console.error("Get purchase history error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get purchase statistics
const getPurchaseStats = async (req, res) => {
  try {
    const stats = await Transaction.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
        },
      },
    ]);

    const totalTransactions = await Transaction.countDocuments();
    const totalFailed = await Transaction.countDocuments({ status: "failed" });
    const totalCompleted = await Transaction.countDocuments({
      status: "completed",
    });

    res.json({
      success: true,
      data: {
        total: totalTransactions,
        completed: totalCompleted,
        failed: totalFailed,
        successRate:
          totalTransactions > 0
            ? ((totalCompleted / totalTransactions) * 100).toFixed(2)
            : 0,
        byStatus: stats,
      },
    });
  } catch (error) {
    console.error("Get purchase stats error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get all transactions across all products
const getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .sort({ timestamp: -1 })
      .populate("productId", "sku name");
    res.json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    console.error("Get all transactions error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

module.exports = {
  processPurchase,
  processBatchPurchases,
  getTransactionStatus,
  getPurchaseHistory,
  getPurchaseStats,
  setWebSocket,
  getAllTransactions,
};
