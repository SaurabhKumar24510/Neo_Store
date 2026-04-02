const express = require("express");
const router = express.Router();
const {
  getProducts,
  addProduct,
  getSellerProducts,
  updateSellerProduct,
  deleteSellerProduct,
} = require("../controllers/productController");
const { protect, authorize } = require("../middleware/authMiddleware");

// GET all products
router.get("/", getProducts);
router.get("/all", getProducts);

// POST new product
router.post("/", protect, authorize("seller", "admin"), addProduct);
router.get("/seller/mine", protect, authorize("seller", "admin"), getSellerProducts);
router.put("/seller/:id", protect, authorize("seller", "admin"), updateSellerProduct);
router.delete("/seller/:id", protect, authorize("seller", "admin"), deleteSellerProduct);

module.exports = router;
