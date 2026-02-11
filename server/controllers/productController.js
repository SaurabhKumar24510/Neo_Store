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
    const { name, description, price, image } = req.body;
    const newProduct = new Product({ name, description, price, image });
    await newProduct.save();
    res.status(201).json({ message: "Product added successfully", product: newProduct });
  } catch (err) {
    res.status(400).json({ message: "Error adding product: " + err.message });
  }
};

module.exports = { getProducts, addProduct };
