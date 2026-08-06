import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../theme/ThemeProvider";
import { strings } from "../../lib/strings";
import { Button } from "../ui/button";

/** Theme toggle — icon + text label (never color-only signal). */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = strings.theme.toggleLabel;
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      <span className="hidden sm:inline">{theme === "dark" ? strings.theme.light : strings.theme.dark}</span>
    </Button>
  );
}