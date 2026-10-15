"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, Download, FilePlus2, FolderOpen, Sparkles, Trash2, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { listProjects, createProject, createProjectFromTemplate, createWorldProject, deleteProject, duplicateProject, importProjectFile } from "@/lib/editor/store";
import { STARTER_TEMPLATES } from "@/lib/editor/defaults";
import { WORLD_PRESETS } from "@/lib/world/presets";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { sfx, haptic } from "@/lib/audio";
import { storageUsageKB } from "@/lib/storage";
import type { ProjectMeta } from "@/lib/editor/types";

export function ProjectsHub() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [usage, setUsage] = useState(0);
  const [templateOpen, setTemplateOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setProjects(listProjects());
    setUsage(storageUsageKB());
  };

  useEffect(refresh, []);

  function onNew(): void {
    setTemplateOpen(true);
    sfx.play("tick", { vol: 0.4 });
  }

  function onPickTemplate(templateId: string): void {
    const p = templateId === "blank" ? createProject() : createProjectFromTemplate(templateId);
    setTemplateOpen(false);
    sfx.play("sparkle");
    haptic(14);
    router.push(`/make3d/${p.id}`);
  }

  function onPickWorld(presetId: string): void {
    const preset = WORLD_PRESETS.find((w) => w.id === presetId);
    if (!preset) return;
    const p = createWorldProject(preset.code);
    setTemplateOpen(false);
    sfx.play("spawn");
    haptic(14);
    router.push(`/world/${p.id}`);
  }

  async function onImport(file: File): Promise<void> {
    try {
      const p = await importProjectFile(file);
      sfx.play("chime");
      toast.success(`Imported "${p.name}"`, {
        description: "All objects, lights & keyframes restored.",
      });
      refresh();
    } catch {
      toast.error("That file is not a valid .3dfy project");
    }
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-5" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            aria-label="Back home"
            className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-transform active:scale-95"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="font-display text-lg font-bold tracking-tight sm:text-xl">
            Your 3D projects
          </h1>
          <span className="rounded-full bg-secondary px-3 py-1 text-[10px] font-bold text-muted-foreground">
            {usage} KB
          </span>
        </div>

        {/* new + import */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            onClick={onNew}
            className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-primary/30 bg-primary/10 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/15 active:scale-[0.98]"
          >
            <FilePlus2 className="size-6 text-primary" />
            <span className="text-sm font-bold">New project</span>
            <span className="text-[10px] text-muted-foreground">templates inside</span>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".3dfy,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-primary/35 transition-all hover:-translate-y-0.5 hover:border-primary/60 active:scale-[0.98]"
          >
            <Upload className="size-6 text-primary" />
            <span className="text-sm font-bold">Import .3dfy</span>
            <span className="text-[10px] text-muted-foreground">continue on any phone</span>
          </button>
        </div>

        {/* list */}
        {projects === null ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-card" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-4xl">✨</p>
            <p className="mt-3 text-sm font-bold">No projects yet</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Create your first 3D world — add text, stars &amp; images, light them up,
              then direct a camera movie.
            </p>
            <Button onClick={onNew} className="mt-4 h-11 rounded-xl px-6 font-bold">
              <Sparkles className="size-4" /> Start creating
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
                <button
                  className="block w-full text-left"
                  onClick={() => {
                    sfx.play("tick");
                    router.push(p.stage === "world" ? `/world/${p.id}` : `/make3d/${p.id}`);
                  }}
                >
                  <div className="relative h-32 w-full overflow-hidden bg-elevated">
                    {p.thumb ? (
                      <img src={p.thumb} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-3xl">🎬</div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-1.5 pt-6">
                      <span className="truncate text-sm font-bold text-white drop-shadow">{p.name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {p.stage === "world" && (
                          <span className="rounded-full bg-primary/80 px-2 py-0.5 text-[9px] font-bold text-white">WORLD</span>
                        )}
                        <span className="rounded-full bg-white/25 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur">
                          {p.objectCount} obj
                        </span>
                      </span>
                    </div>
                  </div>
                </button>
                <div className="flex items-center justify-between gap-1 px-2.5 py-2">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {timeAgo(p.updatedAt)}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <MiniBtn label="Open" onClick={() => router.push(p.stage === "world" ? `/world/${p.id}` : `/make3d/${p.id}`)}><FolderOpen className="size-3.5" /></MiniBtn>
                    <MiniBtn label="Duplicate" onClick={() => { duplicateProject(p.id); refresh(); sfx.play("chime"); toast.success("Duplicated"); }}><Copy className="size-3.5" /></MiniBtn>
                    <MiniBtn label="Export .3dfy" onClick={() => {
                      void import("@/lib/editor/store").then(async (m) => {
                        const proj = m.loadProject(p.id);
                        if (proj) {
                          await m.exportProjectFile(proj);
                          sfx.play("chime");
                          toast.success("Exported .3dfy");
                        }
                      });
                    }}><Download className="size-3.5" /></MiniBtn>
                    <MiniBtn label="Delete" danger onClick={() => {
                      if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                        deleteProject(p.id);
                        refresh();
                        sfx.play("break", { vol: 0.4 });
                        toast.success("Deleted");
                      }
                    }}><Trash2 className="size-3.5" /></MiniBtn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------- starter templates ------------------------- */}
      <Sheet open={templateOpen} onOpenChange={setTemplateOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[80dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-lg pro-scroll">
          <SheetHeader className="pb-1">
            <SheetTitle className="font-display text-base">Start from…</SheetTitle>
            <SheetDescription>Pick a starter scene — you can change everything after.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-8 pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Studio scenes</p>
            <div className="grid grid-cols-2 gap-2.5">
              {STARTER_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onPickTemplate(t.id)}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-secondary/40 px-3 py-4 text-center transition-all hover:border-primary/50 hover:bg-primary/10 active:scale-[0.98]"
                >
                  <span className="text-3xl">{t.emoji}</span>
                  <span className="text-xs font-bold">{t.name}</span>
                  <span className="text-[10px] leading-snug text-muted-foreground">{t.desc}</span>
                </button>
              ))}
            </div>
            <p className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Infinite worlds</p>
            <div className="grid grid-cols-2 gap-2.5">
              {WORLD_PRESETS.slice(0, 4).map((w) => (
                <button
                  key={w.id}
                  onClick={() => onPickWorld(w.id)}
                  className="overflow-hidden rounded-2xl border border-border text-left transition-all hover:border-primary/50 active:scale-[0.98]"
                >
                  <div className="h-14 w-full" style={{ background: `linear-gradient(140deg, ${w.gradient[0]}, ${w.gradient[1]})` }} />
                  <div className="px-2.5 py-1.5">
                    <p className="truncate text-xs font-bold">{w.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{w.tags.slice(0, 2).join(" · ")}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <SiteFooter />
    </main>
  );
}

function MiniBtn({
  children, label, onClick, danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex size-8 items-center justify-center rounded-lg bg-secondary/60 transition-all hover:bg-secondary active:scale-90 ${
        danger ? "text-destructive" : "text-foreground/70"
      }`}
    >
      {children}
    </button>
  );
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
