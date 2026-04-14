import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { OwnerLayout } from "../src/components/OwnerLayout";
import { navigation } from "../src/data/navigation";
import { AppRoutes } from "../src/pages/routes";
import { loadRestaurantState, resetRestaurantState, updatePermissionPolicies } from "../../../packages/shared-types/src/mockRestaurantStore.js";

describe("owner web prototype-backed routing", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (String(url).includes("/api/v1/reports/closing/approve")) {
          const actor = options?.body ? JSON.parse(options.body) : { name: "Owner", role: "Owner" };
          return {
            ok: true,
            json: async () => ({
              popupAlert: {
                title: "Daily closing approved",
                description: `Approved by ${actor.name} (${actor.role}) at 11:32 PM.`,
                cta: "Open reports"
              },
              outletComparison: [],
              insights: [],
              closingSummary: [],
              closingCenter: {
                blockers: [],
                checklist: [],
                ownerSummary: []
              },
              closingState: {
                approved: true,
                approvedAt: "11:32 PM",
                approvedBy: actor.name,
                approvedRole: actor.role,
                reopenedAt: null,
                reopenedBy: null,
                reopenedRole: null,
                status: "Approved and queued"
              },
              permissionPolicies: {
                "manager-close-day": true
              },
              controlSummary: [],
              approvalLog: [],
              alerts: []
            })
          };
        }

        if (String(url).includes("/api/v1/reports/closing/reopen")) {
          const actor = options?.body ? JSON.parse(options.body) : { name: "Owner", role: "Owner" };
          return {
            ok: true,
            json: async () => ({
              popupAlert: {
                title: "2 control issues need owner review",
                description: "1 discount overrides and 1 deleted bills were recorded in live operations.",
                cta: "Open reports"
              },
              outletComparison: [],
              insights: [],
              closingSummary: [],
              closingCenter: {
                blockers: [],
                checklist: [],
                ownerSummary: []
              },
              closingState: {
                approved: false,
                approvedAt: null,
                approvedBy: null,
                approvedRole: null,
                reopenedAt: "6:00 AM",
                reopenedBy: actor.name,
                reopenedRole: actor.role,
                status: "Open for operations"
              },
              permissionPolicies: {
                "manager-close-day": true
              },
              controlSummary: [],
              approvalLog: [],
              alerts: []
            })
          };
        }

        if (String(url).includes("/api/v1/reports/owner-summary")) {
          return {
            ok: true,
            json: async () => ({
              popupAlert: {
                title: "2 control issues need owner review",
                description: "1 discount overrides and 1 deleted bills were recorded in live operations.",
                cta: "Open reports"
              },
              outletComparison: [
                {
                  id: "koramangala",
                  outlet: "Koramangala",
                  sales: "Rs 61,500",
                  profit: "Rs 12,900",
                  expenses: "Rs 14,300",
                  status: "Review"
                }
              ],
              insights: [
                {
                  id: "profit-item",
                  title: "Top profit item",
                  description: "Paneer Tikka generated the highest profit today across outlets."
                }
              ],
              closingSummary: [
                {
                  id: "sales-payments",
                  title: "Sales & Payments",
                  status: "Included",
                  meta: "Total sales, order count, cash vs UPI vs card summary"
                }
              ],
              closingCenter: {
                blockers: [
                  {
                    id: "blocker-override",
                    title: "1 high discount override needs review",
                    detail: "Owner should confirm manager approvals before sending final closing mail."
                  }
                ],
                checklist: [
                  { id: "sales-lock", title: "All outlets sales synced", status: "Done" }
                ],
                ownerSummary: [
                  { id: "closing-sales", label: "Net sales", value: "Rs 2,45,000" }
                ]
              },
              closingState: {
                approved: false,
                approvedAt: null,
                approvedBy: null,
                approvedRole: null,
                reopenedAt: null,
                reopenedBy: null,
                reopenedRole: null,
                status: "Pending review"
              },
              permissionPolicies: {
                "manager-close-day": true
              },
              controlSummary: [
                {
                  id: "discount-overrides",
                  title: "Discount overrides",
                  value: "1 today",
                  detail: "1 still need review",
                  status: "Review"
                }
              ],
              controlLogs: {
                reprints: [
                  {
                    id: "reprint-1",
                    outlet: "Indiranagar",
                    tableNumber: "T1",
                    orderNumber: 10031,
                    reason: "Audit copy",
                    actor: "Manager Rakesh",
                    time: "Now",
                    type: "reprint"
                  }
                ],
                deletedBills: [
                  {
                    id: "deleted-1",
                    outlet: "HSR Layout",
                    tableNumber: "T3",
                    orderNumber: 10033,
                    reason: "Duplicate bill",
                    actor: "Owner OTP",
                    time: "Now",
                    type: "deleted-bill"
                  }
                ],
                voidRequests: [
                  {
                    id: "void-1",
                    outlet: "HSR Layout",
                    tableNumber: "T3",
                    orderNumber: 10033,
                    reason: "Duplicate bill",
                    actor: "Pending OTP",
                    status: "Pending OTP",
                    time: "Now",
                    type: "void-request"
                  }
                ]
              },
              approvalLog: [
                {
                  id: "approval-1",
                  outlet: "Koramangala",
                  tableNumber: "T2",
                  orderNumber: 10032,
                  action: "Discount approved",
                  actor: "Manager OTP",
                  approvalMode: "OTP",
                  amount: "Rs 25",
                  time: "7:48 PM"
                }
              ],
              alerts: [
                {
                  id: "closing-email-wait",
                  title: "Closing email should wait for one unresolved shift",
                  description: "HSR Layout cash mismatch is still open"
                },
                {
                  id: "deleted-bill-owner",
                  title: "Deleted bill approved at HSR Layout",
                  description: "Include deleted-bill reason and manager name in owner report"
                }
              ]
            })
          };
        }

        if (String(url).includes("/api/v1/shifts/mismatch/review")) {
          return {
            ok: true,
            json: async () => ({
              shifts: [
                {
                  id: "ramesh-hsr",
                  cashier: "Ramesh",
                  outlet: "HSR Layout",
                  openingCash: "Rs 7,000",
                  expectedClose: "Rs 26,300",
                  status: "Manager check"
                }
              ],
              movements: [],
              alerts: [
                {
                  id: "hsr-short",
                  title: "HSR Layout mismatch under manager review",
                  description: "Owner report should stay open until closing approval is complete"
                }
              ]
            })
          };
        }

        if (String(url).includes("/api/v1/shifts/summary")) {
          return {
            ok: true,
            json: async () => ({
              shifts: [
                {
                  id: "arjun-koramangala",
                  cashier: "Arjun",
                  outlet: "Koramangala",
                  openingCash: "Rs 5,000",
                  expectedClose: "Rs 21,450",
                  status: "Open"
                },
                {
                  id: "ramesh-hsr",
                  cashier: "Ramesh",
                  outlet: "HSR Layout",
                  openingCash: "Rs 7,000",
                  expectedClose: "Rs 26,300",
                  status: "Mismatch"
                }
              ],
              movements: [
                {
                  id: "cash-in-1",
                  cashier: "Arjun",
                  type: "Cash In",
                  amount: "Rs 500",
                  reason: "Change refill",
                  status: "Approved"
                }
              ],
              alerts: [
                {
                  id: "hsr-short",
                  title: "HSR Layout shift short by Rs 1,200",
                  description: "Manager must review before final closing"
                }
              ]
            })
          };
        }

        if (String(url).includes("reports.html")) {
          return {
            ok: true,
            text: async () =>
              `
                <html>
                  <body>
                    <main class="main-content">
                      <header class="topbar">
                        <div><h2>Reports</h2></div>
                      </header>
                      <section class="hero-panel">
                        <h3>Track performance and deliver the closing report automatically</h3>
                      </section>
                    </main>
                  </body>
                </html>
              `
          };
        }

        return {
          ok: true,
          text: async () =>
            `
              <html>
                <body>
                  <main class="main-content">
                    <header class="topbar">
                      <div><h2>Business Control Center</h2></div>
                    </header>
                    <section class="hero-panel">
                      <h3>Everything your owner needs before the outlet starts billing</h3>
                    </section>
                  </main>
                </body>
              </html>
            `
        };
      })
    );
  });

  afterEach(() => {
    cleanup();
    resetRestaurantState();
    vi.unstubAllGlobals();
  });

  it("maps every navigation id to a route path and a render source", () => {
    for (const item of navigation) {
      expect(item.path).toBeTruthy();
      expect(item.prototypeFile || item.mode === "react").toBeTruthy();
    }
  });

  it("renders the default overview route from prototype content", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Business Control Center" })).toBeInTheDocument();
    });

    expect(screen.getByText("Everything your owner needs before the outlet starts billing")).toBeInTheDocument();
    expect(screen.getByText(/control issues need owner review/i)).toBeInTheDocument();
  });

  it("renders the reports route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/reports"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { level: 2, name: "Reports" }).length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Track performance and deliver the closing report automatically")).toBeInTheDocument();
    expect(screen.getByText("Owner Mail Trigger")).toBeInTheDocument();
    expect(screen.getByText("Closing email should wait for one unresolved shift")).toBeInTheDocument();
    expect(screen.getByText("Owner Risk Summary")).toBeInTheDocument();
    expect(screen.getByText("OTP and Approval History")).toBeInTheDocument();
    expect(screen.getAllByText("Table / Order").length).toBeGreaterThan(0);
    expect(screen.getByText("Reprints, Void Requests, and Deleted Bills")).toBeInTheDocument();
    expect(screen.getByText("Mode")).toBeInTheDocument();
    expect(screen.getByText("Deleted bill approved at HSR Layout")).toBeInTheDocument();
    expect(screen.getByText("Approve Final Closing Report")).toBeInTheDocument();
    expect(screen.getByText("Unresolved Issues")).toBeInTheDocument();
    expect(screen.getByText("Final Snapshot")).toBeInTheDocument();
  });

  it("renders the inventory route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/inventory"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Inventory" })).toBeInTheDocument();
    });

    expect(screen.getByText("Split dining availability and kitchen production stock cleanly")).toBeInTheDocument();
    expect(screen.getAllByText("Sales Inventory").length).toBeGreaterThan(0);
    expect(screen.getByText("Kitchen Production Inventory")).toBeInTheDocument();
    expect(screen.getByText("Sales Inventory • Cashier and Manager Access")).toBeInTheDocument();
    expect(screen.getByText("Kitchen Inventory • Store Incharge and Manager Access")).toBeInTheDocument();
  });

  it("renders the menus route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/menus"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Menus" })).toBeInTheDocument();
    });

    expect(screen.getByText("Keep Item Library separate from Menus")).toBeInTheDocument();
    expect(screen.getByText("Menu Groups")).toBeInTheDocument();
    expect(screen.getByText("Outlet and Channel Mapping")).toBeInTheDocument();
    expect(screen.getByText("New Menu")).toBeInTheDocument();
  });

  it("respects manager close-day policy inside reports", async () => {
    updatePermissionPolicies((current) => ({
      ...current,
      "manager-close-day": false
    }));

    render(
      <MemoryRouter initialEntries={["/reports"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { level: 2, name: "Reports" }).length).toBeGreaterThan(0);
    });

    expect(screen.getByRole("button", { name: "Manager" })).toBeDisabled();
  });

  it("approves the daily closing report from reports", async () => {
    render(
      <MemoryRouter initialEntries={["/reports"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { level: 2, name: "Reports" }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Approve & Send Closing Report" })[0]);

    await waitFor(() => {
      expect(loadRestaurantState().closingState.approved).toBe(true);
    });
    expect(loadRestaurantState().closingState.approvedBy).toBe("Owner");
  });

  it("allows manager to approve and reopen the business day from reports", async () => {
    render(
      <MemoryRouter initialEntries={["/reports"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { level: 2, name: "Reports" }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Manager" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Approve & Send Closing Report" })[0]);

    await waitFor(() => {
      expect(loadRestaurantState().closingState.approved).toBe(true);
    });
    expect(loadRestaurantState().closingState.approvedBy).toBe("Manager Rakesh");
    expect(loadRestaurantState().closingState.approvedRole).toBe("Manager");

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Reopen Business Day" })[0]).toBeEnabled();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Reopen Business Day" })[0]);

    await waitFor(() => {
      expect(loadRestaurantState().closingState.approved).toBe(false);
    });
    expect(loadRestaurantState().closingState.reopenedBy).toBe("Manager Rakesh");
    expect(loadRestaurantState().closingState.reopenedRole).toBe("Manager");
  });

  it("renders the outlets route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/outlets"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Outlets" })).toBeInTheDocument();
    });

    expect(screen.getByText("Configure shops before POS devices and staff go live")).toBeInTheDocument();
    expect(screen.getAllByText("Indiranagar").length).toBeGreaterThan(0);
  });

  it("renders the menu route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/menu"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Menu & Categories" })).toBeInTheDocument();
    });

    expect(screen.getByText("Build a fast, clean menu before the POS goes live")).toBeInTheDocument();
    expect(screen.getByText("Paneer Tikka")).toBeInTheDocument();
    expect(screen.getByText("Area + order type")).toBeInTheDocument();
  });

  it("renders the staff route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/staff"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Staff & Roles" })).toBeInTheDocument();
    });

    expect(screen.getByText("Give every staff member only the access they need")).toBeInTheDocument();
    expect(screen.getByText("Captain Role Permissions")).toBeInTheDocument();
    expect(screen.getByText("Role Access Matrix")).toBeInTheDocument();
    expect(screen.getByText("Role Permission Editor")).toBeInTheDocument();
    expect(screen.getByText("Discount Approval Rule")).toBeInTheDocument();
    expect(screen.getByText("Cashier Discount Limit")).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
    expect(screen.getByText("Cashier Void Limit")).toBeInTheDocument();
    expect(screen.getByText("Rs 200")).toBeInTheDocument();
    expect(screen.getByText("Manager / Owner OTP")).toBeInTheDocument();
    expect(screen.getByText("Cashier Can Create Tables")).toBeInTheDocument();
    expect(screen.getAllByText("Approve and reopen").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Request only").length).toBeGreaterThan(1);
  });

  it("lets the owner toggle role permissions from staff page", async () => {
    render(
      <MemoryRouter initialEntries={["/staff"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Staff & Roles" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Disable" })[0]);
    expect(screen.getByText(/Cashier: Cashier can create tables disabled/i)).toBeInTheDocument();
    expect(loadRestaurantState().permissionPolicies["cashier-table-setup"]).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    expect(screen.getByText(/Cashier: Cashier can create tables enabled/i)).toBeInTheDocument();
    expect(loadRestaurantState().permissionPolicies["cashier-table-setup"]).toBe(true);
  });

  it("renders the discount rules route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/discount-rules"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Discount Rules" })).toBeInTheDocument();
    });

    expect(screen.getByText("Allow discounts without losing profit control")).toBeInTheDocument();
    expect(screen.getByText("Role-wise Discount Limits")).toBeInTheDocument();
    expect(screen.getByText("Discount request exceeded cashier limit")).toBeInTheDocument();
  });

  it("renders the integrations route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/integrations"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Integrations" })).toBeInTheDocument();
    });

    expect(screen.getByText("Keep accounting, delivery, and payment partners in one place")).toBeInTheDocument();
    expect(screen.getAllByText("Paytm").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PhonePe").length).toBeGreaterThan(0);
  });

  it("renders the devices route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/devices"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Devices" })).toBeInTheDocument();
    });

    expect(screen.getByText("Connect POS devices without network complexity")).toBeInTheDocument();
    expect(screen.getByText("Paytm Counter QR")).toBeInTheDocument();
    expect(screen.getByText("Same network first")).toBeInTheDocument();
  });

  it("renders the taxes route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/taxes-receipts"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Print Profile" })).toBeInTheDocument();
    });

    expect(screen.getByText("Branding")).toBeInTheDocument();
    expect(screen.getByText("Printed Logo")).toBeInTheDocument();
    expect(screen.getByText("Show cart-level discounts on item level")).toBeInTheDocument();
  });

  it("renders the shifts route from the React page", async () => {
    render(
      <MemoryRouter initialEntries={["/shifts-cash"]}>
        <OwnerLayout>
          <AppRoutes />
        </OwnerLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Shifts & Cash Control" })).toBeInTheDocument();
    });

    expect(screen.getByText("Track every cashier shift from opening cash to final close")).toBeInTheDocument();
    expect(screen.getByText("Cashier-wise Shift Status")).toBeInTheDocument();
    expect(screen.getAllByText("HSR Layout shift short by Rs 1,200").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Mark Mismatch Under Review" })).toBeInTheDocument();
  });
});
