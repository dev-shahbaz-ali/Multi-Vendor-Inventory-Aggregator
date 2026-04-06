let io = null;
let emitAlert = null;

const setWebSocket = (ioInstance, emitAlertFn) => {
  io = ioInstance;
  emitAlert = emitAlertFn;
};

const emitLowStockAlert = (productId, productName, sku, currentStock, threshold) => {
  if (!emitAlert) return;

  const isCritical = currentStock === 0;
  const alertData = {
    type: "LOW_STOCK",
    productId,
    productName,
    sku,
    currentStock,
    threshold,
    severity: isCritical ? "CRITICAL" : "WARNING",
    timestamp: new Date(),
    message: isCritical
      ? `⚠️ CRITICAL: ${productName} is OUT OF STOCK!`
      : `⚠️ WARNING: ${productName} has only ${currentStock} units left (threshold: ${threshold})`,
  };

  emitAlert("low_stock_alert", alertData);
  console.log(`📢 Alert emitted: ${alertData.severity} — ${productName}`);
};

module.exports = { setWebSocket, emitLowStockAlert };
