export const menusSeedData = {
  menuGroups: [
    {
      id: "all-day",
      name: "All Day Menu",
      status: "Live",
      outletCount: 4,
      itemCount: 142,
      channels: ["Dine-In", "Takeaway", "Delivery"],
      note: "Primary menu used through the full service day"
    },
    {
      id: "breakfast",
      name: "Breakfast Menu",
      status: "Scheduled",
      outletCount: 2,
      itemCount: 26,
      channels: ["Dine-In", "Takeaway"],
      note: "Shown from 7:00 AM to 11:00 AM"
    },
    {
      id: "delivery-only",
      name: "Delivery Specials",
      status: "Review",
      outletCount: 3,
      itemCount: 18,
      channels: ["Delivery"],
      note: "Owner should review pricing and availability before launch"
    }
  ],
  assignments: [
    {
      id: "assign-1",
      menu: "All Day Menu",
      outlet: "Indiranagar",
      channels: "Dine-In, Takeaway, Delivery",
      availability: "Always on",
      status: "Ready"
    },
    {
      id: "assign-2",
      menu: "Breakfast Menu",
      outlet: "Koramangala",
      channels: "Dine-In, Takeaway",
      availability: "7:00 AM - 11:00 AM",
      status: "Scheduled"
    },
    {
      id: "assign-3",
      menu: "Delivery Specials",
      outlet: "HSR Layout",
      channels: "Delivery",
      availability: "6:00 PM - 10:30 PM",
      status: "Review"
    }
  ],
  quickSections: [
    {
      id: "visibility",
      title: "Menu visibility",
      value: "Outlet + channel wise",
      detail: "Control where items appear without editing the item master each time."
    },
    {
      id: "service-windows",
      title: "Service windows",
      value: "Breakfast / all day / specials",
      detail: "Menus can stay simple for staff and still support timed customer views."
    },
    {
      id: "availability",
      title: "Availability edits",
      value: "Fast and simple",
      detail: "Disable menu groups quickly during service without touching item master setup."
    }
  ],
  alerts: [
    {
      id: "delivery-review",
      title: "Delivery Specials menu needs review",
      description: "Check pricing and assign final outlets before enabling it for online channels."
    },
    {
      id: "breakfast-window",
      title: "Breakfast menu should auto-switch by time",
      description: "Schedule support can be added later, but menu grouping is ready now."
    }
  ]
};
