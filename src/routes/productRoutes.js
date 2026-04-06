const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

router.get("/products", productController.getProducts);
router.post("/products", productController.createProduct);
router.put("/products/:id/price", productController.updatePrice);

module.exports = router;
