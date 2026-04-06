const productService = require("../services/productService");

exports.createProduct = async (req, res, next) => {
  try {
    const { name, sku, vendorId, currentPrice, description } = req.body;
    const product = await productService.createProduct(name, sku, vendorId, currentPrice, description);
    res.status(201).json({ success: true, data: product, message: "Product created successfully" });
  } catch (error) {
    next(error);
  }
};

exports.getProducts = async (req, res, next) => {
  try {
    const products = await productService.getProducts();
    res.json({ success: true, count: products.length, data: products });
  } catch (error) {
    next(error);
  }
};

exports.updatePrice = async (req, res, next) => {
  try {
    const { currentPrice } = req.body;
    const price = Number(currentPrice);
    if (isNaN(price) || price < 0) {
      const err = new Error("currentPrice must be a non-negative number");
      err.status = 400;
      return next(err);
    }
    const { product, oldPrice } = await productService.updatePrice(req.params.id, price);
    res.json({
      success: true,
      data: product,
      oldPrice,
      message: "Price updated successfully",
    });
  } catch (error) {
    next(error);
  }
};
