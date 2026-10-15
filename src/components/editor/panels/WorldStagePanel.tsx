"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Gamepad2, Globe2, Mountain, Wand2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/editor/store";
import { WORLD_PRESETS } from "@/lib/world/presets";
import type { WorldCode } from "@/lib/world/schema";
import { flyState, saveFlyPrefs, lookState, saveLookPrefs } from "@/lib/editor/runtime";
import { sfx } from "@/lib/audio";
import { SliderRow, SwitchRow, ChipRow, SectionLabel } from "../ui-bits";
import { ImportWorldDialog } from "./ImportWorldDialog";

/**
 * World studio settings — view/perf options live, terrain/water edits applied
 * as a batch (rebuilding chunks mid-drag would jank), AI import + examples.
 */
export function WorldStagePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const world = useEditor((s) => s.project.worldDef);
  const opts = useEditor((s) => s.project.worldOpts);
  const fov = useEditor((s) => s.project.cameraFov);
  const setWorldDef = useEditor((s) => s.setWorldDef);
  const updateWorldOpts = useEditor((s) => s.updateWorldOpts);
  const setCameraFov = useEditor((s) => s.setCameraFov);

  const [importOpen, setImportOpen] = useState(false);
  const [flySpeed, setFlySpeed] = useState(flyState.speed);
  const [handOn, setHandOn] = useState(lookState.enabled);

  /* terrain + water draft (applied as a batch) */
  const [draft, setDraft] = useState<{ amplitude: number; frequency: number; detail: number; waterOn: boolean; waterLevel: number }>({
    amplitude: 8, frequency: 0.012, detail: 0.5, waterOn: false, waterLevel: 0.4,
  });

  useEffect(() => {
    if (open && world) {
      const id = requestAnimationFrame(() => {
        setDraft({
          amplitude: world.terrain.amplitude,
          frequency: world.terrain.frequency,
          detail: world.terrain.detail,
          waterOn: world.terrain.waterLevel !== null,
          waterLevel: world.terrain.waterLevel ?? 0.4,
        });
        setFlySpeed(flyState.speed);
        setHandOn(lookState.enabled);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open, world]);

  if (!world) return null;

  const patchAtmosphere = (patch: Partial<WorldCode["atmosphere"]>) =>
    setWorldDef({ ...world, atmosphere: { ...world.atmosphere, ...patch } });
  const patchSun = (patch: Partial<WorldCode["atmosphere"]["sun"]>) =>
    patchAtmosphere({ sun: { ...world.atmosphere.sun, ...patch } });

  const applyTerrain = () => {
    setWorldDef({
      ...world,
      terrain: {
        ...world.terrain,
        amplitude: draft.amplitude,
        frequency: draft.frequency,
        detail: draft.detail,
        waterLevel: draft.waterOn ? draft.waterLevel : null,
      },
    });
    toast.success("Terrain updated", { description: "Chunks rebuild around you as you fly." });
    sfx.play("chime", { vol: 0.5 });
  };

  const onImported = (w: WorldCode, warnings: string[]) => {
    setWorldDef(w);
    toast.success(`“${w.name}” loaded`, {
      description: (warnings.length ? warnings.slice(0, 2).join(" ") + " · " : "") +
        `${w.features.length} features · ${w.mobs.length} mob${w.mobs.length === 1 ? "" : "s"} · ${w.lights.length} light${w.lights.length === 1 ? "" : "s"}`,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[88dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-lg pro-scroll">
        <SheetHeader className="pb-1">
          <SheetTitle className="flex items-center gap-2 font-display text-base">
            <Globe2 className="size-4 text-primary" /> World settings
          </SheetTitle>
          <SheetDescription>
            {world.name} · seed {world.seed} — everything renders locally, nothing uploads.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-10 pt-3">
          {/* ------------------------- view & performance ------------------------- */}
          <section className="space-y-3">
            <SectionLabel>View &amp; performance</SectionLabel>
            <div className="grid grid-cols-5 gap-1.5">
              {[2, 3, 4, 5, 6].map((d) => (
                <button
                  key={d}
                  onClick={() => { updateWorldOpts({ renderDistance: d }); sfx.play("tick"); }}
                  className={`min-h-10 rounded-lg border text-xs font-bold transition-all active:scale-95 ${
                    opts.renderDistance === d ? "border-primary bg-primary/15" : "border-border bg-secondary/40"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Render distance in chunks ({(opts.renderDistance * 2 + 1) ** 2} loaded). Higher = farther view but can lag on phones.
            </p>
            <ChipRow
              columns={3}
              value={opts.quality}
              onSelect={(q) => { updateWorldOpts({ quality: q }); sfx.play("tick"); }}
              options={[
                { id: "draft", label: "Draft", emoji: "🪶" },
                { id: "balanced", label: "Balanced", emoji: "⚖️" },
                { id: "high", label: "High", emoji: "💎" },
              ]}
            />
            <SliderRow
              label="Field of view"
              value={fov}
              min={20}
              max={100}
              step={1}
              onChange={setCameraFov}
              format={(v) => `${Math.round(v)}°`}
            />
            <SliderRow
              label="Fly speed"
              value={flySpeed}
              min={2}
              max={30}
              step={1}
              onChange={(v) => { setFlySpeed(v); flyState.speed = v; saveFlyPrefs(); }}
              format={(v) => `${Math.round(v)} m/s`}
            />
            <SwitchRow
              label="Walk mode"
              desc="Camera walks on the ground (gravity) instead of flying"
              checked={opts.walkMode}
              onChange={(v) => updateWorldOpts({ walkMode: v })}
            />
            <SwitchRow
              label="Hand-look (mouse)"
              desc="Drag empty space to look — Minecraft style, with pointer lock"
              checked={handOn}
              onChange={(v) => { lookState.enabled = v; saveLookPrefs(); setHandOn(v); }}
            />
          </section>

          {/* ----------------------------- sun & fog ----------------------------- */}
          <section className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3.5">
            <SectionLabel>Sun &amp; fog <span className="normal-case text-muted-foreground/60">· live</span></SectionLabel>
            <SliderRow label="Sun elevation" value={world.atmosphere.sun.elevation} min={5} max={90} step={1} onChange={(v) => patchSun({ elevation: v })} format={(v) => `${Math.round(v)}°`} />
            <SliderRow label="Sun azimuth" value={world.atmosphere.sun.azimuth} min={0} max={360} step={2} onChange={(v) => patchSun({ azimuth: v })} format={(v) => `${Math.round(v)}°`} />
            <SliderRow label="Sun intensity" value={world.atmosphere.sun.intensity} min={0} max={3} step={0.05} onChange={(v) => patchSun({ intensity: v })} />
            <SliderRow
              label="Fog density"
              value={world.atmosphere.fog.density}
              min={0}
              max={0.02}
              step={0.001}
              onChange={(v) => patchAtmosphere({ fog: { ...world.atmosphere.fog, density: v } }) }
              format={(v) => v.toFixed(3)}
            />
          </section>

          {/* --------------------------- terrain & water --------------------------- */}
          <section className="space-y-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3.5">
            <SectionLabel>Terrain &amp; water <span className="normal-case text-muted-foreground/60">· press Apply</span></SectionLabel>
            <SliderRow label="Hill height" value={draft.amplitude} min={0.5} max={24} step={0.5} onChange={(v) => setDraft((d) => ({ ...d, amplitude: v }))} format={(v) => v.toFixed(1)} />
            <SliderRow label="Hill spacing" value={draft.frequency} min={0.004} max={0.05} step={0.001} onChange={(v) => setDraft((d) => ({ ...d, frequency: v }))} format={(v) => v.toFixed(3)} />
            <SliderRow label="Roughness" value={draft.detail} min={0} max={1} step={0.05} onChange={(v) => setDraft((d) => ({ ...d, detail: v }))} format={(v) => v.toFixed(2)} />
            <SwitchRow label="Water" desc="Lakes / oceans at the given level" checked={draft.waterOn} onChange={(v) => setDraft((d) => ({ ...d, waterOn: v }))} />
            {draft.waterOn && (
              <SliderRow label="Water level" value={draft.waterLevel} min={-10} max={12} step={0.2} onChange={(v) => setDraft((d) => ({ ...d, waterLevel: v }))} format={(v) => v.toFixed(1)} />
            )}
            <Button onClick={applyTerrain} className="h-10 w-full gap-1.5 rounded-lg text-xs font-bold">
              <Check className="size-4" /> Apply terrain changes
            </Button>
          </section>

          {/* ------------------------------ AI import ------------------------------ */}
          <section className="space-y-2">
            <SectionLabel>Bring your own world</SectionLabel>
            <button
              onClick={() => { setImportOpen(true); sfx.play("tick", { vol: 0.4 }); }}
              className="flex w-full items-center gap-3 rounded-xl border border-primary/35 bg-primary/10 px-3.5 py-3 text-left transition-all hover:border-primary/60 hover:bg-primary/15 active:scale-[.98]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wand2 className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold">Import AI world code</span>
                <span className="block truncate text-[10px] text-muted-foreground">Copy the prompt → any AI interviews you → paste the code</span>
              </span>
            </button>
          </section>

          {/* ------------------------------- examples ------------------------------- */}
          <section className="space-y-2">
            <SectionLabel>Example worlds</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {WORLD_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setWorldDef(p.code);
                    onOpenChange(false);
                    toast.success(`“${p.name}” loaded`);
                    sfx.play("spawn");
                  }}
                  className="overflow-hidden rounded-xl border border-border text-left transition-all hover:border-primary/50 active:scale-95"
                >
                  <div className="h-12 w-full" style={{ background: `linear-gradient(140deg, ${p.gradient[0]}, ${p.gradient[1]})` }} />
                  <div className="px-2.5 py-1.5">
                    <p className="truncate text-[11px] font-bold">{p.name}</p>
                    <p className="flex items-center gap-1 truncate text-[9px] text-muted-foreground">
                      <Mountain className="size-2.5" /> {p.tags[0]}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground">
            <Gamepad2 className="size-3" /> Fly with WASD / the pad · long-press the terrain to place objects
          </p>
        </div>
      </SheetContent>

      <ImportWorldDialog open={importOpen} onOpenChange={setImportOpen} onWorld={onImported} />
    </Sheet>
  );
}
