const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("../models/productModel");
const User = require("../models/userModel");

async function resolveFallbackSellerId() {
  const configuredSellerId = process.env.LEGACY_PRODUCT_SELLER_ID;

  if (configuredSellerId && mongoose.Types.ObjectId.isValid(configuredSellerId)) {
    const configuredSeller = await User.findOne({
      _id: configuredSellerId,
      role: { $in: ["seller", "admin"] },
    }).select("_id name email role");

    if (configuredSeller) {
      return configuredSeller;
    }
  }

  return User.findOne({
    role: { $in: ["seller", "admin"] },
  }).sort({ createdAt: 1 }).select("_id name email role");
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const fallbackSeller = await resolveFallbackSellerId();
  if (!fallbackSeller) {
    throw new Error("No seller/admin user found. Create a seller account before backfilling legacy products.");
  }

  const filter = {
    $or: [
      { seller: null },
      { sellerId: null },
    ],
  };

  const legacyCount = await Product.countDocuments(filter);
  console.log("[backfill] fallback seller:", {
    id: String(fallbackSeller._id),
    name: fallbackSeller.name,
    email: fallbackSeller.email,
    role: fallbackSeller.role,
  });
  console.log("[backfill] legacy products found:", legacyCount);

  if (!legacyCount) {
    console.log("[backfill] nothing to update.");
    return;
  }

  const result = await Product.updateMany(
    filter,
    {
      $set: {
        seller: fallbackSeller._id,
        sellerId: fallbackSeller._id,
      },
    }
  );

  console.log("[backfill] update result:", {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  });
}

run()
  .catch((error) => {
    console.error("[backfill] failed:", {
      message: error.message,
      stack: error.stack,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
  });
