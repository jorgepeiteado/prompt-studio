import { create } from "zustand";
import { aspectToSize, VARIATIONS_MIN, VARIATIONS_MAX, type AspectRatio } from "@promptstudio/shared";

export type AspectChoice = AspectRatio | "custom";

interface RunState {
  prompt: string;
  negativePrompt: string;
  steps: number;
  cfg: number;
  seed: number;
  sampler: string;
  scheduler: string;
  aspect: AspectChoice;
  width: number;
  height: number;
  variations: number;
  upscale: boolean;
  variationsError: string | null;
  /** Active/current generation run — set while generating, cleared on finish. */
  activeRunId: string | null;
  randomizeSeed: () => void;
  setPrompt: (value: string) => void;
  setNegativePrompt: (value: string) => void;
  setNumber: (key: "steps" | "cfg" | "seed" | "width" | "height" | "variations", value: number) => void;
  setString: (key: "sampler" | "scheduler", value: string) => void;
  setAspect: (aspect: AspectChoice) => void;
  setVariations: (n: number) => void;
  setActiveRunId: (id: string | null) => void;
  setUpscale: (v: boolean) => void;
  reset: () => void;
}

const initialState = {
  prompt: "",
  negativePrompt: "",
  steps: 20,
  cfg: 2.5,
  seed: Math.floor(Math.random() * 1_000_000),
  sampler: "euler",
  scheduler: "simple",
  aspect: "1:1" as AspectChoice,
  width: 1024,
  height: 1024,
  variations: 4,
  upscale: false,
  variationsError: null,
  activeRunId: null,
};

function validateVariations(n: number): string | null {
  if (n < VARIATIONS_MIN || n > VARIATIONS_MAX) return `Variations must be between ${VARIATIONS_MIN} and ${VARIATIONS_MAX}.`;
  return null;
}

export const useRunStore = create<RunState>()((set) => ({
  ...initialState,
  randomizeSeed: () => set({ seed: Math.floor(Math.random() * 1_000_000) }),
  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setNumber: (key, value) => {
    if (key === "variations") {
      set({ variations: value, variationsError: validateVariations(value) });
      return;
    }
    set({ [key]: value } as Pick<RunState, typeof key>);
  },
  setString: (key, value) => set({ [key]: value } as Pick<RunState, typeof key>),
  setAspect: (aspect) =>
    set(() => {
      if (aspect === "custom") return { aspect };
      const size = aspectToSize(aspect);
      return { aspect, width: size.width, height: size.height };
    }),
  setVariations: (n) => set({ variations: n, variationsError: validateVariations(n) }),
  setActiveRunId: (activeRunId) => set({ activeRunId }),
  setUpscale: (upscale) => set({ upscale }),
  reset: () => set(initialState),
}));