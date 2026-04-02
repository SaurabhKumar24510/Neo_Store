// server/routes/authRoutes.js

const express = require("express");
const router = express.Router();
const { login, signup, getProfile } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", protect, getProfile);

module.exports = router;
