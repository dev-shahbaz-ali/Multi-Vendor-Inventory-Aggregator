const purchaseService = require("../services/purchaseService");

const processPurchase = async (req, res, next) => {
  try {
    const { productId, quantity, userId } = req.body;
    const result = await purchaseService.processPurchase(productId, quantity, userId);
    res.status(200).json({
      success: true,
      data: {
        transactionId: result.transactionId,
        product: result.product,
        quantity: result.quantity,
        remainingStock: result.remainingStock,
        timestamp: result.timestamp,
      },
      alerts: {
        isLowStock: result.isLowStock,
        isCritical: result.isCritical,
        message: result.isCritical
          ? "CRITICAL: Product is now out of stock!"
          : result.isLowStock
            ? "Warning: Stock is now low!"
            : null,
      },
      message: "Purchase completed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const processBatchPurchases = async (req, res, next) => {
  try {
    const results = await purchaseService.processBatchPurchases(req.body.purchases);
    const successful = results.filter((r) => r.success).length;
    res.status(200).json({
      success: true,
      summary: { total: results.length, successful, failed: results.length - successful },
      results,
    });
  } catch (error) {
    next(error);
  }
};

const getTransactionStatus = async (req, res, next) => {
  try {
    const transaction = await purchaseService.getTransactionStatus(req.params.transactionId);
    res.json({ success: true, data: transaction });
  } catch (error) {
    next(error);
  }
};

const getPurchaseHistory = async (req, res, next) => {
  try {
    const transactions = await purchaseService.getPurchaseHistory(req.params.productId, req.query.limit);
    res.json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    next(error);
  }
};

const getPurchaseStats = async (req, res, next) => {
  try {
    const stats = await purchaseService.getPurchaseStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

const getAllTransactions = async (req, res, next) => {
  try {
    const transactions = await purchaseService.getAllTransactions();
    res.json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  processPurchase,
  processBatchPurchases,
  getTransactionStatus,
  getPurchaseHistory,
  getPurchaseStats,
  getAllTransactions,
};
