const express = require("express");
const router = express.Router();
const purchaseController = require("../controllers/purchaseController");

// Purchase routes
router.post("/purchase", purchaseController.processPurchase);
router.post("/purchase/batch", purchaseController.processBatchPurchases);
router.get(
  "/purchase/transaction/:transactionId",
  purchaseController.getTransactionStatus,
);
router.get(
  "/purchase/history/:productId",
  purchaseController.getPurchaseHistory,
);
router.get("/purchase/stats", purchaseController.getPurchaseStats);

module.exports = router;
