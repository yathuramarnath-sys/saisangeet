// Shared localStorage keys — POS reads these for low-stock alerts
export const INVENTORY_TRACKING_KEY = "pos_inventory_tracking";
export const INVENTORY_WASTAGE_KEY  = "pos_inventory_wastage";

export const SESSIONS = ["Breakfast", "Lunch", "Dinner"];
export const UNITS    = ["Pcs", "Kg", "Ltr", "Plate", "Bowl", "Cup"];

// Outlets loaded dynamically from API — empty default
export const OUTLETS = [];

// Menu items loaded from API — empty default
export const menuCatalog = [];

// Tracking config — empty default (owner enables per item)
export const defaultTracking = [];

// Wastage log — empty default
export const wastageLogSeed = [];
