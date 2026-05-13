// server/index.js
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
require('dotenv').config();

// ✅ Connect to MongoDB
connectDB();

const app = express();
const clientPath = path.resolve(__dirname, '../Client');

// ✅ Middlewares
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Routes
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/payments", paymentRoutes);

// ✅ Serve frontend static files (after API routes)
app.use(express.static(clientPath));

// ✅ Fallback to index.html for unmatched routes (for SPA or default route)
app.get("/", (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

app.get("/seller-dashboard", (req, res) => {
  res.sendFile(path.join(clientPath, "seller-dashboard.html"));
});

app.get("/my-orders", (req, res) => {
  res.sendFile(path.join(clientPath, "my-orders.html"));
});

// ✅ Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server is running at: http://localhost:${PORT}`);
  console.log("🔐 Razorpay config:", {
    keyIdLoaded: Boolean(process.env.RAZORPAY_KEY_ID),
    keySecretLoaded: Boolean(process.env.RAZORPAY_KEY_SECRET),
  });
});
