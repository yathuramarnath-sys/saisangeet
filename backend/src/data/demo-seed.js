/**
 * demo-seed.js
 *
 * Injects a realistic starter dataset into a brand-new tenant's owner-setup
 * so they never land on a completely blank screen.
 *
 * Seeded data:
 *   - 1 outlet  : "Main Branch"
 *   - 4 menu categories + 4–5 items each (typical Indian restaurant menu)
 *   - 2 staff members  (Cashier + Captain roles, PIN 1234)
 *
 * Every seeded record carries _demo: true so the owner can bulk-delete
 * later via DELETE /api/v1/demo-data once they add real data.
 *
 * Called from auth.service.js → saveSignupInterest after tenant creation.
 */

function makeDemoSeed(tenantId) {
  const now  = new Date().toISOString();
  const slug = tenantId.replace("tenant-", "").slice(-4).toUpperCase();

  // ── outlet ─────────────────────────────────────────────────────────────────
  const outlet = {
    id:          `outlet-demo-${slug}`,
    code:        `DEMO${slug}`,
    name:        "Main Branch",
    city:        "",
    state:       "",
    gstin:       "",
    reportEmail: "",
    isActive:    true,
    _demo:       true,
    createdAt:   now,
  };

  // ── menu categories ────────────────────────────────────────────────────────
  const categories = [
    { id: "cat-demo-starter",  name: "Starters",    _demo: true },
    { id: "cat-demo-main",     name: "Main Course",  _demo: true },
    { id: "cat-demo-bread",    name: "Breads",       _demo: true },
    { id: "cat-demo-beverage", name: "Beverages",    _demo: true },
  ];

  // ── menu items ─────────────────────────────────────────────────────────────
  const items = [
    // Starters
    { id: "item-d-01", name: "Paneer Tikka",          categoryId: "cat-demo-starter",  price: 220, unit: "PCS", _demo: true },
    { id: "item-d-02", name: "Veg Spring Roll",        categoryId: "cat-demo-starter",  price: 160, unit: "PCS", _demo: true },
    { id: "item-d-03", name: "Chicken 65",             categoryId: "cat-demo-starter",  price: 260, unit: "PCS", _demo: true },
    { id: "item-d-04", name: "Soup of the Day",        categoryId: "cat-demo-starter",  price: 100, unit: "PCS", _demo: true },

    // Main Course
    { id: "item-d-05", name: "Dal Makhani",            categoryId: "cat-demo-main",     price: 200, unit: "PCS", _demo: true },
    { id: "item-d-06", name: "Paneer Butter Masala",   categoryId: "cat-demo-main",     price: 240, unit: "PCS", _demo: true },
    { id: "item-d-07", name: "Chicken Curry",          categoryId: "cat-demo-main",     price: 280, unit: "PCS", _demo: true },
    { id: "item-d-08", name: "Veg Biryani",            categoryId: "cat-demo-main",     price: 220, unit: "PCS", _demo: true },
    { id: "item-d-09", name: "Chicken Biryani",        categoryId: "cat-demo-main",     price: 300, unit: "PCS", _demo: true },

    // Breads
    { id: "item-d-10", name: "Butter Naan",            categoryId: "cat-demo-bread",    price:  40, unit: "PCS", _demo: true },
    { id: "item-d-11", name: "Tandoori Roti",          categoryId: "cat-demo-bread",    price:  30, unit: "PCS", _demo: true },
    { id: "item-d-12", name: "Garlic Naan",            categoryId: "cat-demo-bread",    price:  50, unit: "PCS", _demo: true },
    { id: "item-d-13", name: "Paratha",                categoryId: "cat-demo-bread",    price:  60, unit: "PCS", _demo: true },

    // Beverages
    { id: "item-d-14", name: "Lassi (Sweet)",          categoryId: "cat-demo-beverage", price:  80, unit: "PCS", _demo: true },
    { id: "item-d-15", name: "Mango Shake",            categoryId: "cat-demo-beverage", price: 100, unit: "PCS", _demo: true },
    { id: "item-d-16", name: "Masala Chai",            categoryId: "cat-demo-beverage", price:  40, unit: "PCS", _demo: true },
    { id: "item-d-17", name: "Cold Coffee",            categoryId: "cat-demo-beverage", price: 120, unit: "PCS", _demo: true },
    { id: "item-d-18", name: "Fresh Lime Soda",        categoryId: "cat-demo-beverage", price:  60, unit: "PCS", _demo: true },
  ];

  // ── demo staff ─────────────────────────────────────────────────────────────
  const staff = [
    {
      id:         `staff-demo-c-${slug}`,
      fullName:   "Demo Cashier",
      name:       "Demo Cashier",
      email:      null,
      phone:      null,
      passwordHash: null,
      roles:      ["Cashier"],
      pin:        "1234",
      outletName: "Main Branch",
      isActive:   true,
      _demo:      true,
    },
    {
      id:         `staff-demo-k-${slug}`,
      fullName:   "Demo Captain",
      name:       "Demo Captain",
      email:      null,
      phone:      null,
      passwordHash: null,
      roles:      ["Captain"],
      pin:        "5678",
      outletName: "Main Branch",
      isActive:   true,
      _demo:      true,
    },
  ];

  return { outlet, categories, items, staff };
}

/**
 * Applies demo seed into an existing tenantData object (mutates + returns it).
 * Safe to call even if menu / outlets arrays already have data.
 */
function applyDemoSeed(tenantData, tenantId) {
  const { outlet, categories, items, staff } = makeDemoSeed(tenantId);

  // Outlets
  tenantData.outlets = tenantData.outlets || [];
  if (!tenantData.outlets.some(o => o._demo)) {
    tenantData.outlets.push(outlet);
  }

  // Menu categories
  tenantData.menu = tenantData.menu || {};
  tenantData.menu.categories = tenantData.menu.categories || [];
  if (!tenantData.menu.categories.some(c => c._demo)) {
    tenantData.menu.categories.push(...categories);
  }

  // Menu items
  tenantData.menu.items = tenantData.menu.items || [];
  if (!tenantData.menu.items.some(i => i._demo)) {
    tenantData.menu.items.push(...items);
  }

  // Staff (append to existing users array after owner)
  tenantData.users = tenantData.users || [];
  if (!tenantData.users.some(u => u._demo)) {
    tenantData.users.push(...staff);
  }

  return tenantData;
}

module.exports = { applyDemoSeed };
