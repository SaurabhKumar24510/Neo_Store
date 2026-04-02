const DASHBOARD_API_BASE = window.location.protocol === "file:" ? "http://localhost:5000" : "";
const authToken = localStorage.getItem("token");
const currentUser = JSON.parse(localStorage.getItem("user") || "null");

const state = {
  products: [],
  orders: [],
  analytics: {
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
  },
};

function redirectToLogin() {
  window.location.href = "login.html";
}

function showDashboardAlert(message, type = "success") {
  const alertBox = document.getElementById("dashboardAlert");
  alertBox.textContent = message;
  alertBox.className = `dashboard-alert dashboard-alert-${type}`;

  window.clearTimeout(showDashboardAlert.timer);
  showDashboardAlert.timer = window.setTimeout(() => {
    alertBox.className = "dashboard-alert d-none";
    alertBox.textContent = "";
  }, 2600);
}

function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${DASHBOARD_API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${authToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    redirectToLogin();
    throw new Error(data.message || "You are not authorized to access the seller dashboard.");
  }

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong.");
  }

  return data;
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatDate(dateValue) {
  return new Date(dateValue).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function renderOverview() {
  document.getElementById("statProducts").textContent = state.analytics.totalProducts;
  document.getElementById("statOrders").textContent = state.analytics.totalOrders;
  document.getElementById("statRevenue").textContent = formatCurrency(state.analytics.totalRevenue);
  document.getElementById("statPending").textContent = state.analytics.pendingOrders;

  document.getElementById("analyticsRevenue").textContent = formatCurrency(state.analytics.totalRevenue);
  document.getElementById("analyticsDelivered").textContent = state.orders.filter((order) => order.status === "delivered").length;
  document.getElementById("analyticsProducts").textContent = state.analytics.totalProducts;

  const recentProducts = document.getElementById("recentProducts");
  recentProducts.innerHTML = state.products.slice(0, 4).map((product) => `
    <div class="stack-item">
      <strong>${product.name}</strong>
      <span>${product.category} • ${formatCurrency(product.price)}</span>
    </div>
  `).join("") || `<div class="stack-item"><strong>No products yet</strong><span>Add your first product to start selling.</span></div>`;

  const recentOrders = document.getElementById("recentOrders");
  recentOrders.innerHTML = state.orders.slice(0, 4).map((order) => `
    <div class="stack-item">
      <strong>${order.customerName}</strong>
      <span>${order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}</span>
      <span>${formatCurrency(order.totalAmount)} • ${order.status}</span>
    </div>
  `).join("") || `<div class="stack-item"><strong>No orders yet</strong><span>Seller orders will appear here when customers place them.</span></div>`;
}

function renderProductsTable() {
  const tbody = document.getElementById("productsTableBody");

  if (!state.products.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-table">No products added yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.products.map((product) => `
    <tr>
      <td>
        <strong>${product.name}</strong>
        <div class="text-secondary small">${product.description || "No description"}</div>
      </td>
      <td>${product.category || "General"}</td>
      <td>${formatCurrency(product.price)}</td>
      <td>${formatDate(product.createdAt)}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-outline-dark" data-edit-product="${product._id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger" data-delete-product="${product._id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderOrdersTable() {
  const tbody = document.getElementById("ordersTableBody");

  if (!state.orders.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-table">No seller orders found yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.orders.map((order) => `
    <tr>
      <td>
        <strong>#${order._id.slice(-6).toUpperCase()}</strong>
        <div class="text-secondary small">${formatDate(order.createdAt)}</div>
      </td>
      <td>
        <strong>${order.customerName}</strong>
        <div class="text-secondary small">${order.customerEmail}</div>
      </td>
      <td>
        <div class="order-items-list">
          ${order.items.map((item) => `<div class="order-item-line">${item.name} • Qty ${item.quantity}</div>`).join("")}
        </div>
      </td>
      <td>${formatCurrency(order.totalAmount)}</td>
      <td>
        <div class="delivery-block">
          <strong>${order.deliveryAddress?.fullName || order.customerName}</strong><br>
          ${order.deliveryAddress?.address || "N/A"}<br>
          ${order.deliveryAddress?.city || ""} ${order.deliveryAddress?.pincode || ""}
        </div>
      </td>
      <td><span class="status-pill status-${order.status}">${order.status}</span></td>
      <td>
        <select class="form-select order-status-select" data-order-id="${order._id}">
          ${["pending", "processing", "shipped", "out_for_delivery", "delivered", "cancelled"].map((status) => `
            <option value="${status}" ${order.status === status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>
          `).join("")}
        </select>
      </td>
    </tr>
  `).join("");
}

function populateProfile(user) {
  document.getElementById("sellerWelcome").textContent = `Welcome, ${user.name}`;
  document.getElementById("sellerMeta").textContent = `${user.shopName || "Your shop"} is active and ready for seller operations.`;
  document.getElementById("sidebarSellerName").textContent = user.name;
  document.getElementById("profileName").textContent = user.name;
  document.getElementById("profileEmail").textContent = user.email;
  document.getElementById("profilePhone").textContent = user.phone || "N/A";
  document.getElementById("profileShop").textContent = user.shopName || "Not provided";
  document.getElementById("profileRole").textContent = user.role;
}

function switchSection(section) {
  document.querySelectorAll(".seller-nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === section);
  });

  document.querySelectorAll(".seller-section").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `section-${section}`);
  });
}

function resetProductForm() {
  document.getElementById("productForm").reset();
  document.getElementById("productId").value = "";
  document.getElementById("productFormTitle").textContent = "Add Product";
  document.getElementById("productSubmitBtn").textContent = "Save Product";
}

function loadProductIntoForm(productId) {
  const product = state.products.find((item) => item._id === productId);
  if (!product) return;

  document.getElementById("productId").value = product._id;
  document.getElementById("productName").value = product.name;
  document.getElementById("productCategory").value = product.category || "";
  document.getElementById("productPrice").value = product.price;
  document.getElementById("productImage").value = product.image || "";
  document.getElementById("productDescription").value = product.description || "";
  document.getElementById("productFormTitle").textContent = "Edit Product";
  document.getElementById("productSubmitBtn").textContent = "Update Product";
  switchSection("add-product");
}

async function fetchProfile() {
  const data = await apiFetch("/api/auth/me");
  localStorage.setItem("user", JSON.stringify(data.user));
  populateProfile(data.user);
}

async function fetchDashboardData() {
  const summary = await apiFetch("/api/orders/seller/summary");
  state.analytics = summary.analytics;
  state.products = summary.products;
  state.orders = summary.orders;

  renderOverview();
  renderProductsTable();
  renderOrdersTable();
}

async function handleProductSubmit(event) {
  event.preventDefault();

  const productId = document.getElementById("productId").value;
  const payload = {
    name: document.getElementById("productName").value.trim(),
    category: document.getElementById("productCategory").value.trim(),
    price: Number(document.getElementById("productPrice").value),
    image: document.getElementById("productImage").value.trim(),
    description: document.getElementById("productDescription").value.trim(),
  };

  if (!payload.name || !payload.category || !payload.description || Number.isNaN(payload.price)) {
    showDashboardAlert("Please complete all required product fields.", "error");
    return;
  }

  const path = productId ? `/api/products/seller/${productId}` : "/api/products";
  const method = productId ? "PUT" : "POST";

  try {
    await apiFetch(path, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    resetProductForm();
    await fetchDashboardData();
    switchSection("products");
    showDashboardAlert(productId ? "Product updated successfully." : "Product added successfully.");
  } catch (error) {
    showDashboardAlert(error.message, "error");
  }
}

async function handleDeleteProduct(productId) {
  const confirmed = window.confirm("Delete this product from your seller catalog?");
  if (!confirmed) return;

  try {
    await apiFetch(`/api/products/seller/${productId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    await fetchDashboardData();
    showDashboardAlert("Product deleted successfully.");
  } catch (error) {
    showDashboardAlert(error.message, "error");
  }
}

async function handleOrderStatusChange(orderId, status) {
  try {
    const endpoint = `/api/orders/seller/${orderId}/status`;
    const payload = { status };

    console.log("Seller dashboard status update request:", {
      endpoint,
      method: "PATCH",
      orderId,
      payload,
    });

    const response = await apiFetch(endpoint, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    console.log("Seller dashboard status update response:", response);
    await fetchDashboardData();
    showDashboardAlert(response.message || "Order status updated successfully.");
  } catch (error) {
    console.error("Seller dashboard status update error:", {
      orderId,
      status,
      message: error.message,
    });
    showDashboardAlert(error.message, "error");
  }
}

function initEvents() {
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      switchSection(button.dataset.section);
    });
  });

  document.querySelectorAll("[data-section-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      switchSection(button.dataset.sectionJump);
    });
  });

  document.getElementById("logoutSellerBtn").addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    redirectToLogin();
  });

  document.getElementById("productForm").addEventListener("submit", handleProductSubmit);
  document.getElementById("cancelEditBtn").addEventListener("click", resetProductForm);

  document.getElementById("productsTableBody").addEventListener("click", (event) => {
    const editId = event.target.getAttribute("data-edit-product");
    const deleteId = event.target.getAttribute("data-delete-product");

    if (editId) {
      loadProductIntoForm(editId);
    }

    if (deleteId) {
      handleDeleteProduct(deleteId);
    }
  });

  document.getElementById("ordersTableBody").addEventListener("change", (event) => {
    if (event.target.classList.contains("order-status-select")) {
      handleOrderStatusChange(event.target.dataset.orderId, event.target.value);
    }
  });
}

async function initSellerDashboard() {
  if (!authToken || !currentUser || currentUser.role !== "seller") {
    redirectToLogin();
    return;
  }

  initEvents();
  resetProductForm();

  try {
    await fetchProfile();
    await fetchDashboardData();
  } catch (error) {
    showDashboardAlert(error.message, "error");
  }
}

initSellerDashboard();
