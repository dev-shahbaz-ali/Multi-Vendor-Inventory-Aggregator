const purchase = (req, res, next) => {
  const { productId, quantity } = req.body;
  if (!productId) {
    return res.status(400).json({ success: false, error: "productId is required" });
  }
  const qty = Number(quantity);
  if (quantity === undefined || isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
    return res.status(400).json({ success: false, error: "quantity must be a positive integer" });
  }
  next();
};

const batchPurchase = (req, res, next) => {
  const { purchases } = req.body;
  if (!Array.isArray(purchases) || purchases.length === 0) {
    return res.status(400).json({ success: false, error: "purchases must be a non-empty array" });
  }
  for (let i = 0; i < purchases.length; i++) {
    const { productId, quantity } = purchases[i];
    if (!productId) {
      return res.status(400).json({ success: false, error: `purchases[${i}].productId is required` });
    }
    const qty = Number(quantity);
    if (quantity === undefined || isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      return res.status(400).json({ success: false, error: `purchases[${i}].quantity must be a positive integer` });
    }
  }
  next();
};

const webhookPriceUpdate = (req, res, next) => {
  const { vendorCode, productSku, newPrice, signature } = req.body;
  if (!vendorCode) {
    return res.status(400).json({ success: false, error: "vendorCode is required" });
  }
  if (!productSku) {
    return res.status(400).json({ success: false, error: "productSku is required" });
  }
  const price = Number(newPrice);
  if (newPrice === undefined || isNaN(price) || price < 0) {
    return res.status(400).json({ success: false, error: "newPrice must be a non-negative number" });
  }
  if (!signature) {
    return res.status(400).json({ success: false, error: "signature is required" });
  }
  next();
};

const inventoryCreate = (req, res, next) => {
  const { productId, stock } = req.body;
  if (!productId) {
    return res.status(400).json({ success: false, error: "productId is required" });
  }
  const qty = Number(stock);
  if (stock === undefined || isNaN(qty) || qty < 0) {
    return res.status(400).json({ success: false, error: "stock must be a non-negative number" });
  }
  next();
};

module.exports = { purchase, batchPurchase, webhookPriceUpdate, inventoryCreate };
