const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
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
    default: "General"
  }

}, { timestamps: true });

productSchema.pre("save", function syncSellerId(next) {
  if (this.seller && !this.sellerId) {
    this.sellerId = this.seller;
  }

  if (this.sellerId && !this.seller) {
    this.seller = this.sellerId;
  }

  next();
});

module.exports = mongoose.model("Product", productSchema);
