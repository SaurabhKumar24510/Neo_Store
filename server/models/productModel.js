const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },

  description: {
    type: String
  },

  price: {
    type: Number,
    required: true
  },

  image: {
    type: String,
    default: "https://via.placeholder.com/300x200?text=No+Image"
  },

  // 🔥 IMPORTANT FOR CATEGORY FEATURE
  category: {
    type: String,
    required: true
  }

}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);
