import { create } from "zustand";
import type { RunSummaryDto } from "@promptstudio/shared";

interface GalleryState {
  runs: RunSummaryDto[];
  loading: boolean;
  error: string | null;
  setRuns: (runs: RunSummaryDto[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  removeRun: (runId: string) => void;
  resolveRun: (runId: string) => RunSummaryDto | undefined;
  reset: () => void;
}

const initialState = {
  runs: [] as RunSummaryDto[],
  loading: false,
  error: null,
};

export const useGalleryStore = create<GalleryState>()((set, get) => ({
  ...initialState,
  setRuns: (runs) => set({ runs }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  removeRun: (runId) => set((s) => ({ runs: s.runs.filter((r) => r.id !== runId) })),
  resolveRun: (runId) => get().runs.find((r) => r.id === runId),
  reset: () => set(initialState),
}));