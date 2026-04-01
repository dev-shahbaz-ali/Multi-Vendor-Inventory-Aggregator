const Product = require("../models/Product");

// Create a new product
const createProduct = async (req, res) => {
  try {
    const { sku, name, vendorId, currentPrice, description } = req.body;

    // Validate required fields
    if (!sku || !name || !vendorId || currentPrice === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: sku, name, vendorId, currentPrice",
      });
    }

    // Check if product already exists
    const existingProduct = await Product.findOne({ sku });
    if (existingProduct) {
      return res.status(409).json({
        success: false,
        error: "Product with this SKU already exists",
      });
    }

    // Create new product
    const product = new Product({
      sku,
      name,
      vendorId,
      currentPrice,
      description,
    });

    await product.save();

    res.status(201).json({
      success: true,
      data: product,
      message: "Product created successfully",
    });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

// Get all products
const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get single product by ID
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Update product price
const updateProductPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPrice } = req.body;

    if (currentPrice === undefined || currentPrice < 0) {
      return res.status(400).json({
        success: false,
        error: "Valid currentPrice is required",
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    const oldPrice = product.currentPrice;
    product.currentPrice = currentPrice;
    await product.save();

    res.json({
      success: true,
      data: product,
      oldPrice,
      message: "Price updated successfully",
    });
  } catch (error) {
    console.error("Update price error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProductPrice,
  deleteProduct,
};
