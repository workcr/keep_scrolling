import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { act } from "react";
import { setHoverProject } from "../hoverProject";
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

  it("shows the hovered project after Filters on the home and gallery pages only", () => {
    const home = render(
      <MemoryRouter initialEntries={["/"]}>
        <NavBar />
      </MemoryRouter>
    );
    expect(home.container.querySelector(".nav-hover-project")).toBeNull();
    act(() => setHoverProject("dtms branding"));
    expect(home.container.querySelector(".nav-hover-project").textContent).toBe("DTMS Branding");
    home.unmount();

    const about = render(
      <MemoryRouter initialEntries={["/about"]}>
        <NavBar />
      </MemoryRouter>
    );
    expect(about.container.querySelector(".nav-hover-project")).toBeNull();
    about.unmount();

    const gallery = render(
      <MemoryRouter initialEntries={["/gallery"]}>
        <NavBar />
      </MemoryRouter>
    );
    expect(gallery.container.querySelector(".nav-hover-project").textContent).toBe("DTMS Branding");
    act(() => setHoverProject(null));
  });
});
