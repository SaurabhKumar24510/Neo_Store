// =============================
// Global Variables
// =============================
let allProducts = []; 

// =============================
// Utility: Show Message
// =============================
function showMessage(message) {
  const msgBox = document.getElementById("message-box");
  msgBox.textContent = message;
  msgBox.classList.remove("d-none");
  msgBox.classList.add("show");
  setTimeout(() => {
    msgBox.classList.remove("show");
    msgBox.classList.add("d-none");
  }, 3000);
}

// =============================
// Utility: Add to Cart
// =============================
function addToCart(product) {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  const existing = cart.find(item => item.id === product.id);
  
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push(product);
  }

  localStorage.setItem("cart", JSON.stringify(cart));
  showMessage(`✅ ${product.name} added to cart!`);
}

// =============================
// Core: Render Products
// =============================
function renderProducts(products) {
  const productList = document.getElementById("product-list");
  productList.innerHTML = ""; 

  // Agar products array nahi hai ya khali hai
  if (!Array.isArray(products) || products.length === 0) {
    productList.innerHTML = `<div class="col-12 text-center py-5">
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

    card.innerHTML = `
      <div class="card shadow-sm h-100">
        <img src="${imageUrl}" class="card-img-top" alt="${product.name}" style="height: 200px; object-fit: contain; padding: 10px;">
        <div class="card-body d-flex flex-column">
          <h5 class="card-title">${product.name}</h5>
          <p class="card-text text-truncate" title="${product.description}">${product.description || ""}</p>
          <h5 class="fw-bold text-success">₹${product.price}</h5>
          <button class="btn btn-primary mt-auto add-to-cart-btn">Add to Cart</button>
        </div>
      </div>
    `;
    productList.appendChild(card);

    const btn = card.querySelector(".add-to-cart-btn");
    btn.addEventListener("click", () => {
      addToCart({
        id: productId,
        name: product.name,
        price: product.price,
        image: imageUrl,
        quantity: 1
      });
    });
  });
}

// =============================
// Core: Authentication Logic
// =============================
function handleUserAuth() {
  const user = JSON.parse(localStorage.getItem("user"));
  const loginNav = document.getElementById("login-nav");
  const profileDropdown = document.getElementById("profileDropdown");
  const profileCircle = document.getElementById("profileCircle");
  const profileDetails = document.getElementById("profileDetails");

  if (user) {
    loginNav.classList.add("d-none");
    profileDropdown.classList.remove("d-none");
    profileCircle.textContent = user.name.charAt(0).toUpperCase();
    document.getElementById("dropdownName").textContent = user.name;
    document.getElementById("dropdownEmail").textContent = user.email;
    document.getElementById("dropdownPhone").textContent = user.phone || "N/A";

    profileCircle.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDetails.style.display = profileDetails.style.display === "block" ? "none" : "block";
    });

    document.getElementById("logout-btn").addEventListener("click", () => {
      localStorage.removeItem("user");
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

  if (!searchForm || !searchInput) return;

  // ✅ 1. Page Load par check karo ki pehle kya search tha (Back Button Logic)
  const savedSearchTerm = localStorage.getItem("neostore_search_term");
  if (savedSearchTerm && savedSearchTerm.trim() !== "") {
    searchInput.value = savedSearchTerm;
    filterAndRender(savedSearchTerm); // Wapas purani search show karo
  }

  // 2. Input Event: Search Save karne ka Logic
  searchInput.addEventListener("input", (e) => {
    const value = e.target.value;
    
    // Hamesha current value save karo taaki wapas aane par yaad rahe
    localStorage.setItem("neostore_search_term", value);

    // Agar box khali hai to list reset karo
    if (value === "") {
      renderProducts(allProducts);
      localStorage.removeItem("neostore_search_term"); // Clear memory
    }
  });

  // 3. Submit Event: Search Button / Enter
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault(); 
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    // Submit par bhi save karo
    localStorage.setItem("neostore_search_term", searchTerm);
    
    filterAndRender(searchTerm);
  });
}

// Helper Function: Common logic for filtering
function filterAndRender(searchTerm) {
  if (searchTerm === "") {
    renderProducts(allProducts);
  } else {
    const filtered = allProducts.filter(p => 
      (p.name && p.name.toLowerCase().includes(searchTerm)) || 
      (p.description && p.description.toLowerCase().includes(searchTerm))
    );
    renderProducts(filtered);
  }
}

// =============================
// Main: Initialization (With Debugging)
// =============================
document.addEventListener("DOMContentLoaded", async () => {
  
  // 1. Try different API URLs to find the working one
  const possibleUrls = [
    "http://localhost:5000/api/products/all", // Try full URL
    "http://localhost:5000/api/products",      // Try short URL
    "/api/products/all",                       // Try relative (if proxy used)
    "/api/products"
  ];

  let fetchedData = null;
  let activeUrl = "";

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
        activeUrl = url;
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
      document.getElementById("product-list").innerHTML = "<p class='text-danger'>Data format error.</p>";
      return;
    }

    // Save and Render
    allProducts = finalProducts;
    console.log("Processed Products to Render:", allProducts); // 👈 Check this
    renderProducts(allProducts);

  } else {
    // If all URLs failed
    console.error("Could not connect to backend on any URL.");
    document.getElementById("product-list").innerHTML = `
      <div class="col-12 text-center text-danger py-5">
        <h4>Failed to load products.</h4>
        <p>Backend might be down or URL is incorrect.</p>
        <small>Ensure your NodeJS server is running on port 5000.</small>
      </div>
    `;
  }

  // 3. Init Other Modules
  handleUserAuth();
  initSearch();
});