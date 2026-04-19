// Shared key — POS reads this to know if GST billing is enabled
export const TAX_SETTINGS_KEY     = "pos_tax_settings";
export const RECEIPT_SETTINGS_KEY = "pos_receipt_settings";

// Outlets loaded from API — empty default
export const OUTLETS = [];

// Standard GST slabs — same for every restaurant in India
export const defaultTaxProfiles = [
  { id: "gst-0",  name: "No Tax (0%)",  cgst: 0,   sgst: 0,   igst: 0,   cess: 0, inclusive: false },
  { id: "gst-5",  name: "GST 5%",       cgst: 2.5, sgst: 2.5, igst: 5,   cess: 0, inclusive: false },
  { id: "gst-12", name: "GST 12%",      cgst: 6,   sgst: 6,   igst: 12,  cess: 0, inclusive: false },
  { id: "gst-18", name: "GST 18%",      cgst: 9,   sgst: 9,   igst: 18,  cess: 0, inclusive: false }
];

// Business GST details loaded from API (business profile) — empty default
export const defaultBusinessGST = {
  gstin:     "",
  legalName: "",
  tradeName: "",
  address:   "",
  email:     "",
  phone:     ""
};

export const defaultReceiptSettings = {
  showGstBreakdown:  true,
  showItemDesc:      false,
  showSavings:       true,
  showQR:            true,
  footerNote:        "Thank you for dining with us! Visit again.",
  gstBillingEnabled: true,
  gstBillDelivery:   "both"
};

// Outlet GST profiles loaded from API
export const defaultOutletProfiles = {};
