const express = require("express");
const router = express.Router();
const purchaseController = require("../controllers/purchaseController");
const validate = require("../middlewares/validate");

router.post("/purchase", validate.purchase, purchaseController.processPurchase);
router.post("/purchase/batch", validate.batchPurchase, purchaseController.processBatchPurchases);
router.get("/purchase/all", purchaseController.getAllTransactions);
router.get("/purchase/transaction/:transactionId", purchaseController.getTransactionStatus);
router.get("/purchase/history/:productId", purchaseController.getPurchaseHistory);
router.get("/purchase/stats", purchaseController.getPurchaseStats);

module.exports = router;
