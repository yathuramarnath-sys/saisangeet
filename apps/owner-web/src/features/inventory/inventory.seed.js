export const inventorySeedData = {
  accessCards: [
    {
      id: "dining-access",
      title: "Dining Item Inventory",
      roles: "Cashier + Manager",
      detail: "Service-side items can be checked quickly during billing and floor operations."
    },
    {
      id: "production-access",
      title: "Kitchen Production Inventory",
      roles: "Store Incharge + Manager",
      detail: "Raw-material stock is reserved for kitchen production and store control only."
    }
  ],
  alerts: [
    {
      id: "captain-low-stock",
      title: "Captain mobile should warn before item goes out of stock",
      description: "Low-stock dining items appear in captain quick-add so the floor team can react early."
    },
    {
      id: "store-control",
      title: "Store incharge sees only production items",
      description: "No direct access to dining item availability or billing-side item controls."
    }
  ]
};
