import { strings } from "../../lib/strings";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export interface RunSummaryCardProps {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  variations: number;
  upscale: boolean;
}

/**
 * Derived run summary (design "RunSummaryCard(derived info: count, estimated
 * time — never duplicate controls)"). Shows resolution, parameters and count
 * so the user reviews the job exactly as it will be submitted.
 */
export function RunSummaryCard({
  prompt,
  width,
  height,
  steps,
  cfg,
  sampler,
  variations,
  upscale,
}: RunSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.review.summary}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">{strings.review.prompt}</p>
        <p className="line-clamp-3">{prompt || "—"}</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">{strings.review.resolution}</dt>
          <dd className="text-right font-mono">
            {width}×{height}
            {upscale ? " · 4K" : ""}
          </dd>
          <dt className="text-muted-foreground">{strings.review.parameters}</dt>
          <dd className="text-right font-mono">
            {steps} steps · CFG {cfg} · {sampler}
          </dd>
          <dt className="text-muted-foreground">{strings.variations.label}</dt>
          <dd className="text-right font-mono">{variations}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}