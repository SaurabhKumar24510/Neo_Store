const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  image: {
    type: String,
    default: "",
  },
  category: {
    type: String,
    default: "General",
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
  },
  review: {
    type: String,
    default: "",
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  customerEmail: {
    type: String,
    required: true,
  },
  deliveryAddress: {
    fullName: { type: String, required: true },
    phoneNumber: { type: String, default: "" },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, default: "" },
    pincode: { type: String, required: true },
  },
  items: {
    type: [orderItemSchema],
    default: [],
  },
  checkoutGroupId: {
    type: String,
    default: "",
    index: true,
  },
  subtotalAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  deliveryFee: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ["pending", "processing", "shipped", "out_for_delivery", "delivered", "cancelled"],
    default: "pending",
  },
  statusTimeline: {
    pendingAt: { type: Date, default: null },
    processingAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    outForDeliveryAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  paymentMethod: {
    type: String,
    default: "Cash on Delivery",
  },
  paymentGateway: {
    type: String,
    enum: ["cod", "razorpay"],
    default: "cod",
  },
  paymentStatus: {
    type: String,
    enum: ["pending_cod", "created", "paid", "failed", "refunded"],
    default: "pending_cod",
  },
  gatewayOrderId: {
    type: String,
    default: "",
  },
  gatewayPaymentId: {
    type: String,
    default: "",
  },
  gatewaySignature: {
    type: String,
    default: "",
  },
  paymentFailureReason: {
    type: String,
    default: "",
  },
  paidAt: {
    type: Date,
    default: null,
  },
  deliveryPartner: {
    type: String,
    default: "",
  },
  trackingId: {
    type: String,
    default: "",
  },
  returnStatus: {
    type: String,
    enum: ["not_requested", "requested", "approved", "rejected", "picked", "completed"],
    default: "not_requested",
  },
  refundStatus: {
    type: String,
    enum: ["not_requested", "requested", "processing", "completed", "rejected"],
    default: "not_requested",
  },
  returnRequestedAt: {
    type: Date,
    default: null,
  },
  refundRequestedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

orderSchema.pre("validate", function syncSellerOrderId(next) {
  if (!this.statusTimeline) {
    this.statusTimeline = {};
  }

  if (!this.statusTimeline.pendingAt) {
    this.statusTimeline.pendingAt = this.createdAt || new Date();
  }

  if (this.customer && !this.customerId) {
    this.customerId = this.customer;
  }

  if (this.customerId && !this.customer) {
    this.customer = this.customerId;
  }

  if (this.seller && !this.sellerId) {
    this.sellerId = this.seller;
  }

  if (this.sellerId && !this.seller) {
    this.seller = this.sellerId;
  }

  next();
});

module.exports = mongoose.model("Order", orderSchema);
