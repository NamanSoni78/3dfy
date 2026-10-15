import Link from "next/link";
import { Github, Heart, Wallet } from "lucide-react";

/** Compact footer credit row — used across 3Dfy surfaces. */
export function CreditRow({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 ${compact ? "text-[11px]" : "text-xs"}`}>
      <a
        href="https://payment.namansoni.in/payment"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 font-semibold text-[#b9a8ff] transition-colors hover:bg-primary/20"
      >
        <Wallet className="size-3.5" /> Donate me
      </a>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        Made with <Heart className="size-3 fill-[#f87171] text-[#f87171]" /> by
        <span className="font-semibold text-foreground">Naman</span>
      </span>
      <span className="text-muted-foreground/50">•</span>
      <a
        href="https://github.com/NamanSoni78"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Github className="size-3.5" /> GitHub
      </a>
    </div>
  );
}

/** Full page footer for marketing surfaces (home / projects hub). */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-[#0c0f14]">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-10">
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          3<span className="text-accent">D</span>fy
        </Link>
        <p className="max-w-md text-center text-[11px] leading-relaxed text-muted-foreground">
          Everything runs 100% client-side — your names, projects, images &amp; renders never
          leave your device. Use at your own risk; no warranties, no promises.
        </p>
        <CreditRow />
        <div className="mt-1 flex gap-2">
          <Link href="/3dfy" className="rounded-full bg-secondary px-3.5 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-elevated">Playground</Link>
          <Link href="/make3d" className="rounded-full bg-secondary px-3.5 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-elevated">Studio</Link>
        </div>
      </div>
    </footer>
  );
}
