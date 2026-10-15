"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Download, Redo2, Undo2, Volume2, VolumeX } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditor, exportProjectFile } from "@/lib/editor/store";
import { WORLD_THEMES } from "@/lib/editor/defaults";
import { sfx } from "@/lib/audio";
import { storageUsageKB } from "@/lib/storage";
import { CreditRow } from "@/components/site-footer";
import type { WorldTheme } from "@/lib/editor/types";
import { SliderRow, SwitchRow } from "../ui-bits";

/* ------------------------------ theme panel ----------------------------- */

export function ThemePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const project = useEditor((s) => s.project);
  const setTheme = useEditor((s) => s.setTheme);
  const updateWorld = useEditor((s) => s.updateWorld);

  const custom = project.world.custom ?? {
    id: "custom", name: "My World",
    skyTop: "#1a2233", skyBottom: "#2c3448", ground: "#232b3b",
    grid: { on: true, color: "#46536b" },
    fog: { on: false, color: "#1a2233", density: 0.02 },
    stars: false,
  };

  function patchCustom(p: Partial<WorldTheme>): void {
    updateWorld({ custom: { ...custom, ...p } });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[88dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-lg pro-scroll">
        <SheetHeader className="pb-1">
          <SheetTitle className="font-display text-base">World theme</SheetTitle>
          <SheetDescription>Pick a vibe or craft your own.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-10 pt-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {WORLD_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); sfx.play("sparkle", { vol: 0.5 }); }}
                className={`overflow-hidden rounded-xl border-2 transition-all active:scale-95 ${
                  project.world.themeId === t.id ? "border-primary shadow-md" : "border-border"
                }`}
              >
                <div
                  className="relative h-14"
                  style={{ background: `linear-gradient(${t.skyTop}, ${t.skyBottom})` }}
                >
                  <div className="absolute inset-x-0 bottom-0 h-3.5" style={{ background: t.ground }} />
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[11px] font-bold">{t.name}</span>
                  {project.world.themeId === t.id && <Check className="size-3.5 text-primary" />}
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3.5">
            <button
              onClick={() => { setTheme("custom"); sfx.play("sparkle", { vol: 0.5 }); }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left ${
                project.world.themeId === "custom" ? "bg-primary/15" : "bg-secondary/50"
              }`}
            >
              <span className="text-xs font-bold">My custom world</span>
              {project.world.themeId === "custom" && <Check className="size-3.5 text-primary" />}
            </button>

            <ColorField label="Sky top" value={custom.skyTop} onChange={(v) => patchCustom({ skyTop: v })} />
            <ColorField label="Sky bottom" value={custom.skyBottom} onChange={(v) => patchCustom({ skyBottom: v })} />
            <ColorField label="Ground" value={custom.ground} onChange={(v) => patchCustom({ ground: v })} />
            <ColorField label="Grid" value={custom.grid.color} onChange={(v) => patchCustom({ grid: { ...custom.grid, color: v } })} />
            <SwitchRow label="Fog" desc="Depth fade" checked={custom.fog.on} onChange={(v) => patchCustom({ fog: { ...custom.fog, on: v } })} />
            {custom.fog.on && (
              <SliderRow label="Fog density" value={custom.fog.density} min={0.005} max={0.06} step={0.002} onChange={(v) => patchCustom({ fog: { ...custom.fog, density: v } })} format={(v) => v.toFixed(3)} />
            )}
            <SwitchRow label="Stars" desc="Sparkling sky" checked={custom.stars} onChange={(v) => patchCustom({ stars: v })} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs font-semibold">{label}</Label>
      <div className="flex items-center gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-8 w-24 rounded-md font-mono text-[10px]" maxLength={7} />
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          aria-label={`${label} color`}
        />
      </div>
    </div>
  );
}

/* ------------------------------ world panel ----------------------------- */

export function WorldPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const world = useEditor((s) => s.project.world);
  const updateWorld = useEditor((s) => s.updateWorld);
  const fov = useEditor((s) => s.project.cameraFov);
  const setCameraFov = useEditor((s) => s.setCameraFov);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[88dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-lg pro-scroll">
        <SheetHeader className="pb-1">
          <SheetTitle className="font-display text-base">Lights &amp; world</SheetTitle>
          <SheetDescription>
            Light level 100% = everything visible by default. Lower it to make your own lights matter.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-10 pt-3">
          <div className="space-y-2.5 rounded-xl border border-border bg-secondary/40 p-3.5">
            <p className="text-xs font-bold">Camera</p>
            <SliderRow
              label="Field of view"
              value={fov}
              min={20}
              max={100}
              step={1}
              onChange={setCameraFov}
              format={(v) => `${Math.round(v)}°`}
            />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Wide angles (70°+) feel cinematic in close-ups; 35–50° flatters product shots.
            </p>
          </div>

          <SliderRow
            label="World light level"
            value={world.lightLevel}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => updateWorld({ lightLevel: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />

          <div className="space-y-2.5 rounded-xl border border-border bg-secondary/40 p-3.5">
            <p className="text-xs font-bold">Key light (sun)</p>
            <SwitchRow
              label="On"
              desc="Main shadow-casting light"
              checked={world.keyLight.on}
              onChange={(v) => updateWorld({ keyLight: { ...world.keyLight, on: v } })}
            />
            {world.keyLight.on && (
              <>
                <SliderRow label="Intensity" value={world.keyLight.intensity} min={0} max={4} step={0.1} onChange={(v) => updateWorld({ keyLight: { ...world.keyLight, intensity: v } })} />
                <SliderRow label="Angle" value={world.keyLight.angle} min={0} max={6.28} step={0.1} onChange={(v) => updateWorld({ keyLight: { ...world.keyLight, angle: v } })} format={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
                <SwitchRow label="Cast shadows" checked={world.keyLight.shadows} onChange={(v) => updateWorld({ keyLight: { ...world.keyLight, shadows: v } })} />
              </>
            )}
          </div>

          <div className="space-y-2.5 rounded-xl border border-border bg-secondary/40 p-3.5">
            <p className="text-xs font-bold">Camera light</p>
            <SwitchRow
              label="On"
              desc="A soft light follows your camera — perfect shadows automatically"
              checked={world.cameraLight.on}
              onChange={(v) => updateWorld({ cameraLight: { ...world.cameraLight, on: v } })}
            />
            {world.cameraLight.on && (
              <>
                <SliderRow label="Intensity" value={world.cameraLight.intensity} min={0} max={6} step={0.1} onChange={(v) => updateWorld({ cameraLight: { ...world.cameraLight, intensity: v } })} />
                <SwitchRow label="Cast shadows" checked={world.cameraLight.shadows} onChange={(v) => updateWorld({ cameraLight: { ...world.cameraLight, shadows: v } })} />
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Shadow quality</Label>
            <div className="grid grid-cols-3 gap-2">
              {[512, 1024, 2048].map((q) => (
                <button
                  key={q}
                  onClick={() => { updateWorld({ shadowQuality: q }); sfx.play("tick"); }}
                  className={`min-h-10 rounded-lg border text-xs font-bold transition-all active:scale-95 ${
                    world.shadowQuality === q ? "border-primary bg-primary/15" : "border-border bg-secondary/40"
                  }`}
                >
                  {q === 512 ? "Low" : q === 1024 ? "Medium" : "High"}
                </button>
              ))}
            </div>
          </div>

          <SwitchRow label="Show grid" desc="Hidden automatically in screenshots & renders" checked={world.grid} onChange={(v) => updateWorld({ grid: v })} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- menu panel ------------------------------ */

export function MenuPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const project = useEditor((s) => s.project);
  const renameProject = useEditor((s) => s.renameProject);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [name, setName] = useState(project.name);
  const [usage, setUsage] = useState(0);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => {
        setName(project.name);
        setUsage(storageUsageKB());
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open, project.name]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[80dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-lg pro-scroll">
        <SheetHeader className="pb-1">
          <SheetTitle className="font-display text-base">Project</SheetTitle>
          <SheetDescription>Auto-saved on this device · {usage} KB used</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-10 pt-3">
          {/* undo / redo (mobile-friendly — also Ctrl+Z / Ctrl+Shift+Z on desktop) */}
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <Button
              variant="outline"
              disabled={!canUndo}
              onClick={() => { undo(); sfx.play("tick"); }}
              className="h-11 gap-2 rounded-lg text-xs font-bold"
            >
              <Undo2 className="size-4" /> Undo
            </Button>
            <Button
              variant="outline"
              disabled={!canRedo}
              onClick={() => { redo(); sfx.play("tick"); }}
              className="h-11 gap-2 rounded-lg text-xs font-bold"
            >
              <Redo2 className="size-4" /> Redo
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Project name</Label>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} className="h-10 rounded-lg text-sm" />
              <Button
                className="h-10 rounded-lg px-4 text-xs font-bold"
                onClick={() => { renameProject(name); toast.success("Renamed"); }}
              >
                Save
              </Button>
            </div>
          </div>

          <Button
            variant="outline"
            className="h-11 w-full gap-2 rounded-lg text-xs font-bold"
            onClick={() => {
              void exportProjectFile(useEditor.getState().project);
              sfx.play("chime");
              toast.success("Project exported as .3dfy", {
                description: "Send it to any phone and import it in Projects to continue.",
              });
            }}
          >
            <Download className="size-4" /> Export project (.3dfy) · Ctrl+S
          </Button>

          <Button
            variant="secondary"
            className="h-11 w-full rounded-lg text-xs font-bold"
            onClick={() => router.push("/make3d")}
          >
            All projects
          </Button>

          <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold">
                {sfx.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />} Sound effects
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-md px-3 text-[11px] font-bold"
                onClick={() => {
                  sfx.muted = !sfx.muted;
                  setUsage(storageUsageKB()); // trigger re-render
                }}
              >
                {sfx.muted ? "Unmute" : "Mute"}
              </Button>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Procedural Web Audio feedback on every interaction.
            </p>
          </div>

          <div className="pt-1">
            <CreditRow compact />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
