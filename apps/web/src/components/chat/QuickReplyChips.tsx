import { useRef, useState, type KeyboardEvent } from "react";

export interface QuickReplyChipsProps {
  label: string;
  options: string[];
  onSelect: (value: string) => void;
  /** Disabled until the LLM is ready (chips send messages). */
  disabled?: boolean;
}

/**
 * Quick-reply chips for the 4 interview axes (subject / clothing / lighting /
 * style). Semantics: a single-select radiogroup with **roving tabindex** and
 * arrow-key navigation (design "QuickReplyChips(radiogroup + roving tabindex
 * + arrows)"). Selecting a chip calls `onSelect(value)`.
 */
export function QuickReplyChips({ label, options, onSelect, disabled }: QuickReplyChipsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function focusIndex(i: number) {
    const clamped = (i + options.length) % options.length;
    setActiveIndex(clamped);
    buttons.current[clamped]?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusIndex(i + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusIndex(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusIndex(options.length - 1);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={`chips-${label}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`chips-${label}`} className="flex flex-wrap gap-2">
        {options.map((option, i) => (
          <button
            key={option}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={activeIndex === i}
            tabIndex={activeIndex === i ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              setActiveIndex(i);
              onSelect(option);
            }}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className="min-h-[44px] rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}