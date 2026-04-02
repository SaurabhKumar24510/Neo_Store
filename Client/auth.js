const API_BASE = window.location.protocol === "file:" ? "http://localhost:5000" : "";
const authMode = document.body.dataset.authMode;
const authForm = document.getElementById("authForm");
const authAlert = document.getElementById("authAlert");
const submitButton = document.getElementById("submitButton");
const submitSpinner = document.getElementById("submitSpinner");
const roleInput = document.getElementById("role");
const shopNameField = document.getElementById("shopNameField");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9]{10}$/;
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function getField(id) {
  return document.getElementById(id);
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
  });

  document.querySelectorAll(".form-control").forEach((input) => {
    input.classList.remove("is-invalid");
  });
}

function setFieldError(fieldName, message) {
  const input = getField(fieldName);
  const error = document.querySelector(`[data-error-for="${fieldName}"]`);

  if (input) {
    input.classList.add("is-invalid");
  }

  if (error) {
    error.textContent = message;
  }
}

function showAlert(message, type) {
  authAlert.textContent = message;
  authAlert.className = `auth-alert auth-alert-${type}`;
}

function hideAlert() {
  authAlert.className = "auth-alert d-none";
  authAlert.textContent = "";
}

function setLoading(isLoading, label) {
  submitButton.disabled = isLoading;
  submitSpinner.classList.toggle("d-none", !isLoading);
  submitButton.querySelector(".btn-text").textContent = label;
}

function getSelectedRole() {
  return roleInput?.value || "customer";
}

function updateRoleUI(role) {
  if (roleInput) {
    roleInput.value = role;
  }

  document.querySelectorAll("[data-role-tab]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-role-tab") === role);
  });

  if (shopNameField) {
    shopNameField.classList.toggle("d-none", role !== "seller");
  }
}

function collectFormData() {
  const payload = {};
  new FormData(authForm).forEach((value, key) => {
    payload[key] = String(value).trim();
  });
  return payload;
}

function buildAuthPayload(rawPayload) {
  if (authMode === "signup") {
    return rawPayload;
  }

  return {
    email: rawPayload.email || "",
    password: rawPayload.password || "",
  };
}

function validateLoginForm(payload) {
  let isValid = true;

  if (!payload.email) {
    setFieldError("email", "Email is required.");
    isValid = false;
  } else if (!emailPattern.test(payload.email)) {
    setFieldError("email", "Enter a valid email address.");
    isValid = false;
  }

  if (!payload.password) {
    setFieldError("password", "Password is required.");
    isValid = false;
  }

  return isValid;
}

function validateSignupForm(payload) {
  let isValid = true;
  const selectedRole = payload.role || "customer";

  if (!payload.name) {
    setFieldError("name", "Full name is required.");
    isValid = false;
  } else if (payload.name.length < 2) {
    setFieldError("name", "Name must be at least 2 characters.");
    isValid = false;
  }

  if (!payload.phone) {
    setFieldError("phone", "Phone number is required.");
    isValid = false;
  } else if (!phonePattern.test(payload.phone)) {
    setFieldError("phone", "Enter a valid 10-digit phone number.");
    isValid = false;
  }

  if (!payload.email) {
    setFieldError("email", "Email is required.");
    isValid = false;
  } else if (!emailPattern.test(payload.email)) {
    setFieldError("email", "Enter a valid email address.");
    isValid = false;
  }

  if (!payload.password) {
    setFieldError("password", "Password is required.");
    isValid = false;
  } else if (!passwordPattern.test(payload.password)) {
    setFieldError("password", "Use 8+ characters with letters and numbers.");
    isValid = false;
  }

  if (!payload.confirmPassword) {
    setFieldError("confirmPassword", "Please confirm your password.");
    isValid = false;
  } else if (payload.password !== payload.confirmPassword) {
    setFieldError("confirmPassword", "Passwords do not match.");
    isValid = false;
  }

  if (selectedRole === "seller") {
    if (!payload.shopName) {
      setFieldError("shopName", "Shop name is required for seller accounts.");
      isValid = false;
    } else if (payload.shopName.length < 2) {
      setFieldError("shopName", "Shop name must be at least 2 characters.");
      isValid = false;
    }
  }

  return isValid;
}

async function handleSubmit(event) {
  event.preventDefault();
  clearFieldErrors();
  hideAlert();

  const rawPayload = collectFormData();
  const payload = buildAuthPayload(rawPayload);
  const isSignup = authMode === "signup";
  const isValid = isSignup ? validateSignupForm(payload) : validateLoginForm(payload);

  if (!isValid) {
    showAlert("Please correct the highlighted fields and try again.", "error");
    return;
  }

  setLoading(true, isSignup ? "Creating account..." : "Logging in...");

  try {
    const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
    if (!isSignup) {
      console.log("Login request payload:", {
        email: payload.email,
        hasPassword: Boolean(payload.password),
      });
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.message || "Something went wrong. Please try again.", "error");
      return;
    }

    if (isSignup) {
      showAlert(data.message || "Account created successfully.", "success");
      authForm.reset();
      updateRoleUI("customer");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1600);
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    showAlert(data.message || "Login successful.", "success");

    setTimeout(() => {
      window.location.href = data.user.role === "seller" ? "/seller-dashboard" : "index.html";
    }, 1200);
  } catch (error) {
    console.error("Auth error:", error);
    showAlert("Unable to reach the server right now. Please try again.", "error");
  } finally {
    setLoading(false, authMode === "signup" ? "Create account" : "Login");
  }
}

function initPasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const inputId = button.getAttribute("data-toggle-password");
      const input = getField(inputId);
      const icon = button.querySelector("i");
      const isPassword = input.type === "password";

      input.type = isPassword ? "text" : "password";
      icon.className = isPassword ? "bi bi-eye-slash" : "bi bi-eye";
      button.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    });
  });
}

function initRoleTabs() {
  document.querySelectorAll("[data-role-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      updateRoleUI(button.getAttribute("data-role-tab"));
      hideAlert();
      clearFieldErrors();
    });
  });
}

if (authForm) {
  authForm.addEventListener("submit", handleSubmit);
}

updateRoleUI(getSelectedRole());
initRoleTabs();
initPasswordToggles();
