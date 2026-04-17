// Shared localStorage keys — POS reads/writes these
export const ACTIVE_SHIFTS_KEY   = "pos_active_shifts";
export const CASH_MOVEMENTS_KEY  = "pos_cash_movements";
export const SHIFT_HISTORY_KEY   = "pos_shift_history";

export const OUTLETS  = ["Indiranagar", "Koramangala", "HSR Layout", "Whitefield"];
export const SESSIONS = ["Breakfast", "Lunch", "Dinner", "Full Day"];
export const CASHIERS = ["Ravi", "Priya", "Arjun", "Ramesh", "Karthik", "Sunita"];
export const CASH_OUT_REASONS = ["Petty expense", "Vendor payment", "Courier payout", "Staff advance", "Utility bill", "Other"];
export const CASH_IN_REASONS  = ["Change refill", "Float top-up", "Manager deposit", "Other"];

// Seed data shown on first load
export const seedActiveShifts = [
  {
    id: "shift-001",
    cashier: "Ravi",
    outlet: "Indiranagar",
    session: "Lunch",
    openingCash: 5000,
    cashIn: 500,
    cashOut: 200,
    sales: 14800,
    startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    status: "open"
  },
  {
    id: "shift-002",
    cashier: "Priya",
    outlet: "Koramangala",
    session: "Lunch",
    openingCash: 8000,
    cashIn: 0,
    cashOut: 850,
    sales: 21300,
    startedAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString(),
    status: "open"
  },
  {
    id: "shift-003",
    cashier: "Arjun",
    outlet: "HSR Layout",
    session: "Breakfast",
    openingCash: 4000,
    cashIn: 0,
    cashOut: 300,
    sales: 9200,
    startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    status: "mismatch",
    closingCash: 11700,
    expectedCash: 12900,
    variance: -1200,
    closedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
  }
];

export const seedMovements = [
  {
    id: "mv-001", shiftId: "shift-001", cashier: "Ravi",
    outlet: "Indiranagar", type: "in",
    amount: 500, reason: "Change refill",
    authorizedBy: "Manager", time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "mv-002", shiftId: "shift-002", cashier: "Priya",
    outlet: "Koramangala", type: "out",
    amount: 850, reason: "Petty expense",
    authorizedBy: "Manager", time: new Date(Date.now() - 90 * 60 * 1000).toISOString()
  },
  {
    id: "mv-003", shiftId: "shift-003", cashier: "Arjun",
    outlet: "HSR Layout", type: "out",
    amount: 300, reason: "Courier payout",
    authorizedBy: "Manager", time: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  }
];

export const seedHistory = [
  {
    id: "hist-001", cashier: "Ramesh", outlet: "Whitefield",
    session: "Breakfast", openingCash: 6000,
    cashIn: 0, cashOut: 0, sales: 11200,
    closingCash: 17200, expectedCash: 17200, variance: 0,
    startedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    closedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    status: "closed"
  }
];
