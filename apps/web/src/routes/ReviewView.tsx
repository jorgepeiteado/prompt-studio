import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, messageForError } from "../lib/api";
import { strings } from "../lib/strings";
import { useRunStore } from "../stores/runStore";
import { PromptEditor } from "../components/review/PromptEditor";
import { OptionsPanel } from "../components/review/OptionsPanel";
import { AspectPicker } from "../components/review/AspectPicker";
import { VariationSlider } from "../components/review/VariationSlider";
import { RunSummaryCard } from "../components/review/RunSummaryCard";
import { ProgressView } from "../components/progress/ProgressView";
import { Card, CardContent } from "../components/ui/card";

const ACTIVE_RUN_KEY = "prompt-studio-active-run";

/**
 * Review / edit view (design "mandatory step"). Empty prompt blocks submit;
 * generation options map onto POST /api/generate (upscale optional, OFF by
 * default). On success the active run is tracked (sessionStorage-persisted so
 * a refresh restores the ProgressView — "refresh-mid-generation recovery").
 */
export function ReviewView() {
  const navigate = useNavigate();
  const run = useRunStore();
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Refresh-mid-generation recovery: restore an active run on mount.
  useEffect(() => {
    const active = window.sessionStorage.getItem(ACTIVE_RUN_KEY);
    if (active && !run.activeRunId) run.setActiveRunId(active);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (run.prompt.trim().length === 0) return;
    setError(null);
    setGenerating(true);
    try {
      const result = await api.postGenerate({
        prompt: run.prompt,
        negativePrompt: run.negativePrompt || undefined,
        seed: run.seed,
        steps: run.steps,
        cfg: run.cfg,
        sampler: run.sampler,
        scheduler: run.scheduler,
        width: run.width,
        height: run.height,
        aspect: run.aspect === "custom" ? undefined : run.aspect,
        variations: run.variations,
        upscale: run.upscale,
      });
      run.setActiveRunId(result.runId);
      window.sessionStorage.setItem(ACTIVE_RUN_KEY, result.runId);
      setGenerating(false);
    } catch (err) {
      setError(messageForError(err));
      setGenerating(false);
    }
  }, [run]);

  const handleCancel = useCallback(() => {
    run.setActiveRunId(null);
    window.sessionStorage.removeItem(ACTIVE_RUN_KEY);
  }, [run]);

  const handleOpenGallery = useCallback(() => {
    run.setActiveRunId(null);
    window.sessionStorage.removeItem(ACTIVE_RUN_KEY);
    navigate("/gallery");
  }, [run, navigate]);

  if (run.activeRunId) {
    return (
      <ProgressView
        runId={run.activeRunId}
        total={run.variations}
        prompt={run.prompt || strings.review.emptyHint}
        onCancel={handleCancel}
        onOpenGallery={handleOpenGallery}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="font-display text-2xl">{strings.review.title}</h1>
          <p className="text-sm text-muted-foreground">{strings.chat.englishHint}</p>
        </header>

        {run.prompt.trim().length === 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="font-display text-lg">{strings.review.emptyTitle}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{strings.review.emptyHint}</p>
            </CardContent>
          </Card>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <Card>
          <CardContent className="flex flex-col gap-6 p-6">
            <PromptEditor
              prompt={run.prompt}
              onChange={run.setPrompt}
              onSubmit={() => void handleGenerate()}
              disabled={generating}
            />
            <OptionsPanel
              steps={run.steps}
              cfg={run.cfg}
              seed={run.seed}
              sampler={run.sampler}
              scheduler={run.scheduler}
              upscale={run.upscale}
              onSteps={(v) => run.setNumber("steps", v)}
              onCfg={(v) => run.setNumber("cfg", v)}
              onSeed={(v) => run.setNumber("seed", v)}
              onRandomizeSeed={run.randomizeSeed}
              onSampler={(v) => run.setString("sampler", v)}
              onScheduler={(v) => run.setString("scheduler", v)}
              onUpscale={run.setUpscale}
            />
            <AspectPicker
              value={run.aspect}
              width={run.width}
              height={run.height}
              onPreset={run.setAspect}
              onCustom={(w, h) => {
                run.setAspect("custom");
                run.setNumber("width", w);
                run.setNumber("height", h);
              }}
            />
            <VariationSlider
              value={run.variations}
              min={1}
              max={8}
              onChange={run.setVariations}
              error={run.variationsError ? "tooMany" : null}
            />
          </CardContent>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <RunSummaryCard
          prompt={run.prompt}
          width={run.width}
          height={run.height}
          steps={run.steps}
          cfg={run.cfg}
          sampler={run.sampler}
          variations={run.variations}
          upscale={run.upscale}
        />
      </aside>
    </div>
  );
}