export const staffSeedData = {
  roles: [
    {
      id: "captain",
      name: "Captain",
      summary: "Orders, KOT, move table, split bill request",
      active: true
    },
    {
      id: "waiter",
      name: "Waiter",
      summary: "Orders and kitchen instructions only"
    },
    {
      id: "cashier",
      name: "Cashier",
      summary: "Billing, payments, invoice print, and optional table setup"
    },
    {
      id: "manager",
      name: "Manager",
      summary: "Reports, approvals, outlet oversight"
    },
    {
      id: "kitchen",
      name: "Kitchen",
      summary: "KOT and preparation view only"
    }
  ],
  permissions: [
    { id: "take-orders", name: "Take orders", status: "Enabled" },
    { id: "send-kot", name: "Send KOT", status: "Enabled" },
    { id: "move-table", name: "Move table", status: "Enabled" },
    { id: "split-bill-request", name: "Split bill request", status: "Enabled" },
    { id: "add-kitchen-note", name: "Add kitchen note", status: "Enabled" },
    {
      id: "create-tables",
      name: "Create tables",
      status: "Enabled when owner allows cashier setup access"
    },
    { id: "approve-discount", name: "Approve discount", status: "Disabled", disabled: true },
    { id: "delete-bill", name: "Delete bill", status: "Disabled", disabled: true },
    { id: "access-reports", name: "Access reports", status: "Disabled", disabled: true }
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
      tableControl: "Allow or block cashier setup"
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
    },
    {
      id: "kitchen",
      role: "Kitchen",
      outletScope: "Assigned station",
      closeDay: "No access",
      discountOverride: "No access",
      voidApproval: "No access",
      reports: "No access",
      tableControl: "KOT status update or view-only"
    }
  ],
  permissionEditor: [
    {
      id: "cashier-table-setup",
      label: "Cashier can create tables",
      role: "Cashier",
      detail: "Allow cashier to add table name and seats in AC, Non-AC, and Self Service areas.",
      enabled: true
    },
    {
      id: "manager-close-day",
      label: "Manager can approve closing day",
      role: "Manager",
      detail: "Let manager approve final closing and reopen the next business day.",
      enabled: true
    },
    {
      id: "captain-move-table",
      label: "Captain can move table",
      role: "Captain",
      detail: "Allow captain to shift guests between tables before billing.",
      enabled: true
    },
    {
      id: "waiter-request-bill",
      label: "Waiter can request bill",
      role: "Waiter",
      detail: "Let waiter trigger bill request to cashier after service is delivered.",
      enabled: true
    },
    {
      id: "kitchen-kot-control",
      label: "Kitchen can update KOT status",
      role: "Kitchen",
      detail: "Allow kitchen to move tickets between New, Preparing, Ready, and pickup states.",
      enabled: true
    }
  ],
  staff: [
    {
      id: "karthik",
      name: "Karthik",
      role: "Captain",
      outlet: "Indiranagar",
      login: "PIN",
      status: "Active"
    },
    {
      id: "naveen",
      name: "Naveen",
      role: "Waiter",
      outlet: "Indiranagar",
      login: "PIN",
      status: "Active"
    },
    {
      id: "arjun",
      name: "Arjun",
      role: "Cashier",
      outlet: "Koramangala",
      login: "Password + PIN",
      status: "Active"
    },
    {
      id: "meera",
      name: "Meera",
      role: "Manager",
      outlet: "HSR Layout",
      login: "Password",
      status: "Approval pending",
      warning: true
    }
  ],
  tableAccess: [
    { id: "ac-t1", area: "AC Hall 1", table: "T1", seats: 4, createdBy: "Cashier", status: "Allowed" },
    { id: "ac-t2", area: "AC Hall 1", table: "T2", seats: 6, createdBy: "Cashier", status: "Allowed" },
    { id: "nonac-t5", area: "Non-AC Hall", table: "T5", seats: 8, createdBy: "Cashier", status: "Allowed" },
    { id: "self-s3", area: "Self Service", table: "S3", seats: 4, createdBy: "Cashier", status: "Allowed" }
  ],
  alerts: [
    {
      id: "cashier-table-setup",
      title: "Cashier table setup is enabled",
      description: "They can create areas like AC Hall 1 and add tables with 4 to 8 seats"
    },
    {
      id: "default-pin",
      title: "2 staff still using default PIN",
      description: "Force PIN reset before next shift"
    },
    {
      id: "wrong-role",
      title: "1 waiter has cashier permission by mistake",
      description: "Review role assignment for Koramangala outlet"
    },
    {
      id: "manager-approval",
      title: "Manager approval pending",
      description: "Enable discount override for HSR Layout manager"
    }
  ]
};
