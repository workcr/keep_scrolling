import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import NavBar from "./NavBar";

describe("NavBar", () => {
  it("renders top-level navigation links", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <NavBar />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "R–––M" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gallery" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About" })).toBeInTheDocument();
  });

  it("shows active filter pill from query params", () => {
    render(
      <MemoryRouter initialEntries={["/gallery?client=Acme"]}>
        <NavBar />
      </MemoryRouter>
    );

    expect(screen.getAllByRole("button", { name: /acme/i })).toHaveLength(2);
  });
});
