const API_BASE = window.location.protocol === "file:" ? "http://localhost:5000" : "";
const authToken = localStorage.getItem("token");
const currentUser = JSON.parse(localStorage.getItem("user") || "null");
const trackingSteps = [
  { key: "pending", label: "Placed", icon: "bi-bag-check" },
  { key: "processing", label: "Processing", icon: "bi-gear" },
  { key: "shipped", label: "Shipped", icon: "bi-box-seam" },
  { key: "out_for_delivery", label: "Out for Delivery", icon: "bi-truck" },
  { key: "delivered", label: "Delivered", icon: "bi-house-check" },
];
let ordersState = [];
let reviewModalInstance = null;

function redirectToLogin() {
  window.location.href = "login.html";
}

function showAlert(message) {
  const alertBox = document.getElementById("ordersAlert");
  alertBox.textContent = message;
  alertBox.className = "orders-alert orders-alert-error";
}

function showSuccess(message) {
  const alertBox = document.getElementById("ordersAlert");
  alertBox.textContent = message;
  alertBox.className = "orders-alert orders-alert-success";
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatDate(dateValue, options = {}) {
  if (!dateValue) return "Pending";
  return new Date(dateValue).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

function formatDateTime(dateValue) {
  if (!dateValue) return "Awaiting update";
  return new Date(dateValue).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusClass(status) {
  return `status-${status || "pending"}`;
}

function getStepState(step, currentStatus) {
  if (currentStatus === "cancelled") {
    return "";
  }

  const currentIndex = trackingSteps.findIndex((entry) => entry.key === currentStatus);
  const stepIndex = trackingSteps.findIndex((entry) => entry.key === step);

  if (stepIndex < currentIndex) return "complete";
  if (stepIndex === currentIndex) return "active";
  return "";
}

function renderTrackingSteps(order) {
  const currentStatus = order.status || "pending";
  const timelineLookup = {
    pending: order.statusTimeline?.pendingAt || order.createdAt,
    processing: order.statusTimeline?.processingAt,
    shipped: order.statusTimeline?.shippedAt,
    out_for_delivery: order.statusTimeline?.outForDeliveryAt,
    delivered: order.statusTimeline?.deliveredAt,
  };

  const timelineMarkup = trackingSteps.map((step) => `
    <div class="tracking-step ${getStepState(step.key, currentStatus)}">
      <div class="tracking-step-icon"><i class="bi ${step.icon}"></i></div>
      <div class="tracking-step-title">${step.label}</div>
      <div class="tracking-step-time">${formatDateTime(timelineLookup[step.key])}</div>
    </div>
  `).join("");

  if (currentStatus === "cancelled") {
    return `${timelineMarkup}<div class="tracking-step cancelled active"><div class="tracking-step-icon"><i class="bi bi-x-circle"></i></div><div class="tracking-step-title">Cancelled</div><div class="tracking-step-time">${formatDateTime(order.statusTimeline?.cancelledAt || order.updatedAt)}</div></div>`;
  }

  return timelineMarkup;
}

function getDeliveryProgress(order) {
  const progressMap = {
    pending: 8,
    processing: 28,
    shipped: 56,
    out_for_delivery: 82,
    delivered: 100,
    cancelled: 0,
  };

  return progressMap[order.status] ?? 8;
}

function renderDeliveryGraph(order) {
  const progress = getDeliveryProgress(order);
  const cancelButton = getCancelButtonConfig(order);
  const deliveryStateCopy = {
    pending: "Order confirmed and waiting to be packed.",
    processing: "Your order is being prepared for dispatch.",
    shipped: "Package has left the seller facility.",
    out_for_delivery: "Rider is on the way with your order.",
    delivered: "Package delivered successfully.",
    cancelled: "This order was cancelled before delivery.",
  };

  return `
    <div class="delivery-graph-card ${order.status === "cancelled" ? "delivery-graph-cancelled" : ""}">
      <div class="delivery-graph-top">
        <div>
          <span class="delivery-graph-kicker">Delivery Journey</span>
          <h4>${order.status === "cancelled" ? "Delivery stopped" : "Package on the move"}</h4>
          <p>${deliveryStateCopy[order.status] || "Tracking updates will appear here."}</p>
        </div>
        <div class="delivery-graph-actions">
          <button class="delivery-cancel-btn ${cancelButton.disabled ? "delivery-cancel-btn-disabled" : ""}" type="button" data-cancel-order="${order._id}" ${cancelButton.disabled ? "disabled" : ""}>
            <i class="bi bi-x-circle"></i> ${cancelButton.label}
          </button>
          <span class="delivery-graph-badge"><i class="bi bi-geo-alt"></i> ${order.deliveryPartner}</span>
        </div>
      </div>
      <div class="delivery-graph-track">
        <div class="delivery-point delivery-point-start">
          <div class="delivery-point-icon"><i class="bi bi-shop"></i></div>
          <span>Seller Hub</span>
        </div>
        <div class="delivery-progress-lane">
          <div class="delivery-progress-line"></div>
          <div class="delivery-progress-fill" style="width: ${progress}%;"></div>
          <div class="delivery-rider ${order.status === "delivered" ? "delivery-rider-done" : ""}" style="left: calc(${Math.min(progress, 100)}% - 26px);">
            <i class="bi bi-bicycle"></i>
          </div>
        </div>
        <div class="delivery-point delivery-point-end">
          <div class="delivery-point-icon"><i class="bi bi-house-door"></i></div>
          <span>Your Door</span>
        </div>
      </div>
      <div class="delivery-graph-footer">
        <span><i class="bi bi-upc-scan"></i> Tracking ID: ${order.trackingId}</span>
        <span><i class="bi bi-clock-history"></i> Updated: ${formatDateTime(order.updatedAt || order.createdAt)}</span>
        <span><i class="bi bi-info-circle"></i> ${cancelButton.helper}</span>
      </div>
    </div>
  `;
}

function canCancelOrder(order) {
  return ["pending", "processing"].includes(order.status);
}

function canReturnOrder(order) {
  return order.status === "delivered" && order.returnStatus === "not_requested";
}

function canRefundOrder(order) {
  return ["cancelled", "delivered"].includes(order.status) && order.refundStatus === "not_requested";
}

function getCancelButtonConfig(order) {
  if (canCancelOrder(order)) {
    return {
      label: "Cancel Order",
      disabled: false,
      helper: "You can cancel this order before it moves beyond processing.",
    };
  }

  if (order.status === "cancelled") {
    return {
      label: "Order Cancelled",
      disabled: true,
      helper: "This order has already been cancelled.",
    };
  }

  return {
    label: "Cancellation Locked",
    disabled: true,
    helper: "Cancellation is available only for pending or processing orders.",
  };
}

function buildInvoiceMarkup(order) {
  return `
    <html>
      <head>
        <title>Invoice ${order._id}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          .muted { color: #64748b; }
        </style>
      </head>
      <body>
        <h1>NeoStore Invoice</h1>
        <div class="muted">Order #${String(order._id).slice(-8).toUpperCase()}</div>
        <p><strong>Customer:</strong> ${order.customerName}</p>
        <p><strong>Delivery Address:</strong> ${order.deliveryAddress?.fullName || ""}, ${order.deliveryAddress?.address || ""}, ${order.deliveryAddress?.city || ""} ${order.deliveryAddress?.pincode || ""}</p>
        <p><strong>Tracking:</strong> ${order.trackingId} via ${order.deliveryPartner}</p>
        <table>
          <thead><tr><th>Product</th><th>Qty</th><th>Price</th></tr></thead>
          <tbody>
            ${order.items.map((item) => `<tr><td>${item.name}</td><td>${item.quantity}</td><td>${formatCurrency(item.price * item.quantity)}</td></tr>`).join("")}
          </tbody>
        </table>
        <h3>Total: ${formatCurrency(order.totalAmount)}</h3>
      </body>
    </html>
  `;
}

function renderOrderActions(order) {
  const cancelButton = getCancelButtonConfig(order);
  return `
    <div class="order-actions-bar">
      <button class="track-button-secondary" type="button" data-download-invoice="${order._id}">Download Invoice</button>
      <button class="track-button-secondary" type="button" data-reorder="${order._id}">Buy Again</button>
      <button class="order-action-btn order-action-cancel ${cancelButton.disabled ? "order-action-disabled" : ""}" type="button" data-cancel-order="${order._id}" ${cancelButton.disabled ? "disabled" : ""}>
        <i class="bi bi-x-circle"></i> ${cancelButton.label}
      </button>
      ${canReturnOrder(order) ? `<button class="order-action-btn" type="button" data-order-action="return" data-order-id="${order._id}">Request Return</button>` : ""}
      ${canRefundOrder(order) ? `<button class="order-action-btn" type="button" data-order-action="refund" data-order-id="${order._id}">Request Refund</button>` : ""}
    </div>
  `;
}

function renderSupportCard(order) {
  return `
    <div class="support-card">
      <div>
        <strong>Need help with this order?</strong>
        <p>Our support team can help with delivery updates, returns, refunds, and billing questions.</p>
      </div>
      <div class="support-links">
        <a href="mailto:support@neostore.com?subject=Support for order ${order._id}"><i class="bi bi-envelope"></i> Email</a>
        <a href="tel:+919876543210"><i class="bi bi-telephone"></i> Call Support</a>
      </div>
    </div>
  `;
}

function renderProductActions(order, item) {
  if (order.status !== "delivered") {
    return `<span class="muted-note">Rating and review unlock after delivery.</span>`;
  }

  if (item.rating) {
    return `<span class="review-chip"><i class="bi bi-star-fill"></i> ${item.rating}/5 reviewed</span>`;
  }

  return `<button class="mini-action-btn" type="button" data-open-review="${order._id}" data-product-id="${item.product}" data-product-name="${item.name}">Rate & Review</button>`;
}

function renderStatusMeta(order) {
  const returnText = order.returnStatus && order.returnStatus !== "not_requested" ? order.returnStatus.replace("_", " ") : "Not requested";
  const refundText = order.refundStatus && order.refundStatus !== "not_requested" ? order.refundStatus.replace("_", " ") : "Not requested";

  return `
    <div class="order-meta-box">
      <span class="meta-label">Delivery Partner</span>
      <strong>${order.deliveryPartner}</strong>
      <div>Tracking ID: ${order.trackingId}</div>
    </div>
    <div class="order-meta-box">
      <span class="meta-label">Returns</span>
      <strong>${returnText}</strong>
      <div>${order.returnRequestedAt ? `Requested on ${formatDate(order.returnRequestedAt)}` : "Eligible based on delivery status"}</div>
    </div>
    <div class="order-meta-box">
      <span class="meta-label">Refunds</span>
      <strong>${refundText}</strong>
      <div>${order.refundRequestedAt ? `Requested on ${formatDate(order.refundRequestedAt)}` : "Available on supported orders"}</div>
    </div>
  `;
}

function renderOrders(orders) {
  ordersState = orders;
  const ordersList = document.getElementById("ordersList");
  const ordersCount = document.getElementById("ordersCount");
  ordersCount.textContent = orders.length;

  if (!orders.length) {
    document.getElementById("ordersEmpty").classList.remove("d-none");
    ordersList.classList.add("d-none");
    return;
  }

  document.getElementById("ordersEmpty").classList.add("d-none");
  ordersList.classList.remove("d-none");

  ordersList.innerHTML = orders.map((order, index) => `
    <article class="order-card ${index === 0 ? "order-card-highlight" : ""}" id="order-card-${order._id}">
      <div class="order-topbar">
        <div>
          <h2 class="order-id">Order #${String(order._id).slice(-8).toUpperCase()}</h2>
          <div class="order-subtitle">Placed on ${formatDate(order.createdAt)}</div>
        </div>
        <span class="status-badge ${getStatusClass(order.status)}">${order.status}</span>
        <button class="track-button" type="button" data-track-order="${order._id}">
          ${index === 0 ? "Track Order" : "View Tracking"}
        </button>
      </div>

      <div class="order-meta-grid">
        <div class="order-meta-box">
          <span class="meta-label">Total Amount</span>
          <strong>${formatCurrency(order.totalAmount)}</strong>
        </div>
        <div class="order-meta-box">
          <span class="meta-label">Estimated Delivery</span>
          <strong>${formatDate(order.estimatedDeliveryDate)}</strong>
        </div>
        <div class="order-meta-box">
          <span class="meta-label">Payment</span>
          <strong>${order.paymentMethod || "Cash on Delivery"}</strong>
        </div>
      </div>

      <div class="order-products">
        ${order.items.map((item) => `
          <div class="product-line">
            <div>
              <strong>${item.name}</strong>
              <small class="d-block">Quantity: ${item.quantity}</small>
              ${item.review ? `<small class="d-block">${item.review}</small>` : ""}
            </div>
            <div><strong>${formatCurrency((item.price || 0) * (item.quantity || 0))}</strong></div>
            <div class="product-line-actions">
              ${renderProductActions(order, item)}
            </div>
          </div>
        `).join("")}
      </div>

      <div class="tracking-wrap" id="tracking-${order._id}">
        <div class="tracking-header">
          <div>
            <h3 class="tracking-title">Live Order Tracking</h3>
            <div class="tracking-subcopy">Shipment handled by ${order.deliveryPartner} • Tracking ID ${order.trackingId}</div>
          </div>
          <button class="track-button" type="button" data-track-order="${order._id}">
            ${index === 0 ? "Track Order" : "View Tracking"}
          </button>
        </div>
        ${renderDeliveryGraph(order)}
        <div class="order-footer">
          <div class="order-meta-box">
            <span class="meta-label">Delivery Address</span>
            <strong>${order.deliveryAddress?.fullName || currentUser.name}</strong>
            <div>${order.deliveryAddress?.address || "N/A"}</div>
            <div>${order.deliveryAddress?.city || ""} ${order.deliveryAddress?.pincode || ""}</div>
          </div>
          <div class="order-meta-box">
            <span class="meta-label">Products</span>
            <strong>${order.items.length}</strong>
            <div>${order.items.map((item) => item.name).join(", ")}</div>
          </div>
          <div class="order-meta-box">
            <span class="meta-label">Current Status</span>
            <strong class="${getStatusClass(order.status)}">${order.status}</strong>
          </div>
          ${renderStatusMeta(order)}
        </div>
        <div class="tracking-line mt-3">
          ${renderTrackingSteps(order)}
        </div>
        ${renderOrderActions(order)}
      </div>
      ${renderSupportCard(order)}
    </article>
  `).join("");
}

async function fetchOrders() {
  const response = await fetch(`${API_BASE}/api/orders/my`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    redirectToLogin();
    throw new Error(data.message || "Please log in as a customer to view your orders.");
  }

  if (!response.ok) {
    throw new Error(data.message || "Unable to load your orders.");
  }

  return data.orders || [];
}

async function refreshOrders(message) {
  const orders = await fetchOrders();
  renderOrders(orders);
  if (message) {
    showSuccess(message);
  }
}

async function submitOrderAction(orderId, action) {
  const endpoint = action === "cancel" ? `${API_BASE}/api/orders/${orderId}/cancel` : `${API_BASE}/api/orders/${orderId}/action`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ action }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Unable to update the order action.");
  }

  return data;
}

async function cancelOrder(orderId, button) {
  const confirmed = window.confirm("Are you sure you want to cancel this order?");
  if (!confirmed) return;

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Cancelling...";

  try {
    const data = await submitOrderAction(orderId, "cancel");
    await refreshOrders(data.message || "Order cancelled successfully.");
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function downloadInvoice(orderId) {
  const order = ordersState.find((entry) => entry._id === orderId);
  if (!order) return;

  const invoiceWindow = window.open("", "_blank", "width=900,height=700");
  if (!invoiceWindow) {
    showAlert("Popup blocked. Please allow popups to download the invoice.");
    return;
  }

  invoiceWindow.document.write(buildInvoiceMarkup(order));
  invoiceWindow.document.close();
  invoiceWindow.focus();
  invoiceWindow.print();
}

function reorderOrder(orderId) {
  const order = ordersState.find((entry) => entry._id === orderId);
  if (!order) return;

  const existingCart = JSON.parse(localStorage.getItem("cart") || "[]");
  const cartByProduct = new Map(existingCart.map((item) => [String(item.id), item]));

  order.items.forEach((item) => {
    const key = String(item.product);
    if (cartByProduct.has(key)) {
      cartByProduct.get(key).quantity += item.quantity;
    } else {
      cartByProduct.set(key, {
        id: key,
        sellerId: item.sellerId,
        name: item.name,
        price: item.price,
        image: item.image || "",
        quantity: item.quantity,
      });
    }
  });

  localStorage.setItem("cart", JSON.stringify(Array.from(cartByProduct.values())));
  showSuccess("Items added to cart for reorder.");
}

function openReviewModal(orderId, productId, productName) {
  document.getElementById("reviewOrderId").value = orderId;
  document.getElementById("reviewProductId").value = productId;
  document.getElementById("reviewProductName").textContent = productName;
  document.getElementById("reviewForm").reset();
  if (!reviewModalInstance) {
    reviewModalInstance = new bootstrap.Modal(document.getElementById("reviewModal"));
  }
  reviewModalInstance.show();
}

async function submitReview(event) {
  event.preventDefault();
  const orderId = document.getElementById("reviewOrderId").value;
  const productId = document.getElementById("reviewProductId").value;
  const rating = document.getElementById("reviewRating").value;
  const review = document.getElementById("reviewText").value.trim();
  const submitButton = document.getElementById("reviewSubmitBtn");

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  try {
    const response = await fetch(`${API_BASE}/api/orders/${orderId}/review/${productId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ rating, review }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Unable to submit your review.");
    }

    if (reviewModalInstance) {
      reviewModalInstance.hide();
    }
    await refreshOrders(data.message);
  } catch (error) {
    showAlert(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Review";
  }
}

function initTrackButtons() {
  document.getElementById("ordersList").addEventListener("click", (event) => {
    const orderId = event.target.getAttribute("data-track-order");
    const action = event.target.getAttribute("data-order-action");
    const cancelOrderId = event.target.getAttribute("data-cancel-order");
    const invoiceOrderId = event.target.getAttribute("data-download-invoice");
    const reorderOrderId = event.target.getAttribute("data-reorder");
    const reviewOrderId = event.target.getAttribute("data-open-review");

    if (orderId) {
      const trackingCard = document.getElementById(`tracking-${orderId}`);
      if (trackingCard) {
        trackingCard.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    if (cancelOrderId) {
      cancelOrder(cancelOrderId, event.target);
      return;
    }

    if (invoiceOrderId) {
      downloadInvoice(invoiceOrderId);
      return;
    }

    if (reorderOrderId) {
      reorderOrder(reorderOrderId);
      return;
    }

    if (reviewOrderId) {
      openReviewModal(
        reviewOrderId,
        event.target.getAttribute("data-product-id"),
        event.target.getAttribute("data-product-name")
      );
      return;
    }

    if (action) {
      submitOrderAction(event.target.getAttribute("data-order-id"), action)
        .then((data) => refreshOrders(data.message))
        .catch((error) => showAlert(error.message));
    }
  });
}

async function initMyOrdersPage() {
  if (!authToken || !currentUser || currentUser.role !== "customer") {
    redirectToLogin();
    return;
  }

  initTrackButtons();
  document.getElementById("reviewForm").addEventListener("submit", submitReview);

  try {
    const orders = await fetchOrders();
    renderOrders(orders);
  } catch (error) {
    showAlert(error.message);
  } finally {
    document.getElementById("ordersLoading").classList.add("d-none");
  }
}

initMyOrdersPage();
