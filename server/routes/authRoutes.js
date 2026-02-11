// server/routes/authRoutes.js

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/userModel"); // Make sure this model exists

// ✅ Signup Route
router.post("/signup", async (req, res) => {
  console.log("✅ POST /signup hit");
  try {
    const { name, email, phone, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save the new user
    const newUser = new User({
      name,
      email,
      phone,
      password: hashedPassword,
    });

    await newUser.save();

    res.status(201).json({ message: "Signup successful!" });
  } catch (err) {
    console.error("Signup error:", err.message);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// ✅ Login Route
router.post("/login", async (req, res) => {
  console.log("✅ POST /login hit");
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Send back user data (excluding password)
    const { name, phone } = user;
    res.status(200).json({
      message: "Login successful",
      user: { name, email, phone },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

module.exports = router;
