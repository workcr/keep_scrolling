import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MediaCard from "./MediaCard";

function renderVideo() {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const view = render(
    <MediaCard src="https://x.r2.dev/videos/a.mp4" data-media-type="video" videoInteraction="hover" alt="clip" />
  );
  return { video: view.container.querySelector("video"), container: view.container.querySelector(".video-container"), play };
}

function setActivation(hasBeenActive) {
  Object.defineProperty(navigator, "userActivation", { value: { hasBeenActive }, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete navigator.userActivation;
});

describe("MediaCard hover sound", () => {
  it("keeps the video muted and playing before the visitor has interacted", () => {
    setActivation(false);
    const { video, container, play } = renderVideo();
    fireEvent.mouseEnter(container);
    expect(video.muted).toBe(true);
    expect(play).toHaveBeenCalled();
  });

  it("unmutes on hover after the visitor has interacted, and re-mutes on leave", () => {
    setActivation(true);
    const { video, container } = renderVideo();
    fireEvent.mouseEnter(container);
    expect(video.muted).toBe(false);
    fireEvent.mouseLeave(container);
    expect(video.muted).toBe(true);
  });

  it("falls back to muted playback if the browser refuses sound", async () => {
    setActivation(true);
    const { video, container, play } = renderVideo();
    play.mockImplementationOnce(() => Promise.reject(new DOMException("blocked", "NotAllowedError")));
    await act(async () => {
      fireEvent.mouseEnter(container);
    });
    expect(video.muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
  });
});
