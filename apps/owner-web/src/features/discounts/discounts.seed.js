export const discountsSeedData = {
  rules: [
    {
      id: "lunch-promo",
      name: "Lunch Promo",
      status: "Active",
      meta: ["Type: 10% off order total", "Scope: All outlets", "Time: 12 PM to 3 PM"],
      actions: ["Edit", "Duplicate", "Pause"]
    },
    {
      id: "takeaway-saver",
      name: "Takeaway Saver",
      status: "Active",
      meta: ["Type: Flat Rs 50 off", "Scope: Takeaway bills above Rs 500", "Outlets: 3 selected"],
      actions: ["Edit", "Outlets", "Pause"]
    },
    {
      id: "captain-manual-discount",
      name: "Captain Manual Discount",
      status: "Review",
      review: true,
      meta: [
        "Type: Manual order discount",
        "Cashier max: 5% • Manager max: 15%",
        "Flagged: Override exceeded once today"
      ],
      actions: ["Review logs", "Edit limits"]
    }
  ],
  approvalPolicy: [
    {
      id: "cashier",
      role: "Cashier",
      manualDiscount: "Up to 5%",
      orderVoid: "Not allowed",
      billDelete: "Not allowed",
      status: "Protected"
    },
    {
      id: "captain",
      role: "Captain",
      manualDiscount: "Not allowed",
      orderVoid: "Not allowed",
      billDelete: "Not allowed",
      status: "Protected"
    },
    {
      id: "manager",
      role: "Manager",
      manualDiscount: "Up to 15%",
      orderVoid: "Allowed with note",
      billDelete: "Allowed with reason",
      status: "Sensitive",
      warning: true
    },
    {
      id: "owner",
      role: "Owner",
      manualDiscount: "Unlimited",
      orderVoid: "Allowed",
      billDelete: "Allowed",
      status: "Full access"
    }
  ],
  activity: [
    {
      id: "1",
      time: "1:24 PM",
      user: "Meera",
      action: "Manual discount approved",
      amount: "Rs 180",
      status: "Approved"
    },
    {
      id: "2",
      time: "12:42 PM",
      user: "Arjun",
      action: "Discount request exceeded cashier limit",
      amount: "Rs 260",
      status: "Escalated",
      warning: true
    },
    {
      id: "3",
      time: "11:16 AM",
      user: "Priya",
      action: "Lunch Promo auto-applied",
      amount: "Rs 95",
      status: "Applied"
    }
  ],
  alerts: [
    {
      id: "cashier-limit",
      title: "One cashier tried discount above limit",
      description: "Manager should review the order and training need"
    },
    {
      id: "overlap",
      title: "Two rules overlap during lunch hours",
      description: "Check if stacking should be blocked automatically"
    },
    {
      id: "high-usage",
      title: "Koramangala outlet has high manual discount usage",
      description: "Audit discount trends for possible misuse"
    }
  ]
};
