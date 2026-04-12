export const reportsSeedData = {
  popupAlert: {
    title: "2 control issues need owner review",
    description: "One high discount override and one deleted bill were approved today.",
    cta: "Open reports"
  },
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
  closingCenter: {
    blockers: [
      {
        id: "blocker-shift",
        title: "HSR Layout cash mismatch still open",
        detail: "Closing mail should wait until manager confirms the short cash review."
      },
      {
        id: "blocker-override",
        title: "One high discount override needs owner review",
        detail: "Koramangala cashier override was approved above the normal threshold."
      }
    ],
    checklist: [
      {
        id: "sales-lock",
        title: "All outlets sales synced",
        status: "Done"
      },
      {
        id: "tax-ready",
        title: "GST totals verified",
        status: "Done"
      },
      {
        id: "cash-review",
        title: "Cash mismatch resolved",
        status: "Pending"
      },
      {
        id: "risk-review",
        title: "Deleted bills and overrides reviewed",
        status: "Pending"
      }
    ],
    ownerSummary: [
      {
        id: "closing-sales",
        label: "Net sales",
        value: "Rs 2,45,000"
      },
      {
        id: "closing-tax",
        label: "GST total",
        value: "Rs 12,420"
      },
      {
        id: "closing-deleted",
        label: "Deleted bills",
        value: "2 approved"
      },
      {
        id: "closing-overrides",
        label: "Discount overrides",
        value: "4 today"
      }
    ]
  },
  controlSummary: [
    {
      id: "discount-overrides",
      title: "Discount overrides",
      value: "4 today",
      detail: "1 above limit still needs owner review",
      status: "Review"
    },
    {
      id: "deleted-bills",
      title: "Deleted bills",
      value: "2 approved",
      detail: "Koramangala and HSR Layout",
      status: "Review"
    },
    {
      id: "cash-mismatch",
      title: "Cash mismatch",
      value: "Rs 1,200",
      detail: "HSR Layout shift still open",
      status: "Conditional"
    },
    {
      id: "unauthorized-actions",
      title: "Unauthorized actions",
      value: "3 alerts",
      detail: "Discount attempts blocked at cashier level",
      status: "Strong"
    }
  ],
  approvalLog: [
    {
      id: "approval-1",
      outlet: "Koramangala",
      action: "Discount override approved",
      actor: "Manager Rakesh",
      amount: "Rs 150",
      time: "7:48 PM"
    },
    {
      id: "approval-2",
      outlet: "HSR Layout",
      action: "Deleted bill approved",
      actor: "Manager Placeholder",
      amount: "Bill #10031",
      time: "8:05 PM"
    },
    {
      id: "approval-3",
      outlet: "Indiranagar",
      action: "Cash mismatch flagged",
      actor: "System alert",
      amount: "Rs 1,200",
      time: "8:22 PM"
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
      id: "deleted-bill-owner",
      title: "Deleted bill approved at HSR Layout",
      description: "Include deleted-bill reason and manager name in owner report"
    },
    {
      id: "discount-owner",
      title: "High discount override approved at Koramangala",
      description: "Owner should review approval pattern for cashier training"
    },
    {
      id: "gst-ready",
      title: "GST report and sales summary are ready",
      description: "Monthly export can be generated anytime"
    }
  ]
};
