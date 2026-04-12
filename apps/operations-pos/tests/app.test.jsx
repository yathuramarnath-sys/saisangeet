import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../src/App";

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
    fireEvent.change(discountInput, { target: { value: "25" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Apply Discount" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Enable Service Charge" })[0]);

    expect(screen.getAllByText("Rs 25.00").length).toBeGreaterThan(0);
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

    fireEvent.change(screen.getAllByDisplayValue("Wrong table")[0], { target: { value: "Duplicate bill" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Request Void" })[0]);

    fireEvent.click(screen.getAllByRole("button", { name: "Manager Approve Void" })[0]);
    expect(screen.getAllByText("Manager Placeholder").length).toBeGreaterThan(0);
  });
});
