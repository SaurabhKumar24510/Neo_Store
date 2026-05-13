const express = require("express");
const { getPaymentStatus, getPaymentConfig, createOrder, verifyPayment } = require("../controllers/paymentController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/status", getPaymentStatus);
router.get("/config", getPaymentConfig);
router.post("/create-order", protect, authorize("customer"), createOrder);
router.post("/verify", protect, authorize("customer"), verifyPayment);
router.post("/verify-payment", protect, authorize("customer"), verifyPayment);

module.exports = router;
