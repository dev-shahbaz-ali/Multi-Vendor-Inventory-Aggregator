const crypto = require("crypto");
const Vendor = require("../models/Vendor");
const Product = require("../models/Product");

const verifySignature = (data, signature) => {
  const expected = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET || "")
    .update(JSON.stringify(data))
    .digest("hex");
  return signature === expected;
};

const handlePriceUpdate = async (vendorCode, productSku, newPrice, signature, rawBody) => {
  if (!verifySignature(rawBody, signature)) {
    const err = new Error("Invalid signature");
    err.status = 401;
    throw err;
  }

  const vendor = await Vendor.findOne({ code: vendorCode });
  if (!vendor) {
    const err = new Error("Vendor not found");
    err.status = 404;
    throw err;
  }

  const product = await Product.findOne({ sku: productSku, vendorId: vendor._id });
  if (!product) {
    const err = new Error("Product not found");
    err.status = 404;
    throw err;
  }

  const oldPrice = product.currentPrice;
  product.currentPrice = newPrice;
  await product.save();

  return { productName: product.name, oldPrice, newPrice };
};

module.exports = { handlePriceUpdate };
