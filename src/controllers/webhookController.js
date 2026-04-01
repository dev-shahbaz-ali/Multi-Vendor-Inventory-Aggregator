const Vendor = require("../models/Vendor");
const Product = require("../models/Product");

// Webhook endpoint for vendor price updates
const handlePriceUpdate = async (req, res) => {
  try {
    const { vendorCode, productSku, newPrice, signature } = req.body;

    // Verify webhook signature
    if (!verifySignature(req.body, signature)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Find vendor
    const vendor = await Vendor.findOne({ code: vendorCode });
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // Find product
    const product = await Product.findOne({
      sku: productSku,
      vendorId: vendor._id,
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Update price
    const oldPrice = product.currentPrice;
    product.currentPrice = newPrice;
    await product.save();

    res.json({
      success: true,
      message: "Price updated successfully",
      data: {
        product: product.name,
        oldPrice,
        newPrice,
      },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

function verifySignature(data, signature) {
  // Implement signature verification
  const crypto = require("crypto");
  const expected = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(data))
    .digest("hex");
  return signature === expected;
}

module.exports = { handlePriceUpdate };
