"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Camera, Dices, Download, Gauge, Loader2, RefreshCw, Settings2,
  Share2, Sparkles, Square, Video, Volume2, VolumeX, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CANDY } from "@/lib/palette";
import { sfx, haptic } from "@/lib/audio";
import { usePlayground, type PlaygroundSettings, type PlaygroundStats, type ColorMode, type Difficulty } from "@/lib/playground-store";
import { motion, trailFX, fieldApi } from "@/lib/playground-runtime";
import { requestMotionPermission, motionPermissionRequired, useDeviceMotion, useDesktopShake } from "@/lib/shake";
import { MATERIAL_PRESETS, type MaterialPreset } from "@/lib/three/materials";
import { FONTS } from "@/lib/three/fonts";
import { renderToBlob, copyImageToClipboard } from "@/lib/capture";
import { downloadBlob } from "@/lib/storage";
import { LiveRecorder, shareBlob, liveCaptureSupported, formatBytes } from "@/lib/editor/render";
import { CreditRow } from "@/components/site-footer";
import type { SpriteKind } from "@/lib/three/textures";
import type { CaptureHandle } from "./PlaygroundScene";

const Scene = dynamic(() => import("./PlaygroundScene"), {
  ssr: false,
  loading: () => null,
});

const TRAIL_KINDS: { id: SpriteKind; label: string }[] = [
  { id: "circle", label: "Bubbles" },
  { id: "star", label: "Stars" },
  { id: "heart", label: "Hearts" },
  { id: "spark", label: "Sparks" },
  { id: "flake", label: "Snow" },
];

const PRESETS: { id: "spin" | "wave" | "bounce" | "orbit"; label: string; emoji: string }[] = [
  { id: "spin", label: "Spin", emoji: "🌀" },
  { id: "wave", label: "Wave", emoji: "〰️" },
  { id: "bounce", label: "Bounce", emoji: "⤴️" },
  { id: "orbit", label: "Orbit", emoji: "🛸" },
];

const DIFFS: { id: Difficulty; label: string; desc: string; emoji: string }[] = [
  { id: "zen", label: "Zen", desc: "Unbreakable · gentle gravity", emoji: "🧘" },
  { id: "normal", label: "Normal", desc: "Classic physics · shake to break", emoji: "🎮" },
  { id: "chaos", label: "Chaos", desc: "Random gravity flips & bursts", emoji: "🔥" },
];

const COLOR_MODES: { id: ColorMode; label: string; emoji: string }[] = [
  { id: "rainbow", label: "Rainbow", emoji: "🌈" },
  { id: "gradient", label: "Gradient", emoji: "🎢" },
  { id: "single", label: "Single", emoji: "🎯" },
];

const REC_MAX_SEC = 120;

export function PlaygroundApp() {
  const hydrate = usePlayground((s) => s.hydrate);
  const settings = usePlayground((s) => s.settings);
  const setSettings = usePlayground((s) => s.setSettings);
  const stats = usePlayground((s) => s.stats);
  const bump = usePlayground((s) => s.bump);

  const [nameOpen, setNameOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [needMotion, setNeedMotion] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [rebuildSignal, setRebuildSignal] = useState(0);

  /* --------------------------- live recording --------------------------- */
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [recResult, setRecResult] = useState<{ blob: Blob; ext: string } | null>(null);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const [recOpen, setRecOpen] = useState(false);
  const recorderRef = useRef<LiveRecorder | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const captureRef = useRef<CaptureHandle | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const shakeHold = useRef<ReturnType<typeof setInterval> | null>(null);
  const shakeRamp = useRef(0.35);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      hydrate();
      setHintVisible(window.localStorage.getItem("3dfy.hint.seen") !== "1");
      setNeedMotion(motionPermissionRequired());
    });
    return () => cancelAnimationFrame(id);
  }, [hydrate]);

  useEffect(() => {
    sfx.muted = settings.muted;
  }, [settings.muted]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setNameDraft(settings.name));
    return () => cancelAnimationFrame(id);
  }, [settings.name]);

  /* ------------------------- motion wiring ------------------------- */

  useDeviceMotion({
    onShake: (e) => fieldApi.shake(e.intensity, e.dx, e.dy),
    onTilt: (gx, gz) => {
      motion.tiltX = gx;
      motion.tiltZ = gz;
    },
  });

  useDesktopShake(wrapRef, {
    onShake: (e) => fieldApi.shake(e.intensity, e.dx, e.dy),
    onTilt: (gx, gz) => {
      motion.tiltX = gx;
      motion.tiltZ = gz;
    },
  });

  const onCaptureReady = useCallback((h: CaptureHandle) => {
    captureRef.current = h;
    setReady(true);
  }, []);

  /* ----------------------------- actions ---------------------------- */

  function dismissHint(): void {
    window.localStorage.setItem("3dfy.hint.seen", "1");
    setHintVisible(false);
  }

  function applyName(): void {
    const clean = nameDraft.trim().slice(0, 14);
    if (!clean) {
      toast.error("Type a name first");
      return;
    }
    setSettings({ name: clean.toUpperCase() });
    setNameOpen(false);
    sfx.play("sparkle");
    haptic(15);
  }

  function reroll(): void {
    const material = MATERIAL_PRESETS[Math.floor(Math.random() * MATERIAL_PRESETS.length)].id;
    const colorMode = COLOR_MODES[Math.floor(Math.random() * COLOR_MODES.length)].id;
    const color = CANDY[Math.floor(Math.random() * CANDY.length)];
    setSettings({ material, colorMode, color });
    bump("rerolls");
    sfx.play("sparkle");
    haptic([10, 30, 10]);
    toast.success("Rerolled", { description: "New material, colors & vibe" });
  }

  function rebuild(): void {
    setRebuildSignal((n) => n + 1);
    fieldApi.rebuild();
    sfx.play("chime");
    haptic(12);
  }

  async function screenshot(): Promise<void> {
    const h = captureRef.current;
    if (!h) return;
    const blob = await renderToBlob(h.gl, h.scene, h.camera);
    if (!blob) {
      toast.error("Screenshot failed");
      return;
    }
    sfx.play("shutter");
    haptic(25);
    bump("screenshots");
    downloadBlob(blob, `3dfy-${Date.now()}.png`);
    const copied = await copyImageToClipboard(blob);
    if (copied) {
      toast.success("Screenshot copied to clipboard", { description: "Backup download saved too." });
    } else {
      toast.success("Screenshot saved");
    }
  }

  /* --------------------------- video recording --------------------------- */

  function startRecording(): void {
    const h = captureRef.current;
    if (!h) return;
    if (!liveCaptureSupported()) {
      toast.error("Video recording is not supported in this browser", {
        description: "Try Chrome or Safari — or use the screenshot button.",
      });
      return;
    }
    const rec = new LiveRecorder();
    try {
      rec.start(h.gl.domElement, 60, 14_000_000);
    } catch {
      toast.error("Could not start recording");
      return;
    }
    recorderRef.current = rec;
    setRecording(true);
    setRecSecs(0);
    sfx.play("recStart");
    haptic(20);
    recTimer.current = setInterval(() => {
      setRecSecs((s) => {
        if (s + 1 >= REC_MAX_SEC) void stopRecording();
        return s + 1;
      });
    }, 1000);
  }

  async function stopRecording(): Promise<void> {
    if (recTimer.current) {
      clearInterval(recTimer.current);
      recTimer.current = null;
    }
    const rec = recorderRef.current;
    if (!rec) return;
    setRecording(false);
    recorderRef.current = null;
    const out = await rec.stop();
    sfx.play("recStop");
    haptic(12);
    if (!out || !out.blob.size) {
      toast.error("Nothing recorded");
      return;
    }
    setRecResult(out);
    setRecUrl(URL.createObjectURL(out.blob));
    setRecOpen(true);
  }

  function downloadRecording(): void {
    if (!recResult) return;
    downloadBlob(recResult.blob, `3dfy-playground-${Date.now()}.${recResult.ext}`);
    sfx.play("shutter");
    toast.success("Video saved", { description: formatBytes(recResult.blob.size) });
  }

  async function shareRecording(): Promise<void> {
    if (!recResult) return;
    const ok = await shareBlob(recResult.blob, `3dfy-playground.${recResult.ext}`);
    if (!ok) toast.error("Sharing not supported here", { description: "Use Save instead." });
  }

  function closeRecSheet(): void {
    if (recUrl) URL.revokeObjectURL(recUrl);
    setRecUrl(null);
    setRecResult(null);
    setRecOpen(false);
  }

  /* --------------------------- shake button --------------------------- */

  function startShakeHold(): void {
    if (shakeHold.current) return;
    shakeRamp.current = 0.35;
    const fire = () => {
      fieldApi.shake(shakeRamp.current, (Math.random() - 0.5) * 2, 0.9);
      shakeRamp.current = Math.min(1, shakeRamp.current + 0.08);
    };
    fire();
    shakeHold.current = setInterval(fire, 130);
  }

  function stopShakeHold(): void {
    if (shakeHold.current) {
      clearInterval(shakeHold.current);
      shakeHold.current = null;
    }
  }

  async function enableMotion(): Promise<void> {
    const ok = await requestMotionPermission();
    if (ok) {
      window.sessionStorage.setItem("3dfy.motion.granted", "1");
      setNeedMotion(false);
      toast.success("Motion enabled", { description: "Shake & tilt your phone!" });
    } else {
      toast.error("Motion permission denied");
    }
  }

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 overflow-hidden bg-[#141925] select-none"
      style={{ touchAction: "none" }}
      onPointerDown={() => sfx.unlock()}
    >
      <Scene onCaptureReady={onCaptureReady} rebuildSignal={rebuildSignal} />

      {/* -------------------------- top bar -------------------------- */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="pointer-events-auto flex items-center gap-1.5">
          <Link
            href="/"
            aria-label="Back home"
            className="flex size-10 items-center justify-center rounded-lg border border-border bg-panel/90 text-foreground shadow-sm backdrop-blur transition-transform active:scale-95"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <button
            onClick={() => {
              setNameOpen(true);
              sfx.play("tick");
            }}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-panel/90 px-4 shadow-sm backdrop-blur transition-transform active:scale-95"
          >
            <span className="font-display text-sm font-bold tracking-wide">{settings.name || "NAME"}</span>
            <Sparkles className="size-3.5 text-primary" />
          </button>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <IconBtn label="Reroll vibe" onClick={reroll}><Dices className="size-4.5" /></IconBtn>
          <IconBtn label={settings.muted ? "Unmute" : "Mute"} onClick={() => setSettings({ muted: !settings.muted })}>
            {settings.muted ? <VolumeX className="size-4.5" /> : <Volume2 className="size-4.5" />}
          </IconBtn>
          <IconBtn label="Stats" onClick={() => { setStatsOpen(true); sfx.play("tick"); }}><Gauge className="size-4.5" /></IconBtn>
          <IconBtn label="Settings" onClick={() => { setSettingsOpen(true); sfx.play("tick"); }}><Settings2 className="size-4.5" /></IconBtn>
          <IconBtn label="Screenshot" onClick={() => void screenshot()}><Camera className="size-4.5" /></IconBtn>
          <button
            onClick={() => (recording ? void stopRecording() : startRecording())}
            aria-label={recording ? "Stop recording" : "Record video"}
            title={recording ? "Stop recording" : "Record video"}
            className={`flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold shadow-sm backdrop-blur transition-all active:scale-95 ${
              recording
                ? "border-destructive/50 bg-destructive/20 text-destructive"
                : "border-border bg-panel/90 text-foreground hover:bg-elevated"
            }`}
          >
            <span className={`size-2.5 rounded-full ${recording ? "rec-dot bg-destructive" : "bg-destructive"}`} />
            {recording ? (
              <span className="tabular-nums">{Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}</span>
            ) : (
              <Video className="size-4.5" />
            )}
          </button>
        </div>
      </div>

      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-panel/90 px-8 py-6 shadow-lg backdrop-blur">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-sm font-semibold">Melting candy…</p>
          </div>
        </div>
      )}

      {needMotion && (
        <button
          onClick={() => void enableMotion()}
          className="absolute left-1/2 z-20 -translate-x-1/2 rounded-full border border-primary/40 bg-primary/15 px-4 py-2 text-xs font-bold text-[#b9a8ff] shadow-lg backdrop-blur transition-transform active:scale-95"
          style={{ top: "max(4.2rem, calc(env(safe-area-inset-top) + 3.8rem))" }}
        >
          Enable motion &amp; tilt
        </button>
      )}

      {hintVisible && (
        <div
          className="absolute left-1/2 z-20 w-[min(92vw,26rem)] -translate-x-1/2 rounded-xl border border-border bg-panel/95 px-4 py-3 text-center shadow-lg backdrop-blur"
          style={{ top: "max(4.2rem, calc(env(safe-area-inset-top) + 3.8rem))" }}
        >
          <p className="text-xs font-medium leading-relaxed text-muted-foreground">
            Drag letters · pinch one to squeeze · shake to break · tilt to roll · <b className="text-foreground">record video</b> from the top bar
          </p>
          <button onClick={dismissHint} className="mt-1.5 text-[11px] font-bold text-primary hover:underline">
            Got it
          </button>
        </div>
      )}

      {/* ------------------------ bottom action bar ------------------------ */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-panel/95 p-1.5 shadow-xl backdrop-blur no-scrollbar">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => fieldApi.preset(p.id)}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-all hover:bg-secondary active:scale-95"
            >
              <span className="text-base">{p.emoji}</span>
              <span className="hidden sm:inline">{p.label}</span>
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px bg-border" />
          <button
            onClick={rebuild}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-all hover:bg-secondary active:scale-95"
          >
            <RefreshCw className="size-4" />
            <span className="hidden sm:inline">Rebuild</span>
          </button>
          <button
            onPointerDown={startShakeHold}
            onPointerUp={stopShakeHold}
            onPointerLeave={stopShakeHold}
            onPointerCancel={stopShakeHold}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-destructive/15 px-4 text-xs font-bold text-destructive transition-all active:scale-95"
          >
            <Zap className="size-4" />
            <span className="hidden sm:inline">Hold to shake</span>
            <span className="sm:hidden">SHAKE</span>
          </button>
        </div>
      </div>

      {/* --------------------------- sheets --------------------------- */}
      <NameSheet
        open={nameOpen}
        onOpenChange={setNameOpen}
        draft={nameDraft}
        setDraft={setNameDraft}
        onApply={applyName}
        settings={settings}
        setSettings={setSettings}
      />

      <StatsSheet open={statsOpen} onOpenChange={setStatsOpen} stats={stats} />

      {/* recording result preview */}
      <Sheet open={recOpen} onOpenChange={(v) => { if (!v) closeRecSheet(); }}>
        <SheetContent side="bottom" className="mx-auto max-h-[86dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-lg pro-scroll">
          <SheetHeader className="pb-1">
            <SheetTitle className="font-display text-base">Your recording</SheetTitle>
            <SheetDescription>Recorded live from the playground — physics and all.</SheetDescription>
          </SheetHeader>
          {recUrl && (
            <div className="space-y-3 px-4 pb-10 pt-3">
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                { }
                <video src={recUrl} controls playsInline className="max-h-[46dvh] w-full" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground uppercase">{recResult?.ext}</span>
                <span>{recResult ? formatBytes(recResult.blob.size) : ""} · {recSecs}s</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={downloadRecording} className="h-11 gap-2 rounded-lg text-xs font-bold">
                  <Download className="size-4" /> Save
                </Button>
                <Button variant="secondary" onClick={() => void shareRecording()} className="h-11 gap-2 rounded-lg text-xs font-bold">
                  <Share2 className="size-4" /> Share
                </Button>
              </div>
              <Button
                variant="outline"
                className="h-10 w-full gap-2 rounded-lg text-xs font-bold"
                onClick={closeRecSheet}
              >
                <Square className="size-3.5" /> Discard &amp; record again
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[85dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-lg pro-scroll">
          <SheetHeader className="pb-0">
            <SheetTitle className="font-display text-base">Playground settings</SheetTitle>
            <SheetDescription>Difficulty, font, trail shape &amp; sound.</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 px-4 pb-8 pt-4">
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <div className="grid grid-cols-3 gap-2">
                {DIFFS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setSettings({ difficulty: d.id }); sfx.play("tick"); }}
                    className={`rounded-xl border p-3 text-left transition-all active:scale-95 ${
                      settings.difficulty === d.id
                        ? "border-primary bg-primary/15 shadow-sm"
                        : "border-border bg-secondary/40"
                    }`}
                  >
                    <p className="text-lg">{d.emoji}</p>
                    <p className="text-xs font-bold">{d.label}</p>
                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{d.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Font</Label>
              <Select value={settings.font} onValueChange={(v) => setSettings({ font: v })}>
                <SelectTrigger className="w-full rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONTS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Trail shape</Label>
              <div className="flex flex-wrap gap-2">
                {TRAIL_KINDS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { trailFX.setSprite(t.id); sfx.play("tick"); }}
                    className="rounded-lg border border-border bg-secondary/40 px-3.5 py-2 text-xs font-bold transition-all hover:border-primary/40 active:scale-95"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-4">
              <div>
                <p className="text-sm font-bold">Sound effects</p>
                <p className="text-xs text-muted-foreground">Procedural Web Audio</p>
              </div>
              <Switch checked={!settings.muted} onCheckedChange={(v) => setSettings({ muted: !v })} />
            </div>

            <Button
              variant="outline"
              className="w-full rounded-lg"
              onClick={() => {
                usePlayground.getState().resetStats();
                toast.success("Stats reset");
              }}
            >
              Reset stats
            </Button>

            <div className="pt-1">
              <CreditRow compact />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function IconBtn({
  children, label, onClick,
}: {
  children: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-lg border border-border bg-panel/90 text-foreground shadow-sm backdrop-blur transition-all hover:bg-elevated active:scale-90"
    >
      {children}
    </button>
  );
}

/* ------------------------------ sheets ------------------------------ */

function NameSheet({
  open, onOpenChange, draft, setDraft, onApply, settings, setSettings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: string;
  setDraft: (v: string) => void;
  onApply: () => void;
  settings: PlaygroundSettings;
  setSettings: (patch: Partial<PlaygroundSettings>) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[88dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-lg pro-scroll">
        <SheetHeader className="pb-0">
          <SheetTitle className="font-display text-base">Make it 3D</SheetTitle>
          <SheetDescription>Type a name, pick a material &amp; colors — physics does the rest.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-10 pt-4">
          <div className="space-y-2">
            <Label htmlFor="pg-name">Your name (max 14 letters)</Label>
            <Input
              id="pg-name"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 14))}
              onKeyDown={(e) => { if (e.key === "Enter") onApply(); }}
              placeholder="NAMAN"
              className="h-12 rounded-lg text-center text-lg font-bold uppercase tracking-widest"
              autoCapitalize="characters"
              autoComplete="off"
            />
            <p className="text-right text-[10px] text-muted-foreground">{draft.length}/14</p>
          </div>

          <div className="space-y-2">
            <Label>Material</Label>
            <div className="grid grid-cols-3 gap-2">
              {MATERIAL_PRESETS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSettings({ material: m.id as MaterialPreset }); sfx.play("tick"); }}
                  className={`rounded-xl border p-2.5 text-center transition-all active:scale-95 ${
                    settings.material === m.id
                      ? "border-primary bg-primary/15 shadow-sm"
                      : "border-border bg-secondary/40"
                  }`}
                >
                  <p className="text-xl">{m.emoji}</p>
                  <p className="text-[11px] font-bold">{m.name}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Color mode</Label>
            <div className="grid grid-cols-3 gap-2">
              {COLOR_MODES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSettings({ colorMode: c.id }); sfx.play("tick"); }}
                  className={`rounded-xl border p-2.5 text-center transition-all active:scale-95 ${
                    settings.colorMode === c.id
                      ? "border-primary bg-primary/15 shadow-sm"
                      : "border-border bg-secondary/40"
                  }`}
                >
                  <p className="text-xl">{c.emoji}</p>
                  <p className="text-[11px] font-bold">{c.label}</p>
                </button>
              ))}
            </div>
          </div>

          {settings.colorMode === "single" && (
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {CANDY.map((c) => (
                  <button
                    key={c}
                    aria-label={`Color ${c}`}
                    onClick={() => setSettings({ color: c })}
                    className={`size-9 rounded-lg border-2 transition-transform active:scale-90 ${
                      settings.color === c ? "border-foreground scale-110" : "border-border"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          )}

          <Button onClick={onApply} className="h-12 w-full rounded-xl text-base font-bold shadow-lg shadow-primary/20">
            <Sparkles className="size-5" /> Make it 3D
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatsSheet({
  open, onOpenChange, stats,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stats: PlaygroundStats;
}) {
  const total = Object.values(stats).reduce<number>((a, b) => a + (typeof b === "number" ? b : 0), 0);
  const items: { label: string; value: string; emoji: string }[] = [
    { label: "Letters made", value: String(stats.lettersMade), emoji: "🔤" },
    { label: "Shakes", value: String(stats.shakes), emoji: "📳" },
    { label: "Breaks", value: String(stats.breaks), emoji: "💥" },
    { label: "Drags", value: String(stats.drags), emoji: "👆" },
    { label: "Drag distance", value: `${Math.round(stats.dragDistance)} u`, emoji: "📏" },
    { label: "Squeezes", value: String(stats.squeezes), emoji: "🤏" },
    { label: "Presets fired", value: String(stats.presets), emoji: "🌀" },
    { label: "Rerolls", value: String(stats.rerolls), emoji: "🎲" },
    { label: "Screenshots", value: String(stats.screenshots), emoji: "📸" },
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[85dvh] overflow-y-auto rounded-t-2xl border-border bg-panel sm:max-w-lg pro-scroll">
        <SheetHeader className="pb-0">
          <SheetTitle className="font-display text-base">Your stats</SheetTitle>
          <SheetDescription>
            {total} total interactions — everything stored only on your device.
          </SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-2 px-4 pb-8 pt-4">
          {items.map((i) => (
            <div key={i.label} className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
              <p className="text-lg">{i.emoji}</p>
              <p className="text-lg font-extrabold tabular-nums font-display">{i.value}</p>
              <p className="text-[10px] font-semibold leading-tight text-muted-foreground">{i.label}</p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
