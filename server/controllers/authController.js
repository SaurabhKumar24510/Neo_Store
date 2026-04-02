const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9]{10}$/;
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function signToken(user) {
  return jwt.sign(
    { userId: user._id, role: user.role },
    process.env.JWT_SECRET || "neostore_dev_secret_change_me",
    { expiresIn: "7d" }
  );
}

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    shopName: user.shopName || "",
  };
}

function validateSignupPayload({ name, email, phone, password, confirmPassword, role, shopName }) {
  if (!name || !email || !phone || !password || !confirmPassword) {
    return "All fields are required.";
  }

  if (!["customer", "seller"].includes(role || "customer")) {
    return "Please choose a valid account type.";
  }

  if (!emailPattern.test(email)) {
    return "Please enter a valid email address.";
  }

  if (!phonePattern.test(phone)) {
    return "Phone number must be 10 digits.";
  }

  if (!passwordPattern.test(password)) {
    return "Password must be at least 8 characters and include letters and numbers.";
  }

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  if ((role || "customer") === "seller" && !shopName) {
    return "Shop name is required for seller accounts.";
  }

  return null;
}

function isBcryptHash(value) {
  return typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);
}

exports.signup = async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const phone = req.body.phone?.trim();
    const password = req.body.password?.trim();
    const confirmPassword = req.body.confirmPassword?.trim();
    const role = req.body.role?.trim() || "customer";
    const shopName = req.body.shopName?.trim() || "";

    const validationError = validateSignupPayload({
      name,
      email,
      phone,
      password,
      confirmPassword,
      role,
      shopName,
    });

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const user = await User.create({
      name,
      email,
      phone,
      password,
      role,
      shopName: role === "seller" ? shopName : "",
    });

    console.log("Signup success:", {
      userId: String(user._id),
      email: user.email,
      role: user.role,
      passwordHashed: isBcryptHash(user.password),
    });

    return res.status(201).json({
      message: "Account created successfully. Please log in to continue.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Signup error:", {
      message: error.message,
      email: req.body.email,
      role: req.body.role || "customer",
    });
    return res.status(500).json({ message: "Unable to create account right now. Please try again." });
  }
};

exports.login = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    console.log("Login attempt:", {
      email,
      hasPassword: Boolean(password),
    });

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    if (!emailPattern.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.warn("Login failed: user not found", { email });
      return res.status(401).json({ message: "Invalid email or password." });
    }

    console.log("Login user fetched:", {
      userId: String(user._id),
      email: user.email,
      role: user.role,
      passwordHashed: isBcryptHash(user.password),
    });

    if (!isBcryptHash(user.password)) {
      console.error("Login failed: stored password is not a bcrypt hash", {
        userId: String(user._id),
        email: user.email,
      });
      return res.status(500).json({ message: "Stored password format is invalid. Please reset or recreate this account." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      console.warn("Login failed: password mismatch", {
        userId: String(user._id),
        email: user.email,
      });
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = signToken(user);

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Login error:", {
      message: error.message,
      email: req.body.email,
    });
    return res.status(500).json({ message: "Unable to log in right now. Please try again." });
  }
};

exports.getProfile = async (req, res) => {
  return res.status(200).json({ user: sanitizeUser(req.user) });
};
