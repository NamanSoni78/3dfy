"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { flyKeys } from "@/lib/three/fly";
import { sfx, haptic } from "@/lib/audio";

/**
 * Minecraft-PE-style touch flight pad.
 * Left cluster: W/A/S/D cross. Right: ascend / descend pills.
 * Buttons write into the shared `flyKeys` state; the scene's fly rig reads
 * them every frame — identical to physical keys.
 */
export function FlyTouchPad({ compact = false }: { compact?: boolean }) {
  const btn = (key: keyof typeof flyKeys, label: string) => (
    <FlyPadButton keyLabel={label} compact={compact}
      onDown={() => { flyKeys[key] = true; haptic(8); }}
      onUp={() => { flyKeys[key] = false; }}
    />
  );

  return (
    <div className="pointer-events-none flex w-full items-end justify-between px-3">
      {/* left cluster — movement cross */}
      <div className="pointer-events-auto grid grid-cols-3 gap-1">
        <span />
        {btn("forward", "W")}
        <span />
        {btn("left", "A")}
        {btn("back", "S")}
        {btn("right", "D")}
      </div>

      {/* right cluster — ascend / descend pills */}
      <div className="pointer-events-auto flex flex-col gap-1.5">
        <FlyPadButton keyLabel="Fly up" icon={<ChevronUp className="size-4" />} compact={compact}
          onDown={() => { flyKeys.up = true; haptic(8); }}
          onUp={() => { flyKeys.up = false; }}
        />
        <FlyPadButton keyLabel="Descend" icon={<ChevronDown className="size-4" />} compact={compact}
          onDown={() => { flyKeys.down = true; haptic(8); }}
          onUp={() => { flyKeys.down = false; }}
        />
      </div>
    </div>
  );
}

function FlyPadButton({
  keyLabel, icon, compact, onDown, onUp,
}: {
  keyLabel: string;
  icon?: React.ReactNode;
  compact?: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const cancel = () => { setHeld(false); onUp(); };
    window.addEventListener("pointerup", cancel);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", cancel);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [onUp]);

  return (
    <button
      aria-label={keyLabel}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setHeld(true);
        sfx.unlock();
        onDown();
      }}
      onPointerUp={() => { setHeld(false); onUp(); }}
      onPointerLeave={() => { if (held) { setHeld(false); onUp(); } }}
      className={`select-none border font-bold uppercase tracking-wide backdrop-blur transition-all ${
        compact ? "text-[10px] size-11 rounded-lg" : "text-[11px] size-12 rounded-xl"
      } ${
        held
          ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30"
          : "border-border bg-panel/85 text-secondary-foreground"
      }`}
    >
      {icon ?? keyLabel}
    </button>
  );
}
