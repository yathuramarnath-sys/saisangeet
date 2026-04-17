export const discountsSeedData = {
  rules: [
    {
      id: "lunch-promo",
      name: "Lunch Promo",
      discountType: "percentage",
      discountScope: "order",
      value: 10,
      outletScope: "All Outlets",
      appliesToRole: "Cashier",
      requiresApproval: false,
      timeWindow: "12 PM to 3 PM",
      notes: "",
      isActive: true
    },
    {
      id: "takeaway-saver",
      name: "Takeaway Saver",
      discountType: "flat",
      discountScope: "order",
      value: 50,
      outletScope: "All Outlets",
      appliesToRole: "Cashier",
      requiresApproval: false,
      timeWindow: "Always on",
      notes: "Applies on takeaway bills above Rs 500",
      isActive: true
    },
    {
      id: "manager-override",
      name: "Manager Discretionary",
      discountType: "percentage",
      discountScope: "order",
      value: 15,
      outletScope: "All Outlets",
      appliesToRole: "Manager",
      requiresApproval: true,
      timeWindow: "Always on",
      notes: "Requires manager approval before applying",
      isActive: true
    }
  ],
  approvalPolicy: [
    {
      id: "cashier",
      role: "Cashier",
      manualDiscountLimit: 5,
      orderVoid: "Not allowed",
      billDelete: "Not allowed",
      approvalRoute: "Escalate to Manager"
    },
    {
      id: "manager",
      role: "Manager",
      manualDiscountLimit: 15,
      orderVoid: "Allowed with note",
      billDelete: "Allowed with reason",
      approvalRoute: "Self-approve"
    }
  ],
  activity: [
    { id: "1", time: "1:24 PM", user: "Meera", action: "Manual discount approved", amount: "Rs 180", status: "Approved" },
    { id: "2", time: "12:42 PM", user: "Arjun", action: "Discount request exceeded cashier limit", amount: "Rs 260", status: "Escalated", warning: true },
    { id: "3", time: "11:16 AM", user: "Priya", action: "Lunch Promo auto-applied", amount: "Rs 95", status: "Applied" }
  ],
  alerts: [
    { id: "cashier-limit", title: "One cashier tried discount above limit", description: "Manager should review the order" },
    { id: "overlap", title: "Two rules overlap during lunch hours", description: "Check if stacking should be blocked" }
  ]
};
