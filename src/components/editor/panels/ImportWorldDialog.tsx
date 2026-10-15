"use client";

import { useState } from "react";
import { ClipboardCopy, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WORLD_PROMPT, parseWorldCode, type WorldCode } from "@/lib/world/schema";
import { SAMPLE_WORLD_TEXT } from "@/lib/world/presets";
import { sfx, haptic } from "@/lib/audio";

/**
 * AI world import — two steps:
 *  1. copy the engineered prompt → paste into ANY AI → answer its questions
 *  2. paste the ```3dwc code block back here → robust parser → world applied
 *
 * Shared by the /world gallery and the world studio settings panel.
 */
export function ImportWorldDialog({
  open,
  onOpenChange,
  onWorld,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onWorld: (world: WorldCode, warnings: string[]) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(WORLD_PROMPT);
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
    const res = parseWorldCode(code);
    if ("error" in res) {
      setError(res.error);
      sfx.play("break", { vol: 0.3 });
      return;
    }
    onOpenChange(false);
    setCode("");
    sfx.play("spawn");
    haptic(16);
    onWorld(res.world, res.warnings);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl border-border bg-panel pro-scroll sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-base">
            <Wand2 className="size-4 text-primary" /> Import AI world code
          </DialogTitle>
          <DialogDescription>
            Any AI can design your world — terrain, mobs, lights, reflections, physics.
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
              {WORLD_PROMPT.slice(0, 420)}…
            </pre>
          </section>

          {/* step 2 */}
          <section className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-bold">
              <span className="mr-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">2</span>
              Paste the AI&apos;s world code here
            </p>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={'The whole ```3dwc code block, e.g.\n{\n  "format": "3dwc-2",\n  "name": "Luminara Night",\n  "terrain": { … },\n  "mobs": [ … ]\n}'}
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
                <Sparkles className="size-4" /> Generate world
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setCode(SAMPLE_WORLD_TEXT); setError(null); }}
                className="h-9 rounded-lg px-3 text-xs"
              >
                Try a sample
              </Button>
            </div>
          </section>

          <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
            Parser is forgiving — extra prose ignored, every number clamped, invalid entries skipped
            with a warning. v1 codes still work.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
