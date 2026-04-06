const Product = require("../models/Product");

const createProduct = async (name, sku, vendorId, currentPrice, description) => {
  const existing = await Product.findOne({ sku: sku.toUpperCase() });
  if (existing) {
    const err = new Error(`Product with SKU "${sku}" already exists.`);
    err.status = 400;
    throw err;
  }
  const product = new Product({ name, sku, vendorId, currentPrice, description });
  await product.save();
  return product;
};

const getProducts = async () => {
  return Product.find().sort({ createdAt: -1 });
};

const updatePrice = async (id, newPrice) => {
  const product = await Product.findById(id);
  if (!product) {
    const err = new Error("Product not found");
    err.status = 404;
    throw err;
  }
  const oldPrice = product.currentPrice;
  product.currentPrice = newPrice;
  await product.save();
  return { product, oldPrice };
};

module.exports = { createProduct, getProducts, updatePrice };
