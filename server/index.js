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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Routes
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);

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
});
