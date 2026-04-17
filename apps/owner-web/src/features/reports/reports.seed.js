export const OUTLETS = ["All Outlets", "Indiranagar", "Koramangala", "HSR Layout", "Whitefield"];
export const MONTHS  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Day End Summary ──────────────────────────────────────────────────────────
export const dayEndSeed = {
  summary: {
    totalSales: 245680, totalOrders: 312, avgOrderValue: 787,
    netAfterDiscount: 238420, totalTax: 11920, totalDiscount: 7260,
    totalCancelled: 3, cancelledValue: 1840
  },
  paymentModes: [
    { mode: "Cash",   orders: 98,  amount: 74200  },
    { mode: "UPI",    orders: 134, amount: 108640 },
    { mode: "Card",   orders: 42,  amount: 38940  },
    { mode: "Swiggy", orders: 21,  amount: 14820  },
    { mode: "Zomato", orders: 17,  amount: 9080   }
  ],
  orderTypes: [
    { type: "Dine In",  orders: 186, amount: 168400 },
    { type: "Takeaway", orders: 84,  amount: 52840  },
    { type: "Delivery", orders: 42,  amount: 24440  }
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
    { name: "Paneer Tikka",    category: "Starters", qty: 98,  rate: 240, amount: 23520 },
    { name: "Veg Biryani",     category: "Mains",    qty: 124, rate: 240, amount: 29760 },
    { name: "Butter Naan",     category: "Breads",   qty: 218, rate:  40, amount:  8720 },
    { name: "Dal Makhani",     category: "Mains",    qty: 86,  rate: 220, amount: 18920 },
    { name: "Masala Chai",     category: "Drinks",   qty: 142, rate:  40, amount:  5680 },
    { name: "Crispy Corn",     category: "Starters", qty: 76,  rate: 180, amount: 13680 },
    { name: "Cold Coffee",     category: "Drinks",   qty: 56,  rate:  80, amount:  4480 },
    { name: "Sweet Lime Soda", category: "Drinks",   qty: 48,  rate:  60, amount:  2880 },
    { name: "Gulab Jamun",     category: "Desserts", qty: 64,  rate: 120, amount:  7680 },
    { name: "Palak Paneer",    category: "Mains",    qty: 68,  rate: 260, amount: 17680 },
    { name: "Kadai Chicken",   category: "Mains",    qty: 54,  rate: 320, amount: 17280 },
    { name: "Tandoori Roti",   category: "Breads",   qty: 106, rate:  25, amount:  2650 }
  ],
  tax: { taxableAmount: 233760, cgst: 5844, sgst: 5844, igst: 0, cess: 0, totalTax: 11688 },
  discounts: [
    { type: "Member discount (10%)", count: 42, amount: 4200 },
    { type: "Happy Hour (5%)",       count: 28, amount: 1680 },
    { type: "Manual override",       count:  6, amount: 1380 }
  ],
  cancellations: [
    { bill: "#3041", outlet: "Koramangala", amount: 680, reason: "Customer changed mind", time: "1:14 PM" },
    { bill: "#3087", outlet: "Indiranagar", amount: 840, reason: "Wrong order entered",   time: "7:42 PM" },
    { bill: "#3112", outlet: "HSR Layout",  amount: 320, reason: "Item unavailable",      time: "9:05 PM" }
  ]
};

// ── Item Sales Report ────────────────────────────────────────────────────────
export const itemSalesSeed = [
  { name: "Veg Biryani",     category: "Mains",    qty: 847, rate: 240, amount: 203280, orders: 612, rank: 1 },
  { name: "Paneer Tikka",    category: "Starters", qty: 634, rate: 240, amount: 152160, orders: 498, rank: 2 },
  { name: "Dal Makhani",     category: "Mains",    qty: 521, rate: 220, amount: 114620, orders: 421, rank: 3 },
  { name: "Palak Paneer",    category: "Mains",    qty: 468, rate: 260, amount: 121680, orders: 388, rank: 4 },
  { name: "Kadai Chicken",   category: "Mains",    qty: 412, rate: 320, amount: 131840, orders: 356, rank: 5 },
  { name: "Crispy Corn",     category: "Starters", qty: 389, rate: 180, amount:  70020, orders: 312, rank: 6 },
  { name: "Butter Naan",     category: "Breads",   qty: 1240, rate:  40, amount:  49600, orders: 892, rank: 7 },
  { name: "Tandoori Roti",   category: "Breads",   qty: 864, rate:  25, amount:  21600, orders: 642, rank: 8 },
  { name: "Masala Chai",     category: "Drinks",   qty: 728, rate:  40, amount:  29120, orders: 588, rank: 9 },
  { name: "Cold Coffee",     category: "Drinks",   qty: 342, rate:  80, amount:  27360, orders: 298, rank: 10 },
  { name: "Sweet Lime Soda", category: "Drinks",   qty: 298, rate:  60, amount:  17880, orders: 254, rank: 11 },
  { name: "Gulab Jamun",     category: "Desserts", qty: 412, rate: 120, amount:  49440, orders: 342, rank: 12 }
];

// ── GST Report ───────────────────────────────────────────────────────────────
export const gstSeed = {
  month: "Apr 2026",
  summary: { taxableAmount: 4820400, cgst: 120510, sgst: 120510, totalGst: 241020, totalBills: 6248 },
  daily: [
    { date: "01 Apr", bills: 198, taxable: 148200, cgst: 3705, sgst: 3705, total: 7410 },
    { date: "02 Apr", bills: 212, taxable: 162480, cgst: 4062, sgst: 4062, total: 8124 },
    { date: "03 Apr", bills: 187, taxable: 138640, cgst: 3466, sgst: 3466, total: 6932 },
    { date: "04 Apr", bills: 224, taxable: 174320, cgst: 4358, sgst: 4358, total: 8716 },
    { date: "05 Apr", bills: 241, taxable: 188200, cgst: 4705, sgst: 4705, total: 9410 },
    { date: "06 Apr", bills: 198, taxable: 151600, cgst: 3790, sgst: 3790, total: 7580 },
    { date: "07 Apr", bills: 176, taxable: 131400, cgst: 3285, sgst: 3285, total: 6570 },
    { date: "08 Apr", bills: 205, taxable: 158640, cgst: 3966, sgst: 3966, total: 7932 },
    { date: "09 Apr", bills: 219, taxable: 168920, cgst: 4223, sgst: 4223, total: 8446 },
    { date: "10 Apr", bills: 231, taxable: 180240, cgst: 4506, sgst: 4506, total: 9012 },
    { date: "11 Apr", bills: 196, taxable: 149600, cgst: 3740, sgst: 3740, total: 7480 },
    { date: "12 Apr", bills: 208, taxable: 161240, cgst: 4031, sgst: 4031, total: 8062 },
    { date: "13 Apr", bills: 224, taxable: 175320, cgst: 4383, sgst: 4383, total: 8766 },
    { date: "14 Apr", bills: 246, taxable: 194820, cgst: 4870, sgst: 4870, total: 9741 },
    { date: "15 Apr", bills: 187, taxable: 142800, cgst: 3570, sgst: 3570, total: 7140 },
    { date: "16 Apr", bills: 211, taxable: 164320, cgst: 4108, sgst: 4108, total: 8216 },
    { date: "17 Apr", bills: 312, taxable: 233760, cgst: 5844, sgst: 5844, total: 11688 }
  ],
  outletBreakdown: [
    { outlet: "Indiranagar",  bills: 1842, taxable: 1486200, cgst: 37155, sgst: 37155, total: 74310 },
    { outlet: "Koramangala",  bills: 1624, taxable: 1282400, cgst: 32060, sgst: 32060, total: 64120 },
    { outlet: "HSR Layout",   bills: 1498, taxable: 1164800, cgst: 29120, sgst: 29120, total: 58240 },
    { outlet: "Whitefield",   bills: 1284, taxable:  887000, cgst: 22175, sgst: 22175, total: 44350 }
  ]
};

// ── Payment Report ───────────────────────────────────────────────────────────
export const paymentSeed = {
  summary: { totalCollected: 245680, cashAmount: 74200, digitalAmount: 171480, variance: 0 },
  modes: [
    { mode: "Cash",   icon: "💵", orders: 98,  amount: 74200,  pct: 30.2 },
    { mode: "UPI",    icon: "📱", orders: 134, amount: 108640, pct: 44.2 },
    { mode: "Card",   icon: "💳", orders: 42,  amount: 38940,  pct: 15.9 },
    { mode: "Swiggy", icon: "🛵", orders: 21,  amount: 14820,  pct: 6.0  },
    { mode: "Zomato", icon: "🔴", orders: 17,  amount: 9080,   pct: 3.7  }
  ],
  hourly: [
    { hour: "8 AM",  cash: 2400,  upi: 3200,  card: 0,    total: 5600  },
    { hour: "9 AM",  cash: 3600,  upi: 4800,  card: 1200, total: 9600  },
    { hour: "10 AM", cash: 2800,  upi: 3600,  card: 800,  total: 7200  },
    { hour: "12 PM", cash: 8400,  upi: 14200, card: 4800, total: 27400 },
    { hour: "1 PM",  cash: 12600, upi: 18400, card: 6200, total: 37200 },
    { hour: "2 PM",  cash: 9200,  upi: 13600, card: 4400, total: 27200 },
    { hour: "7 PM",  cash: 14800, upi: 22400, card: 8400, total: 45600 },
    { hour: "8 PM",  cash: 12600, upi: 19800, card: 7200, total: 39600 },
    { hour: "9 PM",  cash: 7800,  upi: 9240,  card: 5940, total: 22980 }
  ],
  outletReconciliation: [
    { outlet: "Indiranagar", cash: 24800, upi: 38400, card: 14200, swiggy: 3200, zomato: 1400, total: 82000, cashierVariance: 0   },
    { outlet: "Koramangala", cash: 18600, upi: 28200, card: 10400, swiggy: 3800, zomato: 500,  total: 61500, cashierVariance: -200 },
    { outlet: "HSR Layout",  cash: 16800, upi: 24600, card: 8200,  swiggy: 4200, zomato: 4500, total: 58300, cashierVariance: 0   },
    { outlet: "Whitefield",  cash: 14000, upi: 17440, card: 6140,  swiggy: 3620, zomato: 2680, total: 43880, cashierVariance: 0   }
  ]
};

// ── Discount & Void Report ───────────────────────────────────────────────────
export const discountVoidSeed = {
  summary: { totalDiscountAmt: 7260, totalDiscountBills: 76, totalVoids: 3, totalVoidAmt: 1840, manualOverrides: 6 },
  discountLog: [
    { bill: "#3021", outlet: "Indiranagar",  cashier: "Ravi",   type: "Member 10%",   amount: 240, approved: "Auto",    time: "12:14 PM" },
    { bill: "#3028", outlet: "Koramangala",  cashier: "Priya",  type: "Happy Hour 5%", amount: 180, approved: "Auto",    time: "3:22 PM"  },
    { bill: "#3041", outlet: "Koramangala",  cashier: "Priya",  type: "Manual",        amount: 450, approved: "Mgr OTP", time: "7:48 PM"  },
    { bill: "#3055", outlet: "HSR Layout",   cashier: "Arjun",  type: "Member 10%",   amount: 320, approved: "Auto",    time: "1:05 PM"  },
    { bill: "#3072", outlet: "Indiranagar",  cashier: "Ravi",   type: "Manual",        amount: 380, approved: "Mgr OTP", time: "8:12 PM"  },
    { bill: "#3087", outlet: "Whitefield",   cashier: "Karthik",type: "Happy Hour 5%", amount: 120, approved: "Auto",    time: "4:30 PM"  },
    { bill: "#3091", outlet: "HSR Layout",   cashier: "Arjun",  type: "Manual",        amount: 550, approved: "Mgr OTP", time: "9:10 PM"  },
    { bill: "#3104", outlet: "Indiranagar",  cashier: "Ravi",   type: "Member 10%",   amount: 280, approved: "Auto",    time: "7:55 PM"  }
  ],
  voidLog: [
    { bill: "#3041", outlet: "Koramangala", cashier: "Priya",   amount: 680, reason: "Customer changed mind", approvedBy: "Manager",  time: "1:14 PM" },
    { bill: "#3087", outlet: "Indiranagar", cashier: "Ravi",    amount: 840, reason: "Wrong order entered",   approvedBy: "Manager",  time: "7:42 PM" },
    { bill: "#3112", outlet: "HSR Layout",  cashier: "Arjun",   amount: 320, reason: "Item unavailable",      approvedBy: "Owner OTP",time: "9:05 PM" }
  ]
};

// ── Staff Sales Report ───────────────────────────────────────────────────────
export const staffSalesSeed = [
  { cashier: "Ravi",    outlet: "Indiranagar",  session: "Lunch+Dinner", orders: 98,  sales: 82400, discounts: 1840, voids: 1, cashIn: 500,  cashOut: 200, openingCash: 5000, closingCash: 86460, variance: 0    },
  { cashier: "Priya",   outlet: "Koramangala",  session: "Lunch+Dinner", orders: 84,  sales: 68200, discounts: 2140, voids: 2, cashIn: 0,    cashOut: 850, openingCash: 8000, closingCash: 74310, variance: -200 },
  { cashier: "Arjun",   outlet: "HSR Layout",   session: "Full Day",     orders: 72,  sales: 56800, discounts: 1680, voids: 0, cashIn: 0,    cashOut: 300, openingCash: 4000, closingCash: 59700, variance: 800  },
  { cashier: "Karthik", outlet: "Whitefield",   session: "Lunch",        orders: 58,  sales: 38280, discounts: 1600, voids: 0, cashIn: 1000, cashOut: 0,   openingCash: 6000, closingCash: 45280, variance: 0    }
];

// ── Category-wise Report ─────────────────────────────────────────────────────
export const categorySalesSeed = {
  categories: [
    {
      name: "Mains",     color: "#1a7a3a", itemCount: 5,
      qty: 1109, orders: 824, amount: 391920, avgRate: 268,
      topItem: { name: "Veg Biryani", amount: 203280 },
      sessions: { Breakfast: 48200, Lunch: 168400, Dinner: 175320 },
      outlets:  { Indiranagar: 112400, Koramangala: 98200, "HSR Layout": 94800, Whitefield: 86520 }
    },
    {
      name: "Starters",  color: "#FF5722", itemCount: 2,
      qty: 1023, orders: 742, amount: 222180, avgRate: 214,
      topItem: { name: "Paneer Tikka", amount: 152160 },
      sessions: { Breakfast: 18400, Lunch: 92600, Dinner: 111180 },
      outlets:  { Indiranagar: 68400, Koramangala: 54200, "HSR Layout": 52800, Whitefield: 46780 }
    },
    {
      name: "Breads",    color: "#FF9800", itemCount: 2,
      qty: 2104, orders: 1534, amount: 71200, avgRate: 34,
      topItem: { name: "Butter Naan", amount: 49600 },
      sessions: { Breakfast: 12400, Lunch: 28600, Dinner: 30200 },
      outlets:  { Indiranagar: 22400, Koramangala: 18200, "HSR Layout": 16800, Whitefield: 13800 }
    },
    {
      name: "Drinks",    color: "#2196F3", itemCount: 3,
      qty: 688, orders: 512, amount: 74120, avgRate: 60,
      topItem: { name: "Masala Chai", amount: 29120 },
      sessions: { Breakfast: 24800, Lunch: 24420, Dinner: 24900 },
      outlets:  { Indiranagar: 24200, Koramangala: 19800, "HSR Layout": 16400, Whitefield: 13720 }
    },
    {
      name: "Desserts",  color: "#9C27B0", itemCount: 1,
      qty: 412, orders: 342, amount: 49440, avgRate: 120,
      topItem: { name: "Gulab Jamun", amount: 49440 },
      sessions: { Breakfast: 2400, Lunch: 18200, Dinner: 28840 },
      outlets:  { Indiranagar: 16200, Koramangala: 12800, "HSR Layout": 11400, Whitefield: 9040 }
    }
  ],
  // Item drilldown per category
  items: {
    Mains:    [
      { name: "Veg Biryani",   qty: 847, orders: 612, rate: 240, amount: 203280 },
      { name: "Dal Makhani",   qty: 521, orders: 421, rate: 220, amount: 114620 },
      { name: "Palak Paneer",  qty: 468, orders: 388, rate: 260, amount: 121680 },
      { name: "Kadai Chicken", qty: 412, orders: 356, rate: 320, amount: 131840 }
    ],
    Starters: [
      { name: "Paneer Tikka",  qty: 634, orders: 498, rate: 240, amount: 152160 },
      { name: "Crispy Corn",   qty: 389, orders: 312, rate: 180, amount:  70020 }
    ],
    Breads:   [
      { name: "Butter Naan",   qty: 1240, orders: 892, rate:  40, amount: 49600 },
      { name: "Tandoori Roti", qty:  864, orders: 642, rate:  25, amount: 21600 }
    ],
    Drinks:   [
      { name: "Masala Chai",     qty: 728, orders: 588, rate:  40, amount: 29120 },
      { name: "Cold Coffee",     qty: 342, orders: 298, rate:  80, amount: 27360 },
      { name: "Sweet Lime Soda", qty: 298, orders: 254, rate:  60, amount: 17880 }
    ],
    Desserts: [
      { name: "Gulab Jamun", qty: 412, orders: 342, rate: 120, amount: 49440 }
    ]
  }
};
