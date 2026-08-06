import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { nextTheme, resolveInitialTheme, THEME_STORAGE_KEY, type Theme } from "./theme-logic";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Minimal theme provider: class strategy on <html>, persisted in localStorage,
 * defaults to the system preference. No next-themes dependency (design.md).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    resolveInitialTheme(readStored(), () => {
      return (
        typeof window !== "undefined" &&
        (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false)
      );
    }),
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable — theme still applies in-session */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => nextTheme(t)), []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>.");
  return ctx;
}