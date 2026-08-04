/**
 * Detects whether an assistant reply is the FINAL prompt (ready for generation)
 * or still part of the interview.
 *
 * Contract (interview-assistant spec):
 * - Spanish interview questions → false (they contain "?" and/or Spanish
 *   interrogatives such as qué / cuál / cómo / dónde / cuándo).
 * - A complete English paragraph prompt (≥ 60 words per spec) → true.
 * - A pasted complete English prompt ("usá este: …") passes through → true.
 */

/** Minimum words for a final prompt per the interview-assistant spec (60–160). */
export const MIN_FINAL_PROMPT_WORDS = 60;

const SPANISH_INTERROGATIVE =
  /\b(?:por qué|qué|cuál|cuáles|cómo|dónde|cuándo|quién|quiénes|cuánto|cuántos|cuánta|cuántas)\b/iu;

const ES_STOP = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "en",
  "y", "e", "o", "u", "a", "al", "con", "por", "para", "sin", "sobre",
  "entre", "hasta", "desde", "hacia", "que", "lo", "le", "se", "su", "sus",
  "mi", "tu", "mis", "tus", "es", "son", "era", "estaba", "está", "están",
  "esto", "esta", "este", "estos", "estas", "esos", "esas", "ese", "esa",
  "ya", "no", "si", "pero", "más", "muy", "también", "ni", "nos", "os",
]);

const EN_STOP = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "of", "to", "for",
  "with", "by", "from", "is", "are", "was", "were", "be", "been", "it", "its",
  "this", "that", "these", "those", "as", "he", "she", "they", "we", "you",
  "i", "his", "her", "their", "our", "your", "my", "me", "him", "them", "us",
  "have", "has", "had", "do", "does", "did", "not", "so", "if", "then",
  "than", "too", "very", "can", "will", "would", "should", "could", "may",
  "might", "about", "into", "over", "after", "before", "between", "under",
  "through", "during", "within", "without", "across",
]);

/**
 * Returns true when the text looks like the final English prompt, false when
 * it is still an interview exchange.
 */
export function detectFinalPrompt(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Interview replies ask questions in Spanish.
  if (trimmed.includes("?") || SPANISH_INTERROGATIVE.test(trimmed)) return false;

  const words = trimmed.toLowerCase().match(/[a-zà-ÿ]+/gu) ?? [];
  if (words.length < MIN_FINAL_PROMPT_WORDS) return false;

  // Language dominance via stopwords: English prompts lean on English
  // stopwords and contain almost no Spanish ones; Spanish prose is the
  // opposite. A Spanish-dominant long reply is not a final prompt.
  let spanish = 0;
  let english = 0;
  for (const word of words) {
    if (ES_STOP.has(word)) spanish++;
    else if (EN_STOP.has(word)) english++;
  }
  return spanish <= english;
}
