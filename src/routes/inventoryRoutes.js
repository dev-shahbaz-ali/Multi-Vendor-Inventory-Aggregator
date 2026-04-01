const express = require("express");
const router = express.Router();
const inventoryController = require("../controllers/inventoryController");

// Inventory routes
router.post("/inventory", inventoryController.createOrUpdateInventory);
router.get("/inventory", inventoryController.getAllInventory);
router.get("/inventory/low-stock", inventoryController.getLowStockItems);
router.get(
  "/inventory/product/:productId",
  inventoryController.getInventoryByProduct,
);
router.put("/inventory/:productId/stock", inventoryController.updateStock);
router.put(
  "/inventory/:productId/threshold",
  inventoryController.updateThreshold,
);
router.delete("/inventory/:productId", inventoryController.deleteInventory);

module.exports = router;
