const inventoryService = require("../services/inventoryService");

const createOrUpdateInventory = async (req, res, next) => {
  try {
    const { productId, stock, lowStockThreshold } = req.body;
    const { inventory, created } = await inventoryService.createOrUpdateInventory(productId, stock, lowStockThreshold);
    res.status(created ? 201 : 200).json({
      success: true,
      data: inventory,
      message: created ? "Inventory created successfully" : "Inventory updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

const getAllInventory = async (req, res, next) => {
  try {
    const inventory = await inventoryService.getAllInventory();
    res.json({ success: true, count: inventory.length, data: inventory });
  } catch (error) {
    next(error);
  }
};

const getInventoryByProduct = async (req, res, next) => {
  try {
    const inventory = await inventoryService.getInventoryByProduct(req.params.productId);
    res.json({ success: true, data: inventory });
  } catch (error) {
    next(error);
  }
};

const getLowStockItems = async (req, res, next) => {
  try {
    const items = await inventoryService.getLowStockItems();
    res.json({
      success: true,
      count: items.length,
      data: items,
      message: items.length > 0 ? "Low stock items found" : "No low stock items",
    });
  } catch (error) {
    next(error);
  }
};

const updateStock = async (req, res, next) => {
  try {
    const { quantity, operation } = req.body;
    const { inventory, isLowStock, isCritical } = await inventoryService.updateStock(
      req.params.productId,
      quantity,
      operation
    );
    res.json({
      success: true,
      data: inventory,
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
    next(error);
  }
};

const updateThreshold = async (req, res, next) => {
  try {
    const inventory = await inventoryService.updateThreshold(req.params.productId, req.body.lowStockThreshold);
    res.json({ success: true, data: inventory, message: "Low stock threshold updated successfully" });
  } catch (error) {
    next(error);
  }
};

const deleteInventory = async (req, res, next) => {
  try {
    await inventoryService.deleteInventory(req.params.productId);
    res.json({ success: true, message: "Inventory deleted successfully" });
  } catch (error) {
    next(error);
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
};
