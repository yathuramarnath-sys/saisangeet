export const devicesSeedData = {
  linkCode: {
    code: "POS24190",
    outlet: "Indiranagar",
    expiresAt: "10:15 AM"
  },
  devices: [
    {
      id: "front-counter-pos-1",
      name: "Front Counter POS 1",
      type: "POS terminal",
      outlet: "Indiranagar",
      setup: "Receipt + tax synced",
      status: "Active"
    },
    {
      id: "captain-tab-2",
      name: "Captain Tab 2",
      type: "Captain tablet",
      outlet: "Indiranagar",
      setup: "Menu + KOT synced",
      status: "Active"
    },
    {
      id: "kitchen-screen-1",
      name: "Kitchen Screen 1",
      type: "KDS",
      outlet: "HSR Layout",
      setup: "KOT display synced",
      status: "Active"
    },
    {
      id: "kitchen-printer-1",
      name: "Kitchen Printer 1",
      type: "Printer",
      outlet: "Koramangala",
      setup: "Routing review pending",
      status: "Review",
      warning: true
    },
    {
      id: "paytm-counter-1",
      name: "Paytm Counter QR",
      type: "Payment QR",
      outlet: "Whitefield",
      setup: "Settlement linked",
      status: "Active"
    },
    {
      id: "phonepe-soundbox-1",
      name: "PhonePe Soundbox 1",
      type: "Payment device",
      outlet: "Indiranagar",
      setup: "UPI alerts + outlet linked",
      status: "Active"
    }
  ],
  alerts: [
    {
      id: "kitchen-routing",
      title: "Kitchen printer routing not finalized",
      description: "Koramangala printer is linked but not assigned to the correct station"
    },
    {
      id: "link-code",
      title: "1 link code expires soon",
      description: "Generate a fresh code if the terminal is not linked in time"
    },
    {
      id: "captain-tablet",
      title: "Captain tablet missing at Whitefield",
      description: "Link a tablet for faster order taking on the floor"
    },
    {
      id: "payment-device",
      title: "Paytm QR pending assignment at Koramangala",
      description: "Assign the payment partner device before enabling full UPI flow"
    }
  ]
};
