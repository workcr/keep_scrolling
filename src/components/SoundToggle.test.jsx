import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SoundToggle from "./SoundToggle";
import { isSoundEnabled, setSoundEnabled } from "../soundPreference";

afterEach(() => act(() => setSoundEnabled(false)));

describe("SoundToggle", () => {
  it("starts off and toggles hover sound", () => {
    render(<SoundToggle />);
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Sound on");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(isSoundEnabled()).toBe(true);
    expect(button.textContent).toBe("Sound off");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(isSoundEnabled()).toBe(false);
  });
});
