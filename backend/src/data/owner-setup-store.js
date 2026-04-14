const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", ".data");
const DATA_FILE = path.join(DATA_DIR, "owner-setup.json");

function createDefaultData() {
  return {
    businessProfile: {
      id: "business-1",
      legalName: "Saisangeet Hospitality Private Limited",
      tradeName: "Saisangeet",
      gstin: "29ABCDE1234F1Z5",
      phone: "+91 98765 43210",
      email: "owner@saisangeet.in",
      addressLine1: "12 MG Road",
      addressLine2: "Near Metro Station",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
      timezone: "Asia/Kolkata",
      currencyCode: "INR",
      logoUrl: "",
      invoiceHeader: "Pure veg family restaurant",
      invoiceFooter: "Thank you, visit again"
    },
    outlets: [
      {
        id: "outlet-indiranagar",
        code: "BLR-01",
        name: "Indiranagar",
        gstin: "29ABCDE1234F1Z5",
        city: "Bengaluru",
        state: "Karnataka",
        isActive: true,
        hours: "8:00 AM - 11:00 PM",
        services: ["Dine-in", "Takeaway", "Delivery"],
        defaultTaxProfileId: "tax-5",
        receiptTemplateId: "receipt-dine-in"
      },
      {
        id: "outlet-koramangala",
        code: "BLR-02",
        name: "Koramangala",
        gstin: "29ABCDE1234F1Z5",
        city: "Bengaluru",
        state: "Karnataka",
        isActive: true,
        hours: "9:00 AM - 11:30 PM",
        services: ["Dine-in", "Takeaway"],
        defaultTaxProfileId: "tax-5",
        receiptTemplateId: "receipt-dine-in"
      }
    ],
    permissions: [
      { id: "perm-1", code: "business.manage", moduleName: "Business", scope: "owner" },
      { id: "perm-2", code: "outlets.manage", moduleName: "Outlets", scope: "owner" },
      { id: "perm-3", code: "menu.manage", moduleName: "Menu", scope: "owner" },
      { id: "perm-4", code: "roles.manage", moduleName: "Roles", scope: "owner" },
      { id: "perm-5", code: "users.manage", moduleName: "Users", scope: "owner" },
      { id: "perm-6", code: "tax.manage", moduleName: "Billing", scope: "owner" },
      { id: "perm-7", code: "receipt_templates.manage", moduleName: "Billing", scope: "owner" },
      { id: "perm-8", code: "devices.manage", moduleName: "Devices", scope: "owner" },
      { id: "perm-9", code: "reports.view", moduleName: "Reports", scope: "manager" },
      { id: "perm-10", code: "operations.kot.send", moduleName: "Operations", scope: "captain" },
      { id: "perm-11", code: "operations.bill.request", moduleName: "Operations", scope: "waiter" },
      { id: "perm-12", code: "operations.discount.approve", moduleName: "Operations", scope: "manager" }
    ],
    roles: [
      {
        id: "role-owner",
        name: "Owner",
        description: "Full business access across all outlets",
        permissions: ["business.manage", "outlets.manage", "menu.manage", "roles.manage", "users.manage", "tax.manage", "receipt_templates.manage", "devices.manage", "reports.view"]
      },
      {
        id: "role-manager",
        name: "Manager",
        description: "Outlet operations and approval access",
        permissions: ["menu.manage", "users.manage", "reports.view", "operations.discount.approve"]
      },
      {
        id: "role-captain",
        name: "Captain",
        description: "Floor service and KOT operations",
        permissions: ["operations.kot.send"]
      }
    ],
    users: [
      {
        id: "user-owner",
        fullName: "Amarnath",
        name: "Amarnath",
        roles: ["Owner"],
        outletName: "All Outlets",
        isActive: true,
        pin: "1234"
      },
      {
        id: "user-manager-1",
        fullName: "Priya Manager",
        name: "Priya Manager",
        roles: ["Manager"],
        outletName: "Indiranagar",
        isActive: true,
        pin: "2244"
      }
    ],
    taxProfiles: [
      { id: "tax-5", name: "GST 5%", cgstRate: 2.5, sgstRate: 2.5, igstRate: 5, cessRate: 0, isInclusive: false, isDefault: true },
      { id: "tax-18", name: "GST 18%", cgstRate: 9, sgstRate: 9, igstRate: 18, cessRate: 0, isInclusive: false, isDefault: false }
    ],
    receiptTemplates: [
      { id: "receipt-dine-in", name: "Dine-In Standard", showQrPayment: true, showTaxBreakdown: true, footerNote: "Thank you, visit again", outletName: "All Outlets" },
      { id: "receipt-takeaway", name: "Takeaway Standard", showQrPayment: true, showTaxBreakdown: true, footerNote: "Packed with care", outletName: "All Outlets" }
    ],
    devices: [
      { id: "device-1", deviceName: "Front Cashier POS", deviceType: "POS Terminal", outletName: "Indiranagar", status: "active", linkCode: "INDR-1001" },
      { id: "device-2", deviceName: "Billing Counter 2", deviceType: "POS Terminal", outletName: "Koramangala", status: "inactive", linkCode: "KORA-1002" }
    ],
    menu: {
      categories: [
        { id: "cat-starters", name: "Starters", itemCount: 2 },
        { id: "cat-main-course", name: "Main Course", itemCount: 1 },
        { id: "cat-beverages", name: "Beverages", itemCount: 1 }
      ],
      items: [
        {
          id: "item-paneer-tikka",
          categoryId: "cat-starters",
          name: "Paneer Tikka",
          station: "Grill station",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Area + service pricing", "Available", "Tracked"],
          salesAvailability: "Available",
          outletAvailability: [
            { outlet: "Indiranagar", enabled: true },
            { outlet: "Koramangala", enabled: true }
          ],
          inventoryTracking: { enabled: true, mode: "Item wise", note: "Track sellable stock for POS and waiter ordering" },
          pricing: [
            { area: "AC", dineIn: "Rs 220", takeaway: "Rs 210", delivery: "Rs 230" },
            { area: "Non-AC", dineIn: "Rs 210", takeaway: "Rs 205", delivery: "Rs 225" },
            { area: "Self Service", dineIn: "Rs 195", takeaway: "Rs 190", delivery: "Rs 215" }
          ]
        },
        {
          id: "item-crispy-corn",
          categoryId: "cat-starters",
          name: "Crispy Corn",
          station: "Fry station",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Area + service pricing", "Available"],
          salesAvailability: "Available",
          outletAvailability: [
            { outlet: "Indiranagar", enabled: true },
            { outlet: "Koramangala", enabled: false }
          ],
          inventoryTracking: { enabled: false, mode: "Optional", note: "Inventory tracking is disabled for this item" },
          pricing: [
            { area: "AC", dineIn: "Rs 180", takeaway: "Rs 175", delivery: "Rs 195" },
            { area: "Non-AC", dineIn: "Rs 170", takeaway: "Rs 165", delivery: "Rs 185" },
            { area: "Self Service", dineIn: "Rs 160", takeaway: "Rs 155", delivery: "Rs 175" }
          ]
        },
        {
          id: "item-veg-biryani",
          categoryId: "cat-main-course",
          name: "Veg Biryani",
          station: "Main kitchen",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Popular", "Tracked"],
          salesAvailability: "Available",
          outletAvailability: [
            { outlet: "Indiranagar", enabled: true },
            { outlet: "Koramangala", enabled: true }
          ],
          inventoryTracking: { enabled: true, mode: "Category wise", note: "Included in opening stock category-wise sales tracking" },
          pricing: [
            { area: "AC", dineIn: "Rs 240", takeaway: "Rs 230", delivery: "Rs 250" },
            { area: "Non-AC", dineIn: "Rs 230", takeaway: "Rs 225", delivery: "Rs 245" },
            { area: "Self Service", dineIn: "Rs 220", takeaway: "Rs 215", delivery: "Rs 235" }
          ]
        },
        {
          id: "item-sweet-lime",
          categoryId: "cat-beverages",
          name: "Sweet Lime Soda",
          station: "Beverages",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Available"],
          salesAvailability: "Available",
          outletAvailability: [
            { outlet: "Indiranagar", enabled: true },
            { outlet: "Koramangala", enabled: true }
          ],
          inventoryTracking: { enabled: false, mode: "Optional later", note: "No stock tracking for beverages in this setup" },
          pricing: [
            { area: "AC", dineIn: "Rs 90", takeaway: "Rs 85", delivery: "Rs 95" },
            { area: "Non-AC", dineIn: "Rs 90", takeaway: "Rs 85", delivery: "Rs 95" },
            { area: "Self Service", dineIn: "Rs 90", takeaway: "Rs 85", delivery: "Rs 95" }
          ]
        }
      ]
    }
  };
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createDefaultData(), null, 2));
  }
}

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  return data;
}

function getOwnerSetupData() {
  return readData();
}

function updateOwnerSetupData(updater) {
  const current = readData();
  const next = updater(JSON.parse(JSON.stringify(current)));
  return writeData(next);
}

module.exports = {
  getOwnerSetupData,
  updateOwnerSetupData
};
