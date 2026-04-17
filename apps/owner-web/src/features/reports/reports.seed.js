export const OUTLETS = ["All Outlets", "Indiranagar", "Koramangala", "HSR Layout", "Whitefield"];

// Day End Summary seed — realistic one-day snapshot
export const dayEndSeed = {
  summary: {
    totalSales:     245680,
    totalOrders:    312,
    avgOrderValue:  787,
    netAfterDiscount: 238420,
    totalTax:       11920,
    totalDiscount:  7260,
    totalCancelled: 3,
    cancelledValue: 1840
  },

  paymentModes: [
    { mode: "Cash",    orders: 98,  amount: 74200  },
    { mode: "UPI",     orders: 134, amount: 108640 },
    { mode: "Card",    orders: 42,  amount: 38940  },
    { mode: "Swiggy",  orders: 21,  amount: 14820  },
    { mode: "Zomato",  orders: 17,  amount: 9080   }
  ],

  orderTypes: [
    { type: "Dine In",   orders: 186, amount: 168400 },
    { type: "Takeaway",  orders: 84,  amount: 52840  },
    { type: "Delivery",  orders: 42,  amount: 24440  }
  ],

  sessions: [
    { session: "Breakfast", orders: 54,  amount: 28960  },
    { session: "Lunch",     orders: 138, amount: 102480 },
    { session: "Dinner",    orders: 120, amount: 114240 }
  ],

  categories: [
    { category: "Starters", qty: 284, amount: 62480  },
    { category: "Mains",    qty: 412, amount: 118640 },
    { category: "Drinks",   qty: 198, amount: 24840  },
    { category: "Desserts", qty: 86,  amount: 12960  },
    { category: "Breads",   qty: 324, amount: 12960  }
  ],

  items: [
    { name: "Paneer Tikka",     category: "Starters", qty: 98,  rate: 240, amount: 23520 },
    { name: "Veg Biryani",      category: "Mains",    qty: 124, rate: 240, amount: 29760 },
    { name: "Butter Naan",      category: "Breads",   qty: 218, rate:  40, amount:  8720 },
    { name: "Dal Makhani",      category: "Mains",    qty: 86,  rate: 220, amount: 18920 },
    { name: "Masala Chai",      category: "Drinks",   qty: 142, rate:  40, amount:  5680 },
    { name: "Crispy Corn",      category: "Starters", qty: 76,  rate: 180, amount: 13680 },
    { name: "Cold Coffee",      category: "Drinks",   qty: 56,  rate:  80, amount:  4480 },
    { name: "Sweet Lime Soda",  category: "Drinks",   qty: 48,  rate:  60, amount:  2880 },
    { name: "Gulab Jamun",      category: "Desserts", qty: 64,  rate: 120, amount:  7680 },
    { name: "Palak Paneer",     category: "Mains",    qty: 68,  rate: 260, amount: 17680 },
    { name: "Kadai Chicken",    category: "Mains",    qty: 54,  rate: 320, amount: 17280 },
    { name: "Tandoori Roti",    category: "Breads",   qty: 106, rate:  25, amount:  2650 }
  ],

  tax: {
    taxableAmount: 233760,
    cgst:           5844,
    sgst:           5844,
    igst:              0,
    cess:              0,
    totalTax:       11688
  },

  discounts: [
    { type: "Member discount (10%)", count: 42, amount: 4200 },
    { type: "Happy Hour (5%)",       count: 28, amount: 1680 },
    { type: "Manual override",       count:  6, amount: 1380 }
  ],

  cancellations: [
    { bill: "#3041", outlet: "Koramangala", amount: 680,  reason: "Customer changed mind",   time: "1:14 PM" },
    { bill: "#3087", outlet: "Indiranagar", amount: 840,  reason: "Wrong order entered",     time: "7:42 PM" },
    { bill: "#3112", outlet: "HSR Layout",  amount: 320,  reason: "Item unavailable",         time: "9:05 PM" }
  ]
};
