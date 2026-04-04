const Product = require("../models/Product");

exports.createProduct = async (req, res) => {
  try {
    const { name, sku, currentPrice, description } = req.body;

    // Check if product with this SKU already exists
    const existingProduct = await Product.findOne({ sku: sku.toUpperCase() });
    if (existingProduct) {
      return res.status(400).json({
        message: `Product with SKU "${sku}" already exists.`,
      });
    }

    const product = new Product({ name, sku, currentPrice, description });
    await product.save();

    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Error fetching products" });
  }
};
