import { useState } from "react";
import { ChevronDown, Dices } from "lucide-react";
import { strings } from "../../lib/strings";
import { cn } from "../../lib/utils";
import { Switch } from "../ui/switch";

export interface OptionsPanelProps {
  steps: number;
  cfg: number;
  seed: number;
  sampler: string;
  scheduler: string;
  upscale: boolean;
  onSteps: (v: number) => void;
  onCfg: (v: number) => void;
  onSeed: (v: number) => void;
  onRandomizeSeed: () => void;
  onSampler: (v: string) => void;
  onScheduler: (v: string) => void;
  onUpscale: (v: boolean) => void;
}

const SAMPLERS = ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_2m_sde", "uni_pc"];
const SCHEDULERS = ["simple", "karras", "exponential", "normal"];

/**
 * Generation options. Steps + CFG are always visible; sampler/scheduler/seed
 * collapse under "Avanzado" (design "defaults collapsed under 'Avanzado'");
 * the HD/4K upscale switch maps to `upscale: true` in the POST body and is OFF
 * by default (task 2.5 + design "explicit optional upscale toggle").
 */
export function OptionsPanel({
  steps,
  cfg,
  seed,
  sampler,
  scheduler,
  upscale,
  onSteps,
  onCfg,
  onSeed,
  onRandomizeSeed,
  onSampler,
  onScheduler,
  onUpscale,
}: OptionsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <legend className="sr-only">{strings.options.title}</legend>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>{strings.options.steps}</span>
          <input
            type="number"
            value={steps}
            min={1}
            max={100}
            onChange={(e) => onSteps(Number(e.target.value) || 1)}
            className="h-[44px] rounded-md border border-input bg-background px-3 font-mono text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{strings.options.cfg}</span>
          <input
            type="number"
            value={cfg}
            min={0.5}
            max={30}
            step={0.5}
            onChange={(e) => onCfg(Number(e.target.value) || 0.5)}
            className="h-[44px] rounded-md border border-input bg-background px-3 font-mono text-sm"
          />
        </label>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">
          {strings.options.upscale}
          <span className="font-mono text-xs text-muted-foreground">4K</span>
        </span>
        <Switch checked={upscale} onCheckedChange={onUpscale} aria-label={strings.options.upscale} />
      </label>

      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex min-h-[44px] w-full items-center justify-between rounded-md text-sm font-medium transition-colors hover:bg-surface/80"
        >
          {strings.options.advanced}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        <p className="text-xs text-muted-foreground">{strings.options.advancedHint}</p>
        {open && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>{strings.options.seed}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => onSeed(Number(e.target.value) || 0)}
                  className="h-[44px] w-full rounded-md border border-input bg-background px-3 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={onRandomizeSeed}
                  title={strings.options.randomize}
                  aria-label={strings.options.randomize}
                  className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md border border-border transition-colors hover:bg-surface/80"
                >
                  <Dices className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{strings.options.sampler}</span>
              <select
                value={sampler}
                onChange={(e) => onSampler(e.target.value)}
                className="h-[44px] rounded-md border border-input bg-background px-2 font-mono text-sm"
              >
                {SAMPLERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{strings.options.scheduler}</span>
              <select
                value={scheduler}
                onChange={(e) => onScheduler(e.target.value)}
                className="h-[44px] rounded-md border border-input bg-background px-2 font-mono text-sm"
              >
                {SCHEDULERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
    </fieldset>
  );
}