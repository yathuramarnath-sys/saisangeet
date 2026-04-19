// Shared localStorage keys — POS reads/writes these
export const ACTIVE_SHIFTS_KEY   = "pos_active_shifts";
export const CASH_MOVEMENTS_KEY  = "pos_cash_movements";
export const SHIFT_HISTORY_KEY   = "pos_shift_history";

// Loaded dynamically from API
export const OUTLETS  = [];
export const SESSIONS = ["Breakfast", "Lunch", "Dinner", "Full Day"];
export const CASHIERS = [];
export const CASH_OUT_REASONS = ["Petty expense", "Vendor payment", "Courier payout", "Staff advance", "Utility bill", "Other"];
export const CASH_IN_REASONS  = ["Change refill", "Float top-up", "Manager deposit", "Other"];

// No seed data — shifts come from live POS operations
export const seedActiveShifts = [];
export const seedMovements    = [];
export const seedHistory      = [];
