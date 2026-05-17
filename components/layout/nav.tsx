"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SECTIONS: { href: string; label: string; match: (path: string) => boolean }[] = [
  { href: "/", label: "Dashboard", match: (p) => p === "/" },
  { href: "/artists", label: "Artists", match: (p) => p.startsWith("/artists") },
  { href: "/settings", label: "Settings", match: (p) => p.startsWith("/settings") },
];

export function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <nav className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 h-12 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 group"
            aria-label="Faye home"
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_hsl(var(--accent)/0.5)]"
            />
            <span className="font-semibold tracking-tight">faye</span>
          </Link>
          <div className="flex items-center gap-1">
            {SECTIONS.map((s) => {
              const active = s.match(pathname);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className={cn(
                    "px-2.5 py-1 text-sm rounded-md transition-colors",
                    active
                      ? "text-foreground bg-surface-1"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-1/60"
                  )}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-muted-foreground font-mono">{email}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    </nav>
  );
}
