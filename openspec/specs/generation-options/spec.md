# Generation Options Specification

## Purpose

Controls for generation parameters, aspect-ratio presets mapped to latent resolution, and multi-seed variations from a single interview; optional img2img, off by default.

## Requirements

### Requirement: Parameter Set

The system MUST expose editable parameters: seed, steps, cfg, and resolution (latent width/height). Template defaults: steps 20, cfg 2.5, sampler `euler`, scheduler `simple`, seed randomized per run.

#### Scenario: Default values

- GIVEN the options panel opens for a new run
- WHEN the user inspects the fields
- THEN seed is randomized, steps = 20, cfg = 2.5, sampler = euler, scheduler = simple

#### Scenario: Parameter override

- GIVEN the user sets steps = 30 and cfg = 4.0
- WHEN the run is submitted
- THEN the KSampler payload uses the overridden values

### Requirement: Aspect Presets

The system MUST provide presets sized by a 1024 long side: 1:1 → 1024×1024, 4:5 → 1024×1280, 3:2 → 1024×683, 16:9 → 1024×576, 9:16 → 576×1024. Preset selection MUST set the latent width/height in node 8.

#### Scenario: Preset mapping

- GIVEN the user selects preset 4:5
- WHEN the run is submitted
- THEN node 8 width = 1024 and height = 1280

#### Scenario: Custom resolution

- GIVEN the user enters a custom resolution not matching any preset
- WHEN the run is submitted
- THEN width/height are used as entered

### Requirement: Variations (Multi-Seed)

One interview MUST generate N variations with distinct seeds. Default N = 4, configurable 1–8. Each variation MUST use a different seed while sharing prompt and other parameters.

#### Scenario: Default variation count

- GIVEN the user submits a run without touching variation count
- WHEN the run completes
- THEN exactly 4 images with 4 distinct seeds are produced

#### Scenario: Variation count bounds

- GIVEN the user sets variation count to 9
- WHEN the run is submitted
- THEN submission is blocked (1–8 required)
- AND a validation message is shown

### Requirement: img2img (Optional)

img2img MUST be OFF by default. When enabled, the system MUST include the img2img branch (denoise 0.45, source image, KSampler) and use it for the run; the photorealistic text branch remains the default.

#### Scenario: Default off

- GIVEN the user opens a new run
- WHEN the img2img toggle is inspected
- THEN it is OFF and the run uses the text-to-image branch

#### Scenario: Enabled with source image

- GIVEN the user enables img2img and provides a source image
- WHEN the run is submitted
- THEN the payload includes the img2img branch with denoise 0.45 and the source image

### Requirement: Variation Summary

The system MUST show the pending run summary (prompt, resolution, parameters, variation count) before submission.

#### Scenario: Review before submit

- GIVEN the user has configured options
- WHEN the submit panel renders
- THEN it shows prompt, resolution, parameters, and variation count for confirmation
