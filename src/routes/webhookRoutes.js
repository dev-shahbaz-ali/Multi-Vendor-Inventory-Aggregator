const express = require("express");
const router = express.Router();
const webhookController = require("../controllers/webhookController");
const validate = require("../middlewares/validate");

router.post("/webhook/price-update", validate.webhookPriceUpdate, webhookController.handlePriceUpdate);

module.exports = router;
