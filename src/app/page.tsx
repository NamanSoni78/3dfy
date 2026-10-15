"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Boxes, Camera, Clapperboard, Cpu, Film, Gamepad2, Github, Globe2, Heart,
  Lightbulb, Magnet, Palette, Shield, Smartphone, Sparkles, Volume2, Wallet, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { listProjects } from "@/lib/editor/store";
import type { ProjectMeta } from "@/lib/editor/types";

const WORLD_FEATURES = [
  { icon: Globe2, text: "Infinite chunk-streamed terrain — Minecraft-style flight" },
  { icon: Wand2, text: "AI world-code import: mobs, custom lights, reflections, physics" },
  { icon: Clapperboard, text: "The FULL studio on endless land — objects, timeline, render" },
  { icon: Gamepad2, text: "Hand-look mouse mode + WASD flight (replay-mod style)" },
  { icon: Lightbulb, text: "Walk or fly · day/night skies · rivers, lakes & glowing crystals" },
  { icon: Film, text: "Frame-perfect MP4 renders with world pre-warming" },
  { icon: Smartphone, text: "On-screen Minecraft PE pad on phones" },
  { icon: Shield, text: "Runs 100% in your browser — nothing uploads" },
];

const PLAYGROUND_FEATURES = [
  { icon: Cpu, text: "Full 3D physics name generator (Rapier WASM)" },
  { icon: Palette, text: "6 material types — clay, metallic, glass, neon, rubber, marble" },
  { icon: Volume2, text: "Web Audio API sound effects on all interactions" },
  { icon: Camera, text: "Screenshots & live video recording with save / share" },
  { icon: Sparkles, text: "Stats dashboard tracking every interaction" },
  { icon: Magnet, text: "Drag-to-move letters with spring physics" },
  { icon: Smartphone, text: "Shake detection (mobile + desktop simulation)" },
  { icon: Shield, text: "localStorage persistence — nothing leaves your device" },
];

const STUDIO_FEATURES = [
  { icon: Wand2, text: "3D text, 10 shapes, images & lights — long-press to spawn" },
  { icon: Clapperboard, text: "Camera keyframes + one-tap path recording (replay-mod style)" },
  { icon: Film, text: "Blender-style offline render — frame-perfect MP4/WebM export" },
  { icon: Lightbulb, text: "Full lighting rig: world level, key light, camera light & shadows" },
  { icon: Sparkles, text: "15 particle FX presets + custom particle builder" },
  { icon: Palette, text: "5 world themes + custom theme maker" },
  { icon: Boxes, text: "Projects saved on-device, portable .3dfy files" },
  { icon: Gamepad2, text: "Blender-style keyboard shortcuts on desktop (G / R / S …)" },
];

export default function Home() {
  const [recent, setRecent] = useState<ProjectMeta[]>([]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setRecent(listProjects().slice(0, 4)));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <main className="min-h-dvh bg-background">
      {/* ------------------------------ nav ------------------------------ */}
      <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-display text-lg font-bold tracking-tight">
            3<span className="text-accent">D</span>fy
          </Link>
          <div className="flex items-center gap-1.5">
            <Link
              href="/world"
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10"
            >
              Worlds
            </Link>
            <Link
              href="/make3d"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Studio
            </Link>
            <Link
              href="/3dfy"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Playground
            </Link>
            <a
              href="https://github.com/NamanSoni78"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Github className="size-4" />
            </a>
          </div>
        </div>
      </nav>

      {/* ------------------------------ hero ------------------------------ */}
      <section className="hero-glow relative overflow-hidden px-4 pb-16 pt-14 text-center sm:pt-20">
        <div className="relative mx-auto max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3.5 py-1.5 text-[11px] font-semibold text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> 100% in your browser · no account · no server
          </span>

          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Infinite AI worlds,
            <br />
            <span className="text-accent">rendered into film.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Ask any AI to design a world — rivers, mobs, glowing crystals, dusk suns — then fly it,
            place your objects, direct the camera and render a frame-perfect video.
            Or squeeze your name with real physics in the playground.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 w-full max-w-xs rounded-xl px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-transform hover:-translate-y-0.5 active:scale-[0.98] sm:w-auto"
            >
              <Link href="/world">
                <Globe2 className="size-5" /> Explore infinite AI worlds
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="h-12 w-full max-w-xs rounded-xl px-8 text-sm font-bold transition-transform hover:-translate-y-0.5 active:scale-[0.98] sm:w-auto"
            >
              <Link href="/make3d">
                <Boxes className="size-5" /> Open 3D studio
              </Link>
            </Button>
          </div>

          <p className="mt-3 text-center text-[11px] text-muted-foreground/70">
            <Link href="/3dfy" className="font-semibold text-primary underline-offset-2 hover:underline">
              or play with your name →
            </Link>
          </p>

          <p className="mt-4 text-[11px] text-muted-foreground/70">
            No install · no sign-up · runs on your phone&apos;s GPU
          </p>
        </div>
      </section>

      {/* --------------------------- mode cards --------------------------- */}
      <section className="mx-auto max-w-4xl px-4 pb-10">
        <div className="grid gap-4 md:grid-cols-2">
          <ModeCard
            href="/world"
            icon={<Globe2 className="size-6" />}
            title="World Studio"
            tag="Infinite worlds · flagship"
            desc="An infinite AI-designed world AND the full editor: place text, shapes, images and lights anywhere on the terrain, direct camera keyframes, render frame-perfect video."
            bullets={["AI world code (3DWC v2): mobs, lights, reflections, physics", "Hand-look + WASD flight, walk mode, on-phone pad", "The complete /make3d toolkit on endless land"]}
            wide
          />
          <ModeCard
            href="/make3d"
            icon={<Clapperboard className="size-6" />}
            title="Make 3D Studio"
            tag="Mini Blender"
            desc="A clean bounded stage for people who want a basic Blender-like place: text, shapes, images, lights, particles, AI-imported mesh shapes. Fly the camera, render a movie."
            bullets={["Replay-mod style camera paths + offline MP4 render", "Import AI-designed shapes with REAL mesh data (3DSC v2)", "Projects, .3dfy files, themes, full lighting rig"]}
          />
          <ModeCard
            href="/3dfy"
            icon={<Gamepad2 className="size-6" />}
            title="3Dfy Playground"
            tag="Physics toy"
            desc="Your name becomes squeezable 3D letters with springs, gravity and candy trails. Shake your phone hard enough and it shatters. Record it all as video."
            bullets={["Zen / Normal / Chaos difficulty", "Spin, Wave, Bounce & Orbit presets", "Tilt your phone to roll the letters"]}
          />
        </div>

        {recent.length > 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-card/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Continue creating</p>
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {recent.map((p) => (
                <Link
                  key={p.id}
                  href={p.stage === "world" ? `/world/${p.id}` : `/make3d/${p.id}`}
                  className="flex min-w-40 items-center gap-2.5 rounded-xl border border-border bg-secondary/40 px-3 py-2 transition-all hover:border-primary/40 active:scale-95"
                >
                  {p.thumb ? (
                    <img src={p.thumb} alt="" className="size-9 rounded-md object-cover" />
                  ) : (
                    <span className="flex size-9 items-center justify-center rounded-md bg-elevated text-muted-foreground">
                      <Film className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold">{p.name}</span>
                    <span className="block text-[10px] text-muted-foreground">{p.objectCount} objects</span>
                  </span>
                </Link>
              ))}
              <Link
                href="/make3d"
                className="flex min-w-32 items-center justify-center gap-1 rounded-xl border border-dashed border-primary/40 px-3 py-2 text-xs font-bold text-primary transition-all active:scale-95"
              >
                All projects <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ----------------------------- features ---------------------------- */}
      <section className="mx-auto max-w-4xl px-4 pb-16">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">
              World Studio <span className="text-muted-foreground/50">·</span> <span className="text-accent">superpowers</span>
            </h2>
            <ul className="mt-4 space-y-1">
              {WORLD_FEATURES.map((f) => (
                <li key={f.text} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/40">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-4" />
                  </span>
                  <span className="text-xs font-medium leading-snug">{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">
              Playground <span className="text-muted-foreground/50">·</span> <span className="text-accent">superpowers</span>
            </h2>
            <ul className="mt-4 space-y-1">
              {PLAYGROUND_FEATURES.map((f) => (
                <li key={f.text} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/40">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-4" />
                  </span>
                  <span className="text-xs font-medium leading-snug">{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">
              Studio <span className="text-muted-foreground/50">·</span> <span className="text-accent">superpowers</span>
            </h2>
            <ul className="mt-4 space-y-1">
              {STUDIO_FEATURES.map((f) => (
                <li key={f.text} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/40">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-4" />
                  </span>
                  <span className="text-xs font-medium leading-snug">{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------ donate ------------------------------ */}
      <section className="mx-auto max-w-4xl px-4 pb-16">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/10 to-transparent px-6 py-8 text-center">
          <p className="font-display text-lg font-bold tracking-tight">Enjoying 3Dfy?</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            3Dfy is free and always will be. If it made you smile, a small donation keeps
            the caffeine flowing and the features coming.
          </p>
          <Button asChild size="lg" className="h-11 gap-2 rounded-xl px-6 text-sm font-bold">
            <a href="https://payment.namansoni.in/payment" target="_blank" rel="noopener noreferrer">
              <Wallet className="size-4" /> Donate me
            </a>
          </Button>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Made with <Heart className="size-3 fill-[#f87171] text-[#f87171]" /> by Naman
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function ModeCard({
  href, icon, title, tag, desc, bullets, wide = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  tag: string;
  desc: string;
  bullets: string[];
  wide?: boolean;
}) {
  return (
    <Link href={href} className={`group block ${wide ? "md:col-span-2" : ""}`}>
      <div className="h-full overflow-hidden rounded-2xl border border-border bg-card transition-all group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-primary/5">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {tag}
          </span>
        </div>
        <div className="p-5">
          <h3 className="font-display text-base font-bold tracking-tight">{title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
          <ul className="mt-3 space-y-1.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-2 text-[11px] font-medium text-foreground/75">
                <span className="size-1.5 shrink-0 rounded-full bg-primary" /> {b}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-1 text-xs font-bold text-primary">
            Open <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
          </p>
        </div>
      </div>
    </Link>
  );
}
