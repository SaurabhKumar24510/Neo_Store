// server/index.js
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
require('dotenv').config();

// ✅ Connect to MongoDB
connectDB();

const app = express();

// ✅ Middlewares
app.use(cors());
app.use(express.json());

// ✅ Routes
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes"); // <-- 🔹 New line added

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes); // <-- 🔹 Product routes connected

// ✅ Serve frontend static files (after API routes)
app.use(express.static(path.join(__dirname, '../client')));

// ✅ Fallback to index.html for unmatched routes (for SPA or default route)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ✅ Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server is running at: http://localhost:${PORT}`);
});
