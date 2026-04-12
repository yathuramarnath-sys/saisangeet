export const integrationsSeedData = {
  services: [
    {
      id: "zoho-books",
      name: "Zoho Books",
      status: "Connected",
      meta: [
        "Purpose: Accounting + tax export",
        "Last sync: 10:05 AM",
        "Outlets mapped: 4/4"
      ],
      actions: ["Reconnect", "View sync", "Map ledgers"]
    },
    {
      id: "swiggy",
      name: "Swiggy",
      status: "Connected",
      meta: [
        "Purpose: Delivery order sync",
        "Last sync: 2 min ago",
        "Menu sync: Healthy"
      ],
      actions: ["Sync menu", "View orders", "Outlet map"]
    },
    {
      id: "zomato",
      name: "Zomato",
      status: "Review",
      review: true,
      meta: [
        "Purpose: Delivery order sync",
        "Last sync: 21 min ago",
        "Outlet mapping pending: 1"
      ],
      actions: ["Complete setup", "Sync menu", "Reconnect"]
    },
    {
      id: "paytm",
      name: "Paytm",
      status: "Connected",
      meta: [
        "Purpose: UPI + QR payment acceptance",
        "Settlement: Same-day summary",
        "Devices linked: 3 counters"
      ],
      actions: ["Reconnect", "View settlements", "Assign QR"]
    },
    {
      id: "phonepe",
      name: "PhonePe",
      status: "Connected",
      meta: [
        "Purpose: UPI + soundbox payment flow",
        "Last sync: 5 min ago",
        "Devices linked: 2 counters"
      ],
      actions: ["Reconnect", "View settlements", "Outlet map"]
    }
  ],
  mapping: [
    {
      id: "indiranagar",
      outlet: "Indiranagar",
      zohoBooks: "Mapped",
      swiggy: "Mapped",
      zomato: "Mapped",
      paymentPartners: "Paytm + PhonePe",
      status: "Healthy"
    },
    {
      id: "koramangala",
      outlet: "Koramangala",
      zohoBooks: "Mapped",
      swiggy: "Mapped",
      zomato: "Pending",
      paymentPartners: "Paytm",
      status: "Review",
      warning: true
    },
    {
      id: "hsr-layout",
      outlet: "HSR Layout",
      zohoBooks: "Mapped",
      swiggy: "Mapped",
      zomato: "Mapped",
      paymentPartners: "PhonePe",
      status: "Healthy"
    },
    {
      id: "whitefield",
      outlet: "Whitefield",
      zohoBooks: "Mapped",
      swiggy: "Mapped",
      zomato: "Mapped",
      paymentPartners: "Paytm + PhonePe",
      status: "Healthy"
    }
  ],
  alerts: [
    {
      id: "zomato-mapping",
      title: "Zomato outlet mapping pending for Koramangala",
      description: "Complete mapping before enabling live order sync"
    },
    {
      id: "swiggy-menu",
      title: "Swiggy menu update not pushed for 3 items",
      description: "Resync menu after latest price changes"
    },
    {
      id: "zoho-ledger",
      title: "Zoho tax ledger check recommended",
      description: "Verify GST ledger mapping before monthly filing"
    },
    {
      id: "paytm-qr",
      title: "Paytm QR not assigned for one cashier counter",
      description: "Assign QR before enabling rush-hour billing"
    },
    {
      id: "phonepe-soundbox",
      title: "PhonePe soundbox offline at Whitefield",
      description: "Check device power and settlement sync"
    }
  ]
};
