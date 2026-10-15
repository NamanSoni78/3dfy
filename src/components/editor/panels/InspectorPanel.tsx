"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/lib/editor/store";
import { FONTS } from "@/lib/three/fonts";
import { MATERIAL_PRESETS, TEXT_THEMES, type MaterialPreset } from "@/lib/three/materials";
import { PARTICLE_PRESETS } from "@/lib/editor/defaults";
import { fileToDataUrl } from "@/lib/capture";
import { saveAsset } from "@/lib/editor/assets";
import { sfx, haptic } from "@/lib/audio";
import { uid } from "@/lib/storage";
import type { ImageObj, LightObj, SceneObject, ShapeObj, TextObj, CustomParticle } from "@/lib/editor/types";
import { ChipRow, ColorGrid, SliderRow, Stepper, SwitchRow, UploadButton } from "../ui-bits";

type Tab = "object" | "style" | "kind" | "fx";

/* ----------------------------- content (shared) ---------------------------- */

export function InspectorContent({ onClose }: { onClose?: () => void }) {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const updateObject = useEditor((s) => s.updateObject);
  const deleteObject = useEditor((s) => s.deleteObject);
  const duplicateObject = useEditor((s) => s.duplicateObject);
  const registerAsset = useEditor((s) => s.registerAsset);
  const registerAssetMeta = useEditor((s) => s.registerAssetMeta);
  const addCustomParticle = useEditor((s) => s.addCustomParticle);

  const obj = project.objects.find((o) => o.id === selectedId) ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("object");

  const patch = (p: Partial<SceneObject>, commit = false) => {
    if (obj) updateObject(obj.id, p, commit);
  };
  const patchMat = (p: Partial<SceneObject["material"]>, commit = false) =>
    patch({ material: { ...obj!.material, ...p } } as Partial<SceneObject>, commit);
  const patchFx = (p: Partial<SceneObject["effects"]>, commit = false) =>
    patch({ effects: { ...obj!.effects, ...p } } as Partial<SceneObject>, commit);

  if (!obj) return null;

  const onReplaceImage = async (f: File): Promise<void> => {
    if (obj.type !== "image") return;
    try {
      const { url, w, h } = await fileToDataUrl(f, 1024, 0.92);
      const id = uid();
      await saveAsset(id, url);
      registerAsset(id, url);
      registerAssetMeta(id, { name: f.name, w, h });
      patch({ image: { asset: id, aspect: w / h, frame: obj.image.frame } } as Partial<SceneObject>, true);
      toast.success("Image replaced");
    } catch {
      toast.error("Could not load that image");
    }
  };

  const kindLabel =
    obj.type === "text" ? "Text" : obj.type === "shape" ? "Shape" : obj.type === "image" ? "Image" : "Light";
  const kindIcon = obj.type === "text" ? "T" : obj.type === "image" ? "▨" : obj.type === "light" ? "☀" : "◆";

  async function onPrintFile(file: File): Promise<void> {
    try {
      const { url, w, h } = await fileToDataUrl(file, 1024, 0.92);
      const id = uid();
      await saveAsset(id, url);
      registerAsset(id, url);
      registerAssetMeta(id, { name: file.name, w, h });
      patchMat({ printAsset: id }, true);
      toast.success("Custom print applied");
    } catch {
      toast.error("Could not load that image");
    }
  }

  const applyTextTheme = (themeId: string): void => {
    const theme = TEXT_THEMES.find((t) => t.id === themeId);
    if (!theme || obj.type !== "text") return;
    updateObject(obj.id, {
      material: {
        ...obj.material,
        preset: theme.preset,
        color: theme.color,
        emissive: theme.color,
        emissiveIntensity: theme.id === "neon" || theme.id === "lava" ? (theme.emissiveIntensity ?? 2.4) : (theme.emissiveIntensity ?? 0),
        printAsset: null,
      },
      text: { ...obj.text, theme: theme.id },
      effects: {
        ...obj.effects,
        outline: { ...obj.effects.outline, on: theme.id === "cartoon" },
      },
    } as Partial<SceneObject>, true);
    sfx.play("sparkle", { vol: 0.5 });
  };

  const saveCustomParticle = (cp: CustomParticle): void => {
    addCustomParticle(cp);
    patchFx({ particles: { ...obj.effects.particles, preset: `custom:${cp.id}`, on: true } }, true);
    toast.success(`Particle "${cp.name}" created`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
          {kindIcon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{obj.name}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kindLabel} object</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close inspector"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onReplaceImage(f);
          e.target.value = "";
        }}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 grid w-auto shrink-0 grid-cols-4 rounded-lg bg-secondary/60">
          <TabsTrigger value="object" className="text-[11px]">Object</TabsTrigger>
          <TabsTrigger value="style" className="text-[11px]">Style</TabsTrigger>
          <TabsTrigger value="kind" className="text-[11px]">{kindLabel}</TabsTrigger>
          <TabsTrigger value="fx" className="text-[11px]">FX</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-3 pro-scroll">
          {/* ------------------------- OBJECT TAB ------------------------- */}
          <TabsContent value="object" className="mt-0 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Name</Label>
              <Input
                value={obj.name}
                onChange={(e) => patch({ name: e.target.value.slice(0, 40) } as Partial<SceneObject>)}
                className="h-9 rounded-lg text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Position</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["X", "Y", "Z"] as const).map((axis, i) => (
                  <Stepper
                    key={axis}
                    label={axis}
                    value={obj.position[i]}
                    onChange={(v) => {
                      const p = [...obj.position] as [number, number, number];
                      p[i] = v;
                      patch({ position: p } as Partial<SceneObject>);
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Rotation (deg)</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["X", "Y", "Z"] as const).map((axis, i) => (
                  <Stepper
                    key={axis}
                    label={axis}
                    step={15}
                    min={-360}
                    max={360}
                    decimals={0}
                    unit="°"
                    value={Math.round((obj.rotation[i] * 180) / Math.PI)}
                    onChange={(deg) => {
                      const r = [...obj.rotation] as [number, number, number];
                      r[i] = (deg * Math.PI) / 180;
                      patch({ rotation: r } as Partial<SceneObject>);
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                {[0, 90, 180, 270].map((d) => (
                  <button
                    key={d}
                    onClick={() => patch({ rotation: [obj.rotation[0], (d * Math.PI) / 180, obj.rotation[2]] } as Partial<SceneObject>)}
                    className="flex-1 rounded-lg border border-border bg-secondary/50 py-1.5 text-[10px] font-bold transition-all active:scale-95"
                  >
                    Y {d}°
                  </button>
                ))}
              </div>
            </div>

            <SliderRow
              label="Size"
              value={obj.scale[0]}
              min={0.15}
              max={6}
              step={0.05}
              onChange={(v) => patch({ scale: [v, v, v] } as Partial<SceneObject>)}
              format={(v) => `${v.toFixed(2)}×`}
            />

            <div className="grid grid-cols-2 gap-2">
              <SwitchRow label="Cast shadow" checked={obj.castShadow} onChange={(v) => patch({ castShadow: v } as Partial<SceneObject>)} />
              <SwitchRow label="Visible" checked={obj.visible} onChange={(v) => patch({ visible: v } as Partial<SceneObject>)} />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="h-10 flex-1 gap-1.5 rounded-lg text-xs font-bold"
                onClick={() => { duplicateObject(obj.id); sfx.play("chime", { vol: 0.5 }); }}
              >
                <Copy className="size-3.5" /> Duplicate
              </Button>
              <Button
                variant="destructive"
                className="h-10 flex-1 gap-1.5 rounded-lg text-xs font-bold"
                onClick={() => { deleteObject(obj.id); sfx.play("break", { vol: 0.5 }); haptic(20); onClose?.(); }}
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
          </TabsContent>

          {/* ------------------------- STYLE TAB ------------------------- */}
          <TabsContent value="style" className="mt-0 space-y-4">
            {obj.type !== "light" && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Material</Label>
                  <ChipRow
                    columns={3}
                    value={obj.material.preset}
                    options={MATERIAL_PRESETS.map((m) => ({ id: m.id, label: m.name, emoji: m.emoji }))}
                    onSelect={(id) => patchMat({ preset: id as MaterialPreset }, true)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Color</Label>
                  <ColorGrid value={obj.material.color} onChange={(c) => patchMat({ color: c, emissive: c })} />
                </div>

                <SliderRow label="Metallic" value={obj.material.metalness} min={0} max={1} onChange={(v) => patchMat({ metalness: v })} />
                <SliderRow label="Roughness" value={obj.material.roughness} min={0} max={1} onChange={(v) => patchMat({ roughness: v })} />
                <SliderRow label="Glow" value={obj.material.emissiveIntensity} min={0} max={3} onChange={(v) => patchMat({ emissiveIntensity: v })} />
                <SliderRow label="Opacity" value={obj.material.opacity} min={0.05} max={1} onChange={(v) => patchMat({ opacity: v })} />

                <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
                  <Label className="text-xs font-semibold">Custom print (image on surface)</Label>
                  {obj.material.printAsset && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-2.5 py-1.5">
                      <span className="truncate text-[11px] font-semibold">Print applied</span>
                      <button
                        className="text-[11px] font-bold text-destructive hover:underline"
                        onClick={() => patchMat({ printAsset: null }, true)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <UploadButton label="Choose print image" onFile={(f) => void onPrintFile(f)} />
                  <p className="text-[10px] leading-tight text-muted-foreground">
                    The image wraps onto the object like a sticker print.
                  </p>
                </div>
              </>
            )}
            {obj.type === "light" && <LightTab obj={obj} patch={patch} />}
          </TabsContent>

          {/* ------------------------- KIND TAB ------------------------- */}
          <TabsContent value="kind" className="mt-0 space-y-4">
            {obj.type === "text" && <TextTab obj={obj} patch={patch} applyTextTheme={applyTextTheme} />}
            {obj.type === "shape" && <ShapeTab obj={obj} patch={patch} />}
            {obj.type === "image" && <ImageTab obj={obj} patch={patch} fileRef={fileRef} />}
            {obj.type === "light" && <LightTab obj={obj} patch={patch} />}
          </TabsContent>

          {/* --------------------------- FX TAB --------------------------- */}
          <TabsContent value="fx" className="mt-0 space-y-4">
            <SwitchRow
              label="Particles"
              desc="Effects around this object"
              checked={obj.effects.particles.on}
              onChange={(v) => patchFx({ particles: { ...obj.effects.particles, on: v } })}
            />
            {obj.effects.particles.on && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Preset</Label>
                  <ChipRow
                    columns={4}
                    value={obj.effects.particles.preset}
                    options={PARTICLE_PRESETS.map((p) => ({ id: p.id, label: p.name, emoji: p.emoji }))}
                    onSelect={(id) => patchFx({ particles: { ...obj.effects.particles, preset: id } })}
                  />
                </div>
                {project.customParticles.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Your custom FX</Label>
                    <ChipRow
                      columns={3}
                      value={obj.effects.particles.preset}
                      options={project.customParticles.map((c) => ({ id: `custom:${c.id}`, label: c.name, emoji: "🧪" }))}
                      onSelect={(id) => patchFx({ particles: { ...obj.effects.particles, preset: id } })}
                    />
                  </div>
                )}
                <SliderRow
                  label="Intensity"
                  value={obj.effects.particles.intensity}
                  min={0.2}
                  max={3}
                  onChange={(v) => patchFx({ particles: { ...obj.effects.particles, intensity: v } })}
                  format={(v) => `${v.toFixed(1)}×`}
                />
                <CustomParticleMaker onSave={saveCustomParticle} />
              </>
            )}

            <SwitchRow
              label="Outline"
              desc="Sticker-style border"
              checked={obj.effects.outline.on}
              onChange={(v) => patchFx({ outline: { ...obj.effects.outline, on: v } })}
            />
            {obj.effects.outline.on && (
              <>
                <ColorGrid value={obj.effects.outline.color} onChange={(c) => patchFx({ outline: { ...obj.effects.outline, color: c } })} />
                <SliderRow
                  label="Thickness"
                  value={obj.effects.outline.thickness}
                  min={0.01}
                  max={0.12}
                  step={0.005}
                  onChange={(v) => patchFx({ outline: { ...obj.effects.outline, thickness: v } })}
                />
              </>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/* ------------------------------ layouts ------------------------------ */

/** Mobile: bottom sheet. */
export function InspectorPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto flex h-[82dvh] flex-col rounded-t-2xl border-border bg-panel p-0 sm:max-w-xl">
        <SheetHeader className="sr-only">
          <SheetTitle>Object inspector</SheetTitle>
          <SheetDescription>Edit the selected object.</SheetDescription>
        </SheetHeader>
        <InspectorContent onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

/** Desktop: docked right side panel. */
export function InspectorDock({ onClose }: { onClose: () => void }) {
  return (
    <aside className="pointer-events-auto absolute right-3 top-[calc(3.4rem+env(safe-area-inset-top))] bottom-[calc(3.9rem)] z-20 flex w-80 flex-col overflow-hidden rounded-xl border border-border bg-panel/95 shadow-2xl backdrop-blur">
      <InspectorContent onClose={onClose} />
    </aside>
  );
}

/* ------------------------------ sub-tabs ------------------------------ */

type PatchFn = (p: Partial<SceneObject>, commit?: boolean) => void;

function TextTab({ obj, patch, applyTextTheme }: { obj: TextObj; patch: PatchFn; applyTextTheme: (id: string) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Text</Label>
        <Input
          value={obj.text.content}
          onChange={(e) => patch({ text: { ...obj.text, content: e.target.value.slice(0, 24) } } as Partial<SceneObject>)}
          className="h-10 rounded-lg text-center text-base font-bold uppercase tracking-wider"
          placeholder="TYPE HERE"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Font</Label>
        <ChipRow
          columns={3}
          value={obj.text.font}
          options={FONTS.map((f) => ({ id: f.id, label: f.name.split(" ")[0] }))}
          onSelect={(id) => patch({ text: { ...obj.text, font: id } } as Partial<SceneObject>)}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Style themes</Label>
        <ChipRow
          columns={4}
          value={obj.text.theme}
          options={TEXT_THEMES.map((t) => ({ id: t.id, label: t.name, emoji: t.emoji }))}
          onSelect={applyTextTheme}
        />
      </div>
      <SliderRow
        label="3D depth"
        value={obj.text.depth}
        min={0.05}
        max={1.4}
        step={0.05}
        onChange={(v) => patch({ text: { ...obj.text, depth: v } } as Partial<SceneObject>)}
        format={(v) => v.toFixed(2)}
      />
      <SwitchRow
        label="Bevel edges"
        desc="Rounded edges"
        checked={obj.text.bevel}
        onChange={(v) => patch({ text: { ...obj.text, bevel: v } } as Partial<SceneObject>)}
      />
    </>
  );
}

function ShapeTab({ obj, patch }: { obj: ShapeObj; patch: PatchFn }) {
  if (obj.shape === "custom") {
    return (
      <p className="rounded-lg bg-secondary/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Imported AI shape — <b className="text-foreground">{obj.name}</b>. Transform it with the gizmo or
        by dragging; scale & material apply from the Style tab. Re-import from the Add menu to spawn another.
      </p>
    );
  }
  return (
    <>
      <p className="rounded-lg bg-secondary/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Shape: <b className="text-foreground">{obj.shape}</b> — drag the object to move it, or use the gizmo for
        rotate / scale.
      </p>
      <SliderRow
        label="Thickness"
        value={obj.depth}
        min={0.05}
        max={1.2}
        step={0.05}
        onChange={(v) => patch({ depth: v } as Partial<SceneObject>)}
        format={(v) => v.toFixed(2)}
      />
    </>
  );
}

function ImageTab({ obj, patch, fileRef }: { obj: ImageObj; patch: PatchFn; fileRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <>
      <p className="rounded-lg bg-secondary/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Image plane — tilt with rotation, resize with the Scale tool.
      </p>
      <SwitchRow
        label="White frame"
        checked={obj.image.frame}
        onChange={(v) => patch({ image: { ...obj.image, frame: v } } as Partial<SceneObject>)}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-full rounded-lg text-xs font-bold"
        onClick={() => fileRef.current?.click()}
      >
        Replace image
      </Button>
      <p className="text-[10px] leading-tight text-muted-foreground">
        Tip: long-press the ground → Image to add another picture.
      </p>
    </>
  );
}

function LightTab({ obj, patch }: { obj: LightObj; patch: PatchFn }) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Light color</Label>
        <ColorGrid value={obj.light.color} onChange={(c) => patch({ light: { ...obj.light, color: c } } as Partial<SceneObject>)} />
      </div>
      <SliderRow
        label="Intensity"
        value={obj.light.intensity}
        min={0}
        max={60}
        step={0.5}
        onChange={(v) => patch({ light: { ...obj.light, intensity: v } } as Partial<SceneObject>)}
        format={(v) => v.toFixed(0)}
      />
      <SliderRow
        label="Reach"
        value={obj.light.distance}
        min={1}
        max={40}
        step={0.5}
        onChange={(v) => patch({ light: { ...obj.light, distance: v } } as Partial<SceneObject>)}
        format={(v) => v.toFixed(0)}
      />
    </>
  );
}

/* ------------------------ custom particle maker ------------------------ */

function CustomParticleMaker({ onSave }: { onSave: (cp: CustomParticle) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((x) => !x), []);
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3">
      <button className="flex w-full items-center justify-between text-left" onClick={toggle}>
        <span className="text-xs font-bold text-[#b9a8ff]">Create your own particle FX</span>
        <span className="text-[10px] font-bold text-muted-foreground">{open ? "close" : "open"}</span>
      </button>
      {open && <CustomParticleForm onSave={onSave} />}
    </div>
  );
}

function CustomParticleForm({ onSave }: { onSave: (cp: CustomParticle) => void }) {
  const [name, setName] = useState("My FX");
  const [shape, setShape] = useState<"circle" | "star" | "heart" | "spark" | "flake">("spark");
  const [color1, setColor1] = useState("#FF6EC7");
  const [color2, setColor2] = useState("#7AF6FF");
  const [count, setCount] = useState(90);
  const [rate, setRate] = useState(18);
  const [speed, setSpeed] = useState(1.5);
  const [size, setSize] = useState(0.16);
  const [gravity, setGravity] = useState(0.4);
  const [life, setLife] = useState(1.2);
  const [additive, setAdditive] = useState(true);
  const [rise, setRise] = useState(true);

  return (
    <div className="mt-2 space-y-3">
      <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} className="h-9 rounded-lg text-sm" placeholder="FX name" />
      <ChipRow
        columns={5}
        value={shape}
        options={[
          { id: "circle", label: "Dot", emoji: "⚪" },
          { id: "star", label: "Star", emoji: "⭐" },
          { id: "heart", label: "Heart", emoji: "💗" },
          { id: "spark", label: "Spark", emoji: "✨" },
          { id: "flake", label: "Flake", emoji: "❄️" },
        ]}
        onSelect={setShape}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-bold">Color 1</Label>
          <input type="color" value={color1} onChange={(e) => setColor1(e.target.value.toUpperCase())} className="h-9 w-full cursor-pointer rounded-lg border border-border bg-transparent p-0.5" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-bold">Color 2</Label>
          <input type="color" value={color2} onChange={(e) => setColor2(e.target.value.toUpperCase())} className="h-9 w-full cursor-pointer rounded-lg border border-border bg-transparent p-0.5" />
        </div>
      </div>
      <SliderRow label="Amount" value={count} min={20} max={200} step={5} onChange={setCount} format={(v) => v.toFixed(0)} />
      <SliderRow label="Speed" value={speed} min={0.2} max={5} onChange={setSpeed} />
      <SliderRow label="Size" value={size} min={0.05} max={0.5} step={0.01} onChange={setSize} />
      <SliderRow label="Float (gravity)" value={gravity} min={-3} max={3} step={0.1} onChange={setGravity} />
      <SliderRow label="Lifetime" value={life} min={0.4} max={2.5} step={0.1} onChange={setLife} format={(v) => `${v.toFixed(1)}s`} />
      <div className="grid grid-cols-2 gap-2">
        <SwitchRow label="Glow blend" checked={additive} onChange={setAdditive} />
        <SwitchRow label="Float up" checked={rise} onChange={setRise} />
      </div>
      <Button
        className="h-10 w-full rounded-lg text-xs font-bold"
        onClick={() =>
          onSave({
            id: uid(),
            name: name || "My FX",
            config: { shape, colors: [color1, color2], count, rate, speed, spread: 1, size, gravity, life, additive, rise },
          })
        }
      >
        Create &amp; apply
      </Button>
    </div>
  );
}
