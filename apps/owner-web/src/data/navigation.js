// Flat array — used by routes.jsx for route generation
export const navigation = [
  { id: "dashboard",    label: "Dashboard",            path: "/dashboard",       mode: "react" },
  { id: "live-orders",  label: "Live Orders",          path: "/live-orders",     mode: "react" },
  { id: "all-orders",   label: "All Orders",           path: "/orders",          mode: "react" },
  { id: "kots",         label: "KOT History",          path: "/kots",            mode: "react" },
  { id: "online-orders-history", label: "Online Orders",  path: "/online-orders-history", mode: "react" },
  { id: "business",     label: "Business Profile",     path: "/business",        mode: "react" },
  { id: "outlets",      label: "Outlets",              path: "/outlets",         mode: "react" },
  { id: "menu",         label: "Menu & Categories",    path: "/menu",            mode: "react" },
  { id: "kitchen",      label: "Kitchen Stations",     path: "/kitchen-stations",mode: "react" },
  { id: "staff",        label: "Staff & Roles",        path: "/staff",           mode: "react" },
  { id: "discounts",    label: "Discount Rules",       path: "/discount-rules",  mode: "react" },
  { id: "pos-config",   label: "POS Configuration",    path: "/pos-config",       mode: "react" },
  { id: "integrations",    label: "Integrations",         path: "/integrations",        mode: "react" },
  { id: "payment-methods", label: "Payment Methods",      path: "/payment-methods",     mode: "react" },
  { id: "devices",      label: "Devices",              path: "/devices",         mode: "react" },
  { id: "inventory",    label: "Inventory",            path: "/inventory",       mode: "react" },
  { id: "taxes",        label: "Taxes & Receipts",     path: "/taxes-receipts",  mode: "react" },
  { id: "shifts",       label: "Shifts & Cash Control",path: "/shifts-cash",     mode: "react" },
  { id: "credits",      label: "Credit Ledger",        path: "/credit-ledger",   mode: "react" },
  { id: "reports",      label: "Reports",              path: "/reports",         mode: "react" },
  { id: "online-sales", label: "Online Sales",         path: "/online-sales",    mode: "react" },
  { id: "appstore",     label: "App Store",            path: "/app-store",       mode: "react" },
  { id: "billing",      label: "Billing & Plans",      path: "/billing",         mode: "react" },
];

// Grouped structure — used by Sidebar for rendering sections + icons
export const navGroups = [
  { type: "item", id: "dashboard", label: "Dashboard", path: "/dashboard", icon: "dashboard" },

  {
    type: "section",
    label: "DAILY OPERATIONS",
    items: [
      { id: "live-orders",           label: "Live Orders",    path: "/live-orders",            icon: "sensors" },
      { id: "all-orders",            label: "All Orders",     path: "/orders",                 icon: "list_alt" },
      { id: "kots",                  label: "KOT History",    path: "/kots",                   icon: "receipt" },
      { id: "online-orders-history", label: "Online Orders",  path: "/online-orders-history",  icon: "delivery_dining" },
    ],
  },

  {
    type: "section",
    label: "SETUP",
    items: [
      { id: "business",     label: "Business Profile",     path: "/business",         icon: "storefront" },
      { id: "outlets",      label: "Outlets",              path: "/outlets",           icon: "location_on" },
      { id: "menu",         label: "Menu & Categories",    path: "/menu",              icon: "restaurant_menu" },
      { id: "kitchen",      label: "Kitchen Stations",     path: "/kitchen-stations",  icon: "soup_kitchen" },
      { id: "staff",        label: "Staff & Roles",        path: "/staff",             icon: "group" },
      { id: "discounts",    label: "Discount Rules",       path: "/discount-rules",    icon: "local_offer" },
      { id: "pos-config",   label: "POS Configuration",    path: "/pos-config",        icon: "point_of_sale" },
      { id: "integrations",    label: "Integrations",    path: "/integrations",    icon: "cable" },
      { id: "payment-methods", label: "Payment Methods", path: "/payment-methods", icon: "payments" },
      { id: "devices",         label: "Devices",         path: "/devices",         icon: "devices" },
    ],
  },

  {
    type: "section",
    label: "OPERATIONS",
    items: [
      { id: "inventory",    label: "Inventory",            path: "/inventory",         icon: "inventory_2" },
      { id: "taxes",        label: "Taxes & Receipts",     path: "/taxes-receipts",    icon: "receipt_long" },
      { id: "shifts",       label: "Shifts & Cash Control",path: "/shifts-cash",       icon: "layers" },
      { id: "credits",      label: "Credit Ledger",        path: "/credit-ledger",     icon: "account_balance_wallet" },
      { id: "reports",      label: "Reports",              path: "/reports",           icon: "bar_chart" },
      { id: "online-sales", label: "Online Sales",         path: "/online-sales",      icon: "shopping_bag" },
    ],
  },

  {
    type: "section",
    label: "ACCOUNT",
    items: [
      { id: "appstore", label: "App Store",      path: "/app-store", icon: "apps" },
      { id: "billing",  label: "Billing & Plans", path: "/billing",   icon: "credit_card" },
    ],
  },
];
