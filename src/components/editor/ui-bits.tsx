"use client";

import { useRef } from "react";
import { Minus, Plus, Upload } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CANDY } from "@/lib/palette";
import { sfx } from "@/lib/audio";

export const EXTRA_COLORS = ["#FFFFFF", "#1F242C", "#FFD24D", "#8A2BE2", "#00C874", "#12B5CB", "#FF6B6B", "#4D96FF"];

/* ------------------------------ stepper ------------------------------ */

export function Stepper({
  label, value, step = 0.25, min = -20, max = 20, onChange, decimals = 2, unit,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  decimals?: number;
  unit?: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v * 100) / 100));
  return (
    <div className="flex items-center justify-between gap-1 rounded-lg border border-border bg-secondary/50 px-2 py-1.5">
      <span className="w-5 shrink-0 text-[11px] font-bold text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button
          aria-label={`Decrease ${label}`}
          className="flex size-7 items-center justify-center rounded-md bg-elevated text-secondary-foreground transition-transform active:scale-90"
          onClick={() => { onChange(clamp(value - step)); sfx.play("tick", { vol: 0.3 }); }}
        >
          <Minus className="size-3" />
        </button>
        <span className="w-13 text-center text-[11px] font-bold tabular-nums">
          {value.toFixed(decimals)}{unit ?? ""}
        </span>
        <button
          aria-label={`Increase ${label}`}
          className="flex size-7 items-center justify-center rounded-md bg-elevated text-secondary-foreground transition-transform active:scale-90"
          onClick={() => { onChange(clamp(value + step)); sfx.play("tick", { vol: 0.3 }); }}
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- slider row ----------------------------- */

export function SliderRow({
  label, value, min, max, step = 0.01, onChange, format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <span className="text-xs font-bold tabular-nums text-foreground">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        onValueCommit={() => sfx.play("tick", { vol: 0.25 })}
      />
    </div>
  );
}

/* ---------------------------- color picker ---------------------------- */

export function ColorGrid({
  value, onChange, extra = true,
}: {
  value: string;
  onChange: (c: string) => void;
  extra?: boolean;
}) {
  const colors = extra ? [...CANDY, ...EXTRA_COLORS] : [...CANDY];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            aria-label={c}
            onClick={() => { onChange(c); sfx.play("tick", { vol: 0.3 }); }}
            className={`size-7 rounded-md border transition-transform active:scale-90 ${
              value.toLowerCase() === c.toLowerCase() ? "border-foreground ring-2 ring-ring scale-105" : "border-border"
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Custom color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#FF6EC7"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-8 flex-1 rounded-md font-mono text-[11px]"
          placeholder="#FF6EC7"
          maxLength={7}
        />
      </div>
    </div>
  );
}

/* ------------------------------- switch ------------------------------- */

export function SwitchRow({
  label, desc, checked, onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold">{label}</p>
        {desc && <p className="text-[10px] leading-tight text-muted-foreground">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* ------------------------------- upload ------------------------------- */

export function UploadButton({
  label = "Upload image", onFile, accept = "image/*",
}: {
  label?: string;
  onFile: (f: File) => void;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-full gap-2 rounded-lg text-xs font-semibold"
        onClick={() => ref.current?.click()}
      >
        <Upload className="size-3.5" /> {label}
      </Button>
    </>
  );
}

/* ------------------------------- chips ------------------------------- */

export function ChipRow<T extends string>({
  options, value, onSelect, columns = 3,
}: {
  options: { id: T; label: string; emoji?: string }[];
  value: T | null;
  onSelect: (id: T) => void;
  columns?: number;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => { onSelect(o.id); sfx.play("tick", { vol: 0.3 }); }}
          className={`flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-all active:scale-95 ${
            value === o.id
              ? "border-primary bg-primary/15 shadow-sm"
              : "border-border bg-secondary/40 hover:border-primary/40"
          }`}
        >
          {o.emoji && <span className="text-sm leading-none">{o.emoji}</span>}
          <span className="text-[10px] font-semibold leading-tight">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* --------------------------- section heading --------------------------- */

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">{children}</p>
  );
}
