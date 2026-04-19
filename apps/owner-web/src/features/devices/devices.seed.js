export const DEVICE_ROLES = [
  { value: "billing",    label: "Billing Counter" },
  { value: "kitchen",    label: "Kitchen Station" },
  { value: "dining",     label: "Dining Hall" },
  { value: "bar",        label: "Bar / Beverages" },
  { value: "unassigned", label: "Unassigned" }
];

export const STATION_SUGGESTIONS = [
  "Grill Station",
  "Main Kitchen",
  "Beverages",
  "Desserts",
  "AC Hall 1",
  "Family Hall",
  "Rooftop",
  "Billing Counter 1",
  "Billing Counter 2"
];

export const DEVICES_SHARED_KEY = "pos_devices_assignments";

export const PRINTER_MODELS = ["Epson TM-T82", "TVS RP 3160 Gold", "Other"];

// No seed devices — each customer starts empty
export const devicesSeedData = [];
