/**
 * Theme resolution logic (pure — testable without DOM).
 *
 * ThemeProvider contract: class strategy on <html>, persisted in localStorage,
 * system preference as default. These pure helpers keep the provider thin.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "prompt-studio-theme";

/**
 * Resolves the initial theme. `stored` is the raw localStorage value (or
 * null/undefined when absent); `systemPrefersDark` is the live media query.
 */
export function resolveInitialTheme(
  stored: string | null | undefined,
  systemPrefersDark: () => boolean,
): Theme {
  if (stored === "dark" || stored === "light") return stored;
  return systemPrefersDark() ? "dark" : "light";
}

/** Cycles dark -> light -> dark for the toggle. */
export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}