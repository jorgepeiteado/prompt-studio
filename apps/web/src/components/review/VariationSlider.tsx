import { strings } from "../../lib/strings";
import { cn } from "../../lib/utils";

export interface VariationSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  error: string | null;
}

/**
 * Variations 1–8 via a native `input[type=range]` (design "touch ≥44px, rem
 * typography"). Values above the max are **blocked**: the store rejects them
 * and surfaces `variations.tooMany` (design "9 blocked with message").
 */
export function VariationSlider({ value, min, max, onChange, error }: VariationSliderProps) {
  const outOfRange = value > max;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label htmlFor="variations" className="text-sm font-medium">
          {strings.variations.label}
        </label>
        <output
          htmlFor="variations"
          className={cn("font-mono text-sm", outOfRange ? "text-destructive" : "text-muted-foreground")}
        >
          {outOfRange ? `> ${max}` : String(value)}
        </output>
      </div>
      <input
        id="variations"
        type="range"
        value={Math.min(value, max)}
        min={min}
        max={max}
        step={1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-[hsl(var(--accent))]"
      />
      <p
        id="variations-hint"
        className="text-xs text-muted-foreground"
      >
        {strings.variations.hint}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error === "tooMany" ? strings.variations.tooMany : error}
        </p>
      )}
    </div>
  );
}