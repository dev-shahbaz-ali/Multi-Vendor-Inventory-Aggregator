const express = require("express");
const router = express.Router();
const reconciliationController = require("../controllers/reconciliationController");

router.post("/reconciliation/run", reconciliationController.runReconciliation);

module.exports = router;
