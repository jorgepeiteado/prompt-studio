import { useEffect, useState } from "react";
import { CircleDot, Dot, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import { strings } from "../../lib/strings";
import { cn } from "../../lib/utils";

export type LlmPillState = "checking" | "ready" | "starting" | "offline";

interface LlmStatusPillProps {
  /** Tells the header pill to re-check readiness (e.g. after a chat unmount). */
  refreshKey?: number;
}

/**
 * Header "Motor de IA" status pill (design "Header LLM status pill (from
 * /api/health)"). Never color-only: icon + text label per state.
 */
export function LlmStatusPill({ refreshKey = 0 }: LlmStatusPillProps) {
  const [state, setState] = useState<LlmPillState>("checking");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const status = await api.getLlmStatus();
        if (cancelled) return;
        setState(status.ready ? "ready" : status.adopted ? "ready" : "starting");
      } catch {
        if (cancelled) return;
        setState("offline");
      }
    }
    void check();
    const id = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshKey]);

  const config: Record<LlmPillState, { Icon: typeof Loader2; text: string; className: string }> = {
    checking: { Icon: CircleDot, text: "…", className: "text-muted-foreground" },
    ready: { Icon: Dot, text: strings.llm.ready, className: "text-success" },
    starting: { Icon: Loader2, text: strings.llm.starting, className: "text-muted-foreground animate-spin" },
    offline: { Icon: CircleDot, text: strings.llm.offline, className: "text-destructive" },
  };
  const { Icon, text, className } = config[state];

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium"
      title={strings.llm.status}
    >
      <Icon className={cn("h-4 w-4", state === "starting" && "animate-spin")} aria-hidden="true" />
      <span className="hidden md:inline">{strings.llm.status}:</span>
      <span className={className}>{text}</span>
    </div>
  );
}