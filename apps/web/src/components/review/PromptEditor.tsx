import { useRef, useState } from "react";
import { strings } from "../../lib/strings";
import { Button } from "../ui/button";

export interface PromptEditorProps {
  prompt: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

/**
 * Final-prompt editor. Empty prompt blocks submit and surfaces a validation
 * message (design "PromptEditor(validates empty)" + "Empty prompt blocks
 * submit"). The editor is the mandatory post-interview step.
 */
export function PromptEditor({ prompt, onChange, onSubmit, disabled }: PromptEditorProps) {
  const [showError, setShowError] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (prompt.trim().length === 0) {
      setShowError(true);
      ref.current?.focus();
      return;
    }
    onSubmit();
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="final-prompt" className="text-sm font-medium">
        {strings.review.promptLabel}
      </label>
      <textarea
        ref={ref}
        id="final-prompt"
        value={prompt}
        onChange={(e) => {
          onChange(e.target.value);
          if (e.target.value.trim().length > 0) setShowError(false);
        }}
        disabled={disabled}
        rows={5}
        placeholder={strings.review.promptPlaceholder}
        aria-invalid={showError}
        aria-describedby={showError ? "final-prompt-error" : undefined}
        className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      {showError && (
        <p id="final-prompt-error" role="alert" className="text-sm text-destructive">
          {strings.review.promptRequired}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={disabled}>
          {strings.review.generate}
        </Button>
      </div>
    </div>
  );
}