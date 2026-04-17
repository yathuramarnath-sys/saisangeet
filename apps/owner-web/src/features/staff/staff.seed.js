export const staffSeedData = {
  roles: [
    {
      id: "captain",
      name: "Captain",
      summary: "Orders, KOT, move table, split bill request",
      permissions: ["operations.kot.send", "operations.table.move", "operations.bill.split"],
      active: true
    },
    {
      id: "waiter",
      name: "Waiter",
      summary: "Take orders and request bill only",
      permissions: ["operations.kot.send", "operations.bill.request"],
      active: true
    },
    {
      id: "cashier",
      name: "Cashier",
      summary: "Billing, payments, invoice print",
      permissions: ["operations.bill.split", "operations.bill.edit", "operations.bill.cancel", "operations.table.create"],
      active: true
    },
    {
      id: "manager",
      name: "Manager",
      summary: "Reports, discount approvals, outlet oversight",
      permissions: ["operations.discount.approve", "operations.bill.cancel", "reports.view", "users.manage", "floor.area.manage"],
      active: true
    }
  ],
  permissions: [
    { id: "take-orders", code: "operations.kot.send", name: "Send KOT", workflowArea: "Operations" },
    { id: "request-bill", code: "operations.bill.request", name: "Request Bill", workflowArea: "Operations" },
    { id: "move-table", code: "operations.table.move", name: "Move Table", workflowArea: "Operations" },
    { id: "split-bill", code: "operations.bill.split", name: "Split Bill", workflowArea: "Operations" },
    { id: "edit-bill", code: "operations.bill.edit", name: "Edit Bill", workflowArea: "Operations" },
    { id: "cancel-bill", code: "operations.bill.cancel", name: "Cancel Bill", workflowArea: "Operations" },
    { id: "approve-discount", code: "operations.discount.approve", name: "Approve Discount", workflowArea: "Operations" },
    { id: "create-tables", code: "operations.table.create", name: "Create Tables", workflowArea: "Operations" },
    { id: "view-reports", code: "reports.view", name: "View Reports", workflowArea: "Reports" },
    { id: "manage-staff", code: "users.manage", name: "Manage Staff", workflowArea: "Management" },
    { id: "area-setup", code: "floor.area.manage", name: "Area Setup", workflowArea: "Management" }
  ],
  accessMatrix: [
    {
      id: "owner",
      role: "Owner",
      outletScope: "All outlets",
      closeDay: "Approve and reopen",
      discountOverride: "Approve",
      voidApproval: "Approve",
      reports: "Full access",
      tableControl: "Full control"
    },
    {
      id: "manager",
      role: "Manager",
      outletScope: "Assigned outlet",
      closeDay: "Approve and reopen",
      discountOverride: "Approve",
      voidApproval: "Approve",
      reports: "Outlet reports",
      tableControl: "Monitor only"
    },
    {
      id: "cashier",
      role: "Cashier",
      outletScope: "Assigned outlet",
      closeDay: "View only",
      discountOverride: "Request only",
      voidApproval: "Request only",
      reports: "Shift and billing only",
      tableControl: "Optional if owner allows"
    },
    {
      id: "captain",
      role: "Captain",
      outletScope: "Assigned section",
      closeDay: "No access",
      discountOverride: "No access",
      voidApproval: "No access",
      reports: "No access",
      tableControl: "Move table and assign waiter"
    },
    {
      id: "waiter",
      role: "Waiter",
      outletScope: "Assigned tables",
      closeDay: "No access",
      discountOverride: "No access",
      voidApproval: "No access",
      reports: "No access",
      tableControl: "Pickup and deliver only"
    }
  ],
  permissionEditor: [],
  staff: [
    {
      id: "karthik",
      name: "Karthik",
      role: "Captain",
      outlet: "Indiranagar",
      login: "PIN",
      status: "Active",
      mobileNumber: "9876500001",
      pin: "1234"
    },
    {
      id: "naveen",
      name: "Naveen",
      role: "Waiter",
      outlet: "Indiranagar",
      login: "PIN",
      status: "Active",
      mobileNumber: "9876500002",
      pin: "2345"
    },
    {
      id: "arjun",
      name: "Arjun",
      role: "Cashier",
      outlet: "Koramangala",
      login: "PIN",
      status: "Active",
      mobileNumber: "9876500003",
      pin: "3456"
    },
    {
      id: "meera",
      name: "Meera",
      role: "Manager",
      outlet: "HSR Layout",
      login: "Password",
      status: "Inactive",
      mobileNumber: "9876500004",
      pin: ""
    }
  ],
  tableAccess: [],
  alerts: [
    {
      id: "default-pin",
      title: "2 staff still using default PIN",
      description: "Force PIN reset before next shift"
    },
    {
      id: "manager-inactive",
      title: "Manager account inactive",
      description: "Meera (HSR Layout) needs activation before shift"
    }
  ]
};
