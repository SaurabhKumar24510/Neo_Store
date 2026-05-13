const API_BASE = window.location.protocol === "file:" ? "http://localhost:5000" : "";
const CART_KEY = "cart";
const COUPON_KEY = "neostore_coupon";
const CHECKOUT_DRAFT_KEY = "neostore_checkout_draft";
const currentUser = JSON.parse(localStorage.getItem("user") || "null");
const authToken = localStorage.getItem("token");

const couponCatalog = {
  SAVE10: { type: "percentage", value: 10 },
  FREESHIP: { type: "shipping", value: 99 },
};

const paymentOptions = [
  {
    label: "Cash on Delivery",
    value: "Cash on Delivery",
    icon: "bi-cash-coin",
    note: "Pay securely at the time of delivery.",
    badge: "COD",
    logos: ["Pay on delivery", "Instant confirmation"],
    accent: "payment-cod",
  },
  {
    label: "Card",
    value: "Card",
    icon: "bi-credit-card-2-front",
    note: "Pay with credit, debit, or ATM cards through Razorpay Secure Checkout.",
    badge: "Visa / RuPay",
    logos: ["Visa", "Mastercard", "RuPay"],
    accent: "payment-card",
  },
  {
    label: "Net Banking",
    value: "Net Banking",
    icon: "bi-bank",
    note: "Continue to your bank's secure authentication page.",
    badge: "100+ banks",
    logos: ["SBI", "HDFC", "ICICI"],
    accent: "payment-bank",
  },
  {
    label: "UPI",
    value: "UPI",
    icon: "bi-phone",
    note: "Complete payment quickly with supported UPI apps or QR.",
    badge: "UPI",
    logos: ["UPI", "BHIM", "GPay"],
    accent: "payment-upi",
  },
];

const checkoutState = {
  step: 1,
  items: [],
  submitting: false,
  popupOpen: false,
  paymentConfig: {
    onlinePaymentsEnabled: false,
    supportedMethods: [],
    codEnabled: true,
    message: "Checking secure payment options...",
  },
  form: {
    fullName: "",
    phoneNumber: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    saveAddress: true,
    paymentMethod: "Cash on Delivery",
  },
  errors: {},
};

let toastInstance;
let razorpayScriptPromise = null;

function getCart() {
  return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function getAppliedCoupon() {
  return (localStorage.getItem(COUPON_KEY) || "").trim().toUpperCase();
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function showToast(message) {
  document.getElementById("checkoutToastMessage").textContent = message;
  toastInstance.show();
}

function logCheckout(event, details = {}) {
  console.log(`[checkout] ${event}`, details);
}

function logCheckoutError(event, error, details = {}) {
  console.error(`[checkout] ${event}`, {
    message: error?.message || String(error),
    stack: error?.stack || null,
    ...details,
  });
}

function loadDraft() {
  const draft = JSON.parse(localStorage.getItem(CHECKOUT_DRAFT_KEY) || "null");
  if (draft) {
    checkoutState.form = { ...checkoutState.form, ...draft.form };
    checkoutState.step = draft.step || 1;
  } else if (currentUser) {
    checkoutState.form.fullName = currentUser.name || "";
    checkoutState.form.phoneNumber = currentUser.phone || "";
  }
}

function persistDraft() {
  localStorage.setItem(
    CHECKOUT_DRAFT_KEY,
    JSON.stringify({
      step: checkoutState.step,
      form: checkoutState.form,
    })
  );
}

function getMetrics() {
  const subtotal = checkoutState.items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );
  const coupon = couponCatalog[getAppliedCoupon()] || null;
  const baseDelivery = checkoutState.items.length ? (subtotal >= 1499 ? 0 : 99) : 0;

  let discount = 0;
  let delivery = baseDelivery;

  if (coupon?.type === "percentage") {
    discount = Math.round((subtotal * coupon.value) / 100);
  }

  if (coupon?.type === "shipping") {
    delivery = Math.max(0, baseDelivery - coupon.value);
  }

  return {
    subtotal,
    discount,
    delivery,
    total: Math.max(0, subtotal - discount + delivery),
    couponCode: getAppliedCoupon(),
  };
}

function getSelectedPaymentOption() {
  return paymentOptions.find((option) => option.value === checkoutState.form.paymentMethod) || paymentOptions[0];
}

function isPaymentMethodAvailable(method) {
  if (method === "Cash on Delivery") {
    return checkoutState.paymentConfig.codEnabled !== false;
  }

  return true;
}

function normalizePaymentMethodSelection() {
  if (checkoutState.form.paymentMethod === "Cash on Delivery") {
    return;
  }

  if (!checkoutState.paymentConfig.onlinePaymentsEnabled && checkoutState.form.paymentMethod !== "Cash on Delivery") {
    return;
  }

  if (!isPaymentMethodAvailable(checkoutState.form.paymentMethod)) {
    checkoutState.form.paymentMethod = "Cash on Delivery";
  }
}

function getPaymentApiBase() {
  return `${API_BASE}/api/payment`;
}

function getVerifyPaymentEndpoint() {
  return `${getPaymentApiBase()}/verify`;
}

function setSelectedPaymentMethod(method) {
  checkoutState.form.paymentMethod = method;
  persistDraft();
  logCheckout("payment-method:selected", {
    selectedPaymentMethod: method,
  });
  renderCurrentStep();
}

function setCheckoutSubmitting(isSubmitting) {
  checkoutState.submitting = isSubmitting;

  const buttons = [
    document.getElementById("placeOrderBtn"),
    document.getElementById("summaryPlaceOrderBtn"),
    document.getElementById("mobileContinueBtn"),
  ].filter(Boolean);

  buttons.forEach((button) => {
    const copy = button.querySelector(".btn-copy");
    const spinner = button.querySelector(".spinner-border");
    button.disabled = isSubmitting;

    if (copy) {
      const defaultLabel = button.dataset.defaultLabel || copy.textContent;
      button.dataset.defaultLabel = defaultLabel;

      if (isSubmitting) {
        copy.textContent = getPaymentSubmittingLabel();
      } else {
        copy.textContent = defaultLabel;
      }
    }

    if (spinner) {
      spinner.classList.toggle("d-none", !isSubmitting);
    }
  });
}

function isOnlinePaymentMethod(method) {
  return method !== "Cash on Delivery";
}

function getPaymentActionLabel(method = checkoutState.form.paymentMethod) {
  return method === "Cash on Delivery" ? "Confirm COD Order" : "Continue to Secure Payment";
}

function getPaymentSubmittingLabel(method = checkoutState.form.paymentMethod) {
  return method === "Cash on Delivery" ? "Confirming COD Order..." : "Redirecting to Secure Payment Gateway...";
}

function showOrderSuccess(message) {
  saveCart([]);
  localStorage.removeItem(CHECKOUT_DRAFT_KEY);
  localStorage.removeItem(COUPON_KEY);
  showToast(message);
  window.setTimeout(() => {
    window.location.href = "my-orders.html";
  }, 900);
}

function validateStepOne() {
  const errors = {};
  const phonePattern = /^[0-9]{10}$/;
  const pincodePattern = /^[0-9]{6}$/;

  if (!checkoutState.form.fullName.trim()) errors.fullName = "Full name is required.";
  if (!phonePattern.test(checkoutState.form.phoneNumber.trim())) errors.phoneNumber = "Enter a valid 10-digit phone number.";
  if (!checkoutState.form.address.trim()) errors.address = "Address is required.";
  if (!checkoutState.form.city.trim()) errors.city = "City is required.";
  if (!checkoutState.form.state.trim()) errors.state = "State is required.";
  if (!pincodePattern.test(checkoutState.form.pincode.trim())) errors.pincode = "Enter a valid 6-digit pincode.";

  checkoutState.errors = errors;
  return Object.keys(errors).length === 0;
}

function updateStepper() {
  document.querySelectorAll(".stepper-step").forEach((stepButton) => {
    const stepNumber = Number(stepButton.dataset.step);
    const circle = stepButton.querySelector(".stepper-circle");
    stepButton.classList.toggle("active", stepNumber === checkoutState.step);
    stepButton.classList.toggle("complete", stepNumber < checkoutState.step);
    circle.innerHTML = stepNumber < checkoutState.step ? '<i class="bi bi-check-lg"></i>' : String(stepNumber);
  });
}

function renderSummary() {
  const metrics = getMetrics();
  document.getElementById("summaryMiniList").innerHTML = checkoutState.items.map((item) => `
    <div class="summary-mini-item">
      <img src="${item.image || "https://via.placeholder.com/80x80?text=NeoStore"}" alt="${item.name}" loading="lazy">
      <div>
        <strong>${item.name}</strong>
        <div class="summary-mini-meta">${item.quantity} x ${formatCurrency(item.price)}</div>
      </div>
    </div>
  `).join("");

  document.getElementById("summarySubtotal").textContent = formatCurrency(metrics.subtotal);
  document.getElementById("summaryDiscount").textContent = `-${formatCurrency(metrics.discount)}`;
  document.getElementById("summaryDelivery").textContent = metrics.delivery === 0 ? "Free" : formatCurrency(metrics.delivery);
  document.getElementById("summaryTotal").textContent = formatCurrency(metrics.total);
}

function renderAddressStep() {
  const f = checkoutState.form;
  const e = checkoutState.errors;

  return `
    <section class="step-card address-step-card">
      <div class="address-step-header">
        <div>
          <span class="address-step-kicker"><i class="bi bi-geo-alt"></i> Delivery details</span>
          <h2>Where should we deliver your order?</h2>
          <p>Add a complete address so our delivery partner can reach you without delays.</p>
        </div>
        <div class="address-secure-chip">
          <i class="bi bi-shield-check"></i>
          <span>Secure delivery information</span>
        </div>
      </div>

      <div class="address-helper-row">
        <span><i class="bi bi-house-door"></i> Use a house number, street, and landmark</span>
        <span><i class="bi bi-phone"></i> Keep your phone reachable for delivery updates</span>
      </div>

      <div class="address-form-grid">
        <div class="address-field-wrap">
          <div class="modern-field address-field has-icon">
            <i class="bi bi-person field-icon"></i>
            <label for="fullName">Full Name</label>
            <input id="fullName" class="form-control" data-field="fullName" value="${f.fullName}" placeholder="Receiver name">
          </div>
          <small class="field-error">${e.fullName || ""}</small>
        </div>
        <div class="address-field-wrap">
          <div class="modern-field address-field has-icon">
            <i class="bi bi-telephone field-icon"></i>
            <label for="phoneNumber">Phone Number</label>
            <input id="phoneNumber" class="form-control" data-field="phoneNumber" value="${f.phoneNumber}" placeholder="10-digit mobile number">
          </div>
          <small class="field-error">${e.phoneNumber || ""}</small>
        </div>
        <div class="address-field-wrap address-field-wide">
          <div class="modern-field address-field address-textarea-field has-icon">
            <i class="bi bi-signpost-2 field-icon"></i>
            <label for="address">Complete Address</label>
            <textarea id="address" class="form-control" data-field="address" placeholder="House no., building, street, area, landmark">${f.address}</textarea>
          </div>
          <small class="field-error">${e.address || ""}</small>
        </div>
        <div class="address-field-wrap">
          <div class="modern-field address-field has-icon">
            <i class="bi bi-buildings field-icon"></i>
            <label for="city">City</label>
            <input id="city" class="form-control" data-field="city" value="${f.city}" placeholder="City">
          </div>
          <small class="field-error">${e.city || ""}</small>
        </div>
        <div class="address-field-wrap">
          <div class="modern-field address-field has-icon">
            <i class="bi bi-map field-icon"></i>
            <label for="state">State</label>
            <input id="state" class="form-control" data-field="state" value="${f.state}" placeholder="State">
          </div>
          <small class="field-error">${e.state || ""}</small>
        </div>
        <div class="address-field-wrap">
          <div class="modern-field address-field has-icon">
            <i class="bi bi-pin-map field-icon"></i>
            <label for="pincode">Pincode</label>
            <input id="pincode" class="form-control" data-field="pincode" value="${f.pincode}" placeholder="6-digit pincode">
          </div>
          <small class="field-error">${e.pincode || ""}</small>
        </div>
      </div>

      <div class="save-address-row address-save-card">
        <label class="form-check m-0 address-save-check">
          <input class="form-check-input" type="checkbox" id="saveAddress" ${f.saveAddress ? "checked" : ""}>
          <span class="address-save-copy">
            <span class="form-check-label">Save address for future orders</span>
            <small>We will prefill this address next time for a faster checkout.</small>
          </span>
        </label>
        <span class="field-note"><i class="bi bi-lock"></i> You can edit this anytime from your account.</span>
      </div>

      <div class="step-actions address-step-actions">
        <button class="btn btn-primary address-continue-btn" id="continueStepBtn" type="button">
          Continue to Review <i class="bi bi-arrow-right"></i>
        </button>
      </div>
    </section>
  `;
}

function renderReviewStep() {
  const metrics = getMetrics();

  return `
    <section class="step-card">
      <h2>Review your order</h2>
      <p>Check each item, update quantities if needed, and verify the price breakdown before payment.</p>
      <div class="review-list">
        ${checkoutState.items.map((item) => `
          <article class="review-card" data-item-id="${item.id}">
            <img src="${item.image || "https://via.placeholder.com/80x80?text=NeoStore"}" alt="${item.name}" loading="lazy">
            <div>
              <h3>${item.name}</h3>
              <div class="summary-mini-meta">${item.description || "Fast delivery eligible product"}</div>
              <div class="review-qty mt-3">
                <button type="button" data-qty-action="decrease" data-item-id="${item.id}" ${item.quantity <= 1 ? "disabled" : ""}>-</button>
                <span>${item.quantity}</span>
                <button type="button" data-qty-action="increase" data-item-id="${item.id}">+</button>
              </div>
            </div>
            <div class="review-price">
              <div>${formatCurrency(item.price)}</div>
              <strong>${formatCurrency(item.price * item.quantity)}</strong>
            </div>
          </article>
        `).join("")}
      </div>
      <div class="summary-breakdown mt-4">
        <div class="summary-line"><span>Subtotal</span><strong>${formatCurrency(metrics.subtotal)}</strong></div>
        <div class="summary-line"><span>Discount</span><strong class="text-success">-${formatCurrency(metrics.discount)}</strong></div>
        <div class="summary-line"><span>Delivery</span><strong>${metrics.delivery === 0 ? "Free" : formatCurrency(metrics.delivery)}</strong></div>
        <div class="summary-line"><span>Total</span><strong>${formatCurrency(metrics.total)}</strong></div>
      </div>
      <div class="step-actions">
        <button class="btn btn-outline-dark" id="backStepBtn" type="button">Back</button>
        <button class="btn btn-primary" id="continuePaymentBtn" type="button">Continue to Payment</button>
      </div>
    </section>
  `;
}

function renderPaymentStep() {
  const selected = getSelectedPaymentOption();
  const metrics = getMetrics();
  const onlineAvailable = checkoutState.paymentConfig.onlinePaymentsEnabled;
  const isCod = selected.value === "Cash on Delivery";

  return `
    <section class="step-card">
      <h2>Select your preferred payment method</h2>
      <p>Choose the method you trust most. Your payment details are handled through a secure, encrypted checkout experience.</p>
      <div class="alert ${onlineAvailable ? "alert-success" : "alert-warning"} payment-config-alert" role="status">
        ${onlineAvailable
          ? "100% secure payments are available through Razorpay Secure Checkout for cards, UPI, net banking, wallets, EMI, and QR."
          : "Cash on Delivery is available right now. Secure online payment options may be temporarily unavailable."}
      </div>
      <div class="payment-grid">
        ${paymentOptions.map((option) => `
          <label class="payment-card ${option.accent} ${checkoutState.form.paymentMethod === option.value ? "active" : ""}" data-payment-method="${option.value}" data-payment-available="true">
            <input type="radio" name="paymentMethod" value="${option.value}" ${checkoutState.form.paymentMethod === option.value ? "checked" : ""}>
            <div class="payment-card-topline">
              <span class="payment-icon"><i class="bi ${option.icon}"></i></span>
              <span class="payment-badge">${option.badge}</span>
            </div>
            <span class="payment-card-title">${option.label}</span>
            <small>${option.value === "Cash on Delivery" ? `${option.note} Your order will be confirmed instantly.` : `${option.note} You will continue to Razorpay Secure Checkout to complete your payment safely.`}</small>
            <div class="payment-logos">
              ${option.logos.map((logo) => `<span>${logo}</span>`).join("")}
            </div>
          </label>
        `).join("")}
      </div>
      <div class="payment-status-panel">
        <div>
          <span class="payment-status-kicker">Selected method</span>
          <strong>${selected.label}</strong>
          <p>${isCod ? "Pay securely at the time of delivery. Your order will be confirmed instantly." : `You will continue to Razorpay Secure Checkout to pay ${formatCurrency(metrics.total)} safely.`}</p>
          <div class="payment-guidance-list">
            ${isCod
              ? `<span><i class="bi bi-check-circle"></i> No online payment needed</span><span><i class="bi bi-lightning-charge"></i> Instant order confirmation</span>`
              : `<span><i class="bi bi-shield-check"></i> 100% secure payments</span><span><i class="bi bi-lock"></i> Encrypted payment gateway</span><span><i class="bi bi-lightning-charge"></i> Fast and secure checkout</span>`}
          </div>
        </div>
        <div class="payment-status-pill ${isCod ? "is-cod" : "is-online"}">
          ${isCod ? "Pay on Delivery" : "Secure Payment"}
        </div>
      </div>
      <div class="step-actions">
        <button class="btn btn-outline-dark" id="backToReviewBtn" type="button">Back</button>
        <button class="btn btn-primary" id="placeOrderBtn" type="button">
          <span class="btn-copy">${getPaymentActionLabel()}</span>
          <span class="spinner-border spinner-border-sm d-none" aria-hidden="true"></span>
        </button>
      </div>
    </section>
  `;
}

function renderCurrentStep() {
  const root = document.getElementById("checkoutStepContent");
  if (checkoutState.step === 1) root.innerHTML = renderAddressStep();
  if (checkoutState.step === 2) root.innerHTML = renderReviewStep();
  if (checkoutState.step === 3) root.innerHTML = renderPaymentStep();

  updateStepper();
  renderSummary();
  syncMobileButtons();
}

function setStep(nextStep) {
  checkoutState.step = nextStep;
  persistDraft();
  renderCurrentStep();
}

function syncMobileButtons() {
  document.getElementById("mobileBackBtn").classList.toggle("d-none", checkoutState.step === 1);
  const continueButton = document.getElementById("mobileContinueBtn");
  const continueCopy = continueButton.querySelector(".btn-copy");
  continueButton.dataset.defaultLabel = checkoutState.step === 1
    ? "Continue"
    : checkoutState.step === 2
      ? "Continue to Payment"
      : getPaymentActionLabel();
  continueCopy.textContent = continueButton.dataset.defaultLabel;

  const summaryButton = document.getElementById("summaryPlaceOrderBtn");
  const summaryCopy = summaryButton.querySelector(".btn-copy");
  summaryButton.dataset.defaultLabel = checkoutState.step === 3 ? getPaymentActionLabel() : "Review Payment";
  summaryCopy.textContent = summaryButton.dataset.defaultLabel;
}

function collectStepOneValues() {
  document.querySelectorAll("[data-field]").forEach((field) => {
    checkoutState.form[field.dataset.field] = field.value;
  });

  const saveCheckbox = document.getElementById("saveAddress");
  if (saveCheckbox) {
    checkoutState.form.saveAddress = saveCheckbox.checked;
  }
}

function updateQuantity(itemId, direction) {
  const item = checkoutState.items.find((entry) => String(entry.id) === String(itemId));
  if (!item) return;

  const delta = direction === "increase" ? 1 : -1;
  item.quantity = Math.max(1, Number(item.quantity || 1) + delta);
  saveCart(checkoutState.items);
  renderCurrentStep();
}

function getCheckoutPayload() {
  return {
    items: checkoutState.items,
    couponCode: getAppliedCoupon(),
    deliveryAddress: {
      fullName: checkoutState.form.fullName.trim(),
      phoneNumber: checkoutState.form.phoneNumber.trim(),
      address: checkoutState.form.address.trim(),
      city: checkoutState.form.city.trim(),
      state: checkoutState.form.state.trim(),
      pincode: checkoutState.form.pincode.trim(),
    },
    paymentMethod: checkoutState.form.paymentMethod,
  };
}

async function createBackendOrder() {
  const endpoint = `${getPaymentApiBase()}/create-order`;
  const payload = getCheckoutPayload();

  logCheckout("create-order:request", {
    endpoint,
    paymentMethod: payload.paymentMethod,
    itemCount: payload.items.length,
    hasToken: Boolean(authToken),
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let data = {};

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseError) {
      logCheckoutError("create-order:json-parse-failed", parseError, {
        endpoint,
        rawText,
        status: response.status,
      });
      throw new Error(`Backend returned a non-JSON response (${response.status}). Check the server terminal.`);
    }

    logCheckout("create-order:response", {
      status: response.status,
      ok: response.ok,
      body: data,
    });

    if (!response.ok) {
      throw new Error(data.message || `Unable to start checkout (HTTP ${response.status}).`);
    }

    return data;
  } catch (error) {
    logCheckoutError("create-order:failed", error, { endpoint });
    throw error;
  }
}

async function fetchPaymentConfig() {
  const endpoint = `${getPaymentApiBase()}/status`;

  try {
    const statusResponse = await fetch(endpoint);
    const data = await statusResponse.json().catch(() => ({}));

    logCheckout("payment-status:response", {
      status: statusResponse.status,
      ok: statusResponse.ok,
      body: data,
    });

    if (!statusResponse.ok) {
      throw new Error(data.message || "Unable to load payment status.");
    }

    checkoutState.paymentConfig = {
      onlinePaymentsEnabled: Boolean(data.razorpayEnabled || data.onlinePaymentsEnabled),
      supportedMethods: Array.isArray(data.supportedMethods) ? data.supportedMethods : [],
      codEnabled: data.codEnabled !== false,
      message: Boolean(data.razorpayEnabled || data.onlinePaymentsEnabled)
        ? "Secure online payments are available."
        : (data.message || "Secure online payments are temporarily unavailable. Cash on Delivery is still available."),
    };
    logCheckout("razorpay-enabled", checkoutState.paymentConfig);

    if (checkoutState.paymentConfig.onlinePaymentsEnabled) {
      ensureRazorpayScript()
        .then(() => {
          logCheckout("razorpay-script:loaded");
        })
        .catch((error) => {
          logCheckoutError("razorpay-script:background-load-failed", error);
        });
    }
  } catch (error) {
    logCheckoutError("payment-status:failed", error, { endpoint });
    checkoutState.paymentConfig = {
      onlinePaymentsEnabled: false,
      supportedMethods: [],
      codEnabled: true,
      message: "Secure online payments are temporarily unavailable. Cash on Delivery is still available.",
    };
  }

  normalizePaymentMethodSelection();
}

function ensureRazorpayScript() {
  if (typeof window.Razorpay === "function") {
    return Promise.resolve();
  }

  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Unable to load Razorpay checkout script.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout script."));
    document.head.appendChild(script);
  }).finally(() => {
    if (typeof window.Razorpay === "function") {
      razorpayScriptPromise = Promise.resolve();
    } else {
      razorpayScriptPromise = null;
    }
  });

  return razorpayScriptPromise;
}

async function sendPaymentFailure(payload) {
  await fetch(getVerifyPaymentEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      checkoutGroupId: payload.checkoutGroupId,
      razorpay_order_id: payload.razorpayOrderId,
      paymentStatus: "failed",
      failureReason: payload.failureReason,
    }),
  }).catch(() => null);
}

function getRazorpayMethod(method) {
  const methodMap = {
    Card: "card",
    "Net Banking": "netbanking",
    UPI: "upi",
  };

  return methodMap[method] || undefined;
}

function formatRazorpayContact(contact) {
  const digits = String(contact || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return String(contact || "");
}

function buildRazorpayPrefill(session) {
  const prefill = {
    ...(session.prefill || {}),
  };

  if (!prefill.name) {
    prefill.name = checkoutState.form.fullName || currentUser?.name || "";
  }

  if (!prefill.email && currentUser?.email) {
    prefill.email = currentUser.email;
  }

  if (!prefill.contact) {
    prefill.contact = checkoutState.form.phoneNumber || currentUser?.phone || "";
  }

  prefill.contact = formatRazorpayContact(prefill.contact);

  return prefill;
}

function buildRazorpayDisplayConfig(method) {
  if (method === "UPI") {
    return {
      display: {
        blocks: {
          upi_preferred: {
            name: "Scan & Pay using any UPI App",
            instruments: [
              {
                method: "upi",
              },
            ],
          },
          online_fallback: {
            name: "Other secure payment options",
            instruments: [
              { method: "card" },
              { method: "netbanking" },
              { method: "wallet" },
            ],
          },
        },
        sequence: ["block.upi_preferred", "block.online_fallback"],
        preferences: {
          // Keep fallback methods available so Checkout does not show
          // "No appropriate payment method found" when UPI is unavailable
          // in test mode, dashboard settings, or on the current device.
          show_default_blocks: false,
        },
      },
    };
  }

  return {
    display: {
      blocks: {
        preferred: {
          name: "Recommended payment options",
          instruments: [
            { method: "card" },
            { method: "upi" },
            { method: "netbanking" },
            { method: "wallet" },
            { method: "emi" },
          ],
        },
      },
      sequence: ["block.preferred"],
      preferences: {
        show_default_blocks: true,
      },
    },
  };
}

async function openRazorpayCheckout(session) {
  await ensureRazorpayScript();
  checkoutState.popupOpen = true;

  return new Promise((resolve, reject) => {
    const selectedPaymentMethod = session.paymentMethod || checkoutState.form.paymentMethod;
    const razorpayMethod = getRazorpayMethod(selectedPaymentMethod);
    const razorpayDisplayConfig = buildRazorpayDisplayConfig(selectedPaymentMethod);
    const razorpayPrefill = buildRazorpayPrefill(session);

    logCheckout("razorpay:prepare", {
      hasScript: typeof window.Razorpay === "function",
      session,
      selectedPaymentMethod,
      razorpayMethod,
      hasPrefillEmail: Boolean(razorpayPrefill.email),
      hasPrefillContact: Boolean(razorpayPrefill.contact),
    });

    if (typeof window.Razorpay !== "function") {
      reject(new Error("Razorpay checkout failed to load. Check your internet connection and try again."));
      return;
    }

    if (!session?.success || !session?.orderId || !session?.amount || !session?.currency || !session?.key) {
      reject(new Error("Payment session is incomplete. Check the backend create-order response in the console."));
      return;
    }

    let settled = false;

    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const instance = new window.Razorpay({
      key: session.key,
      amount: session.amount,
      currency: session.currency || "INR",
      name: "NeoStore",
      description: "Secure checkout",
      order_id: session.orderId,
      image: "https://via.placeholder.com/96x96/2563eb/ffffff?text=N",
      prefill: razorpayPrefill,
      notes: session.notes || { checkoutGroupId: session.checkoutGroupId },
      ...(razorpayMethod ? { method: razorpayMethod } : {}),
      theme: {
        color: "#2563eb",
        backdrop_color: "#0f172a",
      },
      config: razorpayDisplayConfig,
      retry: {
        enabled: true,
      },
      modal: {
        backdropclose: false,
        escape: false,
        handleback: true,
        confirm_close: true,
        animation: true,
        ondismiss: async () => {
          logCheckout("razorpay:modal-dismissed", {
            checkoutGroupId: session.checkoutGroupId,
            orderId: session.orderId,
          });
          await sendPaymentFailure({
            checkoutGroupId: session.checkoutGroupId,
            razorpayOrderId: session.orderId,
            failureReason: "Payment popup was closed before completion.",
          });
          checkoutState.popupOpen = false;
          settleReject(new Error("Payment was cancelled before completion."));
        },
      },
      handler: async (response) => {
        try {
          logCheckout("razorpay:handler-success", response);
          const verifyResponse = await fetch(getVerifyPaymentEndpoint(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              checkoutGroupId: session.checkoutGroupId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          const verifyData = await verifyResponse.json().catch(() => ({}));
          logCheckout("verify-payment:response", {
            status: verifyResponse.status,
            ok: verifyResponse.ok,
            body: verifyData,
          });
          if (!verifyResponse.ok) {
            throw new Error(verifyData.message || "Payment verification failed.");
          }

          checkoutState.popupOpen = false;
          settleResolve(verifyData);
        } catch (error) {
          checkoutState.popupOpen = false;
          logCheckoutError("verify-payment:failed", error);
          settleReject(error);
        }
      },
    });

    instance.on("payment.failed", async (response) => {
      const reason = response?.error?.description || "Payment failed. Please try another method.";
      logCheckoutError("razorpay:payment-failed", new Error(reason), {
        response,
      });
      await sendPaymentFailure({
        checkoutGroupId: session.checkoutGroupId,
        razorpayOrderId: session.orderId,
        failureReason: reason,
      });
      checkoutState.popupOpen = false;
      settleReject(new Error(reason));
    });

    logCheckout("razorpay:open", {
      orderId: session.orderId,
      amount: session.amount,
      currency: session.currency,
    });
    instance.open();
  });
}

async function placeOrder() {
  if (checkoutState.submitting || checkoutState.popupOpen) {
    logCheckout("place-order:blocked", {
      submitting: checkoutState.submitting,
      popupOpen: checkoutState.popupOpen,
    });
    return;
  }

  if (!currentUser || currentUser.role !== "customer" || !authToken) {
    showToast("Please log in as a customer to place your order.");
    return;
  }

  if (!checkoutState.items.length) {
    showToast("Your cart is empty.");
    window.location.href = "cart.html";
    return;
  }

  if (!validateStepOne()) {
    setStep(1);
    showToast("Please complete the delivery address before placing your order.");
    return;
  }

  setCheckoutSubmitting(true);

  try {
    logCheckout("place-order:start", {
      paymentMethod: checkoutState.form.paymentMethod,
      itemCount: checkoutState.items.length,
    });
    const orderSession = await createBackendOrder();

    if (orderSession.flow === "cod") {
      showOrderSuccess(orderSession.message || "Order placed successfully.");
      return;
    }

    logCheckout("place-order:opening-razorpay", {
      orderId: orderSession.orderId,
      amount: orderSession.amount,
      currency: orderSession.currency,
    });
    const verification = await openRazorpayCheckout(orderSession);
    showOrderSuccess(verification.message || "Payment successful and order placed.");
  } catch (error) {
    logCheckoutError("place-order:failed", error, {
      paymentMethod: checkoutState.form.paymentMethod,
    });
    showToast(error.message || "Unable to place your order.");
  } finally {
    setCheckoutSubmitting(false);
  }
}

function handleContinue() {
  if (checkoutState.step === 1) {
    collectStepOneValues();
    if (!validateStepOne()) {
      renderCurrentStep();
      showToast("Please complete the required address fields.");
      return;
    }
    setStep(2);
    return;
  }

  if (checkoutState.step === 2) {
    setStep(3);
    return;
  }

  placeOrder();
}

function initEvents() {
  document.getElementById("checkoutStepContent").addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    if (field) {
      checkoutState.form[field] = event.target.value;
      persistDraft();
    }
  });

  document.getElementById("checkoutStepContent").addEventListener("click", (event) => {
    if (event.target.closest("#continueStepBtn") || event.target.closest("#continuePaymentBtn")) {
      handleContinue();
      return;
    }

    if (event.target.closest("#backStepBtn")) {
      setStep(1);
      return;
    }

    if (event.target.closest("#backToReviewBtn")) {
      setStep(2);
      return;
    }

    if (event.target.closest("#placeOrderBtn")) {
      placeOrder();
      return;
    }

    const paymentCard = event.target.closest("[data-payment-method]");
    if (paymentCard) {
      const selectedMethod = paymentCard.dataset.paymentMethod;
      console.log("Payment method clicked", selectedMethod);

      setSelectedPaymentMethod(selectedMethod);
      if (isOnlinePaymentMethod(selectedMethod)) {
        showToast("Payment method selected. Continue to Razorpay Secure Checkout when you are ready.");
      } else {
        showToast("Cash on Delivery selected. Your order will be confirmed instantly.");
      }
      return;
    }

    const qtyButton = event.target.closest("[data-qty-action]");
    if (qtyButton) {
      updateQuantity(qtyButton.dataset.itemId, qtyButton.dataset.qtyAction);
    }
  });

  document.getElementById("checkoutStepContent").addEventListener("change", (event) => {
    if (event.target.name === "paymentMethod") {
      setSelectedPaymentMethod(event.target.value);
    }
  });

  document.querySelectorAll(".stepper-step").forEach((button) => {
    button.addEventListener("click", () => {
      const targetStep = Number(button.dataset.step);
      if (targetStep > checkoutState.step && checkoutState.step === 1) {
        collectStepOneValues();
        if (!validateStepOne()) {
          renderCurrentStep();
          return;
        }
      }
      setStep(targetStep);
    });
  });

  document.getElementById("mobileContinueBtn").dataset.defaultLabel = "Continue";
  document.getElementById("summaryPlaceOrderBtn").dataset.defaultLabel = "Review Payment";

  document.getElementById("mobileContinueBtn").addEventListener("click", handleContinue);
  document.getElementById("mobileBackBtn").addEventListener("click", () => setStep(Math.max(1, checkoutState.step - 1)));
  document.getElementById("summaryPlaceOrderBtn").addEventListener("click", () => {
    if (checkoutState.step !== 3) {
      showToast("Review your address and order details before choosing payment.");
      return;
    }
    placeOrder();
  });
}

function initCheckout() {
  toastInstance = new bootstrap.Toast(document.getElementById("checkoutToast"), { delay: 2800 });
  logCheckout("init", {
    apiBase: API_BASE || window.location.origin,
    razorpayScriptLoaded: typeof window.Razorpay === "function",
    hasToken: Boolean(authToken),
    currentUserRole: currentUser?.role || null,
  });
  checkoutState.items = getCart();
  loadDraft();

  if (!checkoutState.items.length) {
    showToast("Your cart is empty. Add products before checkout.");
    window.setTimeout(() => {
      window.location.href = "cart.html";
    }, 700);
    return;
  }

  fetchPaymentConfig()
    .finally(() => {
      initEvents();
      renderCurrentStep();
    });
}

document.addEventListener("DOMContentLoaded", initCheckout);
