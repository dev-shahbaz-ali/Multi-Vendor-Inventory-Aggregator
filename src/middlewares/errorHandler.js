const errorHandler = (err, req, res, next) => {
  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({ success: false, error: "Invalid ID format" });
  }

  const status = err.status || 500;
  const body = { success: false, error: err.message || "Internal server error" };

  // Attach extra fields set on the error by services
  if (err.available !== undefined) body.available = err.available;
  if (err.requested !== undefined) body.requested = err.requested;
  if (err.currentStock !== undefined) body.currentStock = err.currentStock;

  res.status(status).json(body);
};

module.exports = errorHandler;
