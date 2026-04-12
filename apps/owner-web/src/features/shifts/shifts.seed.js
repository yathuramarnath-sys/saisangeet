export const shiftsSeedData = {
  shifts: [
    {
      id: "arjun-koramangala",
      cashier: "Arjun",
      outlet: "Koramangala",
      openingCash: "Rs 5,000",
      expectedClose: "Rs 21,450",
      status: "Open"
    },
    {
      id: "priya-indiranagar",
      cashier: "Priya",
      outlet: "Indiranagar",
      openingCash: "Rs 8,000",
      expectedClose: "Rs 32,200",
      status: "Open"
    },
    {
      id: "ramesh-hsr",
      cashier: "Ramesh",
      outlet: "HSR Layout",
      openingCash: "Rs 7,000",
      expectedClose: "Rs 26,300",
      status: "Mismatch",
      warning: true
    },
    {
      id: "manoj-whitefield",
      cashier: "Manoj",
      outlet: "Whitefield",
      openingCash: "Rs 8,000",
      expectedClose: "Rs 28,110",
      status: "Closed"
    }
  ],
  movements: [
    {
      id: "cash-in-1",
      cashier: "Arjun",
      type: "Cash In",
      amount: "Rs 500",
      reason: "Change refill",
      status: "Approved"
    },
    {
      id: "cash-out-1",
      cashier: "Priya",
      type: "Cash Out",
      amount: "Rs 850",
      reason: "Petty expense",
      status: "Manager check",
      warning: true
    },
    {
      id: "cash-out-2",
      cashier: "Ramesh",
      type: "Cash Out",
      amount: "Rs 300",
      reason: "Courier payout",
      status: "Approved"
    }
  ],
  alerts: [
    {
      id: "hsr-short",
      title: "HSR Layout shift short by Rs 1,200",
      description: "Manager must review before final closing"
    },
    {
      id: "petty-range",
      title: "2 cash-out entries exceed normal petty range",
      description: "Check approval and reason entries"
    },
    {
      id: "not-closed",
      title: "One cashier has not closed shift",
      description: "Prompt closing before end-of-day report generation"
    }
  ]
};
