const express = require("express");
const router = express.Router();
const {
  placeOrder,
  getCustomerOrders,
  handleCustomerOrderAction,
  getSellerOrders,
  submitOrderReview,
  updateSellerOrderStatus,
  getSellerDashboardSummary,
} = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/", protect, authorize("customer"), placeOrder);
router.get("/my", protect, authorize("customer"), getCustomerOrders);
router.patch("/:id/cancel", protect, authorize("customer"), handleCustomerOrderAction);
router.patch("/:id/action", protect, authorize("customer"), handleCustomerOrderAction);
router.post("/:id/review/:productId", protect, authorize("customer"), submitOrderReview);
router.get("/seller", protect, authorize("seller", "admin"), getSellerOrders);
router.patch("/seller/:id/status", protect, authorize("seller", "admin"), updateSellerOrderStatus);
router.put("/seller/:id/status", protect, authorize("seller", "admin"), updateSellerOrderStatus);
router.get("/seller/summary", protect, authorize("seller", "admin"), getSellerDashboardSummary);

module.exports = router;
