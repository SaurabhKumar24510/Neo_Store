// =============================
// Global Variables
// =============================
let allProducts = []; 
const API_BASE = window.location.protocol === "file:" ? "http://localhost:5000" : "";
let currentSearchTerm = "";

function getCart() {
  return JSON.parse(localStorage.getItem("cart")) || [];
}

function getCurrentUser() {
  return JSON.parse(localStorage.getItem("user") || "null");
}

function isSellerPreviewMode() {
  return getCurrentUser()?.role === "seller";
}

function updateCartBadge() {
  const cartCountBadge = document.getElementById("cartCountBadge");
  if (!cartCountBadge) return;

  const totalItems = getCart().reduce((sum, item) => sum + (item.quantity || 0), 0);
  cartCountBadge.textContent = totalItems;
  cartCountBadge.classList.toggle("d-none", totalItems === 0);
}

function getProductUIData(product) {
  const idSeed = `${product._id || product.id || product.name || "0"}`;
  const charTotal = idSeed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const discount = 8 + (charTotal % 5) * 4;
  const rating = (4 + ((charTotal % 9) / 10)).toFixed(1);
  const reviewCount = 120 + (charTotal % 380);
  const originalPrice = Math.round(Number(product.price || 0) / (1 - discount / 100));

  return {
    discount,
    rating,
    reviewCount,
    originalPrice: originalPrice > Number(product.price || 0) ? originalPrice : Number(product.price || 0) + 199,
  };
}

// =============================
// Utility: Show Message
// =============================
function showMessage(message) {
  const msgBox = document.getElementById("message-box");
  if (!msgBox) return;
  msgBox.textContent = message;
  msgBox.classList.remove("d-none");
  msgBox.classList.add("show");
  setTimeout(() => {
    msgBox.classList.remove("show");
    msgBox.classList.add("d-none");
  }, 3000);
}

function normalizeSearchTerm(value) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function updateSearchFeedback(searchTerm, resultCount, totalCount) {
  const feedback = document.getElementById("searchFeedback");
  if (!feedback) return;

  if (!searchTerm) {
    feedback.textContent = `Showing all ${totalCount} products`;
    feedback.classList.remove("d-none");
    return;
  }

  feedback.textContent = `${resultCount} result${resultCount === 1 ? "" : "s"} for "${searchTerm}"`;
  feedback.classList.remove("d-none");
}

function updateSearchButtons(searchTerm) {
  const searchButton = document.getElementById("searchButton");
  const clearButton = document.getElementById("clearSearchButton");

  if (searchButton) {
    searchButton.textContent = searchTerm ? "Update" : "Search";
  }

  if (clearButton) {
    clearButton.classList.toggle("d-none", !searchTerm);
  }
}

// =============================
// Utility: Add to Cart
// =============================
function addToCart(product) {
  if (isSellerPreviewMode()) {
    showMessage("Seller preview mode is enabled. Cart actions are disabled.");
    return;
  }

  let cart = getCart();
  const existing = cart.find(item => item.id === product.id);
  
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push(product);
  }

  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartBadge();
  showMessage(`✅ ${product.name} added to cart!`);
}

// =============================
// Core: Render Products
// =============================
function renderProducts(products) {
  const productList = document.getElementById("product-list");
  if (!productList) return;
  productList.innerHTML = ""; 

  // Agar products array nahi hai ya khali hai
  if (!Array.isArray(products) || products.length === 0) {
    productList.innerHTML = `<div class="col-12 text-center py-5 empty-state">
                                <h4 class="text-muted">No products found.</h4>
                                <p class="small text-muted">Check Console (F12) for API errors.</p>
                              </div>`;
    return;
  }

  products.forEach(product => {
    const card = document.createElement("div");
    card.className = "col-md-3 col-sm-6 mb-4";
    
    // ID check: Mongo _id ya SQL id?
    const productId = product._id || product.id || Math.random().toString();
    const imageUrl = product.image || "https://via.placeholder.com/200?text=No+Image";
    const uiData = getProductUIData(product);

    card.innerHTML = `
      <div class="card shadow-sm h-100">
        <div class="product-card-top">
          <div class="product-badge-row">
            <span class="discount-badge">${uiData.discount}% OFF</span>
            <span class="stock-badge">In stock</span>
          </div>
          <img src="${imageUrl}" class="card-img-top" alt="${product.name}" style="object-fit: contain; padding: 10px;">
        </div>
        <div class="card-body d-flex flex-column">
          <div class="product-meta-row">
            <span class="rating-pill"><i class="bi bi-star-fill"></i> ${uiData.rating}</span>
            <span class="delivery-pill">${uiData.reviewCount}+ reviews</span>
          </div>
          <h5 class="card-title">${product.name}</h5>
          <p class="card-text text-truncate" title="${product.description}">${product.description || ""}</p>
          <div class="product-price-row">
            <div class="price-block">
              <span class="current-price">₹${product.price}</span>
              <span class="original-price">₹${uiData.originalPrice}</span>
            </div>
            <button class="wishlist-btn" type="button" aria-label="Save ${product.name}">
              <i class="bi bi-heart"></i>
            </button>
          </div>
          <div class="product-actions">
            ${isSellerPreviewMode()
              ? `<span class="product-preview-note"><i class="bi bi-eye"></i> Seller preview</span>`
              : `<button class="btn btn-primary mt-auto add-to-cart-btn">Add to Cart</button>`}
          </div>
        </div>
      </div>
    `;
    productList.appendChild(card);

    const btn = card.querySelector(".add-to-cart-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        addToCart({
          id: productId,
          sellerId: product.sellerId || product.seller || "",
          name: product.name,
          price: product.price,
          image: imageUrl,
          description: product.description || "",
          category: product.category || "General",
          quantity: 1
        });
      });
    }
  });
}

// =============================
// Core: Authentication Logic
// =============================
function handleUserAuth() {
  const user = getCurrentUser();
  const loginNav = document.getElementById("login-nav");
  const myOrdersNav = document.getElementById("myOrdersNav");
  const profileDropdown = document.getElementById("profileDropdown");
  const profileCircle = document.getElementById("profileCircle");
  const profileDetails = document.getElementById("profileDetails");
  const dropdownOrdersLink = document.getElementById("dropdownOrdersLink");

  if (!loginNav || !profileDropdown || !profileCircle || !profileDetails) return;

  if (user) {
    loginNav.classList.add("d-none");
    profileDropdown.classList.remove("d-none");
    profileCircle.textContent = user.name.charAt(0).toUpperCase();
    document.getElementById("dropdownName").textContent = user.name;
    document.getElementById("dropdownEmail").textContent = user.email;
    document.getElementById("dropdownPhone").textContent = user.phone || "N/A";
    const sellerPreviewBanner = document.getElementById("sellerPreviewBanner");
    if (sellerPreviewBanner && user.role === "seller") {
      sellerPreviewBanner.classList.remove("d-none");
    }
    if (myOrdersNav) {
      myOrdersNav.classList.toggle("d-none", user.role !== "customer");
    }
    if (dropdownOrdersLink) {
      dropdownOrdersLink.classList.toggle("d-none", user.role !== "customer");
    }

    profileCircle.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDetails.style.display = profileDetails.style.display === "block" ? "none" : "block";
    });

    document.getElementById("logout-btn").addEventListener("click", () => {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      showMessage("Logged out!");
      setTimeout(() => location.reload(), 1500);
    });

    document.addEventListener("click", (e) => {
      if (!profileDropdown.contains(e.target)) profileDetails.style.display = "none";
    });
  }
}

// =============================
// Core: Search Functionality
// =============================
// =============================
// Core: Search Functionality (With Memory)
// =============================
function initSearch() {
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");
  const clearSearchButton = document.getElementById("clearSearchButton");

  if (!searchForm || !searchInput) return;

  // ✅ 1. Page Load par check karo ki pehle kya search tha (Back Button Logic)
  const savedSearchTerm = localStorage.getItem("neostore_search_term");
  if (savedSearchTerm && savedSearchTerm.trim() !== "") {
    searchInput.value = savedSearchTerm;
    filterAndRender(savedSearchTerm); // Wapas purani search show karo
  } else {
    updateSearchButtons("");
    updateSearchFeedback("", allProducts.length, allProducts.length);
  }

  // 2. Input Event: Search Save karne ka Logic
  searchInput.addEventListener("input", (e) => {
    const value = normalizeSearchTerm(e.target.value);
    
    // Hamesha current value save karo taaki wapas aane par yaad rahe
    if (value) {
      localStorage.setItem("neostore_search_term", value);
    } else {
      localStorage.removeItem("neostore_search_term");
    }

    updateSearchButtons(value);

    // Agar box khali hai to list reset karo
    if (value === "") {
      filterAndRender("");
    }
  });

  // 3. Submit Event: Search Button / Enter
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault(); 
    const searchTerm = normalizeSearchTerm(searchInput.value);
    searchInput.value = searchTerm;
    
    // Submit par bhi save karo
    if (searchTerm) {
      localStorage.setItem("neostore_search_term", searchTerm);
    } else {
      localStorage.removeItem("neostore_search_term");
    }
    
    filterAndRender(searchTerm);
  });

  if (clearSearchButton) {
    clearSearchButton.addEventListener("click", () => {
      searchInput.value = "";
      localStorage.removeItem("neostore_search_term");
      filterAndRender("");
      searchInput.focus();
    });
  }
}

// Helper Function: Common logic for filtering
function filterAndRender(searchTerm) {
  currentSearchTerm = searchTerm;

  if (searchTerm === "") {
    renderProducts(allProducts);
    updateSearchButtons("");
    updateSearchFeedback("", allProducts.length, allProducts.length);
  } else {
    const filtered = allProducts.filter(p => 
      (p.name && p.name.toLowerCase().includes(searchTerm)) || 
      (p.description && p.description.toLowerCase().includes(searchTerm))
    );
    renderProducts(filtered);
    updateSearchButtons(searchTerm);
    updateSearchFeedback(searchTerm, filtered.length, allProducts.length);
  }
}

// =============================
// Main: Initialization (With Debugging)
// =============================
document.addEventListener("DOMContentLoaded", async () => {
  updateCartBadge();
  
  // 1. Try different API URLs to find the working one
  const possibleUrls = [
    `${API_BASE}/api/products`,
    `${API_BASE}/api/products/all`,
    "http://localhost:5000/api/products",
    "http://localhost:5000/api/products/all"
  ];

  let fetchedData = null;

  // Loop through URLs until one works
  for (const url of possibleUrls) {
    try {
      console.log(`Trying to fetch from: ${url}...`);
      const res = await fetch(url);
      
      if (res.ok) {
        const data = await res.json();
        console.log("Success! Data received from:", url);
        console.log("Raw Data:", data); // 👈 Check console for this log
        fetchedData = data;
        break; // Stop if successful
      }
    } catch (err) {
      console.warn(`Failed to fetch from ${url}`, err);
    }
  }

  // 2. Process Data
  if (fetchedData) {
    // Handle if data is wrapped in an object (e.g., { products: [...] })
    let finalProducts = [];
    
    if (Array.isArray(fetchedData)) {
      finalProducts = fetchedData;
    } else if (fetchedData.products && Array.isArray(fetchedData.products)) {
      finalProducts = fetchedData.products;
    } else if (fetchedData.data && Array.isArray(fetchedData.data)) {
      finalProducts = fetchedData.data;
    } else {
      console.error("Data format is unknown:", fetchedData);
      renderProducts([]);
      return;
    }

    // Save and Render
    allProducts = finalProducts;
    console.log("Processed Products to Render:", allProducts); // 👈 Check this
    filterAndRender(currentSearchTerm);

  } else {
    // If all URLs failed
    console.error("Could not connect to backend on any URL.");
    renderProducts([]);
    updateSearchButtons("");
    updateSearchFeedback("", 0, 0);
  }

  // 3. Init Other Modules
  handleUserAuth();
  initSearch();
});

window.addEventListener("storage", (event) => {
  if (event.key === "cart") {
    updateCartBadge();
  }
});
