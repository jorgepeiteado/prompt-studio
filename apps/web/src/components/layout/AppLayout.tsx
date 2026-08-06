import { Outlet, NavLink } from "react-router-dom";
import { Camera } from "lucide-react";
import { strings } from "../../lib/strings";
import { ThemeToggle } from "./ThemeToggle";
import { LlmStatusPill } from "./LlmStatusPill";
import { cn } from "../../lib/utils";

function Nav() {
  const items = [
    { to: "/", label: strings.nav.studio, end: true },
    { to: "/gallery", label: strings.nav.gallery, end: false },
  ];
  return (
    <nav aria-label="Principal" className="flex items-center gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[44px] inline-flex items-center",
              isActive ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <NavLink to="/" className="flex items-center gap-2" aria-label={strings.app.name}>
            <Camera className="h-5 w-5 text-accent" aria-hidden="true" />
            <span className="font-display text-lg font-semibold tracking-tight">
              {strings.app.name}
            </span>
          </NavLink>
          <Nav />
        </div>
        <div className="flex items-center gap-3">
          <LlmStatusPill />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** Shared shell: header + route outlet. */
export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Header />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}