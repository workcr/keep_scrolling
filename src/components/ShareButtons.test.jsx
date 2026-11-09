import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShareButtons, { shareTargets } from "./ShareButtons";

const props = { url: "https://keep-scrolling.com/project/surf-overdose", title: "Surf Overdose — Rodrigo Mendes", image: "https://keep-scrolling.com/assets/a.webp" };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete navigator.share;
});

describe("ShareButtons", () => {
  it("builds share links with the page address", () => {
    const targets = Object.fromEntries(shareTargets(props).map((t) => [t.name, t.href]));
    expect(Object.keys(targets)).toEqual(["Email", "WhatsApp", "X", "Facebook", "LinkedIn", "Pinterest"]);
    expect(targets.Email).toContain("mailto:?subject=Surf%20Overdose");
    expect(targets.Facebook).toContain(encodeURIComponent(props.url));
    expect(targets.Pinterest).toContain(encodeURIComponent(props.image));
    expect(shareTargets({ ...props, image: undefined }).map((t) => t.name)).not.toContain("Pinterest");
  });

  it("uses the device's share sheet when there is one", async () => {
    navigator.share = vi.fn().mockResolvedValue();
    const { getByText, container } = render(<ShareButtons {...props} />);
    await act(async () => fireEvent.click(getByText("Share")));
    expect(navigator.share).toHaveBeenCalledWith({ title: props.title, url: props.url });
    expect(container.querySelector(".project-share-options")).toBeNull();
  });

  it("shows the options where there's no share sheet, and copies the link", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { getByText, container } = render(<ShareButtons {...props} />);
    await act(async () => fireEvent.click(getByText("Share")));
    expect(container.querySelectorAll(".project-share-options a")).toHaveLength(6);
    await act(async () => fireEvent.click(getByText("Link")));
    expect(writeText).toHaveBeenCalledWith(props.url);
    expect(getByText("Copied")).toBeInTheDocument();
  });
});
