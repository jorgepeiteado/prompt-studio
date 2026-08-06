import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { strings } from "../../lib/strings";
import { Button } from "../ui/button";

export interface RegenerateButtonProps {
  onRegenerate: (keepSeed: boolean) => Promise<void>;
  disabled?: boolean;
}

/**
 * Regenerate control with "mantener semilla" checkbox (design
 * "RegenerateButton('mantener semilla' checkbox)" — POST /api/regenerate with
 * keepSeed, creating a new run and leaving the original untouched).
 */
export function RegenerateButton({ onRegenerate, disabled }: RegenerateButtonProps) {
  const [keepSeed, setKeepSeed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await onRegenerate(keepSeed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={keepSeed}
          onChange={(e) => setKeepSeed(e.target.checked)}
          className="h-4 w-4 accent-[hsl(var(--accent))]"
        />
        {strings.detail.keepSeed}
      </label>
      <Button onClick={handleClick} disabled={disabled || busy}>
        <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
        {busy ? strings.detail.regenerating : strings.detail.regenerate}
      </Button>
    </div>
  );
}