export const reportsSeedData = {
  outletComparison: [
    {
      id: "indiranagar",
      outlet: "Indiranagar",
      sales: "Rs 82,000",
      profit: "Rs 22,100",
      expenses: "Rs 13,200",
      status: "Strong"
    },
    {
      id: "koramangala",
      outlet: "Koramangala",
      sales: "Rs 61,500",
      profit: "Rs 12,900",
      expenses: "Rs 14,300",
      status: "Review",
      warning: true
    },
    {
      id: "hsr-layout",
      outlet: "HSR Layout",
      sales: "Rs 54,300",
      profit: "Rs 14,600",
      expenses: "Rs 9,800",
      status: "Healthy"
    },
    {
      id: "whitefield",
      outlet: "Whitefield",
      sales: "Rs 47,200",
      profit: "Rs 12,200",
      expenses: "Rs 8,900",
      status: "Healthy"
    }
  ],
  insights: [
    {
      id: "profit-item",
      title: "Top profit item",
      description: "Paneer Tikka generated the highest profit today across all outlets."
    },
    {
      id: "best-time",
      title: "Best selling time",
      description: "Sales peak happened between 7 PM and 9 PM at 3 outlets."
    },
    {
      id: "outlet-alert",
      title: "Outlet alert",
      description: "Koramangala profit dropped 18% compared to yesterday."
    },
    {
      id: "cash-review",
      title: "Cash review",
      description: "One shift mismatch should be resolved before daily closing report goes out."
    }
  ],
  closingSummary: [
    {
      id: "sales-payments",
      title: "Sales & Payments",
      status: "Included",
      meta: "Total sales, order count, cash vs UPI vs card summary"
    },
    {
      id: "profit-expenses",
      title: "Profit & Expenses",
      status: "Included",
      meta: "Outlet-wise profit, expense ratio, and exception highlights"
    },
    {
      id: "risk-alerts",
      title: "Risk Alerts",
      status: "Conditional",
      meta: "Cash mismatch, deleted bills, discount overrides, and stock exceptions",
      warning: true
    }
  ],
  alerts: [
    {
      id: "closing-email-wait",
      title: "Closing email should wait for one unresolved shift",
      description: "HSR Layout cash mismatch is still open"
    },
    {
      id: "profit-target",
      title: "Koramangala profit trend is below target",
      description: "Add this automatically to owner email summary"
    },
    {
      id: "gst-ready",
      title: "GST report and sales summary are ready",
      description: "Monthly export can be generated anytime"
    }
  ]
};
