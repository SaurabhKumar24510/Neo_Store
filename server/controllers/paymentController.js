const crypto = require("crypto");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");

const deliveryPartners = ["BlueDart", "Delhivery", "Ekart", "DTDC"];
const supportedOnlineMethods = new Set(["Card", "Net Banking", "UPI"]);
const sampleRazorpayCredentials = {
  keyId: "rzp_test_A1B2C3D4E5",
  keySecret: "abCDefgh12345678",
};
const couponCatalog = {
  SAVE10: { type: "percentage", value: 10 },
  FREESHIP: { type: "shipping", value: 99 },
};

function logPayment(event, details = {}) {
  console.log(`[payment] ${event}`, details);
}

function logPaymentError(event, error, details = {}) {
  console.error(`[payment] ${event}`, {
    message: error.message,
    stack: error.stack,
    ...details,
  });
}

let cachedLegacySellerId = null;

async function getLegacyFallbackSellerId() {
  if (cachedLegacySellerId) {
    return cachedLegacySellerId;
  }

  const configuredSellerId = process.env.LEGACY_PRODUCT_SELLER_ID;
  if (configuredSellerId && mongoose.Types.ObjectId.isValid(configuredSellerId)) {
    const configuredSeller = await User.findOne({
      _id: configuredSellerId,
      role: { $in: ["seller", "admin"] },
    }).select("_id");

    if (configuredSeller) {
      cachedLegacySellerId = String(configuredSeller._id);
      return cachedLegacySellerId;
    }
  }

  const fallbackSeller = await User.findOne({
    role: { $in: ["seller", "admin"] },
  }).sort({ createdAt: 1 }).select("_id");

  if (!fallbackSeller) {
    throw new Error("No seller account is available to own legacy products.");
  }

  cachedLegacySellerId = String(fallbackSeller._id);
  return cachedLegacySellerId;
}

function sanitizeDeliveryAddress(address) {
  return {
    fullName: address.fullName?.trim(),
    phoneNumber: address.phoneNumber?.trim(),
    address: address.address?.trim(),
    city: address.city?.trim(),
    state: address.state?.trim(),
    pincode: address.pincode?.trim(),
  };
}

function buildCheckoutGroupId() {
  return `chk_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function getRazorpayCredentialState() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  const keysLoaded = Boolean(keyId && keySecret);
  const placeholdersDetected =
    keyId === sampleRazorpayCredentials.keyId ||
    keySecret === sampleRazorpayCredentials.keySecret;

  return {
    keyId,
    keySecret,
    keysLoaded,
    placeholdersDetected,
    enabled: keysLoaded && !placeholdersDetected,
  };
}

function getRazorpayClient() {
  const credentialState = getRazorpayCredentialState();

  if (!credentialState.keysLoaded) {
    throw new Error("Razorpay keys are not configured.");
  }

  if (credentialState.placeholdersDetected) {
    throw new Error("Sample Razorpay placeholder keys are configured. Replace them with your real Test Mode API keys from the Razorpay Dashboard.");
  }

  return new Razorpay({
    key_id: credentialState.keyId,
    key_secret: credentialState.keySecret,
  });
}

exports.getPaymentStatus = async (req, res) => {
  try {
    const credentialState = getRazorpayCredentialState();
    const razorpayEnabled = credentialState.enabled;

    return res.json({
      success: true,
      razorpayEnabled,
      onlinePaymentsEnabled: razorpayEnabled,
      provider: razorpayEnabled ? "razorpay" : null,
      supportedMethods: razorpayEnabled ? ["Card", "Net Banking", "UPI"] : [],
      codEnabled: true,
      message: razorpayEnabled
        ? "Secure Razorpay checkout is available for cards, UPI, net banking, wallets, EMI, and QR."
        : credentialState.placeholdersDetected
          ? "Sample Razorpay keys are configured on the server. Replace them with real Test Mode API keys to enable secure online payments."
        : "Online payments are temporarily unavailable. Cash on Delivery is still available.",
    });
  } catch (error) {
    logPaymentError("payment-status:failed", error);
    return res.status(500).json({
      success: false,
      razorpayEnabled: false,
      onlinePaymentsEnabled: false,
      supportedMethods: [],
      codEnabled: true,
      message: "Unable to load payment status.",
    });
  }
};

exports.getPaymentConfig = exports.getPaymentStatus;

function validateAddress(deliveryAddress) {
  return Boolean(
    deliveryAddress.fullName &&
    deliveryAddress.phoneNumber &&
    deliveryAddress.address &&
    deliveryAddress.city &&
    deliveryAddress.state &&
    deliveryAddress.pincode
  );
}

function computeCheckoutTotals(subtotal, couponCode) {
  const normalizedCoupon = String(couponCode || "").trim().toUpperCase();
  const coupon = couponCatalog[normalizedCoupon] || null;
  const baseDelivery = subtotal > 0 ? (subtotal >= 1499 ? 0 : 99) : 0;

  let discount = 0;
  let delivery = baseDelivery;

  if (coupon?.type === "percentage") {
    discount = Math.round((subtotal * coupon.value) / 100);
  }

  if (coupon?.type === "shipping") {
    delivery = Math.max(0, baseDelivery - coupon.value);
  }

  return {
    couponCode: normalizedCoupon,
    subtotal,
    discount,
    delivery,
    total: Math.max(0, subtotal - discount + delivery),
  };
}

function allocateAmount(totalAmount, sellers) {
  const subtotal = sellers.reduce((sum, seller) => sum + seller.subtotal, 0);
  if (!subtotal || !totalAmount) {
    return sellers.map(() => 0);
  }

  let remaining = totalAmount;

  return sellers.map((seller, index) => {
    if (index === sellers.length - 1) {
      return remaining;
    }

    const ratio = seller.subtotal / subtotal;
    const allocated = Math.round(totalAmount * ratio);
    remaining -= allocated;
    return allocated;
  });
}

function normalizeOrderForResponse(order) {
  const source = typeof order.toObject === "function" ? order.toObject() : order;
  const createdAt = source.createdAt ? new Date(source.createdAt) : new Date();
  const estimatedDeliveryDate = new Date(createdAt);
  estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + 5);
  const idSeed = String(source._id || "");
  const seedTotal = idSeed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return {
    ...source,
    estimatedDeliveryDate,
    deliveryPartner: source.deliveryPartner || deliveryPartners[seedTotal % deliveryPartners.length],
    trackingId: source.trackingId || `NST${idSeed.slice(-8).toUpperCase()}`,
  };
}

async function buildSellerOrdersPayload({
  user,
  items,
  deliveryAddress,
  paymentMethod,
  paymentGateway,
  paymentStatus,
  gatewayOrderId = "",
  checkoutGroupId = "",
  paymentFailureReason = "",
}) {
  const productIds = items.map((item) => item.id).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } });
  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const groupedBySeller = new Map();
  const productsNeedingBackfill = [];

  for (const cartItem of items) {
    const product = productsById.get(String(cartItem.id));
    if (!product) {
      logPayment("create-order:product-missing", {
        cartItemId: cartItem.id || null,
        cartItemName: cartItem.name || null,
      });
      continue;
    }

    let sellerId = String(product.sellerId || product.seller || cartItem.sellerId || "");
    if (!sellerId) {
      sellerId = await getLegacyFallbackSellerId();
      productsNeedingBackfill.push(String(product._id));
      logPayment("create-order:legacy-seller-fallback", {
        productId: String(product._id),
        productName: product.name,
        fallbackSellerId: sellerId,
      });
    }

    if (!sellerId) {
      continue;
    }

    if (!groupedBySeller.has(sellerId)) {
      groupedBySeller.set(sellerId, []);
    }

    groupedBySeller.get(sellerId).push({
      product: product._id,
      sellerId,
      name: product.name,
      quantity: Math.max(1, Number(cartItem.quantity) || 1),
      price: Number(product.price) || 0,
      image: product.image || "",
      category: product.category || "General",
    });
  }

  if (productsNeedingBackfill.length) {
    const fallbackSellerId = await getLegacyFallbackSellerId();
    await Product.updateMany(
      {
        _id: { $in: productsNeedingBackfill },
        seller: null,
        sellerId: null,
      },
      {
        $set: {
          seller: fallbackSellerId,
          sellerId: fallbackSellerId,
        },
      }
    );

    logPayment("create-order:legacy-products-backfilled", {
      fallbackSellerId,
      productCount: productsNeedingBackfill.length,
      productIds: productsNeedingBackfill,
    });
  }

  if (!groupedBySeller.size) {
    throw new Error("No seller-linked products were found in your cart.");
  }

  const sellerEntries = Array.from(groupedBySeller.entries()).map(([sellerId, sellerItems]) => ({
    sellerId,
    items: sellerItems,
    subtotal: sellerItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
  }));

  return sellerEntries.map((entry) => ({
    customer: user._id,
    customerId: user._id,
    seller: entry.sellerId,
    sellerId: entry.sellerId,
    customerName: user.name,
    customerEmail: user.email,
    deliveryAddress,
    paymentMethod,
    paymentGateway,
    paymentStatus,
    gatewayOrderId,
    checkoutGroupId,
    paymentFailureReason,
    items: entry.items,
    subtotalAmount: entry.subtotal,
    discountAmount: 0,
    deliveryFee: 0,
    totalAmount: entry.subtotal,
    status: "pending",
    statusTimeline: {
      pendingAt: new Date(),
      processingAt: null,
      shippedAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      cancelledAt: null,
    },
    deliveryPartner: deliveryPartners[Math.floor(Math.random() * deliveryPartners.length)],
  }));
}

function applySharedTotals(orders, discountTotal, deliveryTotal) {
  const sellers = orders.map((order) => ({ subtotal: order.subtotalAmount }));
  const discountAllocations = allocateAmount(discountTotal, sellers);
  const deliveryAllocations = allocateAmount(deliveryTotal, sellers);

  return orders.map((order, index) => ({
    ...order,
    discountAmount: discountAllocations[index],
    deliveryFee: deliveryAllocations[index],
    totalAmount: Math.max(0, order.subtotalAmount - discountAllocations[index] + deliveryAllocations[index]),
  }));
}

exports.createOrder = async (req, res) => {
  try {
    const user = req.user;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const paymentMethod = req.body.paymentMethod?.trim() || "Cash on Delivery";
    const couponCode = req.body.couponCode;
    const deliveryAddress = sanitizeDeliveryAddress(req.body.deliveryAddress || {});

    logPayment("create-order:request", {
      userId: user ? String(user._id) : null,
      role: user?.role || null,
      paymentMethod,
      itemCount: items.length,
      couponCode: couponCode || "",
      ...(() => {
        const credentialState = getRazorpayCredentialState();
        return {
          hasKeyId: Boolean(credentialState.keyId),
          hasKeySecret: Boolean(credentialState.keySecret),
          placeholdersDetected: credentialState.placeholdersDetected,
        };
      })(),
    });

    if (!user) {
      return res.status(401).json({ message: "Please log in to place your order." });
    }

    if (user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can place orders." });
    }

    if (!items.length) {
      return res.status(400).json({ message: "Your cart is empty." });
    }

    if (!validateAddress(deliveryAddress)) {
      return res.status(400).json({ message: "Complete the delivery address before placing your order." });
    }

    const checkoutGroupId = buildCheckoutGroupId();
    const baseOrdersPayload = await buildSellerOrdersPayload({
      user,
      items,
      deliveryAddress,
      paymentMethod,
      paymentGateway: paymentMethod === "Cash on Delivery" ? "cod" : "razorpay",
      paymentStatus: paymentMethod === "Cash on Delivery" ? "pending_cod" : "created",
      checkoutGroupId,
    });
    const subtotal = baseOrdersPayload.reduce((sum, order) => sum + order.subtotalAmount, 0);
    const totals = computeCheckoutTotals(subtotal, couponCode);

    logPayment("create-order:computed-totals", {
      checkoutGroupId,
      subtotal,
      discount: totals.discount,
      delivery: totals.delivery,
      totalRupees: totals.total,
    });

    if (paymentMethod === "Cash on Delivery") {
      const preparedOrders = applySharedTotals(baseOrdersPayload, totals.discount, totals.delivery);
      const createdOrders = await Order.insertMany(preparedOrders);

      logPayment("create-order:cod-success", {
        checkoutGroupId,
        orderCount: createdOrders.length,
      });

      return res.status(201).json({
        success: true,
        flow: "cod",
        message: "Order placed successfully with Cash on Delivery.",
        orders: createdOrders.map(normalizeOrderForResponse),
      });
    }

    if (!supportedOnlineMethods.has(paymentMethod)) {
      return res.status(400).json({ message: "Please choose a supported payment method." });
    }

    const razorpay = getRazorpayClient();
    const amountInPaise = Math.round(totals.total * 100);

    if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount. Please review your cart and try again.",
        debug: {
          totalRupees: totals.total,
          amountInPaise,
        },
      });
    }

    logPayment("create-order:razorpay-init", {
      checkoutGroupId,
      paymentMethod,
      amountInPaise,
      currency: "INR",
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: checkoutGroupId.slice(0, 40),
      notes: {
        customerId: String(user._id),
        customerEmail: user.email,
        paymentMethod,
      },
    });

    const preparedOrders = applySharedTotals(
      baseOrdersPayload.map((order) => ({
        ...order,
        gatewayOrderId: razorpayOrder.id,
      })),
      totals.discount,
      totals.delivery
    );
    await Order.insertMany(preparedOrders);

    logPayment("create-order:razorpay-success", {
      checkoutGroupId,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    });

    return res.status(201).json({
      success: true,
      flow: "online",
      message: "Payment order created successfully.",
      checkoutGroupId,
      key: process.env.RAZORPAY_KEY_ID,
      orderId: razorpayOrder.id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      displayAmount: totals.total,
      paymentMethod,
      prefill: {
        name: user.name,
        email: user.email,
        contact: deliveryAddress.phoneNumber || user.phone || "",
      },
      notes: {
        checkoutGroupId,
        customerId: String(user._id),
        customerEmail: user.email,
      },
      orderSummary: totals,
    });
  } catch (error) {
    logPaymentError("create-order:failed", error, {
      userId: req.user ? String(req.user._id) : null,
      paymentMethod: req.body?.paymentMethod || null,
    });

    const isConfigError = error.message === "Razorpay keys are not configured.";
    const isPlaceholderError = error.message === "Sample Razorpay placeholder keys are configured. Replace them with your real Test Mode API keys from the Razorpay Dashboard.";
    return res.status(isConfigError ? 500 : 500).json({
      success: false,
      message: isConfigError
        ? "Razorpay test keys are missing on the server. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to server/.env and restart the backend."
        : isPlaceholderError
          ? "Razorpay sample keys are still configured. Open the Razorpay Dashboard, copy your real Test Mode API keys, paste them into server/.env, and restart the backend."
        : error.message || "Unable to initialize payment right now. Please try again.",
      debug: {
        type: isConfigError ? "razorpay_config" : isPlaceholderError ? "razorpay_placeholder_keys" : "create_order_failure",
        hasKeyId: Boolean(process.env.RAZORPAY_KEY_ID),
        hasKeySecret: Boolean(process.env.RAZORPAY_KEY_SECRET),
        placeholdersDetected: getRazorpayCredentialState().placeholdersDetected,
      },
    });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const {
      checkoutGroupId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentStatus,
      failureReason,
    } = req.body;

    logPayment("verify-payment:request", {
      userId: req.user ? String(req.user._id) : null,
      checkoutGroupId: checkoutGroupId || null,
      razorpayOrderId: razorpay_order_id || null,
      paymentStatus: paymentStatus || "success_attempt",
    });

    if (!checkoutGroupId || !razorpay_order_id) {
      return res.status(400).json({ message: "Missing checkout reference for payment verification." });
    }

    const orders = await Order.find({
      checkoutGroupId,
      gatewayOrderId: razorpay_order_id,
      customer: req.user._id,
    });

    if (!orders.length) {
      return res.status(404).json({ message: "No matching order was found for this payment." });
    }

    if (paymentStatus === "failed") {
      await Order.updateMany(
        { checkoutGroupId, gatewayOrderId: razorpay_order_id, customer: req.user._id },
        {
          $set: {
            paymentStatus: "failed",
            paymentFailureReason: failureReason || "Payment was not completed.",
          },
        }
      );

      logPayment("verify-payment:marked-failed", {
        checkoutGroupId,
        razorpayOrderId: razorpay_order_id,
        failureReason: failureReason || "Payment was not completed.",
      });

      return res.status(400).json({ message: failureReason || "Payment failed or was cancelled." });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await Order.updateMany(
        { checkoutGroupId, gatewayOrderId: razorpay_order_id, customer: req.user._id },
        {
          $set: {
            paymentStatus: "failed",
            paymentFailureReason: "Payment signature verification failed.",
          },
        }
      );

      logPayment("verify-payment:signature-mismatch", {
        checkoutGroupId,
        razorpayOrderId: razorpay_order_id,
      });

      return res.status(400).json({ message: "Payment verification failed." });
    }

    await Order.updateMany(
      { checkoutGroupId, gatewayOrderId: razorpay_order_id, customer: req.user._id },
      {
        $set: {
          paymentStatus: "paid",
          gatewayPaymentId: razorpay_payment_id,
          gatewaySignature: razorpay_signature,
          paymentFailureReason: "",
          paidAt: new Date(),
        },
      }
    );

    const updatedOrders = await Order.find({
      checkoutGroupId,
      gatewayOrderId: razorpay_order_id,
      customer: req.user._id,
    }).sort({ createdAt: -1 });

    logPayment("verify-payment:success", {
      checkoutGroupId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      orderCount: updatedOrders.length,
    });

    return res.json({
      success: true,
      message: "Payment verified and order placed successfully.",
      orders: updatedOrders.map(normalizeOrderForResponse),
    });
  } catch (error) {
    logPaymentError("verify-payment:failed", error, {
      userId: req.user ? String(req.user._id) : null,
      checkoutGroupId: req.body?.checkoutGroupId || null,
      razorpayOrderId: req.body?.razorpay_order_id || null,
    });
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to verify payment right now.",
    });
  }
};
