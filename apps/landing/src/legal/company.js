/**
 * company.js — the business behind PLATO, exactly as on the GST certificate.
 * Shown in the footer and on the Privacy / Terms / Refund / Contact pages.
 * Meta (WhatsApp) and Razorpay verify these against the GST certificate, so
 * keep them identical to it.
 */

export const COMPANY = {
  brand:      "PLATO",
  legalName:  "TODO: legal name as on GST certificate",
  tradeName:  "",                                        // as on the certificate, if any
  structure:  "Sole proprietorship",
  gstin:      "33AGIPA4444J1ZN",
  address:    "TODO: principal place of business as on GST certificate",
  state:      "Tamil Nadu",
  email:      "info@dinexpos.in",
  phone:      "+91 98840 40854",
  website:    "https://dinexpos.in",
  grievanceOfficer: "TODO: legal name as on GST certificate",   // the proprietor
  updated:    "24 November 2026",
};

/** True until every TODO above is filled in — pages show a warning in development. */
export const COMPANY_INCOMPLETE = Object.values(COMPANY).some(v => String(v).startsWith("TODO"));
