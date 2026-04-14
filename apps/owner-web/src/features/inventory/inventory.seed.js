export const inventorySeedData = {
  accessCards: [
    {
      id: "dining-access",
      title: "Sales Inventory",
      roles: "Cashier + Manager",
      detail: "Optional sellable-stock module for businesses that want stock visibility at POS and waiter ordering."
    },
    {
      id: "production-access",
      title: "Kitchen Production Inventory",
      roles: "Store Incharge + Manager",
      detail: "Optional kitchen-side module for raw material control, waste, issue, and production-side visibility."
    }
  ],
  alerts: [
    {
      id: "captain-low-stock",
      title: "Captain mobile should warn before sales stock goes out",
      description: "Only sales inventory appears in captain quick-add so the floor team reacts to billable stock, not raw material."
    },
    {
      id: "store-control",
      title: "Store incharge sees only kitchen inventory",
      description: "No direct access to sales inventory availability or billing-side item controls."
    },
    {
      id: "missing-stock",
      title: "Missing-stock alert should surface before daily closing",
      description: "If kitchen stock drops unusually fast, owner and manager should review leakage or unrecorded waste."
    }
  ]
};
