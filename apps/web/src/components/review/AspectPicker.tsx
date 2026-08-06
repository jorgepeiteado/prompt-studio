import { strings } from "../../lib/strings";
import { cn } from "../../lib/utils";

export interface AspectPickerProps {
  value: "1:1" | "4:5" | "3:2" | "16:9" | "9:16" | "custom";
  width: number;
  height: number;
  onPreset: (aspect: "1:1" | "4:5" | "3:2" | "16:9" | "9:16") => void;
  onCustom: (width: number, height: number) => void;
}

const PRESETS: Array<{ key: "1:1" | "4:5" | "3:2" | "16:9" | "9:16"; label: string }> = [
  { key: "1:1", label: "1:1 · Cuadrado" },
  { key: "4:5", label: "4:5 · Vertical" },
  { key: "3:2", label: "3:2 · Horizontal" },
  { key: "16:9", label: "16:9 · Panorámica" },
  { key: "9:16", label: "9:16 · Historia" },
];

/**
 * Aspect picker: 5 preset buttons + a custom-resolution form (design
 * "AspectPicker(5 preset+custom radiogroup; uses aspectToSize from shared)").
 * Selecting a preset updates the run store resolution via aspectToSize.
 */
export function AspectPicker({ value, width, height, onPreset, onCustom }: AspectPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {strings.aspect.label}
        </legend>
        <div role="radiogroup" aria-label={strings.aspect.label} className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const selected = value === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onPreset(p.key)}
                className={cn(
                  "inline-flex min-h-[44px] items-center rounded-md border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-accent bg-accent/10 font-medium text-accent" : "border-border bg-surface hover:bg-surface/80",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={value === "custom"}
          onClick={() => onCustom(width, height)}
          className={cn(
            "inline-flex min-h-[44px] items-center rounded-md border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === "custom" ? "border-accent bg-accent/10 font-medium text-accent" : "border-border bg-surface",
          )}
        >
          {strings.aspect.custom}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <span>{strings.aspect.width}</span>
          <input
            type="number"
            aria-label={strings.aspect.width}
            value={width}
            min={256}
            step={64}
            onChange={(e) => onCustom(Number(e.target.value) || width, height)}
            className="h-[44px] w-24 rounded-md border border-input bg-background px-2 text-right text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span>{strings.aspect.height}</span>
          <input
            type="number"
            aria-label={strings.aspect.height}
            value={height}
            min={256}
            step={64}
            onChange={(e) => onCustom(width, Number(e.target.value) || height)}
            className="h-[44px] w-24 rounded-md border border-input bg-background px-2 text-right text-sm"
          />
        </label>
      </div>
    </div>
  );
}