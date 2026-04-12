export const taxesSeedData = {
  profiles: [
    {
      id: "gst-5",
      name: "GST 5%",
      summary: "CGST 2.5% + SGST 2.5% • Default profile",
      active: true
    },
    {
      id: "gst-12",
      name: "GST 12%",
      summary: "CGST 6% + SGST 6%"
    },
    {
      id: "gst-18",
      name: "GST 18%",
      summary: "CGST 9% + SGST 9%"
    }
  ],
  outletDefaults: [
    {
      id: "indiranagar",
      outlet: "Indiranagar",
      gstDefault: "GST 5%",
      receipt: "Dine-In Standard",
      pricingMode: "Exclusive",
      status: "Ready"
    },
    {
      id: "koramangala",
      outlet: "Koramangala",
      gstDefault: "GST 5%",
      receipt: "Not assigned",
      pricingMode: "Exclusive",
      status: "Review",
      warning: true
    },
    {
      id: "hsr-layout",
      outlet: "HSR Layout",
      gstDefault: "GST 5%",
      receipt: "Dine-In Standard",
      pricingMode: "Exclusive",
      status: "Ready"
    },
    {
      id: "whitefield",
      outlet: "Whitefield",
      gstDefault: "GST 5%",
      receipt: "Takeaway Standard",
      pricingMode: "Exclusive",
      status: "Ready"
    }
  ],
  alerts: [
    {
      id: "missing-gst",
      title: "4 items missing GST profile",
      description: "Assign tax before these items appear on live POS billing"
    },
    {
      id: "missing-receipt",
      title: "Koramangala receipt default missing",
      description: "Select a receipt template before cashier login is enabled"
    },
    {
      id: "qr-review",
      title: "Review QR block for takeaway template",
      description: "Owner should confirm payment QR visibility on parcel bill"
    }
  ]
};
