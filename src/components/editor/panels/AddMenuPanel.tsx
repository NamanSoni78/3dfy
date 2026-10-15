"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useEditor } from "@/lib/editor/store";
import { makeImage, makeLight, makeShape, makeText } from "@/lib/editor/defaults";
import { SHAPE_KINDS } from "@/lib/three/geometry";
import { pendingSpawn, spawnPointInFront } from "@/lib/editor/runtime";
import { fileToDataUrl } from "@/lib/capture";
import { saveAsset } from "@/lib/editor/assets";
import { sfx, haptic } from "@/lib/audio";
import { uid } from "@/lib/storage";
import { ImportShapeDialog } from "./ImportShapeDialog";

export function AddMenuPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const addObject = useEditor((s) => s.addObject);
  const registerAsset = useEditor((s) => s.registerAsset);
  const registerAssetMeta = useEditor((s) => s.registerAssetMeta);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);

  /** Long-press point wins (exact placement); otherwise new objects spawn
   *  right IN FRONT of the camera — always visible, wherever you flew. */
  const spawnPoint = (radius = 1.1): [number, number, number] =>
    pendingSpawn.point ?? spawnPointInFront(radius);

  function add(kind: "text" | "light"): void {
    if (kind === "text") addObject(makeText("HELLO", spawnPoint(1.7)));
    else {
      const p = spawnPoint(1.4);
      addObject(makeLight([p[0] + 1.2, p[1] + 1.8, p[2] + 0.8]));
    }
    onOpenChange(false);
    sfx.play("spawn");
    haptic(14);
  }

  function addShape(shape: (typeof SHAPE_KINDS)[number]["id"]): void {
    addObject(makeShape(shape, spawnPoint(1.1)));
    onOpenChange(false);
    sfx.play("spawn");
    haptic(14);
  }

  async function onImage(file: File): Promise<void> {
    try {
      const { url, w, h } = await fileToDataUrl(file, 1024, 0.92);
      const id = uid();
      await saveAsset(id, url);
      registerAsset(id, url);
      registerAssetMeta(id, { name: file.name, w, h });
      addObject(makeImage(id, w / h, spawnPoint(1.3)));
      onOpenChange(false);
      sfx.play("spawn");
      haptic(14);
      toast.success("Image added", { description: "Tap it to select · use Move/Rotate/Scale tools." });
    } catch {
      toast.error("Could not load that image");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[80dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-lg pro-scroll">
        <SheetHeader className="pb-1">
          <SheetTitle className="font-display text-base">Add to your world</SheetTitle>
          <SheetDescription>
            {pendingSpawn.point
              ? "Spawning where you long-pressed. Long-press anywhere on the ground to place things exactly."
              : "New objects appear right in front of you. Long-press the ground to place them exactly instead."}
          </SheetDescription>
        </SheetHeader>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImage(f);
            e.target.value = "";
          }}
        />

        <div className="space-y-4 px-4 pb-8 pt-3">
          <button
            onClick={() => { setImportOpen(true); sfx.play("tick", { vol: 0.4 }); }}
            className="flex w-full items-center gap-3 rounded-xl border border-primary/35 bg-primary/10 px-3.5 py-3 text-left transition-all hover:border-primary/60 hover:bg-primary/15 active:scale-[.98]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-lg text-primary-foreground">✨</span>
            <span className="min-w-0">
              <span className="block text-xs font-bold">Import custom shape</span>
              <span className="block truncate text-[10px] text-muted-foreground">Ask any AI to design it — paste the code here</span>
            </span>
          </button>
          <div className="grid grid-cols-4 gap-2">
            <AddTile emoji="✏️" label="3D Text" onClick={() => add("text")} big />
            <AddTile emoji="🖼️" label="Image" onClick={() => fileRef.current?.click()} big />
            <AddTile emoji="💡" label="Light" onClick={() => add("light")} big />
            <AddTile emoji="⭐" label="Star" onClick={() => addShape("star")} big />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {SHAPE_KINDS.filter((s) => s.id !== "star").map((s) => (
              <AddTile key={s.id} emoji={s.emoji} label={s.name} onClick={() => addShape(s.id)} />
            ))}
          </div>
          <p className="text-center text-[10px] text-muted-foreground">
            Everything saves automatically on this device
          </p>
        </div>
      </SheetContent>
      <ImportShapeDialog open={importOpen} onOpenChange={setImportOpen} />
    </Sheet>
  );
}

function AddTile({
  emoji, label, onClick, big = false,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
  big?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-secondary/40 transition-all hover:border-primary/40 hover:bg-primary/8 active:scale-95 ${
        big ? "min-h-20" : "min-h-16"
      }`}
    >
      <span className={big ? "text-2xl" : "text-xl"}>{emoji}</span>
      <span className="px-1 text-[10px] font-bold leading-tight">{label}</span>
    </button>
  );
}
