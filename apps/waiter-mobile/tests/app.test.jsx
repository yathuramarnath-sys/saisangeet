import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "../src/App";

afterEach(() => {
  cleanup();
});

describe("waiter mobile app", () => {
  it("renders the shared waiter and captain mobile flow", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Waiter and Captain" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Captain" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waiter" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Quick Add" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send KOT" })).toBeInTheDocument();
  });

  it("lets staff switch role, change table, add item, add instruction, and send KOT", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Waiter" }));
    expect(screen.getByText("Waiter mode active")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("T2")[0]);
    expect(screen.getByText("Working on T2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mains" }));
    fireEvent.click(screen.getByRole("button", { name: /Veg Biryani/i }));
    expect(screen.getAllByText("Veg Biryani").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "No garlic" }));
    expect(screen.getAllByText("No garlic").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Send KOT" }));
    expect(screen.getByText("KOT sent")).toBeInTheDocument();
  });

  it("lets the mobile user request bill from the table screen", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Request Bill" }));
    expect(screen.getByText("Bill requested for cashier")).toBeInTheDocument();
  });
});
