const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const mongoose = require("mongoose");

const allowedStatuses = ["pending", "processing", "shipped", "out_for_delivery", "delivered", "cancelled"];
const estimatedDeliveryDays = 5;
const deliveryPartners = ["BlueDart", "Delhivery", "Ekart", "DTDC"];
const timelineSteps = ["pending", "processing", "shipped", "out_for_delivery", "delivered"];

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

function addTrackingMeta(order) {
  const source = typeof order.toObject === "function" ? order.toObject() : order;
  const createdAt = source.createdAt ? new Date(source.createdAt) : new Date();
  const estimatedDeliveryDate = new Date(createdAt);
  estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + estimatedDeliveryDays);
  const idSeed = String(source._id || "");
  const seedTotal = idSeed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const deliveryPartner = source.deliveryPartner || deliveryPartners[seedTotal % deliveryPartners.length];
  const trackingId = source.trackingId || `NST${idSeed.slice(-8).toUpperCase()}`;
  const statusTimeline = source.statusTimeline || {};
  const normalizedTimeline = {
    pendingAt: statusTimeline.pendingAt || source.createdAt || null,
    processingAt: statusTimeline.processingAt || null,
    shippedAt: statusTimeline.shippedAt || null,
    outForDeliveryAt: statusTimeline.outForDeliveryAt || null,
    deliveredAt: statusTimeline.deliveredAt || null,
    cancelledAt: statusTimeline.cancelledAt || null,
  };

  return {
    ...source,
    trackingSteps: timelineSteps,
    estimatedDeliveryDate,
    deliveryPartner,
    trackingId,
    statusTimeline: normalizedTimeline,
  };
}

function normalizeLegacyOrder(order) {
  const patch = {};

  if (!order.customer && order.customerId) {
    patch.customer = order.customerId;
  }

  if (!order.customerId && order.customer) {
    patch.customerId = order.customer;
  }

  if (!order.seller && order.sellerId) {
    patch.seller = order.sellerId;
  }

  if (!order.sellerId && order.seller) {
    patch.sellerId = order.seller;
  }

  if (!order.statusTimeline) {
    patch.statusTimeline = {
      pendingAt: order.createdAt || new Date(),
      processingAt: null,
      shippedAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      cancelledAt: null,
    };
  } else if (!order.statusTimeline.pendingAt) {
    patch["statusTimeline.pendingAt"] = order.createdAt || new Date();
  }

  return patch;
}

function buildStatusTimelinePatch(currentOrder, nextStatus) {
  const now = new Date();
  const patch = {};

  if (!currentOrder.statusTimeline?.pendingAt) {
    patch["statusTimeline.pendingAt"] = currentOrder.createdAt || now;
  }

  if (nextStatus === "processing" && !currentOrder.statusTimeline?.processingAt) {
    patch["statusTimeline.processingAt"] = now;
  }

  if (nextStatus === "shipped" && !currentOrder.statusTimeline?.shippedAt) {
    patch["statusTimeline.processingAt"] = currentOrder.statusTimeline?.processingAt || now;
    patch["statusTimeline.shippedAt"] = now;
  }

  if (nextStatus === "out_for_delivery" && !currentOrder.statusTimeline?.outForDeliveryAt) {
    patch["statusTimeline.processingAt"] = currentOrder.statusTimeline?.processingAt || now;
    patch["statusTimeline.shippedAt"] = currentOrder.statusTimeline?.shippedAt || now;
    patch["statusTimeline.outForDeliveryAt"] = now;
  }

  if (nextStatus === "delivered" && !currentOrder.statusTimeline?.deliveredAt) {
    patch["statusTimeline.processingAt"] = currentOrder.statusTimeline?.processingAt || now;
    patch["statusTimeline.shippedAt"] = currentOrder.statusTimeline?.shippedAt || now;
    patch["statusTimeline.outForDeliveryAt"] = currentOrder.statusTimeline?.outForDeliveryAt || now;
    patch["statusTimeline.deliveredAt"] = now;
  }

  if (nextStatus === "cancelled") {
    patch["statusTimeline.cancelledAt"] = now;
  }

  return patch;
}

exports.placeOrder = async (req, res) => {
  try {
    const user = req.user;
    const cartItems = Array.isArray(req.body.items) ? req.body.items : [];
    const deliveryAddress = sanitizeDeliveryAddress(req.body.deliveryAddress || {});
    const paymentMethod = req.body.paymentMethod?.trim() || "Cash on Delivery";

    if (!user) {
      return res.status(401).json({ message: "Please log in to place an order." });
    }

    if (user.role !== "customer") {
      return res.status(403).json({ message: "Seller accounts are in preview mode and cannot place orders." });
    }

    if (!cartItems.length) {
      return res.status(400).json({ message: "Your cart is empty." });
    }

    if (
      !deliveryAddress.fullName ||
      !deliveryAddress.phoneNumber ||
      !deliveryAddress.address ||
      !deliveryAddress.city ||
      !deliveryAddress.state ||
      !deliveryAddress.pincode
    ) {
      return res.status(400).json({ message: "Delivery address is required." });
    }

    const productIds = cartItems.map((item) => item.id).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds } });
    const productsById = new Map(products.map((product) => [String(product._id), product]));

    const groupedBySeller = new Map();

    for (const cartItem of cartItems) {
      const product = productsById.get(String(cartItem.id));

      if (!product) {
        continue;
      }

      const sellerId = String(product.sellerId || product.seller || "");
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

    if (!groupedBySeller.size) {
      return res.status(400).json({ message: "No seller-linked products were found in your cart." });
    }

    const ordersToCreate = Array.from(groupedBySeller.entries()).map(([sellerId, items]) => ({
      customer: user._id,
      customerId: user._id,
      seller: sellerId,
      sellerId,
      customerName: user.name,
      customerEmail: user.email,
      deliveryAddress,
      paymentMethod,
      paymentGateway: "cod",
      paymentStatus: "pending_cod",
      items,
      subtotalAmount: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      discountAmount: 0,
      deliveryFee: 0,
      totalAmount: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
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

    const createdOrders = await Order.insertMany(ordersToCreate);

    return res.status(201).json({
      message: "Order placed successfully.",
      orders: createdOrders.map(addTrackingMeta),
    });
  } catch (error) {
    console.error("Place order error:", error.message);
    return res.status(500).json({ message: "Unable to place order right now. Please try again." });
  }
};

exports.getCustomerOrders = async (req, res) => {
  try {
    const user = req.user;
    const orders = await Order.find({
      $or: [
        { customer: user._id },
        { customerId: user._id },
        { customerEmail: user.email },
      ],
    }).sort({ createdAt: -1 });

    return res.json({
      orders: orders.map(addTrackingMeta),
    });
  } catch (error) {
    console.error("Customer orders error:", error.message);
    return res.status(500).json({ message: "Unable to load your orders right now." });
  }
};

exports.handleCustomerOrderAction = async (req, res) => {
  try {
    const orderId = req.params.id;
    const action = req.body.action?.trim().toLowerCase();
    const user = req.user;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Please provide a valid order ID." });
    }

    if (!["cancel", "return", "refund"].includes(action)) {
      return res.status(400).json({ message: "Please choose a valid order action." });
    }

    const order = await Order.findOne({
      _id: orderId,
      $or: [{ customer: user._id }, { customerId: user._id }, { customerEmail: user.email }],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found for this customer." });
    }

    const patch = normalizeLegacyOrder(order);

    if (action === "cancel") {
      if (!["pending", "processing"].includes(order.status)) {
        return res.status(400).json({ message: "Only pending or processing orders can be cancelled." });
      }

      patch.status = "cancelled";
      Object.assign(patch, buildStatusTimelinePatch(order, "cancelled"));
    }

    if (action === "return") {
      if (order.status !== "delivered") {
        return res.status(400).json({ message: "Returns are available only after delivery." });
      }

      patch.returnStatus = order.returnStatus === "not_requested" ? "requested" : order.returnStatus;
      patch.returnRequestedAt = order.returnRequestedAt || new Date();
    }

    if (action === "refund") {
      if (!["cancelled", "delivered"].includes(order.status)) {
        return res.status(400).json({ message: "Refund requests are available for cancelled or delivered orders." });
      }

      patch.refundStatus = order.refundStatus === "not_requested" ? "requested" : order.refundStatus;
      patch.refundRequestedAt = order.refundRequestedAt || new Date();
    }

    await Order.collection.updateOne({ _id: order._id }, { $set: patch });
    const updatedOrder = await Order.findById(orderId);

    return res.json({
      message: `${action.charAt(0).toUpperCase()}${action.slice(1)} request updated successfully.`,
      order: addTrackingMeta(updatedOrder),
    });
  } catch (error) {
    console.error("Customer order action error:", error.message);
    return res.status(500).json({ message: "Unable to update this order action right now." });
  }
};

exports.submitOrderReview = async (req, res) => {
  try {
    const orderId = req.params.id;
    const productId = req.params.productId;
    const rating = Number(req.body.rating);
    const review = req.body.review?.trim() || "";
    const user = req.user;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId) || !productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Please provide valid order and product IDs." });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Please provide a rating between 1 and 5." });
    }

    const order = await Order.findOne({
      _id: orderId,
      $or: [{ customer: user._id }, { customerId: user._id }, { customerEmail: user.email }],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found for this customer." });
    }

    if (order.status !== "delivered") {
      return res.status(400).json({ message: "You can review products only after delivery." });
    }

    const item = order.items.find((entry) => String(entry.product) === String(productId));
    if (!item) {
      return res.status(404).json({ message: "Product not found in this order." });
    }

    item.rating = rating;
    item.review = review;
    item.reviewedAt = new Date();

    const patch = normalizeLegacyOrder(order);
    if (Object.keys(patch).length) {
      Object.assign(order, patch);
    }

    await order.save();

    return res.json({
      message: "Review submitted successfully.",
      order: addTrackingMeta(order),
    });
  } catch (error) {
    console.error("Submit review error:", error.message);
    return res.status(500).json({ message: "Unable to submit your review right now." });
  }
};

exports.getSellerOrders = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const orders = await Order.find({
      $or: [{ seller: sellerId }, { sellerId }, { "items.sellerId": sellerId }],
    }).sort({ createdAt: -1 });

    return res.json(orders.map(addTrackingMeta));
  } catch (error) {
    return res.status(500).json({ message: "Unable to load seller orders right now." });
  }
};

exports.updateSellerOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const status = req.body.status?.trim().toLowerCase();
    const sellerId = req.user._id;

    console.log("Seller order status update request:", {
      orderId,
      sellerId: String(sellerId),
      status,
      method: req.method,
    });

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      console.warn("Seller order status update failed: invalid order id", {
        orderId,
        sellerId: String(sellerId),
      });
      return res.status(400).json({ message: "Please provide a valid order ID." });
    }

    if (!status) {
      console.warn("Seller order status update failed: missing status", {
        orderId,
        sellerId: String(sellerId),
      });
      return res.status(400).json({ message: "Please choose an order status." });
    }

    if (!allowedStatuses.includes(status)) {
      console.warn("Seller order status update failed: invalid status", {
        orderId,
        sellerId: String(sellerId),
        status,
      });
      return res.status(400).json({ message: "Please choose a valid order status." });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      console.warn("Seller order status update failed: order not found", {
        orderId,
        sellerId: String(sellerId),
      });
      return res.status(404).json({ message: "Order not found." });
    }

    const ownsOrder =
      String(order.seller || "") === String(sellerId) ||
      String(order.sellerId || "") === String(sellerId) ||
      order.items.some((item) => String(item.sellerId || "") === String(sellerId));

    if (!ownsOrder) {
      console.warn("Seller order status update failed: seller does not own order", {
        orderId,
        sellerId: String(sellerId),
        orderSeller: String(order.seller || ""),
        orderSellerId: String(order.sellerId || ""),
      });
      return res.status(403).json({ message: "You cannot update this order." });
    }

    if (order.status === status) {
      console.log("Seller order status update skipped: status unchanged", {
        orderId,
        sellerId: String(sellerId),
        status,
      });
      return res.json({
        message: "Order status is already up to date.",
        order: addTrackingMeta(order),
      });
    }

    const patch = {
      status,
      ...normalizeLegacyOrder(order),
      ...buildStatusTimelinePatch(order, status),
    };

    const updateResult = await Order.collection.updateOne(
      { _id: order._id },
      { $set: patch }
    );

    console.log("Seller order status update database result:", {
      orderId,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
    });

    const updatedOrder = await Order.findById(orderId);

    if (!updatedOrder) {
      console.warn("Seller order status update failed after lookup: order disappeared", {
        orderId,
        sellerId: String(sellerId),
      });
      return res.status(404).json({ message: "Order not found." });
    }

    console.log("Seller order status update success:", {
      orderId,
      sellerId: String(sellerId),
      status,
    });

    return res.json({ message: "Order status updated successfully.", order: addTrackingMeta(updatedOrder) });
  } catch (error) {
    console.error("Seller order status update error:", {
      message: error.message,
      stack: error.stack,
      orderId: req.params.id,
      sellerId: req.user ? String(req.user._id) : null,
      status: req.body?.status,
    });
    return res.status(500).json({ message: "Unable to update order status right now.", error: error.message });
  }
};

exports.getSellerDashboardSummary = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const [products, orders] = await Promise.all([
      Product.find({ $or: [{ seller: sellerId }, { sellerId }] }).sort({ createdAt: -1 }),
      Order.find({ $or: [{ seller: sellerId }, { sellerId }, { "items.sellerId": sellerId }] }).sort({ createdAt: -1 }),
    ]);

    const totalRevenue = orders
      .filter((order) => order.status !== "cancelled")
      .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

    const analytics = {
      totalProducts: products.length,
      totalOrders: orders.length,
      totalRevenue,
      pendingOrders: orders.filter((order) => order.status === "pending").length,
    };

    return res.json({ analytics, products, orders: orders.map(addTrackingMeta) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load dashboard summary right now." });
  }
};
