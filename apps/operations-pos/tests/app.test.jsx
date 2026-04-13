import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "../src/App";
import { loadRestaurantState, resetRestaurantState, updateClosingState, updatePermissionPolicies } from "../../../packages/shared-types/src/mockRestaurantStore.js";

afterEach(() => {
  cleanup();
  resetRestaurantState();
});

describe("operations pos app", () => {
  it("renders the service floor flow with tables, KOT actions, billing controls, and thermal preview", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Service Floor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Select Table" })).toBeInTheDocument();
    expect(screen.getByText("AC Hall 1")).toBeInTheDocument();
    expect(screen.getAllByText("Paneer Tikka").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Send KOT" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Split Bill and Collect Payment" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Discount, Service Charge, and Round-Off" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "3-inch Thermal Preview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Bill Requested" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Order Activity" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Manager Control Rules" })).toBeInTheDocument();
  });

  it("shows the bill request queue and creates a demo order for quick cashier testing", () => {
    render(<App />);

    expect(screen.getByText("F1 • #10034")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Demo Order" }));
    expect(loadRestaurantState().orders.t2.items.length).toBeGreaterThan(0);
  });

  it("lets the user switch tables, add items, apply instructions, and send KOT", () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: /T2/i })[0]);
    expect(screen.getByText("No items yet. Pick items from the menu to start this order.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Biryani" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Veg Biryani/i }));
    expect(screen.getAllByText("Veg Biryani").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Add kitchen note").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "No garlic" })[0]);
    expect(screen.getAllByText("No garlic").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Send KOT" })[0]);
    expect(screen.getAllByText("KOT Sent").length).toBeGreaterThan(0);
  });

  it("supports bill controls, split payment, reprint approval, and closing the order", () => {
    render(<App />);

    const discountInput = screen.getAllByPlaceholderText("Enter discount")[0];
    fireEvent.change(discountInput, { target: { value: "5" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Apply Discount" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Enable Service Charge" })[0]);

    expect(screen.getAllByText("Rs 5.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Service Charge On").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Split Bill" })[0]);
    expect(screen.getByText("2 bill(s)")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "UPI" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Fill Balance" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Add Payment" })[0]);

    expect(screen.getAllByText("UPI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Print Bill" })[0]);
    expect(screen.getByText("Printed just now")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Close Order" })[0]);

    expect(screen.getByText("Order closed • Invoice ready")).toBeInTheDocument();
    expect(screen.getAllByText("Invoice Ready").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Reprint Last Bill" })[0]);
    expect(screen.getByText("Reprinted just now")).toBeInTheDocument();
    expect(screen.getAllByText("Manager Placeholder").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Today History").length).toBeGreaterThan(0);
  });

  it("supports void request and manager approval placeholders", () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: /T3/i })[0]);
    fireEvent.change(screen.getAllByDisplayValue("Wrong table")[0], { target: { value: "Duplicate bill" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Request Void" })[0]);

    expect(loadRestaurantState().orders.t3.voidRequested).toBe(false);
    expect(loadRestaurantState().orders.t3.voidApprovedBy).toBe("Cashier Anita");
    expect(loadRestaurantState().orders.t3.deletedBillLog[0].orderNumber).toBe(10033);
  });

  it("requires manager or owner otp approval for voids above Rs 200", () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: /T2/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Biryani" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Veg Biryani/i }));
    fireEvent.change(screen.getAllByDisplayValue("Wrong table")[0], { target: { value: "Duplicate bill" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Request Void" })[0]);

    expect(loadRestaurantState().orders.t2.voidRequested).toBe(true);
    expect(loadRestaurantState().orders.t2.voidApprovedBy).toBe("Pending OTP");

    fireEvent.click(screen.getAllByRole("button", { name: "Manager/Owner OTP Approve Void" })[0]);
    fireEvent.change(screen.getByPlaceholderText("Enter OTP"), { target: { value: "2468" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm OTP Approval" }));

    expect(loadRestaurantState().orders.t2.voidRequested).toBe(false);
    expect(loadRestaurantState().orders.t2.voidApprovedBy).toBe("Manager OTP");
    expect(loadRestaurantState().orders.t2.deletedBillLog[0].orderNumber).toBe(10032);
  });

  it("requires manager approval for high discount override", () => {
    render(<App />);

    const discountInput = screen.getAllByPlaceholderText("Enter discount")[0];
    fireEvent.change(discountInput, { target: { value: "25" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Apply Discount" })[0]);

    expect(screen.getByText("Manager/Owner approval pending")).toBeInTheDocument();
    expect(screen.getByText("Unauthorized Action Alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Manager/Owner Approve Discount" }));
    fireEvent.change(screen.getByPlaceholderText("Enter OTP"), { target: { value: "2468" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm OTP Approval" }));

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getAllByText("Manager OTP").length).toBeGreaterThan(0);
  });

  it("rejects invalid otp before approval", () => {
    render(<App />);

    const discountInput = screen.getAllByPlaceholderText("Enter discount")[0];
    fireEvent.change(discountInput, { target: { value: "25" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Apply Discount" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Manager/Owner Approve Discount" }));
    fireEvent.change(screen.getByPlaceholderText("Enter OTP"), { target: { value: "1111" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm OTP Approval" }));

    expect(screen.getByText("Enter valid OTP")).toBeInTheDocument();
    expect(loadRestaurantState().orders.t1.discountOverrideRequested).toBe(true);
  });

  it("locks risky cashier actions after daily closing is approved", () => {
    updateClosingState(() => ({
      approved: true,
      approvedAt: "11:32 PM",
      approvedBy: "Owner",
      status: "Approved and queued"
    }));

    render(<App />);

    expect(screen.getByText("Daily closing approved • Risky cashier actions are locked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply Discount" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request Void" })).toBeDisabled();
  });

  it("applies cashier table setup policy in pos", () => {
    updatePermissionPolicies((current) => ({
      ...current,
      "cashier-table-setup": false
    }));

    render(<App />);

    expect(screen.getByRole("button", { name: "Table Setup Locked" })).toBeDisabled();
  });

  it("shows low-stock menu visibility in pos and keeps out-of-stock items off the quick-pick list", () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: "Biryani" })[0]);
    expect(screen.getByRole("button", { name: /Veg Biryani/i })).toBeInTheDocument();
    expect(screen.getByText("Low Stock")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Butter Naan/i })).not.toBeInTheDocument();
  });
});
