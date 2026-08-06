// @vitest-environment jsdom
/**
 * ProgressView refresh-mid-generation recovery (PR4 W4): after a page reload
 * the view must reconcile against GET /api/generate/:runId so a run that
 * already finished shows its true state instead of frozen "queued" bars.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { api } from "../../lib/api";
import { ProgressView } from "./ProgressView";

beforeEach(() => {
  vi.spyOn(api, "subscribeProgress").mockReturnValue(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProgressView refresh recovery", () => {
  it("reconciles finished variations from the polled run status on mount", async () => {
    vi.spyOn(api, "getGenerateRun").mockResolvedValue({
      status: "completed",
      images: [
        { variationIndex: 0, kind: "base", url: "/a.png" },
        { variationIndex: 1, kind: "base", url: "/b.png" },
      ],
      error: null,
    });

    render(
      <ProgressView
        runId="run-1"
        total={2}
        prompt="foto de estudio"
        onCancel={() => undefined}
        onOpenGallery={() => undefined}
      />,
    );

    // Both bars reach 100 and the gallery CTA appears once every variant is
    // complete — the reloaded view is no longer stuck on queued bars.
    await waitFor(() => {
      expect(screen.getAllByText("Lista")).toHaveLength(2);
    });
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[0]?.getAttribute("aria-valuenow")).toBe("100");
    expect(bars[1]?.getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByRole("button", { name: "Ver en la galería" })).toBeTruthy();
  });

  it("keeps rendering from SSE when the status poll is unavailable", async () => {
    vi.spyOn(api, "getGenerateRun").mockRejectedValue(new Error("502"));
    render(
      <ProgressView
        runId="run-1"
        total={2}
        prompt="foto de estudio"
        onCancel={() => undefined}
        onOpenGallery={() => undefined}
      />,
    );
    // Bars render queued and no gallery link — view is not broken by the poll.
    await waitFor(() => expect(screen.getAllByRole("progressbar")).toHaveLength(2));
    expect(screen.getByText("Cancelar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ver en la galería" })).toBeNull();
  });
});