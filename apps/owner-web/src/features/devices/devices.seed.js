export const DEVICE_ROLES = [
  { value: "billing",    label: "Billing Counter" },
  { value: "kitchen",    label: "Kitchen Station" },
  { value: "dining",     label: "Dining Hall" },
  { value: "bar",        label: "Bar / Beverages" },
  { value: "unassigned", label: "Unassigned" }
];

// Default station suggestions — user can also type a custom name
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

// Shared localStorage key — POS reads this to know which printer/KDS is assigned where
export const DEVICES_SHARED_KEY = "pos_devices_assignments";

export const PRINTER_MODELS = ["Epson TM-T82", "TVS RP 3160 Gold", "Other"];

export const devicesSeedData = [
  {
    id: "printer-001",
    name: "Billing Counter Printer",
    type: "printer",
    model: "Epson TM-T82",
    ip: "192.168.1.101",
    mac: "00:26:B9:AA:12:01",
    status: "online",
    role: "billing",
    station: null,
    outlet: "Indiranagar",
    paperLow: false,
    lastSeen: new Date().toISOString()
  },
  {
    id: "printer-002",
    name: "Kitchen Printer",
    type: "printer",
    model: "TVS RP 3160 Gold",
    ip: "192.168.1.102",
    mac: "00:26:B9:AA:12:02",
    status: "online",
    role: "kitchen",
    station: "main",
    outlet: "Indiranagar",
    paperLow: true,
    lastSeen: new Date().toISOString()
  },
  {
    id: "kds-001",
    name: "Grill Station Screen",
    type: "kds",
    model: "KDS Display",
    ip: "192.168.1.110",
    mac: "00:26:B9:AA:12:10",
    status: "online",
    role: "kitchen",
    station: "grill",
    outlet: "Indiranagar",
    paperLow: false,
    lastSeen: new Date().toISOString()
  },
  {
    id: "kds-002",
    name: "Beverages Screen",
    type: "kds",
    model: "KDS Display",
    ip: "192.168.1.111",
    mac: "00:26:B9:AA:12:11",
    status: "offline",
    role: "kitchen",
    station: "beverages",
    outlet: "Indiranagar",
    paperLow: false,
    lastSeen: new Date(Date.now() - 18 * 60 * 1000).toISOString()
  },
  {
    id: "printer-003",
    name: "New Printer",
    type: "printer",
    model: "Epson TM-T82",
    ip: "192.168.1.115",
    mac: "00:26:B9:AA:12:15",
    status: "online",
    role: "unassigned",
    station: null,
    outlet: "Indiranagar",
    paperLow: false,
    lastSeen: new Date().toISOString()
  }
];
