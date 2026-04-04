const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

// GET /api/products - List all products
router.get("/products", productController.getProducts);

// POST /api/products - Create a new product
router.post("/products", productController.createProduct);

module.exports = router;
