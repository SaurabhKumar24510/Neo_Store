const Product = require("../models/productModel");

// ✅ Get all products
const getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// ✅ Add a new product
const addProduct = async (req, res) => {
  try {
    const { name, description, price, image, category } = req.body;
    const newProduct = new Product({
      seller: req.user?._id || null,
      sellerId: req.user?._id || null,
      name,
      description,
      price,
      image,
      category: category || "General",
    });
    await newProduct.save();
    res.status(201).json({ message: "Product added successfully", product: newProduct });
  } catch (err) {
    res.status(400).json({ message: "Error adding product: " + err.message });
  }
};

const getSellerProducts = async (req, res) => {
  try {
    const products = await Product.find({
      $or: [{ seller: req.user._id }, { sellerId: req.user._id }],
    }).sort({ createdAt: -1 });

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Unable to load seller products right now." });
  }
};

const updateSellerProduct = async (req, res) => {
  try {
    const { name, description, price, image, category } = req.body;
    const product = await Product.findOne({
      _id: req.params.id,
      $or: [{ seller: req.user._id }, { sellerId: req.user._id }],
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found for this seller." });
    }

    product.name = name?.trim() || product.name;
    product.description = description?.trim() || product.description;
    product.price = typeof price !== "undefined" ? price : product.price;
    product.image = image?.trim() || product.image;
    product.category = category?.trim() || product.category;

    await product.save();
    res.json({ message: "Product updated successfully.", product });
  } catch (err) {
    res.status(400).json({ message: "Unable to update product. Please check the submitted fields." });
  }
};

const deleteSellerProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      $or: [{ seller: req.user._id }, { sellerId: req.user._id }],
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found for this seller." });
    }
    res.json({ message: "Product deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: "Unable to delete product right now." });
  }
};

module.exports = {
  getProducts,
  addProduct,
  getSellerProducts,
  updateSellerProduct,
  deleteSellerProduct,
};
