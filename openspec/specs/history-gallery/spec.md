# History Gallery Specification

## Purpose

Persistent local history: images stored on disk, metadata in SQLite, with a gallery to browse, compare, and regenerate runs from edited prompt/parameters.

## Requirements

### Requirement: Persistence (Disk + SQLite)

Generated images MUST be stored on disk inside the app data folder. SQLite (better-sqlite3) MUST store metadata only: prompt, parameters, resolution, seeds, status, timestamps, and file paths — never image bytes.

#### Scenario: Run persisted

- GIVEN a run completes with 4 images
- WHEN the app saves the run
- THEN 4 image files exist on disk and one metadata row references their paths

#### Scenario: Image bytes not in DB

- GIVEN a persisted run
- WHEN the database is inspected
- THEN no image binary data is stored, only metadata and paths

### Requirement: Gallery Listing

The system MUST list runs chronologically with prompt excerpt, parameters, thumbnail, and status.

#### Scenario: Recent run visible

- GIVEN at least one persisted run
- WHEN the gallery loads
- THEN the newest run appears first with thumbnail, prompt excerpt, and status

#### Scenario: Empty gallery

- GIVEN no runs exist yet
- WHEN the gallery loads
- THEN an empty-state message is shown

### Requirement: Compare Runs

The system MUST allow side-by-side comparison of two or more images with their metadata.

#### Scenario: Compare two images

- GIVEN the user selects two images from the gallery
- WHEN the user clicks compare
- THEN both images render side by side with their prompts and parameters

### Requirement: Regenerate from History

The system MUST allow regenerating any history entry with edited prompt and/or parameters. Regeneration MUST create a NEW run (new seeds, new prompt_id) and MUST NOT overwrite the original entry.

#### Scenario: Regenerate with edited prompt

- GIVEN a completed history entry
- WHEN the user edits the prompt and clicks regenerate
- THEN a new run is submitted with the edited prompt
- AND the original entry remains unchanged

#### Scenario: Regenerate with edited parameters

- GIVEN a completed history entry
- WHEN the user changes steps/cfg/resolution and clicks regenerate
- THEN the new run uses the edited parameters and produces a new gallery entry

### Requirement: Conversation Persistence

The system MUST store the interview chat belonging to each run so history entries remain reproducible and inspectable.

#### Scenario: Chat replay

- GIVEN a persisted run with an interview
- WHEN the user opens the run detail
- THEN the original chat messages and final prompt are shown

### Requirement: Deletion

The system MUST allow deleting a run, removing its metadata row and its image files from disk.

#### Scenario: Delete run

- GIVEN a persisted run
- WHEN the user deletes it
- THEN the metadata row is removed and its image files are deleted from disk
