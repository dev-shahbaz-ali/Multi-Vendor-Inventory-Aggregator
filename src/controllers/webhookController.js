const webhookService = require("../services/webhookService");

const handlePriceUpdate = async (req, res, next) => {
  try {
    const { vendorCode, productSku, newPrice, signature } = req.body;
    const result = await webhookService.handlePriceUpdate(vendorCode, productSku, newPrice, signature, req.body);
    res.json({
      success: true,
      message: "Price updated successfully",
      data: { product: result.productName, oldPrice: result.oldPrice, newPrice: result.newPrice },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { handlePriceUpdate };
