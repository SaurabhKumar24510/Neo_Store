const API_BASE = window.location.protocol === "file:" ? "http://localhost:5000" : "";
const CART_KEY = "cart";
const COUPON_KEY = "neostore_coupon";
const currentUser = JSON.parse(localStorage.getItem("user") || "null");
const authToken = localStorage.getItem("token");

const couponCatalog = {
  SAVE10: {
    type: "percentage",
    value: 10,
    label: "10% instant discount applied to eligible items.",
  },
  FREESHIP: {
    type: "shipping",
    value: 99,
    label: "Delivery charge waived for this order.",
  },
};

const cartState = {
  items: [],
  updatingItemId: null,
  loading: true,
};

let toastInstance;

function getCart() {
  return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function getAppliedCoupon() {
  return (localStorage.getItem(COUPON_KEY) || "").trim().toUpperCase();
}

function setAppliedCoupon(code) {
  if (code) {
    localStorage.setItem(COUPON_KEY, code);
  } else {
    localStorage.removeItem(COUPON_KEY);
  }
}

function isSellerPreview() {
  return currentUser?.role === "seller";
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function getProductDescription(item) {
  return item.description || item.category || "Curated NeoStore device with premium build and fast delivery.";
}

function getItemUiMeta(item) {
  const seed = String(item.id || item.name || "0");
  const total = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const isLimited = total % 3 === 0;
  const rating = (4.1 + (total % 8) / 10).toFixed(1);
  const reviews = 120 + (total % 540);
  const deliveryDay = total % 2 === 0 ? "Tomorrow" : "in 2 days";

  return {
    stockLabel: isLimited ? "Limited Stock" : "In Stock",
    stockClass: isLimited ? "badge-limited" : "badge-stock",
    rating,
    reviews,
    deliveryText: `Delivery by ${deliveryDay}`,
  };
}

function getCartMetrics() {
  const subtotal = cartState.items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );
  const couponCode = getAppliedCoupon();
  const coupon = couponCatalog[couponCode] || null;
  const baseDelivery = cartState.items.length ? (subtotal >= 1499 ? 0 : 99) : 0;

  let discount = 0;
  let delivery = baseDelivery;

  if (coupon?.type === "percentage") {
    discount = Math.round((subtotal * coupon.value) / 100);
  }

  if (coupon?.type === "shipping") {
    delivery = Math.max(0, baseDelivery - coupon.value);
  }

  const total = Math.max(0, subtotal - discount + delivery);
  const savings = discount + Math.max(0, baseDelivery - delivery);

  return {
    subtotal,
    discount,
    delivery,
    total,
    savings,
    couponCode,
    coupon,
    totalItems: cartState.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  };
}

function showToast(message) {
  document.getElementById("cartToastMessage").textContent = message;
  toastInstance.show();
}

function createRipple(event) {
  const button = event.currentTarget;
  const ripple = document.createElement("span");
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);

  ripple.className = "btn-ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

  button.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 500);
}

function setButtonLoading(button, isLoading, loadingLabel) {
  const copy = button.querySelector(".btn-copy");
  const spinner = button.querySelector(".spinner-border");

  button.disabled = isLoading;
  if (copy && loadingLabel) {
    copy.textContent = isLoading ? loadingLabel : button.dataset.defaultLabel || copy.textContent;
  }
  if (spinner) {
    spinner.classList.toggle("d-none", !isLoading);
  }
}

function renderSkeletons() {
  const cartContent = document.getElementById("cartContent");
  cartContent.innerHTML = `
    <div class="cart-item-stack">
      ${Array.from({ length: 3 }).map(() => `
        <article class="cart-item-card skeleton-card">
          <div class="cart-item-media skeleton-block"></div>
          <div class="cart-item-body">
            <div class="skeleton-line skeleton-line-lg"></div>
            <div class="skeleton-line skeleton-line-md"></div>
            <div class="skeleton-line skeleton-line-sm"></div>
            <div class="cart-item-footer">
              <div class="skeleton-pill"></div>
              <div class="skeleton-pill"></div>
            </div>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function createCartItemMarkup(item) {
  const itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
  const imageUrl = item.image || "https://via.placeholder.com/160x160?text=NeoStore";
  const meta = getItemUiMeta(item);
  const isUpdating = cartState.updatingItemId === String(item.id);

  return `
    <article class="cart-item-card" data-item-id="${item.id}">
      <div class="swipe-remove-indicator">
        <i class="bi bi-trash3"></i>
        <span>Remove</span>
      </div>
      <div class="cart-item-shell">
        <div class="cart-item-media">
          <img src="${imageUrl}" alt="${item.name}" loading="lazy">
        </div>
        <div class="cart-item-body">
          <div class="cart-item-copy">
            <div class="cart-item-header">
              <div>
                <div class="item-topline">
                  <span class="status-badge ${meta.stockClass}">${meta.stockLabel}</span>
                  <span class="delivery-chip"><i class="bi bi-truck"></i>${meta.deliveryText}</span>
                </div>
                <h3>${item.name}</h3>
                <p>${getProductDescription(item)}</p>
                <div class="product-rating">
                  <span class="rating-stars"><i class="bi bi-star-fill"></i> ${meta.rating}</span>
                  <span class="rating-count">${meta.reviews} reviews</span>
                </div>
              </div>
              <button class="remove-item-btn ripple-host" type="button" data-remove-id="${item.id}" aria-label="Remove ${item.name}">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
            <div class="cart-item-meta">
              <span class="price-chip">Price ${formatCurrency(item.price)}</span>
              <span class="price-chip">Secure seller fulfilled</span>
            </div>
          </div>

          <div class="cart-item-footer">
            <div class="quantity-control ${isUpdating ? "is-updating" : ""}">
              <button
                type="button"
                class="ripple-host"
                data-quantity-action="decrease"
                data-item-id="${item.id}"
                ${item.quantity <= 1 || isUpdating || isSellerPreview() ? "disabled" : ""}
              >
                <i class="bi bi-dash-lg"></i>
              </button>
              <span class="quantity-value">${item.quantity}</span>
              ${isUpdating ? '<span class="quantity-spinner spinner-border spinner-border-sm" aria-hidden="true"></span>' : ""}
              <button
                type="button"
                class="ripple-host"
                data-quantity-action="increase"
                data-item-id="${item.id}"
                ${isUpdating || isSellerPreview() ? "disabled" : ""}
              >
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>
            <div class="item-total-block">
              <span>Item total</span>
              <strong>${formatCurrency(itemTotal)}</strong>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderEmptyState() {
  document.getElementById("cartContent").innerHTML = `
    <div class="empty-cart-state">
      <div class="empty-cart-icon"><i class="bi bi-bag-heart"></i></div>
      <h3>Your cart feels lonely</h3>
      <p>Add something delightful to your bag and we will keep it ready with fast delivery and seamless checkout.</p>
      <div class="empty-cart-actions">
        <a href="index.html" class="btn btn-dark empty-shop-btn ripple-host">Shop Now</a>
        <a href="index.html" class="btn btn-outline-dark">Continue Shopping</a>
      </div>
    </div>
  `;
}

function renderCartItems() {
  const cartContent = document.getElementById("cartContent");

  if (cartState.loading) {
    renderSkeletons();
    return;
  }

  if (!cartState.items.length) {
    renderEmptyState();
    return;
  }

  cartContent.innerHTML = `
    <div class="cart-item-stack">
      ${cartState.items.map(createCartItemMarkup).join("")}
    </div>
  `;

  bindSwipeToRemove();
}

function updateSummaryUI() {
  const metrics = getCartMetrics();
  const couponMessage = document.getElementById("couponMessage");

  document.getElementById("subtotalAmount").textContent = formatCurrency(metrics.subtotal);
  document.getElementById("discountAmount").textContent = `-${formatCurrency(metrics.discount)}`;
  document.getElementById("deliveryAmount").textContent = metrics.delivery === 0 ? "Free" : formatCurrency(metrics.delivery);
  document.getElementById("finalAmount").textContent = formatCurrency(metrics.total);
  document.getElementById("savedBadge").textContent = `You saved ${formatCurrency(metrics.savings)}`;
  document.getElementById("cartItemsCount").textContent = metrics.totalItems;
  document.getElementById("panelMeta").textContent = metrics.totalItems
    ? `${metrics.totalItems} item${metrics.totalItems === 1 ? "" : "s"} ready for checkout`
    : "No products in cart";
  document.getElementById("mobileCheckoutTotal").textContent = formatCurrency(metrics.total);
  document.getElementById("mobileCheckoutCount").textContent = `${metrics.totalItems} item${metrics.totalItems === 1 ? "" : "s"}`;
  document.getElementById("summaryToggleText").textContent = metrics.totalItems ? "Hide details" : "Show details";
  document.getElementById("couponCode").value = metrics.couponCode;

  couponMessage.textContent = metrics.coupon
    ? metrics.coupon.label
    : "Apply a coupon to unlock instant savings.";
  couponMessage.className = `coupon-message ${metrics.coupon ? "coupon-message-success" : ""}`;

  const proceedButton = document.getElementById("proceedCheckoutBtn");
  const mobileButton = document.getElementById("mobileCheckoutBtn");
  proceedButton.disabled = !metrics.totalItems || isSellerPreview();
  mobileButton.disabled = !metrics.totalItems || isSellerPreview();
  document.getElementById("mobileCheckoutBar").classList.toggle("d-none", !metrics.totalItems);
}

function renderPage() {
  if (isSellerPreview()) {
    document.getElementById("sellerCartAlert").classList.remove("d-none");
  }

  renderCartItems();
  updateSummaryUI();
  bindRipples();
}

function syncAndRender() {
  saveCart(cartState.items);
  renderPage();
}

function updateSingleItemCard(itemId) {
  const existing = document.querySelector(`[data-item-id="${itemId}"]`);
  const item = cartState.items.find((entry) => String(entry.id) === String(itemId));

  if (!existing || !item) {
    renderPage();
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = createCartItemMarkup(item);
  existing.replaceWith(wrapper.firstElementChild);
  bindSwipeToRemove();
  bindRipples();
  updateSummaryUI();
}

function removeItemWithAnimation(itemId) {
  const card = document.querySelector(`[data-item-id="${itemId}"]`);
  if (!card) {
    cartState.items = cartState.items.filter((entry) => String(entry.id) !== String(itemId));
    syncAndRender();
    return;
  }

  card.classList.add("is-removing");
  window.setTimeout(() => {
    cartState.items = cartState.items.filter((entry) => String(entry.id) !== String(itemId));
    syncAndRender();
    showToast("Item removed.");
  }, 220);
}

function applyCoupon() {
  const code = document.getElementById("couponCode").value.trim().toUpperCase();
  const couponMessage = document.getElementById("couponMessage");

  if (!code) {
    setAppliedCoupon("");
    updateSummaryUI();
    return;
  }

  if (!couponCatalog[code]) {
    couponMessage.textContent = "Coupon not recognized. Try SAVE10 or FREESHIP.";
    couponMessage.className = "coupon-message coupon-message-error";
    return;
  }

  setAppliedCoupon(code);
  updateSummaryUI();
  showToast("Coupon applied successfully.");
}

function openCheckout() {
  const metrics = getCartMetrics();

  if (isSellerPreview()) {
    showToast("Seller preview mode does not allow checkout.");
    return;
  }

  if (!metrics.totalItems) {
    showToast("Add at least one product to proceed.");
    return;
  }

  const sourceButton = window.innerWidth < 768
    ? document.getElementById("mobileCheckoutBtn")
    : document.getElementById("proceedCheckoutBtn");

  setButtonLoading(sourceButton, true, "Preparing...");
  window.setTimeout(() => {
    setButtonLoading(sourceButton, false);
    window.location.href = "checkout.html";
  }, 300);
}

function toggleMobileSummary(forceExpanded) {
  const summaryCard = document.getElementById("summaryCard");
  const shouldExpand = typeof forceExpanded === "boolean"
    ? forceExpanded
    : !summaryCard.classList.contains("summary-expanded");

  summaryCard.classList.toggle("summary-expanded", shouldExpand);
  document.getElementById("summaryToggleText").textContent = shouldExpand ? "Hide details" : "Show details";
  document.getElementById("summaryToggleIcon").className = shouldExpand ? "bi bi-chevron-up" : "bi bi-chevron-down";
}

function animateQuantity(itemId) {
  const card = document.querySelector(`[data-item-id="${itemId}"]`);
  card?.classList.add("pulse-update");
  window.setTimeout(() => card?.classList.remove("pulse-update"), 320);
}

function updateQuantity(itemId, direction) {
  if (isSellerPreview()) return;

  const item = cartState.items.find((entry) => String(entry.id) === String(itemId));
  if (!item || cartState.updatingItemId) return;

  const delta = direction === "increase" ? 1 : -1;
  const nextQuantity = Math.max(1, Number(item.quantity || 1) + delta);
  if (nextQuantity === item.quantity) return;

  cartState.updatingItemId = String(itemId);
  updateSingleItemCard(itemId);

  window.setTimeout(() => {
    item.quantity = nextQuantity;
    cartState.updatingItemId = null;
    updateSingleItemCard(itemId);
    animateQuantity(itemId);
    saveCart(cartState.items);
    showToast("Quantity updated.");
  }, 260);
}

function bindSwipeToRemove() {
  if (window.innerWidth >= 768) return;

  document.querySelectorAll(".cart-item-card").forEach((card) => {
    const shell = card.querySelector(".cart-item-shell");
    let startX = 0;
    let currentX = 0;
    let dragging = false;

    const start = (event) => {
      startX = event.touches[0].clientX;
      dragging = true;
      card.classList.add("is-dragging");
    };

    const move = (event) => {
      if (!dragging) return;
      currentX = event.touches[0].clientX - startX;
      if (currentX < 0) {
        shell.style.transform = `translateX(${Math.max(currentX, -110)}px)`;
      }
    };

    const end = () => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove("is-dragging");

      if (currentX < -90) {
        removeItemWithAnimation(card.dataset.itemId);
      } else {
        shell.style.transform = "";
      }

      currentX = 0;
    };

    card.ontouchstart = start;
    card.ontouchmove = move;
    card.ontouchend = end;
  });
}

function bindRipples() {
  document.querySelectorAll(".ripple-host").forEach((button) => {
    button.removeEventListener("click", createRipple);
    button.addEventListener("click", createRipple);
  });
}

function initEvents() {
  document.getElementById("cartContent").addEventListener("click", (event) => {
    const removeId = event.target.closest("[data-remove-id]")?.dataset.removeId;
    if (removeId) {
      removeItemWithAnimation(removeId);
      return;
    }

    const quantityButton = event.target.closest("[data-quantity-action]");
    if (quantityButton) {
      updateQuantity(quantityButton.dataset.itemId, quantityButton.dataset.quantityAction);
    }
  });

  document.getElementById("applyCouponBtn").addEventListener("click", applyCoupon);
  document.getElementById("couponCode").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyCoupon();
    }
  });

  document.getElementById("proceedCheckoutBtn").dataset.defaultLabel = "Proceed to Checkout";
  document.getElementById("mobileCheckoutBtn").dataset.defaultLabel = "Checkout";

  document.getElementById("proceedCheckoutBtn").addEventListener("click", openCheckout);
  document.getElementById("mobileCheckoutBtn").addEventListener("click", openCheckout);
  document.getElementById("summaryToggleBtn").addEventListener("click", () => toggleMobileSummary());

  window.addEventListener("storage", (event) => {
    if (event.key === CART_KEY) {
      cartState.items = getCart();
      renderPage();
      bindRipples();
    }

    if (event.key === COUPON_KEY) {
      updateSummaryUI();
    }
  });

  window.addEventListener("resize", () => {
    bindSwipeToRemove();
    if (window.innerWidth >= 768) {
      toggleMobileSummary(true);
    }
  });
}

function initCartPage() {
  toastInstance = new bootstrap.Toast(document.getElementById("cartToast"), { delay: 2200 });

  cartState.items = getCart();
  initEvents();
  renderPage();
  bindRipples();

  window.setTimeout(() => {
    cartState.loading = false;
    renderPage();
    bindRipples();
    if (window.innerWidth >= 768) {
      toggleMobileSummary(true);
    }
  }, 450);
}

document.addEventListener("DOMContentLoaded", initCartPage);
