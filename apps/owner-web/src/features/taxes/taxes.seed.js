// Shared key — POS reads this to know if GST billing is enabled and which profile applies
export const TAX_SETTINGS_KEY   = "pos_tax_settings";
export const RECEIPT_SETTINGS_KEY = "pos_receipt_settings";

export const OUTLETS = ["Indiranagar", "Koramangala", "HSR Layout", "Whitefield"];

export const defaultTaxProfiles = [
  { id: "gst-0",  name: "No Tax (0%)",  cgst: 0,   sgst: 0,   igst: 0,   cess: 0, inclusive: false },
  { id: "gst-5",  name: "GST 5%",       cgst: 2.5, sgst: 2.5, igst: 5,   cess: 0, inclusive: false },
  { id: "gst-12", name: "GST 12%",      cgst: 6,   sgst: 6,   igst: 12,  cess: 0, inclusive: false },
  { id: "gst-18", name: "GST 18%",      cgst: 9,   sgst: 9,   igst: 18,  cess: 0, inclusive: false }
];

export const defaultBusinessGST = {
  gstin:       "29ABCDE1234F1Z5",
  legalName:   "A2B Kitchens Pvt Ltd",
  tradeName:   "A2B Kitchens",
  address:     "12 MG Road, Indiranagar, Bengaluru – 560038",
  email:       "billing@a2bkitchens.in",
  phone:       "+91 98765 43210"
};

export const defaultReceiptSettings = {
  showGstBreakdown:  true,
  showItemDesc:      false,
  showSavings:       true,
  showQR:            true,
  footerNote:        "Thank you for dining with us! Visit again.",
  // GST billing on POS
  gstBillingEnabled: true,
  gstBillDelivery:   "both"    // "print" | "email" | "both"
};

export const defaultOutletProfiles = {
  Indiranagar: "gst-5",
  Koramangala: "gst-5",
  "HSR Layout": "gst-5",
  Whitefield:  "gst-5"
};
