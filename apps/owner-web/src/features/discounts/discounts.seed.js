// No seed data — discount rules are created by each restaurant owner
export const discountsSeedData = {
  rules:          [],
  approvalPolicy: [
    { id: "cashier", role: "Cashier",  manualDiscountLimit: 5,  orderVoid: "Not allowed",       billDelete: "Not allowed",        approvalRoute: "Escalate to Manager" },
    { id: "manager", role: "Manager",  manualDiscountLimit: 15, orderVoid: "Allowed with note",  billDelete: "Allowed with reason", approvalRoute: "Self-approve" }
  ],
  activity: [],
  alerts:   []
};
