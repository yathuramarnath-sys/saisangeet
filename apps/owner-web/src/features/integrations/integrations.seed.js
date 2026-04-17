// Integration definitions — UI catalog (not API data)
export const INTEGRATIONS_CATALOG = [
  // ── Accounts ──────────────────────────────────────────────
  {
    id: "zoho-books",
    name: "Zoho Books",
    category: "Accounts",
    emoji: "📒",
    tagline: "Auto-sync daily sales, GST reports and expenses to your accounts",
    setupTime: "5 min",
    fields: [
      { key: "organizationId", label: "Organisation ID", placeholder: "123456789", type: "text" },
      { key: "clientId",       label: "Client ID",       placeholder: "Your Zoho Client ID", type: "text" },
      { key: "clientSecret",   label: "Client Secret",   placeholder: "••••••••••••", type: "password" }
    ],
    helpText: "Find these in Zoho Developer Console → API Console → Self Client"
  },

  // ── Online Orders ─────────────────────────────────────────
  {
    id: "swiggy",
    name: "Swiggy",
    category: "Online Orders",
    emoji: "🛵",
    tagline: "Swiggy orders land straight in your POS. Menu syncs automatically.",
    setupTime: "2 min",
    fields: [
      { key: "restaurantId", label: "Swiggy Restaurant ID", placeholder: "RES123456", type: "text" },
      { key: "apiKey",       label: "API Key",              placeholder: "••••••••••••", type: "password" }
    ],
    helpText: "Get these from Swiggy Partner Portal → Settings → API Access"
  },
  {
    id: "zomato",
    name: "Zomato",
    category: "Online Orders",
    emoji: "🍽️",
    tagline: "Zomato orders flow to your kitchen. No manual entry needed.",
    setupTime: "2 min",
    fields: [
      { key: "restaurantId", label: "Zomato Restaurant ID", placeholder: "ZOM789012", type: "text" },
      { key: "apiKey",       label: "API Key",              placeholder: "••••••••••••", type: "password" }
    ],
    helpText: "Available in Zomato Partner Dashboard → Integration Settings"
  },

  // ── Payments ──────────────────────────────────────────────
  {
    id: "paytm",
    name: "Paytm",
    category: "Payments",
    emoji: "💳",
    tagline: "Accept UPI and QR payments at every counter. Same-day settlement.",
    setupTime: "3 min",
    fields: [
      { key: "merchantId", label: "Merchant ID", placeholder: "PAYTM_MERCHANT_ID", type: "text" },
      { key: "apiKey",     label: "API Key",     placeholder: "••••••••••••", type: "password" }
    ],
    helpText: "Login to Paytm Business → API Integration → Get Keys"
  },
  {
    id: "phonepe",
    name: "PhonePe",
    category: "Payments",
    emoji: "📳",
    tagline: "PhonePe Soundbox and QR for fast billing at counters.",
    setupTime: "3 min",
    fields: [
      { key: "merchantId", label: "Merchant ID", placeholder: "PPEMERCHANT", type: "text" },
      { key: "saltKey",    label: "Salt Key",    placeholder: "••••••••••••", type: "password" }
    ],
    helpText: "From PhonePe Business dashboard → Developer → API Keys"
  },

  // ── Delivery ──────────────────────────────────────────────
  {
    id: "rapido",
    name: "Rapido",
    category: "Delivery",
    emoji: "🏍️",
    tagline: "Same-city deliveries by Rapido captains. Track orders live.",
    setupTime: "2 min",
    fields: [
      { key: "clientId",     label: "Client ID",     placeholder: "RPC_CLIENT_ID", type: "text" },
      { key: "clientSecret", label: "Client Secret", placeholder: "••••••••••••", type: "password" }
    ],
    helpText: "From Rapido Business Portal → API Settings"
  },
  {
    id: "dunzo",
    name: "Dunzo",
    category: "Delivery",
    emoji: "📦",
    tagline: "Quick deliveries within 8 km using Dunzo network.",
    setupTime: "2 min",
    fields: [
      { key: "clientId",     label: "Client ID",     placeholder: "DZ_CLIENT_ID", type: "text" },
      { key: "clientSecret", label: "Client Secret", placeholder: "••••••••••••", type: "password" }
    ],
    helpText: "From Dunzo Business Dashboard → Settings → API"
  }
];

export const CATEGORY_ORDER = ["Accounts", "Online Orders", "Payments", "Delivery"];

export const CATEGORY_DESCRIPTIONS = {
  "Accounts":       "Keep your books in sync without manual entry",
  "Online Orders":  "Receive aggregator orders directly in your POS",
  "Payments":       "Accept digital payments at every counter",
  "Delivery":       "Send orders with city delivery partners"
};
