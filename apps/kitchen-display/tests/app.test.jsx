import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "../src/App";
import { resetRestaurantState, updateClosingState, updatePermissionPolicies } from "../../../packages/shared-types/src/mockRestaurantStore.js";

afterEach(() => {
  cleanup();
  resetRestaurantState();
});

describe("kitchen display app", () => {
  it("renders the kitchen board with station filters and status columns", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "KOT Board" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Stations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Preparing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Ready" })).toBeInTheDocument();
    expect(screen.getAllByText("Urgent").length).toBeGreaterThan(0);
  });

  it("creates a demo order and shows it as a kitchen ticket", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Create Demo Order" }));
    expect(screen.getByText("Demo KOT created: KOT-10038")).toBeInTheDocument();
  });

  it("lets the kitchen filter by station and move a ticket to preparing and ready", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Grill" }));
    expect(screen.getAllByText("KOT-10031").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Start Preparing" }));
    expect(screen.getByText("KOT moved to preparing")).toBeInTheDocument();
    expect(screen.getAllByText("Accepted in kitchen").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Mark Ready" }));
    expect(screen.getByText("KOT ready for waiter pickup")).toBeInTheDocument();
  });

  it("lets the kitchen mark a ready ticket as picked up", () => {
    render(<App />);

    fireEvent.click(screen.getByText("KOT-10033"));
    fireEvent.click(screen.getByRole("button", { name: "Waiter Picked Up" }));

    expect(screen.getByText("Waiter pickup completed")).toBeInTheDocument();
  });

  it("locks kitchen actions after daily closing is approved", () => {
    updateClosingState(() => ({
      approved: true,
      approvedAt: "11:32 PM",
      approvedBy: "Owner",
      status: "Approved and queued"
    }));

    render(<App />);

    expect(screen.getByText("Day closed • Kitchen queue is view-only now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Demo Order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start Preparing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mark Ready" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Waiter Picked Up" })).toBeDisabled();
  });

  it("applies owner kitchen control policy to kds actions", () => {
    updatePermissionPolicies((current) => ({
      ...current,
      "kitchen-kot-control": false
    }));

    render(<App />);

    expect(screen.getByText("Kitchen KOT control disabled by owner • Queue is view-only now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Demo Order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start Preparing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mark Ready" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Waiter Picked Up" })).toBeDisabled();
  });
});
