"use client";

import { useState } from "react";
import { ClipboardCopy, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SHAPE_PROMPT, SAMPLE_SHAPE_CODE, parseShapeCode } from "@/lib/shapes/schema";
import type { ShapePart } from "@/lib/shapes/schema";
import { useEditor } from "@/lib/editor/store";
import { makeCustomShape } from "@/lib/editor/defaults";
import { pendingSpawn, spawnPointInFront } from "@/lib/editor/runtime";
import { sfx, haptic } from "@/lib/audio";

/** Rough half-size of an imported shape (positions + scales) → used to pick
 *  a spawn distance that frames the whole object comfortably in front of you. */
function estimateRadius(parts: ShapePart[]): number {
  let r = 0.8;
  for (const p of parts) {
    const pr = Math.hypot(p.position[0], p.position[1], p.position[2]);
    const s = Math.max(Math.abs(p.scale[0]), Math.abs(p.scale[1]), Math.abs(p.scale[2]), 0.5);
    r = Math.max(r, pr + s);
  }
  return Math.min(r, 8);
}

/**
 * AI shape import — two steps:
 *  1. copy the engineered prompt → paste into ANY AI → answer its questions
 *  2. paste the ```3dsc code block back here → robust parser → object added
 */
export function ImportShapeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const addCustomShape = useEditor((s) => s.addCustomShape);
  const addObject = useEditor((s) => s.addObject);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(SHAPE_PROMPT);
      toast.success("Prompt copied", {
        description: "Paste it into any AI (ChatGPT, Claude, Gemini…), answer its questions, then paste the code back here.",
      });
      sfx.play("chime", { vol: 0.5 });
    } catch {
      toast.error("Could not copy — select the text below manually.");
    }
  }

  function generate(): void {
    setError(null);
    const res = parseShapeCode(code);
    if ("error" in res) {
      setError(res.error);
      sfx.play("break", { vol: 0.3 });
      return;
    }
    const { code: parsed, warnings } = res;
    const id = addCustomShape({ name: parsed.name, parts: parsed.parts });
    // long-press point wins; otherwise spawn IN FRONT of the camera at a
    // distance scaled to the object's size (makeCustomShape uses scale 1.4)
    const press = pendingSpawn.point;
    const spawn: [number, number, number] = press
      ? [press[0], press[1] + 0.4, press[2]]
      : spawnPointInFront(estimateRadius(parsed.parts) * 1.4);
    addObject(makeCustomShape(id, parsed.name, spawn));
    onOpenChange(false);
    setCode("");
    sfx.play("spawn");
    haptic(16);
    const meshParts = parsed.parts.filter((p) => p.primitive === "mesh").length;
    toast.success(`“${parsed.name}” added`, {
      description:
        (warnings.length ? warnings.slice(0, 2).join(" ") + " · " : "") +
        `${parsed.parts.length} parts${meshParts ? ` (${meshParts} real mesh)` : ""} · drag it, or use the gizmo to transform.`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl border-border bg-panel pro-scroll sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-base">
            <Wand2 className="size-4 text-primary" /> Import custom shape
          </DialogTitle>
          <DialogDescription>
            Design anything with any AI — it interviews you, then returns a 3D shape code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* step 1 */}
          <section className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold">
                <span className="mr-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">1</span>
                Copy this prompt → give it to any AI
              </p>
              <Button size="sm" onClick={() => void copyPrompt()} className="h-8 gap-1.5 rounded-lg px-3 text-xs">
                <ClipboardCopy className="size-3.5" /> Copy prompt
              </Button>
            </div>
            <pre className="max-h-32 overflow-y-auto rounded-lg bg-background/60 p-2.5 text-[10px] leading-relaxed text-muted-foreground pro-scroll">
              {SHAPE_PROMPT.slice(0, 420)}…
            </pre>
          </section>

          {/* step 2 */}
          <section className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-bold">
              <span className="mr-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">2</span>
              Paste the AI&apos;s shape code here
            </p>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={'The whole ```3dsc code block, e.g.\n{\n  "format": "3dsc-2",\n  "name": "Low-poly Fox",\n  "parts": [ … primitives AND "mesh" parts with vertices/faces … ]\n}'}
              rows={7}
              spellCheck={false}
              className="w-full resize-none rounded-lg border border-border bg-background/60 p-2.5 font-mono text-[11px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
            {error && (
              <p className="mt-2 rounded-lg bg-destructive/15 px-2.5 py-2 text-[11px] font-semibold text-destructive">
                {error}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={generate} disabled={!code.trim()} className="h-9 flex-1 gap-1.5 rounded-lg text-xs font-bold">
                <Sparkles className="size-4" /> Create shape
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setCode(SAMPLE_SHAPE_CODE); setError(null); }}
                className="h-9 rounded-lg px-3 text-xs"
              >
                Try a sample
              </Button>
            </div>
          </section>

          <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
            Parser is forgiving — extra prose is ignored, values are clamped to safe ranges,
            invalid parts are skipped. Shapes save inside the project (.3dfy export too).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
