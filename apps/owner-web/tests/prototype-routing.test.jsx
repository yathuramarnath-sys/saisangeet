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
      vi.fn(async (url) => {
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
    expect(screen.getByText("Manager Approval History")).toBeInTheDocument();
    expect(screen.getByText("Deleted bill approved at HSR Layout")).toBeInTheDocument();
    expect(screen.getByText("Approve Final Closing Report")).toBeInTheDocument();
    expect(screen.getByText("Unresolved Issues")).toBeInTheDocument();
    expect(screen.getByText("Final Snapshot")).toBeInTheDocument();
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

    expect(loadRestaurantState().closingState.approved).toBe(true);
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
