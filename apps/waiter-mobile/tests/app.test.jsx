import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "../src/App";
import { loadRestaurantState, resetRestaurantState, updateClosingState, updatePermissionPolicies } from "../../../packages/shared-types/src/mockRestaurantStore.js";

afterEach(() => {
  cleanup();
  resetRestaurantState();
});

describe("waiter mobile app", () => {
  it("renders the shared waiter and captain mobile flow", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Waiter and Captain" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Captain" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waiter" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Delivery Pulse" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Assign Waiter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send KOT" })).toBeInTheDocument();
    expect(screen.getByText(/Stock alert:/)).toBeInTheDocument();
  });

  it("creates a demo order from mobile for cross-app testing", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Create Demo Order" }));
    expect(screen.getByText("Demo order created for T2")).toBeInTheDocument();
  });

  it("lets the captain assign a waiter, add an item, and send kot", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Waiter Devi" }));
    expect(screen.getByText("Waiter Devi assigned to T1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mains" }));
    fireEvent.click(screen.getByRole("button", { name: /Veg Biryani/i }));
    expect(screen.getAllByText("Veg Biryani").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "No garlic" }));
    expect(screen.getAllByText("No garlic").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Send KOT" }));
    expect(screen.getAllByText("KOT sent").length).toBeGreaterThan(0);
  });

  it("lets the waiter view pickup queue and mark delivery", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Waiter" }));
    expect(screen.getByRole("heading", { level: 2, name: "Pickup Queue" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Mark Picked Up" })[0]);
    expect(screen.getByText("Picked up for T1")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Delivered to Table" })[0]);
    expect(screen.getAllByText(/Delivered to/i).length).toBeGreaterThan(0);
  });

  it("locks mobile actions after daily closing is approved", () => {
    updateClosingState(() => ({
      approved: true,
      approvedAt: "11:32 PM",
      approvedBy: "Owner",
      status: "Approved and queued"
    }));

    render(<App />);

    expect(screen.getByText("Day closed • Ordering, assignment, pickup, and billing actions are locked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Demo Order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Waiter Devi" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request Bill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send KOT" })).toBeDisabled();
  });

  it("applies live owner permission toggles to mobile actions", () => {
    updatePermissionPolicies((current) => ({
      ...current,
      "captain-move-table": false,
      "waiter-request-bill": false
    }));

    render(<App />);

    expect(screen.getByRole("button", { name: "Move Table Locked" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Waiter" }));
    expect(screen.getByRole("button", { name: "Bill Request Locked" })).toBeDisabled();
  });

  it("shows out-of-stock and low-stock dining items to captain", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mains" }));

    expect(screen.getByText("Low Stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Butter Naan/i })).toBeDisabled();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
  });

  it("deducts dining inventory after captain sends KOT", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mains" }));
    fireEvent.click(screen.getByRole("button", { name: /Veg Biryani/i }));
    expect(screen.getAllByText("Veg Biryani").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Send KOT" }));

    await waitFor(() => {
      const vegBiryani = loadRestaurantState().inventory.diningItems.find((item) => item.id === "veg-biryani");
      expect(vegBiryani.quantity).toBe(2);
      expect(["Low Stock", "Out of Stock"]).toContain(vegBiryani.status);
    });
  });
});
