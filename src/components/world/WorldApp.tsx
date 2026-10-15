"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Clapperboard, Film, Globe2, Mountain, Trash2, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createWorldProject, listProjects } from "@/lib/editor/store";
import { WORLD_PRESETS } from "@/lib/world/presets";
import { listWorlds, loadWorld, deleteWorld, type SavedWorldMeta } from "@/lib/world/storage";
import { ImportWorldDialog } from "@/components/editor/panels/ImportWorldDialog";
import type { WorldCode } from "@/lib/world/schema";
import type { ProjectMeta } from "@/lib/editor/types";
import { sfx } from "@/lib/audio";

/**
 * /world — the gallery. Entering any world creates a WORLD PROJECT and opens
 * the FULL studio (/world/<id>): objects, inspector, director timeline and
 * the frame-perfect video render — everything /make3d has, on infinite land.
 */
export function WorldApp() {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [savedList, setSavedList] = useState<SavedWorldMeta[]>([]);
  const [worldProjects, setWorldProjects] = useState<ProjectMeta[]>([]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setSavedList(listWorlds());
      setWorldProjects(listProjects().filter((p) => p.stage === "world").slice(0, 6));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const enter = (world: WorldCode) => {
    const project = createWorldProject(world);
    sfx.play("spawn");
    router.push(`/world/${project.id}`);
  };

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-background">
      <div className="h-full overflow-y-auto pro-scroll">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/85 px-3 py-2.5 backdrop-blur">
          <Link
            href="/"
            aria-label="Back home"
            className="flex size-10 items-center justify-center rounded-lg border border-border bg-panel/90 transition-transform active:scale-95"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Globe2 className="size-5 text-primary" />
            <h1 className="font-display text-base font-bold">World Studio</h1>
          </div>
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground">infinite · procedural · AI-designed</span>
        </header>

        <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
          {/* hero */}
          <section className="mb-8 text-center">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">3Dfy&apos;s flagship mode</p>
            <h2 className="mx-auto mb-3 max-w-lg font-display text-2xl font-bold leading-tight md:text-3xl">
              Your world. Your objects. <span className="text-primary">Your film.</span>
            </h2>
            <p className="mx-auto mb-5 max-w-md text-xs leading-relaxed text-muted-foreground">
              Fly an infinite AI-designed world, place 3D text, shapes, images and lights anywhere,
              direct camera keyframes and render a frame-perfect video — the full studio, on endless land.
            </p>
            <Button onClick={() => setImportOpen(true)} className="h-11 gap-2 rounded-xl px-5 text-sm font-bold shadow-lg shadow-primary/25">
              <Wand2 className="size-4" /> Import AI world code
            </Button>
          </section>

          {/* continue */}
          {worldProjects.length > 0 && (
            <section className="mb-8">
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <Clapperboard className="size-3.5" /> Continue your films
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {worldProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/world/${p.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-panel px-3.5 py-3 transition-all hover:border-primary/50 active:scale-[.98]"
                  >
                    {p.thumb ? (
                      <img src={p.thumb} alt="" className="size-11 rounded-lg object-cover" />
                    ) : (
                      <span className="flex size-11 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
                        <Film className="size-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{p.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{p.objectCount} objects · {new Date(p.updatedAt).toLocaleDateString()}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* examples */}
          <section className="mb-8">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              <Mountain className="size-3.5" /> Example worlds
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {WORLD_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => enter(p.code)}
                  className="group overflow-hidden rounded-2xl border border-border bg-panel text-left transition-all hover:border-primary/50 hover:shadow-xl active:scale-[.98]"
                >
                  <div
                    className="relative h-28 w-full"
                    style={{ background: `linear-gradient(160deg, ${p.gradient[0]}, ${p.gradient[1]})` }}
                  >
                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/45 to-transparent" />
                    <div className="absolute bottom-2 left-2.5 flex gap-1">
                      {p.tags.slice(0, 3).map((t) => (
                        <span key={t} className="rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-bold text-white/90 backdrop-blur">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-bold">{p.name}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{p.desc}</p>
                    <p className="mt-2 text-[10px] font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Open full studio →
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* saved worlds (legacy V1 list — import into a full project) */}
          {savedList.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Saved worlds (V1)</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {savedList.map((w) => (
                  <div key={w.id} className="flex items-center gap-3 rounded-xl border border-border bg-panel px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{w.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        seed {w.seed} · {new Date(w.savedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 rounded-lg px-3 text-xs"
                      onClick={() => {
                        const full = loadWorld(w.id);
                        if (full) enter(full.world);
                        else toast.error("World data missing — re-import the code.");
                      }}
                    >
                      Open
                    </Button>
                    <button
                      aria-label="Delete world"
                      onClick={() => {
                        deleteWorld(w.id);
                        setSavedList(listWorlds());
                        sfx.play("break", { vol: 0.4 });
                      }}
                      className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-transform active:scale-90"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <ImportWorldDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onWorld={(world) => enter(world)}
      />
    </div>
  );
}
