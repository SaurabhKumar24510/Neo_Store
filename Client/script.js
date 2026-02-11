// =============================
// 🔹 Product List Rendering (Dynamic from Backend)
// =============================
document.addEventListener('DOMContentLoaded', async () => {
  const productList = document.getElementById('product-list');

  try {
    const res = await fetch("http://localhost:5000/api/products/all");
    const products = await res.json();

    if (productList && Array.isArray(products)) {
      productList.innerHTML = ""; // clear old static products

      products.forEach(product => {
        const productCard = document.createElement("div");
        productCard.className = "col-md-4 mb-4";
        productCard.innerHTML = `
          <div class="card h-100 shadow-sm p-3 text-center">
            <img src="${product.image || 'https://via.placeholder.com/200'}"
                 class="card-img-top mb-3"
                 alt="${product.name}">
            <h4 class="card-title">${product.name}</h4>
            <p class="card-text">${product.description || ''}</p>
            <h5 class="fw-bold text-success mb-3">₹${product.price}</h5>
            <button class="btn btn-primary add-to-cart-btn">Add to Cart</button>
          </div>
        `;

        // ✅ Add button listener
        const button = productCard.querySelector(".add-to-cart-btn");
        button.addEventListener("click", () => {
          addToCart({
            id: product._id,
            name: product.name,
            price: product.price,
            image: product.image || "https://via.placeholder.com/200",
            quantity: 1
          });
        });

        productList.appendChild(productCard);
      });
    } else {
      productList.innerHTML = "<p>No products found.</p>";
    }
  } catch (err) {
    console.error("Error fetching products:", err);
    if (productList) productList.innerHTML = "<p>Failed to load products.</p>";
  }

  // ✅ Show login status
  const loginStatus = document.getElementById("login-status");
  const user = JSON.parse(localStorage.getItem("user"));
  if (user && loginStatus) {
    loginStatus.innerText = "Logged in as " + user.email;
  }
});

// =============================
// 🛒 Add to Cart Function
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



