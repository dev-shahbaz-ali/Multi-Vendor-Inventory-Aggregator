const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

// Product routes
router.post("/products", productController.createProduct);
router.get("/products", productController.getAllProducts);
router.get("/products/:id", productController.getProductById);
router.put("/products/:id/price", productController.updateProductPrice);
router.delete("/products/:id", productController.deleteProduct);

module.exports = router;
