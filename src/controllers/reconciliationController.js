const reconciliationService = require("../services/reconciliationService");

const runReconciliation = async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      const err = new Error("productId is required");
      err.status = 400;
      return next(err);
    }
    const result = await reconciliationService.reconcileWithVendor(productId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = { runReconciliation };
