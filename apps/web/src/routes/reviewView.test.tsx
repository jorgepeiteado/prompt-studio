// @vitest-environment jsdom
/**
 * ReviewView regenerate-restore test (PR4 W1 "regenerate ?from= ignored").
 * Navigating to /review?from=<runId> must show the run's live ProgressView
 * (prefilled from the run detail) instead of the empty editor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { RunDetailDto } from "@promptstudio/shared";
import { api } from "../lib/api";
import { strings } from "../lib/strings";
import { useRunStore } from "../stores/runStore";
import { ReviewView } from "./ReviewView";

const RUN: RunDetailDto = {
  id: "run-abc",
  createdAt: new Date().toISOString(),
  status: "running",
  prompt: "foto de estudio, luz suave",
  negativePrompt: null,
  params: {
    seed: 7,
    steps: 30,
    cfg: 4,
    samplerName: "dpmpp_2m",
    scheduler: "karras",
    width: 1024,
    height: 1024,
  },
  seeds: [7, 8, 9],
  promptIds: ["p1", "p2", "p3"],
  chat: [],
  images: [],
  error: null,
};

beforeEach(() => {
  useRunStore.setState(useRunStore.getInitialState(), true);
  window.sessionStorage.clear();
  vi.spyOn(api, "getRunDetail").mockResolvedValue(RUN);
  // The view's SSE subscription would open an EventSource; keep it inert here.
  vi.spyOn(api, "subscribeProgress").mockReturnValue(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReviewView with ?from=", () => {
  it("shows the ProgressView for the regenerated run, prefilled from its detail", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/review", search: "?from=run-abc" }]}>
        <ReviewView />
      </MemoryRouter>,
    );

    // ProgressView appears (not the empty editor) …
    expect(await screen.findByText(strings.progress.title)).toBeTruthy();
    // … with the run's prompt visible and one bar per variation (3 seeds).
    expect(screen.getByText(RUN.prompt)).toBeTruthy();
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);

    // The store reflects the prefilled editor state for later reuse.
    const s = useRunStore.getState();
    expect(s.prompt).toBe(RUN.prompt);
    expect(s.variations).toBe(3);
    expect(s.seed).toBe(7);
    expect(s.activeRunId).toBe("run-abc");
    expect(window.sessionStorage.getItem("prompt-studio-active-run")).toBe("run-abc");
  });

  it("falls back to the editor when the run detail cannot be fetched", async () => {
    vi.spyOn(api, "getRunDetail").mockRejectedValueOnce(new Error("404"));
    render(
      <MemoryRouter initialEntries={[{ pathname: "/review", search: "?from=missing" }]}>
        <ReviewView />
      </MemoryRouter>,
    );
    // No progress view; the review editor (title) renders instead.
    expect(await screen.findByText(strings.review.title)).toBeTruthy();
    expect(useRunStore.getState().activeRunId).toBeNull();
  });
});