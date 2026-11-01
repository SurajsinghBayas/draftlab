"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Studio" },
  { href: "/evaluation", label: "Quality analysis" },
  { href: "/risks", label: "Risks" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-paper">
      <div className="flex items-center gap-4 sm:gap-8 px-4 h-12">
        <Link href="/" className="font-serif text-xl font-medium tracking-tight">
          Draft<span className="text-accent">Lab</span>
        </Link>
        <nav className="flex gap-3 sm:gap-5 text-sm" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
              className={path === l.href ? "text-ink font-medium underline decoration-accent decoration-2 underline-offset-[6px]" : "text-muted hover:text-ink"}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
