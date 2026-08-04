# Interview Assistant Specification

## Purpose

Interactive "director fotografico" chat that interviews the user in Spanish, recommends choices when asked, and produces a final photorealistic prompt in English that the user can always edit before generation.

## Requirements

### Requirement: Director Chat (Interview-First)

The system MUST host a multi-turn chat with the director LLM using `director_fotografico.txt` **verbatim** as system prompt. On a raw or vague idea, the LLM MUST reply in Spanish with 3–5 concrete questions covering only the missing axes — subject, clothing/styling, lighting/mood, art style — and MUST NOT re-ask axes the user already answered.

#### Scenario: Vague first idea

- GIVEN a user sends a raw idea ("una chica en un bosque")
- WHEN the chat forwards it to the LLM
- THEN the reply is in Spanish with 3–5 questions covering only the missing axes
- AND no already-answered axis is re-asked

#### Scenario: Complete brief in one message

- GIVEN the user answers all four axes in a single message
- WHEN the reply is generated
- THEN the LLM skips questions and produces the final prompt directly

### Requirement: Quick-Reply Chips

The system SHOULD render one-tap quick-reply chips for the four interview axes. Tapping a chip MUST send its suggestion as the user's message.

#### Scenario: Chip tap

- GIVEN the chat is awaiting user input
- WHEN the user taps the "lighting/mood" chip
- THEN the chip's suggestion is sent as a user message and the LLM replies

### Requirement: Recommend When Asked

On expressions like "no sé", "tirá vos", "recommend me", or "vos decidí", the LLM MUST choose coherent professional choices, state them in one line, and proceed without further questions.

#### Scenario: User defers choice

- GIVEN the user answers "no sé, decidí vos"
- WHEN the LLM reply is generated
- THEN it states one-line professional choices and proceeds to the next step

### Requirement: Final Prompt Generation

The system MUST detect the LLM's final prompt: English, one paragraph, comma-separated descriptive clauses, 60–160 words, no filler words (masterpiece / 8k / ultra detailed forbidden). A complete English prompt pasted by the user ("usá este") MUST pass through unchanged.

#### Scenario: LLM produces final prompt

- GIVEN the interview axes are fully answered
- WHEN the LLM outputs the final prompt
- THEN the app detects it and shows it as the editable final prompt
- AND it is English, one paragraph, 60–160 words, comma-separated clauses

#### Scenario: User pastes complete prompt

- GIVEN the user pastes a complete English prompt with "usá este"
- WHEN the LLM reply is generated
- THEN the pasted prompt is returned unchanged as the final prompt

### Requirement: Always-Editable Final Prompt

The system MUST render the final prompt in an editable text area before submit. The user's edited text MUST be the prompt used for generation. An empty final prompt MUST block submission.

#### Scenario: Edit before submit

- GIVEN the final prompt is displayed
- WHEN the user edits the text and submits
- THEN generation uses the edited text

#### Scenario: Empty edit

- GIVEN the user deletes the entire final prompt
- WHEN the user tries to submit
- THEN submission is blocked with a validation message

### Requirement: Spanish UI (v1)

UI copy MUST be in Spanish (Argentina register) for v1. Technical identifiers (node names, file names, code) MUST be in English. Internationalization (es/en) is deferred to v2/v3.

#### Scenario: UI language check

- GIVEN a user opens the app
- WHEN inspecting any visible UI label
- THEN the label is in Spanish (Argentina register)
- AND technical identifiers in the DOM/code remain English
