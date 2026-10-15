"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Fly camera",
    items: [
      { keys: ["W", "A", "S", "D"], label: "Fly (creative mode)" },
      { keys: ["Space"], label: "Fly up" },
      { keys: ["⇧"], label: "Fly down" },
      { keys: ["C"], label: "Hand-look on/off (Minecraft mouse)" },
      { keys: ["Drag"], label: "Look around (hand mode)" },
    ],
  },
  {
    title: "Tools",
    items: [
      { keys: ["G"], label: "Move tool" },
      { keys: ["R"], label: "Rotate tool" },
      { keys: ["E"], label: "Scale tool" },
      { keys: ["N"], label: "Add object" },
      { keys: ["Esc"], label: "Deselect / close" },
    ],
  },
  {
    title: "Edit",
    items: [
      { keys: ["Ctrl", "Z"], label: "Undo" },
      { keys: ["Ctrl", "⇧", "Z"], label: "Redo" },
      { keys: ["Ctrl", "D"], label: "Duplicate object" },
      { keys: ["X"], label: "Delete object" },
      { keys: ["I"], label: "Toggle inspector" },
    ],
  },
  {
    title: "Camera & video",
    items: [
      { keys: ["K"], label: "Add camera keyframe" },
      { keys: ["Enter"], label: "Play / stop camera path" },
      { keys: ["⇧", "R"], label: "Record path (auto keyframes)" },
      { keys: ["T"], label: "Director mode" },
      { keys: ["V"], label: "Render video" },
      { keys: ["P"], label: "Screenshot" },
    ],
  },
  {
    title: "View",
    items: [
      { keys: ["F"], label: "Frame selected" },
      { keys: ["H"], label: "Toggle grid" },
      { keys: ["?"], label: "This cheat sheet" },
      { keys: ["Ctrl", "S"], label: "Export .3dfy project" },
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-panel sm:rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-base">Keyboard shortcuts</DialogTitle>
          <DialogDescription>Blender-style keys — works everywhere in the editor.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title} className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">{g.title}</p>
              {g.items.map((it) => (
                <div key={it.label} className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground">{it.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {it.keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="pt-1 text-center text-[10px] leading-relaxed text-muted-foreground">
          Mouse: click selects · drag an object to move it · drag empty space looks (hand mode) or orbits ·
          wheel zooms · while an object is selected the camera never rotates on left-drag — use right-drag to orbit
        </p>
      </DialogContent>
    </Dialog>
  );
}
